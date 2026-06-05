/**
 * Logique de matching « fiches référence A4 ↔ profil de recherche » (Steve 2026-06-05).
 *
 * Jumeau exact de `fiche-metier-match.ts` pour le kind biblio `reference_fiche`
 * (fiches A4 individuelles décrivant une référence de marché AlyoS).
 *
 * À la compile d'un dossier, on ne joint pas TOUTES les fiches référence de la
 * bibliothèque, mais seulement celles dont les `matching_keywords` intersectent
 * les `keywords.positive` du profil de recherche actif de l'organisation.
 *
 * Extraite dans un fichier dédié pour pouvoir être testée unitairement sans
 * tirer tout le flow compileDossierAction (qui dépend de Supabase + Storage).
 */

/**
 * Décide si une fiche référence A4 doit être incluse dans le ZIP selon ses
 * matching_keywords et les positives du profil actif.
 *
 * Règles identiques à `shouldIncludeFicheMetier` :
 *   - matching_keywords vide ou null → NE PAS inclure (signal explicite que
 *     Steve n'a pas configuré les keywords pour cette fiche).
 *   - profil sans positives → NE PAS inclure aucune fiche (le sourcing n'est
 *     pas configuré, on n'a pas de signal de matching).
 *   - intersection non vide → INCLURE.
 *   - intersection vide → NE PAS inclure.
 *
 * Le match est insensible à la casse (normalize lowercase + trim).
 */
export function shouldIncludeReferenceFiche(
  matchingKeywords: string[] | null | undefined,
  profilePositives: string[] | null | undefined,
): boolean {
  if (!matchingKeywords || matchingKeywords.length === 0) return false;
  if (!profilePositives || profilePositives.length === 0) return false;

  const normalizedPositives = new Set(profilePositives.map((k) => k.toLowerCase().trim()));
  return matchingKeywords.some((k) => normalizedPositives.has(k.toLowerCase().trim()));
}
