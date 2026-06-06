/**
 * Logique de matching « CV ↔ profil de recherche » (Steve 2026-06-05).
 *
 * Jumeau exact de `fiche-metier-match.ts` et `reference-fiche-match.ts`
 * pour le kind biblio `cv` (CV individuels des collaborateurs AlyoS,
 * sous-traitants, partenaires).
 *
 * À la compile d'un dossier, on ne joint pas TOUS les CV de la bibliothèque,
 * mais seulement ceux dont les `matching_keywords` intersectent les
 * `keywords.positive` du profil de recherche actif de l'organisation.
 *
 * Cas d'usage typique : pour un AO « réhabilitation patrimoine + BIM », on
 * inclut les CV taggés « patrimoine, ABF » et « BIM, IFC, REVIT », pas le CV
 * de l'archi spécialisé crèche neuve.
 *
 * Extraite dans un fichier dédié pour pouvoir être testée unitairement sans
 * tirer tout le flow compileDossierAction (qui dépend de Supabase + Storage).
 */

/**
 * Décide si un CV doit être inclus dans le ZIP selon ses matching_keywords
 * et les positives du profil actif.
 *
 * Règles identiques à `shouldIncludeFicheMetier` :
 *   - matching_keywords vide ou null → NE PAS inclure (signal explicite que
 *     Steve n'a pas configuré les keywords pour ce CV).
 *   - profil sans positives → NE PAS inclure aucun CV (le sourcing n'est
 *     pas configuré, on n'a pas de signal de matching).
 *   - intersection non vide → INCLURE.
 *   - intersection vide → NE PAS inclure.
 *
 * Le match est insensible à la casse (normalize lowercase + trim).
 */
export function shouldIncludeCv(
  matchingKeywords: string[] | null | undefined,
  profilePositives: string[] | null | undefined,
): boolean {
  if (!matchingKeywords || matchingKeywords.length === 0) return false;
  if (!profilePositives || profilePositives.length === 0) return false;

  const normalizedPositives = new Set(profilePositives.map((k) => k.toLowerCase().trim()));
  return matchingKeywords.some((k) => normalizedPositives.has(k.toLowerCase().trim()));
}
