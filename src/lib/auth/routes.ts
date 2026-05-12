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
export const PUBLIC_ROUTES = [
  "/",
  "/about",
  "/login",
  "/auth/callback",
  "/forbidden",
  "/forgot-password",
  // /reset-password est gérée à part : techniquement publique (un visiteur
  // arrive depuis un email Resend sans cookie de session), mais le
  // middleware lui applique une logique spécifique (cf. RESET_PASSWORD_PATH
  // plus bas). On la met dans PUBLIC_ROUTES pour ne pas la traiter comme
  // protégée par défaut.
  "/reset-password",
] as const;

/** Préfixe des routes UI protégées (sourcing app authentifiée). */
export const PROTECTED_PREFIX = "/sourcing" as const;

/** Préfixe des routes admin — exige role admin en plus de l'auth Alyos. */
export const ADMIN_PREFIX = "/sourcing/admin" as const;

/** Préfixe des routes API protégées (réponse JSON 403 si refus). */
export const PROTECTED_API_PREFIX = "/api/protected" as const;

/** Préfixe des routes API admin — exige role admin. */
export const ADMIN_API_PREFIX = "/api/admin" as const;

/** Path exact de la page reset-password (utilisé pour le branchement middleware). */
export const RESET_PASSWORD_PATH = "/reset-password" as const;

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
  return pathname.startsWith(PROTECTED_API_PREFIX) || pathname.startsWith(ADMIN_API_PREFIX);
}

/**
 * Retourne `true` si le pathname requiert le rôle `admin`. C'est un sous-
 * ensemble des routes protégées (UI ou API) qui ne change pas la nature de
 * la réponse côté middleware (UI redirect / API JSON 403) — la décision se
 * fait après celle sur l'authentification + domaine.
 */
export function isAdminRoute(pathname: string): boolean {
  return pathname.startsWith(ADMIN_PREFIX) || pathname.startsWith(ADMIN_API_PREFIX);
}
