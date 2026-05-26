/**
 * Normalisation d'un `RawTender` BOAMP vers la forme finale `NormalizedTender`
 * — edifio Sourcing.
 *
 * Étape 3/7 de la PR #2 module sourcing engine
 * (cf. `notes-de-suivi/DRAFT_PR2_BOAMP_CONNECTOR.md` §Étape 3/7).
 *
 * Source de vérité :
 *  - `specs/module_sourcing_engine_v1.md` §3.3 (mapping `normalize`)
 *  - `src/lib/sourcing/types.ts` (`RawTender`, `NormalizedTender`)
 *  - `src/db/seed/fixtures/boamp-real.json` (forme réelle des champs BOAMP)
 *
 * Les helpers `trimAndCapitalize`, `parseCpvCodes`, `parseAmount`, `parseDate`
 * et `normalizeUrl` sont exportés pour pouvoir être testés individuellement
 * (Vitest).
 *
 * Choix non triviaux :
 *  - Le DCE URL est tenté en `https://` si l'origine est `http://` (la spec
 *    sourcing engine §3.3 « ensure https » l'impose explicitement).
 *  - Les codes CPV sont normalisés au format strict 8 digits (Postgres
 *    `cpv text[]`). On garde le `XXXXXXXX-Y` brut côté `rawData.record`
 *    pour debug, mais on stocke uniquement les 8 digits dans `cpvCodes`.
 *  - `sourceUrl` est dérivé de la convention BOAMP `https://www.boamp.fr/avis/detail/<idweb>`
 *    (cf. spec §3.1 « source_url »). Aucun champ `urldce` ni `sourceUrl`
 *    explicite dans la fixture — on utilise `url_dce` (présent) pour le DCE
 *    et on dérive `sourceUrl`. Voir handoff Cowork si la convention BOAMP
 *    devait évoluer.
 */

import type { BoampApiRecord, NormalizedTender, RawTender } from "./types";

// ============================================================================
// Helpers exportés (testables individuellement)
// ============================================================================

/**
 * Trim + capitalisation de la première lettre (le reste préservé tel quel).
 * Compresse les espaces multiples en un seul.
 *
 * Volontairement minimal — la capitalisation « propre » des libellés acheteurs
 * (« Mairie de Paris ») est l'affaire d'un éventuel post-traitement Title Case,
 * pas de ce helper. Voir handoff Cowork si désaccord sur le périmètre.
 */
export function trimAndCapitalize(value: string | null | undefined): string {
  if (!value || typeof value !== "string") return "";
  const collapsed = value.trim().replace(/\s+/g, " ");
  if (collapsed.length === 0) return "";
  return collapsed.charAt(0).toUpperCase() + collapsed.slice(1);
}

/**
 * Parse les codes CPV (principal + secondaires) et renvoie un tableau strict
 * de codes 8 digits dédupliqué.
 *
 * Format BOAMP : `XXXXXXXX-Y` (8 digits + check digit) ou `XXXXXXXX` parfois.
 * On supprime tout ce qui n'est pas un digit puis on tronque à 8.
 * Les codes < 8 digits sont filtrés (probablement parasites).
 */
export function parseCpvCodes(
  principal: string | null | undefined,
  secondary: string[] | null | undefined,
): string[] {
  const cleaned = (input: string | null | undefined): string | null => {
    if (!input || typeof input !== "string") return null;
    const digits = input.replace(/\D/g, "");
    if (digits.length < 8) return null;
    return digits.slice(0, 8);
  };

  const out = new Set<string>();
  const head = cleaned(principal);
  if (head) out.add(head);
  if (Array.isArray(secondary)) {
    for (const code of secondary) {
      const c = cleaned(code);
      if (c) out.add(c);
    }
  }
  return [...out];
}

/**
 * Parse un montant BOAMP en `number` ou `null`.
 * Accepte :
 *  - `number` natif (cas majoritaire dans la fixture committee)
 *  - `string` au format FR ("1 234 567,89 €") ou US ("1234567.89")
 *  - tout le reste → `null`
 *
 * Le séparateur de milliers FR (espace fine ou normale) est supprimé, la
 * virgule est convertie en point, le symbole € (et autres unités) est retiré.
 */
