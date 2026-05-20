/**
 * Connecteur BOAMP API — edifio Sourcing.
 *
 * Étape 2/7 de la PR #2 module sourcing engine
 * (cf. `notes-de-suivi/DRAFT_PR2_BOAMP_CONNECTOR.md` §Étape 2/7).
 *
 * Source de vérité :
 *  - `specs/module_sourcing_engine_v1.md` §3.1 (BOAMP API Opendatasoft)
 *  - `src/lib/sourcing/types.ts` (`RawTender`, `BoampApiRecord`, `PlatformCode`)
 *
 * Endpoint : `https://data.boamp.fr/api/2/datasets/boamp/records` (Opendatasoft,
 * ouvert, ~500 req/min sans clé). Pagination via `rows` + `start`.
 *
 * Comportement :
 *  - Itère jusqu'à épuisement (record vide OU `total_count` atteint).
 *  - Retry exponentiel sur 429 + 5xx (3 tentatives, backoff 1 s / 2 s / 4 s).
 *  - Mappe chaque record vers `RawTender` (pas de parsing métier ici, c'est
 *    le rôle de `normalize.ts` — étape 3).
 *  - Injection de `fetch` via `opts` pour permettre les tests sans réseau.
 *
 * Choix non triviaux :
 *  - On lit la projection « fields » d'Opendatasoft (`record.record.fields`)
 *    pour produire un `BoampApiRecord` strict. Voir handoff Cowork si la
 *    structure d'enveloppe Opendatasoft change.
 *  - `fetchedAt` est un `string` ISO (pas un `Date`) pour respecter le contrat
 *    `RawTender.fetchedAt` posé à l'étape 1 — Date sérialisée à la frontière.
 */

import type { BoampApiRecord, RawTender } from "../types";

/** Endpoint Opendatasoft BOAMP (constant). */
const BOAMP_ENDPOINT = "https://data.boamp.fr/api/2/datasets/boamp/records";

/** Taille de page maximale Opendatasoft (cf. doc API v2). */
const PAGE_SIZE = 1000;

/** Backoff exponentiel (ms) appliqué entre 2 tentatives sur 429 / 5xx. */
const RETRY_BACKOFF_MS = [1000, 2000, 4000] as const;

/**
 * Enveloppe Opendatasoft v2 : on ne décrit ici que les champs réellement
 * utilisés. Tout le reste (links, total_count partiel, etc.) reste `unknown`
 * et n'est pas exposé en dehors du module.
 */
interface OpendatasoftResponseV2 {
  total_count?: number;
  records?: Array<{ record?: { fields?: BoampApiRecord } }>;
}

/**
 * Contrat du connecteur BOAMP, utilisé par l'orchestrateur (étapes ultérieures).
 */
export interface BoampConnector {
  /**
   * Récupère tous les AO BOAMP publiés depuis `lastRunAt` (exclusive).
   * Le `profileId` n'est pas utilisé dans la requête BOAMP (pas de filtre
   * profil côté API) — il est conservé pour la traçabilité côté caller
   * (orchestrateur écrit `matching_profile_id` post-filtrage).
   */
  fetchSinceLastRun(profileId: string, lastRunAt: Date): Promise<RawTender[]>;
}

/**
 * Options de création du connecteur.
 */
export interface BoampConnectorOptions {
  /**
   * Injection `fetch` pour les tests (mock). Par défaut le `fetch` global
   * (Node ≥ 22 / Edge runtime / Vercel).
   */
  fetch?: typeof fetch;
}

/**
 * Indique si un statut HTTP doit déclencher un retry (429 ou 5xx).
 */
function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

/**
 * Sleep promesse-based — extrait pour pouvoir mock l'horloge en test si besoin.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Encode l'URL Opendatasoft avec les paramètres demandés.
 *
 * @param lastRunAt — borne inférieure de `datepublication` (ISO 8601)
 * @param start     — offset de pagination (0-based)
 */
function buildBoampUrl(lastRunAt: Date, start: number): string {
  const params = new URLSearchParams({
    rows: String(PAGE_SIZE),
    start: String(start),
    where: `datepublication >= "${lastRunAt.toISOString()}"`,
    sort: "datepublication desc",
  });
  return `${BOAMP_ENDPOINT}?${params.toString()}`;
}

/**
 * Erreur dédiée pour les statuts HTTP non-retryables (4xx hors 429). On la
 * laisse remonter immédiatement, sans entrer dans la boucle de retry.
 */
class BoampNonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BoampNonRetryableError";
  }
}

/**
 * Effectue une requête HTTP avec retry exponentiel sur 429 / 5xx.
 * Jette une erreur exploitable si les 3 tentatives échouent.
 *
 * @throws BoampNonRetryableError immédiatement sur statut 4xx hors 429
 * @throws Error si les retries 429/5xx épuisent les tentatives ou si `fetch` rejette
 */
