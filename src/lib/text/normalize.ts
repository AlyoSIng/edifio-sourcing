/**
 * Helpers de normalisation de strings pour le matching texte — edifio Sourcing.
 *
 * Module pur, sans dépendance, sans I/O. Utilisable côté serveur (Node + Edge
 * Functions Deno) et côté client (browser) sans adaptation.
 *
 * Source de vérité décisionnelle : `DECISIONS.md` 2026-05-22 (soir) — décision
 * (d) Board « normalisation accents+casse OBLIGATOIRE des deux côtés
 * (titre AO ↔ mots-clés) ». Bug constaté sur le cron prod du 22/05 :
 * 264/288 AOs filtrés `no_positive_keyword` à cause d'un `toLowerCase()`
 * sans suppression des diacritiques (`'bâtiment'` ne matchait pas
 * `'batiment'`).
 *
 * Utilisé par :
 *  - `src/lib/sourcing/filter.ts` (matching profil ↔ tender, étape 1/5 PR #3)
 *  - `src/lib/tandem/matching.ts` (matching architecte ↔ AO — Nadia, étape 2
 *    Tandem, à venir)
 */

/**
 * Normalise une string pour matching insensible à la casse ET aux accents /
 * diacritiques.
 *
 * Décompose en NFD (sépare base + diacritiques combinants), retire les marques
 * diacritiques combinantes (U+0300 à U+036F), puis applique `toLowerCase()`.
 *
 * Strict normalisation accents + casse, rien d'autre — pas de `trim`, pas de
 * remove punctuation, pas de stemming. Si un matching plus agressif s'avère
 * nécessaire, ce sera l'objet d'une PR « calibrage matcher v2 ».
 *
 * @example
 *   normalizeForMatching('Bâtiment')             // → 'batiment'
 *   normalizeForMatching('ÉCOLE')                // → 'ecole'
 *   normalizeForMatching('réhabilitation')       // → 'rehabilitation'
 *   normalizeForMatching('Équipement public')    // → 'equipement public'
 *
 * @param input — string à normaliser
 * @returns string normalisée (diacritiques retirés + lowercase)
 */
export function normalizeForMatching(input: string): string {
  return input.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
