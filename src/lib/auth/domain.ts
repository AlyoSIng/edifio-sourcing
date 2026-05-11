/**
 * Garde de domaine email — restriction d'accès à `@alyosingenierie.fr`.
 *
 * Source de vérité : `specs/middleware_domain_gate.md` §2 (matrice 12 cas C1-C12).
 *
 * Conditions d'acceptation :
 * - normalisation lowercase systématique avant comparaison (C11)
 * - match strict via `endsWith("@alyosingenierie.fr")` (pas de regex tolérante)
 *   → rejette les domaines cousins `@alyosingenierie.com` (C10)
 *   → rejette les sous-domaines `@dev.alyosingenierie.fr` (C12)
 * - accepte les alias `+` (`alice+test@alyosingenierie.fr`)
 * - rejette toute valeur falsy (null, undefined, chaîne vide)
 *
 * Cette fonction est **pure** et reste testable hors contexte Next.js / Supabase.
 * Toute évolution doit être reportée dans la spec et validée par [CTO Sophie].
 */

/** Domaine email autorisé à accéder à edifio Sourcing. Lowercase obligatoire. */
export const ALLOWED_DOMAIN = "@alyosingenierie.fr" as const;

/**
 * Retourne `true` si l'email appartient au domaine `@alyosingenierie.fr`.
 *
 * @param email — la valeur brute de `user.email` Supabase, potentiellement
 *   null / undefined / casse mixte / alias `+`.
 */
export function isAuthorizedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalised = email.trim().toLowerCase();
  // Garde-fou : un email valide contient exactement un `@`. On évite les faux
  // positifs sur des chaînes qui se termineraient par "@alyosingenierie.fr"
  // sans être un email (par exemple "blabla@@alyosingenierie.fr" ou
  // "blabla.alyosingenierie.fr").
  const atIndex = normalised.indexOf("@");
  if (atIndex < 0 || atIndex !== normalised.lastIndexOf("@")) return false;
  return normalised.endsWith(ALLOWED_DOMAIN);
}
