/**
 * Orchestrateur sourcing : fetch BOAMP → normalize → dedup → filter → score → insert.
 *
 * Étape 4/5 de la PR #3 scoring V1 + cron — coeur métier extrait de la route
 * cron pour faciliter les tests sans Next.js (vitest + mocks).
 *
 * Source de vérité :
 *  - `specs/module_sourcing_engine_v1.md` §2 (pipeline) + §3.4-3.7
 *  - `src/lib/sourcing/{connectors/boamp,normalize,dedup,filter,scoring,insert}.ts`
 *
 * Périmètre PR #3 :
 *  - BOAMP **uniquement** (API ouverte) — PLACE / Francmarchés / MP.info
 *    nécessitent le container Fly.io scraping (PR ultérieure).
 *  - Pas de scoring IA Haiku (PR scoring-ai dédiée).
 *  - Pas de push notification Realtime (PR notifications dédiée).
 *  - Pas de seuil d'insertion : tout AO qui passe le filter est inséré
 *    (décision Board 2026-05-20 — la notif user à seuil ≥60 sera traitée
 *    dans la PR push notifs).
 *
 * Fenêtre temporelle : `lastRunAt = now - 24h` côté V1 (cron quotidien).
 * L'idempotence `insertTender` (`onConflictDoUpdate` sur la contrainte UNIQUE
 * `(org, externalRef, platformId)`) protège des doubles imports si l'on
 * tourne le cron plusieurs fois dans la fenêtre.
 *
 * Choix non triviaux :
 *  - **Erreur unitaire ne stoppe pas le batch** : un AO qui plante à
 *    `normalize` ou `insert` est compté en `errors[]`, mais le reste du batch
 *    continue. C'est la robustesse attendue d'un cron quotidien (un AO BOAMP
 *    mal formé ne doit pas faire tomber 999 autres AO valides).
 *  - **Erreur connecteur stoppe le profil** : si `fetchSinceLastRun` jette
 *    (rate-limit, timeout, schéma cassé), on remonte l'erreur — `runSourcingForProfile`
 *    propage. La route cron (caller) intercepte et continue avec le profil suivant.
 *  - **Trace côté `console.log` structuré** : pas de table `sourcing_runs` en
 *    V1 (= nouvelle migration). Les métriques (durée, volumes) finissent dans
 *    Vercel logs / Datadog. Branchage Sentry futur (Gate 8) viendra greffer
 *    `Sentry.captureException` sur les erreurs (cf. helper audit/index.ts).
 */

import type { Db } from "@/db/client";
import type { SearchProfile } from "@/db/schema/config";

import type { BoampConnector } from "./connectors/boamp";
import { dedupBatch } from "./dedup";
import { matchesProfile, type MatchRejectReason } from "./filter";
import { insertTender, type DrizzleClient } from "./insert";
import { normalize } from "./normalize";
import { scoreTender } from "./scoring";
import type { NormalizedTender, RawTender } from "./types";

/** Fenêtre de fetch côté BOAMP : 24 heures glissantes (cron quotidien). */
const FETCH_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Résultat synthétique d'un run sur un profil — sérialisable JSON, retourné
 * par la route cron à Vercel + utilisé par les tests d'assertion.
 */
export interface ProfileRunResult {
  profileId: string;
  organizationId: string;
  /** Nombre d'AO bruts récupérés sur BOAMP (avant dédup intra-batch). */
  fetched: number;
  /** Nombre d'AO dédupliqués (intra-batch — cross-plateforme en PRs futures). */
  dedupSkipped: number;
  /** Nombre d'AO rejetés par `matchesProfile`, comptés par raison. */
  filtered: Partial<Record<MatchRejectReason, number>>;
  /** Nombre d'AO INSERT (nouveau tender en BDD). */
  inserted: number;
  /** Nombre d'AO UPDATE (re-source idempotent — raw_data + updated_at). */
  updated: number;
  /** Erreurs unitaires (un AO qui plante à normalize/insert — pas le connecteur). */
  errors: Array<{ externalRef: string | null; message: string }>;
  /** Durée totale du pipeline pour ce profil (ms). */
  durationMs: number;
}

/**
 * Options de `runSourcingForProfile` — connecteur + client Drizzle + horloge
 * sont injectés pour les tests (mock de fetch + db Proxy).
 */
