/**
 * Scoring V1 (règles, sans IA) d'un AO normalisé — edifio Sourcing.
 *
 * Étape 3/5 de la PR #3 scoring V1 + cron.
 *
 * Source de vérité :
 *  - `specs/module_sourcing_engine_v1.md` §3.6 (scoreV1Rules + barème)
 *  - `src/db/schema/config.ts` (`searchProfiles.keywords` + `cpvCodes`)
 *  - `src/lib/sourcing/types.ts` (`NormalizedTender`)
 *
 * Barème (entier additif, clamp [0, 100]) :
 *  - **Base**         : `+50`
 *  - **Exact**        : `+20` si UNE expression `keywords.exact` est trouvée
 *    dans le title (1 hit suffit, pas cumulable).
 *  - **Positif**      : `+10` par mot-clé `keywords.positive` matché dans le
 *    title (cumulable — un titre matchant 3 positifs récolte +30).
 *  - **CPV exact**    : `+15` si AU MOINS un code CPV du tender est listé
 *    *exactement* dans `profile.cpvCodes` (pas en préfixe — c'est le filter
 *    §3.5 qui gère le préfixe).
 *
 * Plafond pratique avec ce barème : un AO avec 1 exact + 3 positifs + CPV
 * exact obtient `50 + 20 + 30 + 15 = 115` → clampé à `100`.
 *
 * Choix non triviaux :
 *  - **Sortie entière** : on retourne un `number` qui est toujours un entier
 *    [0, 100]. Cohérent avec l'audit log `tender_select.score: z.number().int()`
 *    et avec la spec §3.6. La BDD stocke en `numeric(5,2)` (rentre sans perte).
 *  - **Scope du match texte** : `title` uniquement, cohérent avec `filter.ts`.
 *    Si on étend à `rawData.record.description_marche`, le faire de manière
 *    coordonnée filter + scoring (sinon score sans rapport avec le filtrage).
 *  - **Pas de scoring IA en PR3** : le scoring complémentaire Haiku 4.5 décrit
 *    en spec §3.6 (`score_final = (score_rules + score_ai) / 2`) est reporté
 *    à une PR dédiée (dépend des prompts versionnés en BDD via la table
 *    `ai_prompt_versions` et de la branche audit `ai_run`). En attendant,
 *    `scoreTender()` retourne le score règles seul.
 *  - **Pas de borne montant** : la spec §3.6 mentionne `+5 si montant proche
 *    de la moyenne historique` mais explicitement « à calculer Phase 2 ».
 *    On ne l'implémente pas.
 */

import type { SearchProfile } from "@/db/schema/config";

import type { NormalizedTender } from "./types";

/** Bonus du barème §3.6 — exposés pour testabilité et lisibilité du code. */
export const SCORING_BASE = 50;
export const SCORING_EXACT_BONUS = 20;
export const SCORING_POSITIVE_BONUS = 10;
export const SCORING_CPV_EXACT_BONUS = 15;
const SCORE_MIN = 0;
const SCORE_MAX = 100;

/**
 * Détail du score (chaque composant + total clampé). Utile pour debug et
 * pour exposer l'explication dans l'UI « pourquoi cet AO a tel score ».
 *
 * Non destiné à être persisté en BDD — seul `total` finit dans `tenders.score`.
 */
export interface ScoreBreakdown {
  base: number;
  exactBonus: number;
  positiveBonus: number;
  cpvExactBonus: number;
  /** Total avant clamp (peut dépasser 100 — utile pour debug). */
  rawTotal: number;
  /** Total final clampé [0, 100], entier. */
  total: number;
}

/**
 * Calcule le score V1 (règles seules) + le détail des composants.
 *
 * @param tender — AO normalisé (post-`filter.matchesProfile === true`)
 * @param profile — profil de recherche ayant matché l'AO
 */
export function scoreTenderDetailed(
  tender: NormalizedTender,
  profile: SearchProfile,
): ScoreBreakdown {
  const titleLower = tender.title.toLowerCase();

  // Base
  const base = SCORING_BASE;

  // Exact : 1 hit suffit (pas cumulable, +20 absolu)
  const hasExactMatch = profile.keywords.exact.some((exp) =>
    titleLower.includes(exp.toLowerCase()),
  );
  const exactBonus = hasExactMatch ? SCORING_EXACT_BONUS : 0;

  // Positifs : +10 par mot-clé matché (cumulable)
  const positiveMatches = profile.keywords.positive.filter((kw) =>
    titleLower.includes(kw.toLowerCase()),
  ).length;
  const positiveBonus = positiveMatches * SCORING_POSITIVE_BONUS;

  // CPV exact : 1 hit suffit (+15 absolu). Match strict (pas startsWith).
  const hasCpvExact = tender.cpvCodes.some((code) => profile.cpvCodes.includes(code));
  const cpvExactBonus = hasCpvExact ? SCORING_CPV_EXACT_BONUS : 0;

  const rawTotal = base + exactBonus + positiveBonus + cpvExactBonus;
  const total = Math.max(SCORE_MIN, Math.min(SCORE_MAX, Math.trunc(rawTotal)));

  return { base, exactBonus, positiveBonus, cpvExactBonus, rawTotal, total };
}

/**
 * Variante simplifiée : retourne directement le score final entier [0, 100].
 * Sucre syntaxique pour les call-sites qui n'ont pas besoin du breakdown.
 */
export function scoreTender(tender: NormalizedTender, profile: SearchProfile): number {
  return scoreTenderDetailed(tender, profile).total;
}
