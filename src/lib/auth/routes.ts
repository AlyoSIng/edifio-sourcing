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
  "/pricing",
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
  // /trial-expired : page de verrou affichée quand le trial est expiré.
  // Public car l'utilisateur peut y être redirigé en session active depuis
  // n'importe quelle route protégée. Pas de données sensibles.
  "/trial-expired",
  // /no-org : page affichée quand un utilisateur authentifié n'a aucune
  // ligne `memberships` (sortie propre de `NoOrganizationMembershipError`).
  // Public car ne dépend pas du tenant — pas de données sensibles, juste
  // un message + bouton logout + lien mailto support. Lot 1.6-bis Hugo.
  "/no-org",
] as const;

/** Préfixe des routes UI protégées (sourcing app authentifiée). */
export const PROTECTED_PREFIX = "/sourcing" as const;

/** Préfixe des routes admin — exige role admin en plus de l'auth Alyos. */
export const ADMIN_PREFIX = "/sourcing/admin" as const;

/** Préfixe des routes API protégées (réponse JSON 403 si refus). */
export const PROTECTED_API_PREFIX = "/api/protected" as const;

/** Préfixe des routes API admin — exige role admin. */
export const ADMIN_API_PREFIX = "/api/admin" as const;

/**
 * Préfixe des routes UI superadmin — exige role superadmin.
 * Réservé à l'éditeur edifio. Compte canonique unique : sebastien@edifio.fr
 * (Steve 2026-06-05, facturation AlyoS désormais active).
 */
export const SUPERADMIN_PREFIX = "/sourcing/superadmin" as const;

/** Préfixe des routes API superadmin — exige role superadmin. */
export const SUPERADMIN_API_PREFIX = "/api/superadmin" as const;

/** Path exact de la page reset-password (utilisé pour le branchement middleware). */
export const RESET_PASSWORD_PATH = "/reset-password" as const;

/**
 * Préfixes publics du module Tandem (sous-étape 4) — page tokenisée
 * architecte + webhook Brevo. Ces routes contournent la garde domaine
 * `@alyosingenierie.fr` car elles sont conçues pour des acteurs externes ;
 * chaque handler porte sa propre vérification cryptographique (JWT
 * architecte / JWT opposition / HMAC Brevo). Cf.
 * `specs/module_tandem_engine_v1.md` §3.4-3.6.
 */
export const PUBLIC_ARCHITECT_PREFIX = "/archi/" as const;
export const PUBLIC_ARCHITECT_API_PREFIX = "/api/archi/" as const;
export const PUBLIC_BREVO_WEBHOOK_PATH = "/api/webhooks/brevo" as const;

/**
 * Préfixe public du module partage cotraitant — page tokenisée accessible
 * sans auth AlyoS. Sécurité assurée par le token UUID opaque (expiration 30j,
 * révocation manuelle). Cf. src/app/cotraitant/[token]/.
 */
export const PUBLIC_COTRAITANT_PREFIX = "/cotraitant/" as const;

/**
 * Retourne `true` si le pathname est une route publique (servie sans
 * vérification de session). Couvre les routes exactes de `PUBLIC_ROUTES`
 * ET les préfixes des modules Tandem et partage cotraitant.
 */
export function isPublicRoute(pathname: string): boolean {
  if ((PUBLIC_ROUTES as readonly string[]).includes(pathname)) return true;
  if (pathname.startsWith(PUBLIC_ARCHITECT_PREFIX)) return true;
  if (pathname.startsWith(PUBLIC_ARCHITECT_API_PREFIX)) return true;
  if (pathname === PUBLIC_BREVO_WEBHOOK_PATH) return true;
  if (pathname.startsWith(PUBLIC_COTRAITANT_PREFIX)) return true;
  return false;
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
  return (
    pathname.startsWith(PROTECTED_API_PREFIX) ||
    pathname.startsWith(ADMIN_API_PREFIX) ||
    pathname.startsWith(SUPERADMIN_API_PREFIX)
  );
}

/**
 * Retourne `true` si le pathname requiert le rôle `admin`. C'est un sous-
 * ensemble des routes protégées (UI ou API) qui ne change pas la nature de
 * la réponse côté middleware (UI redirect / API JSON 403) — la décision se
 * fait après celle sur l'authentification + domaine.
 *
 * Note : les routes superadmin NE sont PAS incluses ici — elles ont leur propre
 * garde (`isSuperAdminRoute`). Un superadmin peut accéder aux routes admin
 * mais un admin ne peut pas accéder aux routes superadmin.
 */
export function isAdminRoute(pathname: string): boolean {
  return pathname.startsWith(ADMIN_PREFIX) || pathname.startsWith(ADMIN_API_PREFIX);
}

/**
 * Retourne `true` si le pathname requiert le rôle `superadmin`.
 * Réservé à l'éditeur edifio. Compte canonique unique : sebastien@edifio.fr
 * (Steve 2026-06-05, facturation AlyoS désormais active).
 */
export function isSuperAdminRoute(pathname: string): boolean {
  return pathname.startsWith(SUPERADMIN_PREFIX) || pathname.startsWith(SUPERADMIN_API_PREFIX);
}