export interface RunSourcingOptions {
  /** Connecteur BOAMP (cf. `createBoampConnector`). */
  connector: BoampConnector;
  /** Client Drizzle (réel ou mock). */
  db: DrizzleClient;
  /** Horloge — `() => new Date()` par défaut, override pour tests. */
  now?: () => Date;
}

/**
 * Exécute le pipeline complet pour UN profil :
 *  1. BOAMP : `fetchSinceLastRun(profileId, now - 24h)` → `RawTender[]`
 *  2. Normalize chaque raw → `NormalizedTender`
 *  3. Dedup intra-batch → unique[]
 *  4. Filter chaque tender vs profile (skip non-matchant, compte les raisons)
 *  5. Score chaque tender qui matche
 *  6. Insert idempotent
 *
 * @throws Si le connecteur BOAMP échoue (rate-limit épuisé, schéma cassé).
 *   La route cron caller intercepte et passe au profil suivant.
 */
export async function runSourcingForProfile(
  profile: SearchProfile,
  opts: RunSourcingOptions,
): Promise<ProfileRunResult> {
  const startedAt = Date.now();
  const nowFn = opts.now ?? (() => new Date());
  const lastRunAt = new Date(nowFn().getTime() - FETCH_WINDOW_MS);

  const result: ProfileRunResult = {
    profileId: profile.id,
    organizationId: profile.organizationId,
    fetched: 0,
    dedupSkipped: 0,
    filtered: {},
    inserted: 0,
    updated: 0,
    errors: [],
    durationMs: 0,
  };

  // 1. Fetch BOAMP — propage l'erreur (caller décide quoi faire)
  const raws: RawTender[] = await opts.connector.fetchSinceLastRun(profile.id, lastRunAt);
  result.fetched = raws.length;

  // 2. Normalize — un raw qui plante est compté en errors et exclu de la suite
  const normalized: NormalizedTender[] = [];
  for (const raw of raws) {
    try {
      normalized.push(normalize(raw));
    } catch (err) {
      result.errors.push({
        externalRef: raw.externalRef ?? null,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 3. Dedup intra-batch (cross-plateforme en PR future quand PLACE/etc actifs)
  const { unique, skipped } = dedupBatch(normalized);
  result.dedupSkipped = skipped.length;

  // 4 + 5 + 6. Filter / Score / Insert (séquentiel — petit volume, simple,
  // évite la complexité de gestion d'erreur en parallèle).
  for (const tender of unique) {
    const match = matchesProfile(tender, profile);
    if (!match.matched) {
      const key = match.reason;
      result.filtered[key] = (result.filtered[key] ?? 0) + 1;
      continue;
    }

    try {
      const score = scoreTender(tender, profile);
      const inserted = await insertTender(
        tender,
        {
          organizationId: profile.organizationId,
          profileId: profile.id,
          score,
        },
        opts.db,
      );
      if (inserted.isNew) {
        result.inserted += 1;
      } else {
        result.updated += 1;
      }
    } catch (err) {
      result.errors.push({
        externalRef: tender.externalRef,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  result.durationMs = Date.now() - startedAt;
  return result;
}

/**
 * Wrapper de plus haut niveau : exécute le pipeline pour TOUS les profils
 * fournis (typiquement `WHERE active=true`). Erreur connecteur → on log et
 * on continue avec le profil suivant.
 */
export interface RunSourcingBatchResult {
  totalProfiles: number;
  results: ProfileRunResult[];
  /** Profils dont le connecteur a jeté avant tout traitement. */
  failedProfiles: Array<{ profileId: string; message: string }>;
  durationMs: number;
}

export async function runSourcingForProfiles(
  profiles: SearchProfile[],
  opts: RunSourcingOptions,
): Promise<RunSourcingBatchResult> {
  const startedAt = Date.now();
  const results: ProfileRunResult[] = [];
  const failedProfiles: RunSourcingBatchResult["failedProfiles"] = [];

  for (const profile of profiles) {
    try {
      const r = await runSourcingForProfile(profile, opts);
      results.push(r);
    } catch (err) {
      failedProfiles.push({
        profileId: profile.id,
        message: err instanceof Error ? err.message : String(err),
      });
      // Trace structurée — exploitable par Vercel logs / Datadog
      console.error("[sourcing:profile:fail]", {
        profile_id: profile.id,
        organization_id: profile.organizationId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    totalProfiles: profiles.length,
    results,
    failedProfiles,
    durationMs: Date.now() - startedAt,
  };
}

/** Re-export pour la route cron (évite à `route.ts` d'importer `@/db/client` deux fois). */
export type { Db };