export function parseAmount(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  // Détection format FR : si on trouve une virgule décimale, on convertit.
  // On retire :
  //  - tous les caractères non-numériques sauf chiffres, "-", "." et ","
  //  - les espaces (incluant espaces fines U+202F et U+00A0)
  const cleaned = trimmed
    .replace(/[\s  ]/g, "") // séparateurs de milliers
    .replace(/€|EUR|HT|TTC/gi, "") // unités courantes
    .replace(/,/g, "."); // virgule décimale FR → point

  // On garde le premier "point" significatif uniquement
  const firstDot = cleaned.indexOf(".");
  let normalized = cleaned;
  if (firstDot >= 0) {
    normalized = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Parse une date BOAMP en `Date` ou `null`.
 * Accepte :
 *  - ISO 8601 (`2026-05-21T17:00:00+02:00`) — format majoritaire BOAMP
 *  - format FR `JJ/MM/AAAA` (avec optionnellement `HH:MM`)
 *  - tout le reste → `null` (pas de tentative `new Date(value)` non typée
 *    car JS accepte beaucoup trop de strings approximatifs).
 */
export function parseDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  // Format ISO 8601 (RFC 3339) : `YYYY-MM-DD` éventuellement suivi de `T...`
  // On reste strict pour ne pas accepter `2026-13-99` qui parse en runtime JS.
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})(T.+)?$/.exec(trimmed);
  if (isoMatch) {
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  // Format FR `JJ/MM/AAAA` ou `JJ/MM/AAAA HH:MM`
  const frMatch = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/.exec(trimmed);
  if (frMatch) {
    const [, dd, mm, yyyy, hh, mi] = frMatch;
    const iso = `${yyyy}-${mm}-${dd}T${hh ?? "00"}:${mi ?? "00"}:00+02:00`;
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

/**
 * Normalise une URL : trim, force `https://` si schéma manquant ou `http://`.
 * Retourne `null` si l'entrée est falsy ou invalide.
 */
export function normalizeUrl(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  let withScheme = trimmed;
  if (/^http:\/\//i.test(trimmed)) {
    withScheme = trimmed.replace(/^http:\/\//i, "https://");
  } else if (!/^https?:\/\//i.test(trimmed)) {
    withScheme = `https://${trimmed}`;
  }

  // Validation finale : on doit pouvoir construire un URL valide
  try {
    return new URL(withScheme).toString();
  } catch {
    return null;
  }
}

// ============================================================================
// Normalisation principale
// ============================================================================

/**
 * Normalise un RawTender issu d'un scraper Playwright (place, francmarches, mp_info).
 * Le record contient déjà les champs extraits par le scraper avec des noms normalisés.
 */
function normalizeScraped(raw: RawTender): NormalizedTender {
  const r = raw.rawData.record;
  const title = trimAndCapitalize((r["title"] as string | undefined) ?? "");
  const buyer = trimAndCapitalize((r["buyer"] as string | undefined) ?? "");

  // CPV : tableau de codes ou string comma-separated
  const cpvRaw = r["cpv"];
  let cpvCodes: string[] = [];
  if (Array.isArray(cpvRaw)) {
    cpvCodes = parseCpvCodes(
      (cpvRaw[0] as string | undefined) ?? null,
      (cpvRaw.slice(1) as string[]) ?? null,
    );
  } else if (typeof cpvRaw === "string") {
    cpvCodes = parseCpvCodes(cpvRaw, null);
  }

  const amount = typeof r["amount"] === "number" ? r["amount"] : parseAmount(r["amount"]);
  const deadline = parseDate((r["deadline"] as string | undefined) ?? null);
  const questionsDeadline = parseDate((r["questionsDeadline"] as string | undefined) ?? null);
  const dceUrl = normalizeUrl((r["dceUrl"] as string | undefined) ?? null);
  const sourceUrl = (r["sourceUrl"] as string | undefined) ?? null;

  return {
    externalRef: raw.externalRef,
    platformCode: raw.platformCode,
    title,
    buyer,
    cpvCodes,
    amount,
    deadline,
    questionsDeadline,
    visitDate: null,
    dceUrl,
    sourceUrl,
    rawData: raw.rawData,
  };
}

/**
 * Convertit un `RawTender` (post-connecteur) en `NormalizedTender` (prêt à
 * être inséré en BDD via `insertTender` — étape 4).
 *
 * Dispatch sur `raw.platformCode` :
 *  - `place` | `francmarches` | `mp_info` → `normalizeScraped` (champs directs)
 *  - `boamp` → logique Opendatasoft (champs BOAMP spécifiques)
 *
 * @param raw — issue du connecteur (étape 2)
 * @returns la forme finale `NormalizedTender`
 */
export function normalize(raw: RawTender): NormalizedTender {
  if (
    raw.platformCode === "place" ||
    raw.platformCode === "francmarches" ||
    raw.platformCode === "mp_info"
  ) {
    return normalizeScraped(raw);
  }

  // `raw.rawData.record` est `Record<string, unknown>` côté contrat — on
  // narrowe en `BoampApiRecord` pour exploiter le typage Opendatasoft.
  // Aucun cast `any` : `as unknown as BoampApiRecord` est l'idiome standard
  // quand on porte un type plus précis sur une forme déjà typée large.
  const fields = (raw.rawData.record ?? {}) as unknown as BoampApiRecord;

  // BOAMP : titre = `objet`, fallback éventuel sur `titre` (non présent dans
  // la fixture committee — défense en profondeur, voir handoff Cowork si
  // BOAMP introduit ce champ).
  const titleSource =
    (fields.objet as string | undefined) ?? (fields.titre as string | undefined) ?? "";
  const buyerSource =
    (fields.nomacheteur as string | undefined) ?? (fields.acheteur as string | undefined) ?? "";

  const title = trimAndCapitalize(titleSource);
  const buyer = trimAndCapitalize(buyerSource);

  const cpvCodes = parseCpvCodes(fields.codecpv_principal, fields.codecpv_secondaire ?? null);

  // Tenter plusieurs champs BOAMP en cascade : montant_estime est le principal,
  // mais BOAMP utilise parfois valeur_estimee, valeur_globale ou montant_global.
  // montant_minimum utilisé en fallback ultime pour les marchés à bon de commande.
  const rawAmount =
    fields.montant_estime ??
    fields.valeur_estimee ??
    fields.valeur_globale ??
    fields.montant_global ??
    fields.montant_minimum ??
    null;
  const amount = parseAmount(rawAmount);
  const deadline = parseDate(fields.datelimitereponse);

  // Champs facultatifs non garantis par la fixture — extraits via les noms
  // observés en prod chez BOAMP. Si absents, on conserve `null`.
  const questionsDeadline = parseDate(
    (fields.date_questions as string | undefined) ??
      (fields.datelimitequestions as string | undefined),
  );
  const visitDate = parseDate(
    (fields.date_visite as string | undefined) ?? (fields.datevisite as string | undefined),
  );

  // DCE : `url_dce` dans la fixture committee, `urldce` cité dans certaines
  // versions de spec — on tente les deux pour résilience. Voir handoff Cowork
  // si l'écart entre la fixture et la spec doit être tranché.
  const dceUrl = normalizeUrl(fields.url_dce ?? (fields.urldce as string | undefined) ?? null);

  // URL source canonique BOAMP — cf. spec §3.1
  const sourceUrl = `https://www.boamp.fr/avis/detail/${encodeURIComponent(raw.externalRef)}`;

  return {
    externalRef: raw.externalRef,
    platformCode: raw.platformCode,
    title,
    buyer,
    cpvCodes,
    amount,
    deadline,
    questionsDeadline,
    visitDate,
    dceUrl,
    sourceUrl,
    rawData: raw.rawData,
  };
}
