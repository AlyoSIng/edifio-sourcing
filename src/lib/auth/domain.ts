/**
 * Garde de domaine email — restriction d'accès à `@alyosingenierie.fr`
 * et `@edifio.fr` (éditeur).
 *
 * Source de vérité : `specs/middleware_domain_gate.md` §2 (matrice 12 cas C1-C12).
 * Extension Board 2026-05-27 : `@edifio.fr` autorisé en plus de `@alyosingenierie.fr`
 * pour permettre au compte `contact@edifio.fr` (superadmin éditeur) d'accéder à
 * l'application.
 *
 * Conditions d'acceptation :
 * - normalisation lowercase systématique avant comparaison (C11)
 * - match strict via `endsWith(domain)` (pas de regex tolérante)
 *   → rejette les domaines cousins `@alyosingenierie.com` (C10)
 *   → rejette les sous-domaines `@dev.alyosingenierie.fr` (C12)
 * - accepte les alias `+` (`alice+test@alyosingenierie.fr`)
 * - rejette toute valeur falsy (null, undefined, chaîne vide)
 *
 * Cette fonction est **pure** et reste testable hors contexte Next.js / Supabase.
 * Toute évolution doit être reportée dans la spec et validée par [CTO Sophie].
 */

/**
 * Domaines email autorisés à accéder à edifio Sourcing.
 * Décision Board 2026-05-27 : ajout `@edifio.fr` pour le superadmin éditeur.
 */
export const ALLOWED_DOMAINS = ["@alyosingenierie.fr", "@edifio.fr"] as const;

/**
 * Alias déprécié — conservé pour rétro-compatibilité des imports existants.
 * Utiliser `ALLOWED_DOMAINS` à la place.
 * @deprecated Utiliser `ALLOWED_DOMAINS`.
 */
export const ALLOWED_DOMAIN = ALLOWED_DOMAINS[0];

/**
 * Retourne `true` si l'email appartient à l'un des domaines autorisés
 * (`@alyosingenierie.fr` ou `@edifio.fr`).
 *
 * @param email — la valeur brute de `user.email` Supabase, potentiellement
 *   null / undefined / casse mixte / alias `+`.
 */
export function isAuthorizedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalised = email.trim().toLowerCase();
  // Garde-fou : un email valide contient exactement un `@`. On évite les faux
  // positifs sur des chaînes qui se termineraient par un domaine autorisé
  // sans être un email (par exemple "blabla@@alyosingenierie.fr" ou
  // "blabla.alyosingenierie.fr").
  const atIndex = normalised.indexOf("@");
  if (atIndex < 0 || atIndex !== normalised.lastIndexOf("@")) return false;
  return ALLOWED_DOMAINS.some((domain) => normalised.endsWith(domain));
}
