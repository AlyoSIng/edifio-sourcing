/**
 * Configuration des routes — middleware de domaine `@alyosingenierie.fr`.
 *
 * Source de vérité : `specs/middleware_domain_gate.md` §3.1.
 *
 * - PUBLIC_ROUTES : pathnames servis sans aucune vérification de session.
 * - PROTECTED_PREFIX : tout pathname qui commence par ce préfixe exige une
 *   session Supabase ET un email `@alyosingenierie.fr`. En cas de refus,
 *   redirection 307 vers `/login?next=<path>` ou `/forbidden`.
 * - PROTECTED_API_PREFIX : idem, mais en cas de refus l'API renvoie
 *   un JSON 403 `{error:"forbidden_domain"}` au lieu de rediriger.
 *
 * Toute évolution doit être reportée dans la spec et validée par [CTO Sophie].
 */

/** Routes publiques — pas de vérification middleware. */
export const PUBLIC_ROUTES = ["/", "/about", "/login", "/auth/callback", "/forbidden"] as const;

/** Préfixe des routes UI protégées (sourcing app authentifiée). */
export const PROTECTED_PREFIX = "/sourcing" as const;

/** Préfixe des routes API protégées (réponse JSON 403 si refus). */
export const PROTECTED_API_PREFIX = "/api/protected" as const;

/**
 * Retourne `true` si le pathname est une route publique (servie sans
 * vérification de session).
 */
export function isPublicRoute(pathname: string): boolean {
  return (PUBLIC_ROUTES as readonly string[]).includes(pathname);
}

/**
 * Retourne `true` si le pathname est une route UI protégée.
 */
export function isProtectedUiRoute(pathname: string): boolean {
  return pathname.startsWith(PROTECTED_PREFIX);
}

/**
 * Retourne `true` si le pathname est une route API protégée.
 * Détermine la forme de la réponse en cas de refus (JSON vs redirect).
 */
export function isProtectedApiRoute(pathname: string): boolean {
  return pathname.startsWith(PROTECTED_API_PREFIX);
}
