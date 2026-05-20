/**
 * Dé-doublonnage cross-plateformes d'AO normalisés — edifio Sourcing.
 *
 * Étape 2/5 de la PR #3 scoring V1 + cron.
 *
 * Source de vérité :
 *  - `specs/module_sourcing_engine_v1.md` §3.4 (hash composite + politique)
 *  - `src/lib/sourcing/types.ts` (`NormalizedTender`)
 *
 * Stratégie :
 *  - **Hash composite SHA-256** sur `(buyer_norm | title_norm[:100] | deadline_date)`.
 *  - Normalisation = lower + diacritiques retirés + espaces compressés/retirés.
 *  - Le `deadline` est tronqué au jour calendaire ISO (`YYYY-MM-DD`) — l'heure
 *    n'est pas signifiante pour identifier un AO commun à plusieurs plateformes
 *    (la plateforme A et B peuvent indiquer 16:00 / 17:00 sur le même AO).
 *  - `deadline: null` ⇒ partie « deadline » du hash = chaîne vide. Les AO sans
 *    deadline restent dé-doublonnables sur buyer+title seuls. Documentation
 *    ouverte : à confirmer Cowork si on veut au contraire NE PAS dédup les
 *    AO sans deadline (pour éviter les collisions accidentelles).
 *
 * Politique de conservation (cf. spec §3.4) :
 *  - À hash identique, on conserve la **première occurrence rencontrée** dans
 *    le batch — l'orchestrateur appelant émet `audit_log` `dedup_skip` pour
 *    chaque doublon écarté (hors scope de ce module).
 *  - `dedupBatch()` est **stable** : l'ordre d'entrée est préservé pour les
 *    occurrences gardées.
 */

import { createHash } from "node:crypto";

import type { NormalizedTender } from "./types";

/**
 * Retire les signes diacritiques d'une chaîne via décomposition Unicode NFD
 * puis suppression des marques de combinaison (catégorie Unicode `Mn`).
 *
 * Exemple : `"Rénovation française"` → `"Renovation francaise"`.
 *
 * Cas de la cédille (`ç`) : NFD la décompose en `c + ◌̧` (combining cedilla,
 * U+0327, catégorie Mn) → bien retirée. Pareil pour `œ` qui reste `œ` (pas
 * une lettre accentuée mais une ligature — non concernée par la dédup).
 *
 * `\p{Mn}` exige le flag `u` ES2018+ (Node ≥ 12). Pas de fallback.
 */
export function removeDiacritics(input: string): string {
  return input.normalize("NFD").replace(/\p{Mn}/gu, "");
}

/**
 * Normalise un segment du hash : trim + lower + remove diacritiques +
 * suppression de TOUS les espaces (espaces fines U+202F et U+00A0 incluses
 * via le passe `\s`).
 */
function normalizeSegment(input: string): string {
  return removeDiacritics(input.trim().toLowerCase()).replace(/\s+/g, "");
}

/**
 * Tronque la deadline au jour calendaire ISO `YYYY-MM-DD`. `null` ⇒ `""`.
 */
function normalizeDeadline(deadline: Date | null): string {
  if (!deadline) return "";
  // `toISOString()` est UTC — pour la dédup cross-plateforme c'est ce qu'on
  // veut (les deux plateformes parlent du même point temporel, même si elles
  // le présentent en fuseau local différent). Si une plateforme rapporte
  // `2026-06-30T23:00:00Z` et l'autre `2026-07-01T00:00:00+01:00`, c'est le
  // même instant et la même date côté UTC.
  return deadline.toISOString().slice(0, 10);
}

/**
 * Calcule le hash composite SHA-256 d'un AO normalisé.
 *
 * Format de la chaîne pré-hash : `<buyer>|<title:100>|<deadline>`.
 *
 * Sortie : hex 64 caractères (déterministe, stable cross-process).
 */
export function dedupHash(tender: NormalizedTender): string {
  const buyer = normalizeSegment(tender.buyer);
  const title = normalizeSegment(tender.title).slice(0, 100);
  const deadline = normalizeDeadline(tender.deadline);

  return createHash("sha256").update(`${buyer}|${title}|${deadline}`).digest("hex");
}

/**
 * Résultat de `dedupBatch` : la liste dédupliquée + la liste des doublons
 * écartés (avec le hash + l'AO conservé qui a « gagné ») pour audit log.
 */
export interface DedupBatchResult {
  /** AO uniques, ordre d'entrée préservé. */
  unique: NormalizedTender[];
  /**
   * AO écartés (doublons d'un AO déjà dans `unique`). Chaque entrée contient
   * le tender écarté, le hash partagé, et l'`externalRef` du tender conservé
   * — utile pour audit log `dedup_skip`.
   */
  skipped: Array<{
    tender: NormalizedTender;
    hash: string;
    keptExternalRef: string;
  }>;
}

/**
 * Dé-doublonne un batch d'AO. Stable : préserve l'ordre d'entrée des AO
 * conservés. À hash identique, le **premier rencontré** est conservé.
 *
 * @param tenders — AO normalisés à dédoublonner (typiquement le résultat
 *   concaténé des fetchers de toutes les plateformes du profil).
 */
export function dedupBatch(tenders: NormalizedTender[]): DedupBatchResult {
  const seen = new Map<string, NormalizedTender>();
  const unique: NormalizedTender[] = [];
  const skipped: DedupBatchResult["skipped"] = [];

  for (const tender of tenders) {
    const hash = dedupHash(tender);
    const kept = seen.get(hash);
    if (kept) {
      skipped.push({ tender, hash, keptExternalRef: kept.externalRef });
      continue;
    }
    seen.set(hash, tender);
    unique.push(tender);
  }

  return { unique, skipped };
}
