/**
 * Filtrage d'un `NormalizedTender` selon un `SearchProfile` — edifio Sourcing.
 *
 * Étape 1/5 de la PR #3 scoring V1 + cron
 * (cf. plan validé Cowork 2026-05-20 — handoff non committé).
 *
 * Source de vérité :
 *  - `specs/module_sourcing_engine_v1.md` §3.5 (matchesProfile)
 *  - `src/db/schema/config.ts` (`searchProfiles` : structure `keywords` jsonb +
 *    `cpvCodes` text[] + `amountMin/Max` numeric)
 *  - `src/lib/sourcing/types.ts` (`NormalizedTender`)
 *
 * Comportement (aligné spec §3.5 stricte) :
 *  1. Mots-clés POSITIFS — si la liste est non vide, au moins un doit matcher
 *     dans `title` (case-insensitive). Liste vide ⇒ pas de filtre positif.
 *  2. Mots-clés NÉGATIFS — si UN seul matche dans `title`, l'AO est rejeté.
 *  3. CPV — si `cpvCodes` profile non vide, au moins un code AO doit avoir
 *     un de ces préfixes (8 digits = exact, < 8 = préfixe famille CPV).
 *  4. MONTANT — si `amountMin`/`amountMax` posés ET `tender.amount` non null,
 *     respect des bornes. Un AO sans montant connu passe (on n'a pas l'info).
 *
 * Choix non triviaux :
 *  - **Scope du matching texte** : la spec §3.5 dit « title OR objet » mais
 *    `NormalizedTender` ne porte qu'un `title` (l'objet BOAMP a été mappé
 *    vers `title` au normalize). On matche donc sur `title` uniquement —
 *    cohérent avec la fixture où `objet === title`. Voir handoff Cowork si
 *    le périmètre doit s'étendre à `rawData.record.description_marche`.
 *  - **CPV préfixe vs exact** : la spec §3.5 fait `startsWith(prefix)`. On
 *    garde ce comportement (un profile peut cibler `45` pour « tous les
 *    travaux BTP » ou `45211000` pour un type précis). Le scoring §3.6
 *    bonus `+15` est lui exact (cf. `scoring.ts`).
 *  - **Montant numeric → number** : Drizzle expose `amountMin/Max` en
 *    `string | null` (precision/scale numeric). On parse en number côté
 *    helper pour comparer à `tender.amount: number | null`. `null` profile
 *    ⇒ pas de filtre côté concerné.
 *  - **Géo et marketTypes** : non implémentés en V1. La spec §3.5 mentionne
 *    « géo (département) — heuristique à coder » et ne traite pas
 *    `marketTypes`. On laisse passer, à reprendre dans une PR dédiée quand
 *    l'extraction département sera spécifiée (probablement depuis
 *    `rawData.record.departement` BOAMP).
 */

import type { SearchProfile } from "@/db/schema/config";

import type { NormalizedTender } from "./types";

/**
 * Raisons documentées de rejet — chaîne discriminante exploitée par l'audit
 * log et par les tests (assertions sur la raison exacte). Strings stables :
 * ne pas renommer sans bump des tests + de l'audit log de l'orchestrateur.
 */
export type MatchRejectReason =
  | "no_positive_keyword"
  | `negative_keyword:${string}`
  | "cpv_mismatch"
  | "amount_below_min"
  | "amount_above_max";

/**
 * Résultat du matching. `matched=false` ⇒ `reason` typée discriminante.
 * `matched=true` ⇒ `reason='all_criteria_pass'` constant (utile pour le log
 * exhaustif côté orchestrateur sans avoir à brancher de cas spéciaux).
 */
export type MatchResult =
  | { matched: true; reason: "all_criteria_pass" }
  | { matched: false; reason: MatchRejectReason };

/**
 * Parse un montant numeric Drizzle (`string | null`) en `number | null`.
 * Tolérant : tout ce qui n'est pas un nombre fini renvoie `null`.
 * Helper interne (non exporté) — `parseAmount` côté `normalize.ts` couvre
 * le parsing des montants BOAMP côté tender, pas côté profile.
 */
function parseAmountBound(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Indique si `tender` matche `profile` selon les règles §3.5. Retourne
 * `{ matched, reason }` — la raison de rejet est documentée et stable.
 *
 * @param tender — AO normalisé (cf. `normalize.ts`)
 * @param profile — profil de recherche (Drizzle row, jsonb `keywords` typé)
 */
export function matchesProfile(tender: NormalizedTender, profile: SearchProfile): MatchResult {
  const titleLower = tender.title.toLowerCase();

  // 1. Mots-clés positifs (au moins un match si liste non vide)
  const positives = profile.keywords.positive;
  if (positives.length > 0) {
    const anyPositive = positives.some((kw) => titleLower.includes(kw.toLowerCase()));
    if (!anyPositive) {
      return { matched: false, reason: "no_positive_keyword" };
    }
  }

  // 2. Mots-clés négatifs (aucun match)
  const negatives = profile.keywords.negative;
  const negativeHit = negatives.find((kw) => titleLower.includes(kw.toLowerCase()));
  if (negativeHit) {
    return { matched: false, reason: `negative_keyword:${negativeHit}` };
  }

  // 3. CPV — au moins un code tender doit avoir un des préfixes profile
  if (profile.cpvCodes.length > 0) {
    const cpvHit = tender.cpvCodes.some((code) =>
      profile.cpvCodes.some((prefix) => code.startsWith(prefix)),
    );
    if (!cpvHit) {
      return { matched: false, reason: "cpv_mismatch" };
    }
  }

  // 4. Montant — bornes appliquées uniquement si tender.amount connu
  if (tender.amount !== null) {
    const min = parseAmountBound(profile.amountMin);
    const max = parseAmountBound(profile.amountMax);
    if (min !== null && tender.amount < min) {
      return { matched: false, reason: "amount_below_min" };
    }
    if (max !== null && tender.amount > max) {
      return { matched: false, reason: "amount_above_max" };
    }
  }

  return { matched: true, reason: "all_criteria_pass" };
}