async function fetchWithRetry(
  url: string,
  fetchImpl: typeof fetch,
): Promise<OpendatasoftResponseV2> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < RETRY_BACKOFF_MS.length; attempt++) {
    try {
      const response = await fetchImpl(url);

      if (response.ok) {
        // Opendatasoft renvoie toujours du JSON sur 200 — `as unknown` puis
        // narrow vers `OpendatasoftResponseV2` (forme partielle, on tolère
        // les champs additionnels via `unknown` côté enveloppe).
        const payload = (await response.json()) as unknown;
        return payload as OpendatasoftResponseV2;
      }

      if (!isRetryableStatus(response.status)) {
        // Erreur définitive (4xx non-429) : on jette via la classe dédiée,
        // re-throwée hors du catch pour ne PAS être retryée.
        throw new BoampNonRetryableError(
          `BOAMP API non-retryable status ${response.status} ${response.statusText} sur ${url}`,
        );
      }

      // Statut retryable : on consigne, on backoff, on retente
      lastError = new Error(
        `BOAMP API retryable status ${response.status} (tentative ${attempt + 1}/${RETRY_BACKOFF_MS.length})`,
      );
    } catch (err) {
      // Erreur non-retryable explicite → remonte immédiatement
      if (err instanceof BoampNonRetryableError) throw err;
      // Erreur réseau ou JSON.parse → on retry comme pour un 5xx
      lastError = err;
    }

    // Backoff si on n'est pas à la dernière tentative
    if (attempt < RETRY_BACKOFF_MS.length - 1) {
      // `noUncheckedIndexedAccess` : on garantit l'index in-range juste ci-dessus
      const backoff = RETRY_BACKOFF_MS[attempt] ?? 1000;
      await sleep(backoff);
    }
  }

  // Les 3 tentatives ont échoué — on remonte une erreur enrichie
  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `BOAMP API a échoué après ${RETRY_BACKOFF_MS.length} tentatives sur ${url} — dernière erreur : ${reason}`,
  );
}

/**
 * Projette un record Opendatasoft brut vers un `RawTender`. Ne fait pas de
 * parsing métier — c'est le rôle de `normalize.ts` (étape 3).
 *
 * Si le record est mal formé (pas d'`idweb`), on jette : c'est anormal côté
 * API BOAMP, mieux vaut un fail loud qu'un silent skip qui masquerait un
 * changement de schéma amont.
 */
function projectRecord(fields: BoampApiRecord, fetchedAtIso: string): RawTender {
  if (!fields.idweb || typeof fields.idweb !== "string") {
    throw new Error(
      `BOAMP record sans idweb exploitable — payload : ${JSON.stringify(fields).slice(0, 200)}`,
    );
  }

  return {
    externalRef: fields.idweb,
    platformCode: "boamp",
    rawData: {
      platform_code: "boamp",
      record: fields as unknown as Record<string, unknown>,
      fetched_at: fetchedAtIso,
    },
    fetchedAt: fetchedAtIso,
  };
}

/**
 * Crée une instance de `BoampConnector`. Le `fetch` injecté en option
 * permet de mocker entièrement le réseau dans les tests.
 */
export function createBoampConnector(opts: BoampConnectorOptions = {}): BoampConnector {
  const fetchImpl = opts.fetch ?? globalThis.fetch;

  if (!fetchImpl) {
    throw new Error(
      "createBoampConnector: aucun fetch disponible (ni opts.fetch ni globalThis.fetch). " +
        "En Node < 18 / runtime sans fetch global, injecter explicitement opts.fetch.",
    );
  }

  return {
    async fetchSinceLastRun(_profileId: string, lastRunAt: Date): Promise<RawTender[]> {
      const fetchedAtIso = new Date().toISOString();
      const accumulator: RawTender[] = [];
      let start = 0;

      // Boucle de pagination — on stoppe sur page vide OU total_count atteint.
      // Garde-fou : 1000 itérations max (1 M de records) — au-delà on jette.
      for (let iter = 0; iter < 1000; iter++) {
        const url = buildBoampUrl(lastRunAt, start);
        const response = await fetchWithRetry(url, fetchImpl);

        const records = response.records ?? [];
        if (records.length === 0) {
          // Page vide → fin naturelle
          break;
        }

        for (const wrapper of records) {
          const fields = wrapper.record?.fields;
          if (!fields) {
            // Record vide / mal formé côté Opendatasoft — on logge en throw
            // pour ne pas masquer une régression amont.
            throw new Error(
              "BOAMP API a renvoyé un wrapper sans record.fields — schéma Opendatasoft inattendu",
            );
          }
          accumulator.push(projectRecord(fields, fetchedAtIso));
        }

        // Si total_count présent et atteint → fin
        if (
          typeof response.total_count === "number" &&
          accumulator.length >= response.total_count
        ) {
          break;
        }

        start += PAGE_SIZE;
      }

      return accumulator;
    },
  };
}
