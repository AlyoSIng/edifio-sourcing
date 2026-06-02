import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isAuthorizedEmail } from "@/lib/auth/domain";
import {
  isAdminRoute,
  isProtectedApiRoute,
  isProtectedUiRoute,
  isPublicRoute,
  isSuperAdminRoute,
  RESET_PASSWORD_PATH,
} from "@/lib/auth/routes";
import {
  isProvisionalPasswordExpired,
  isSuperAdmin,
  mustChangePassword,
  toUserProfile,
} from "@/lib/auth/types";

/**
 * Middleware racine — garde de domaine `@alyosingenierie.fr` + gates
 * `must_change_password` et `admin`.
 *
 * Source de vérité initiale : `specs/middleware_domain_gate.md` §3.1.
 * Extension Board 2026-05-11 (pivot password) :
 *   - redirection forcée vers /reset-password si `must_change_password === true`
 *   - garde `admin` sur `/sourcing/admin/*` et `/api/admin/*`
 *
 * Garde-fou Board (CLAUDE.md — Limites strictes) : la désactivation de ce
 * middleware est INTERDITE. La garde de domaine reste la base, les nouvelles
 * règles s'empilent par-dessus.
 *
 * Pattern cookies : API `getAll` / `setAll` de `@supabase/ssr` 0.6+.
 */

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  try {
    // ---------- 1. Routes publiques (laissées passer) ----------
    // Important : on traverse quand même Supabase pour les routes publiques
    // qui peuvent vouloir agir sur la session (par ex. /reset-password en
    // flow first-login lit la session). Mais on n'applique pas la garde.
    if (isPublicRoute(pathname)) {
      // Cas spécial /reset-password : si l'utilisateur est connecté et n'a
      // PAS must_change_password=true, on l'envoie dans l'app (évite qu'un
      // user actif tombe sur cette page par hasard via un vieux lien).
      if (pathname === RESET_PASSWORD_PATH) {
        // On lit la session si elle existe — mais on ne force rien si pas
        // de Supabase configuré.
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (supabaseUrl && supabaseAnonKey) {
          // Peut servir plus tard pour rediriger un user qui n'a plus
          // besoin de reset. Pour le MVP on ne fait rien — laisse passer.
          // Si on voulait l'implémenter : lire la session, si user + !mustChangePassword
          // ET pas de code en URL → redirect /sourcing/ao-du-jour.
        }
      }
      return NextResponse.next();
    }

    // ---------- 2. Routes ni publiques ni protégées ----------
    const requiresAuth = isProtectedUiRoute(pathname) || isProtectedApiRoute(pathname);
    if (!requiresAuth) {
      return NextResponse.next();
    }

    // ---------- 3. Garde-fou env Supabase ----------
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn(
        "[middleware] NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY manquant — comportement anonyme par défaut.",
      );
      // P3 (2026-05-22) — Les routes API doivent répondre JSON. Sinon le
      // browser suit le redirect 307 vers /login (page HTML) et le caller
      // côté UI plante avec `Unexpected token <` au `JSON.parse`.
      if (isProtectedApiRoute(pathname)) {
        return jsonUnauthorizedApi(
          503,
          "service_unavailable",
          "Service indisponible (configuration Supabase manquante).",
        );
      }
      return redirectToLogin(req, pathname);
    }

    let supabaseResponse = NextResponse.next({ request: req });

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // COOKIE_DOMAIN (optionnel, serveur uniquement) — même règle que
          // src/lib/supabase/server.ts : domaine parent `.alyosingenierie.fr`
          // en prod pour SSO Phase 2. Si absent ou vide : comportement inchangé.
          const cookieDomain = process.env.COOKIE_DOMAIN || undefined;
          cookiesToSet.forEach(({ name, value }) => {
            req.cookies.set(name, value);
          });
          supabaseResponse = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, {
              ...options,
              ...(cookieDomain ? { domain: cookieDomain } : {}),
            });
          });
        },
      },
    });

    // IMPORTANT : ne PAS exécuter de logique métier entre `createServerClient`
    // et `supabase.auth.getUser()` (warning officiel Supabase).
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // ---------- 4. Session absente ----------
    if (!user) {
      // P3 (2026-05-22) — Les routes API renvoient JSON 401 plutôt qu'un
      // 307 vers /login. Sans ça, les fetch côté UI (`InviteUserDialog`,
      // `RegeneratePasswordButton`) suivent le redirect par défaut, reçoivent
      // la page HTML du login et plantent à `await resp.json()` avec
      // `Unexpected token <`. Le caller UI gère le 401 (cf. composants
      // patchés dans la même PR) en redirigeant manuellement vers /login.
      if (isProtectedApiRoute(pathname)) {
        return jsonUnauthorizedApi(401, "unauthorized", "Authentification requise.");
      }
      return redirectToLogin(req, pathname);
    }

    // ---------- 5. Garde domaine `@alyosingenierie.fr` (INCHANGÉE) ----------
    const email = user.email ?? null;
    const allowed = isAuthorizedEmail(email);

    void logAccessAttempt({
      email: email?.toLowerCase() ?? null,
      pathname,
      allowed,
      ip: extractClientIp(req),
      userAgent: req.headers.get("user-agent"),
    });

    if (!allowed) {
      await supabase.auth.signOut();

      if (isProtectedApiRoute(pathname)) {
        // Option A : on propage les cookies effacés par `signOut` (cf. setAll
        // de createServerClient ci-dessus) à la réponse 403 finale. Sans ça,
        // les cookies sb-* restent côté browser jusqu'à expiration naturelle —
        // viole `specs/middleware_domain_gate.md` §2 C4 « session invalidée
        // immédiatement ». Ré-appliqué le 2026-05-16 après refactor du helper
        // E2E signInWith (route /api/test/seed-session) qui dé-couple la pose
        // de session côté E2E du chemin form-login + middleware.
        const apiResponse = new NextResponse(
          JSON.stringify({
            error: "forbidden_domain",
            message: "Accès réservé aux membres AlyoS Ingénierie.",
          }),
          {
            status: 403,
            headers: { "content-type": "application/json" },
          },
        );
        propagateAuthCookies(supabaseResponse, apiResponse);
        return apiResponse;
      }

      const redirectResponse = NextResponse.redirect(new URL("/forbidden", req.url));
      propagateAuthCookies(supabaseResponse, redirectResponse);
      return redirectResponse;
    }

    // ---------- 6. Gate must_change_password ----------
    // Extension pivot password : si le user est sur un provisoire (must_change=true),
    // on le force vers /reset-password tant qu'il n'a pas choisi un mot de passe.
    // Note : la page /reset-password est dans PUBLIC_ROUTES (étape 1) donc le
    // middleware n'arrive ici que pour les routes protégées — pas de boucle.
    const profile = toUserProfile(user);
    if (mustChangePassword(profile)) {
      // Cas pathologique : provisoire expiré et user encore avec un token
      // valide (qui peut arriver si l'expiration est posée côté metadata
      // mais qu'on l'ignore côté JWT). On signe-out et on renvoie /login
      // avec un message explicite. La Server Action signInWithPasswordAction
      // applique la même règle au moment du login.
      if (isProvisionalPasswordExpired(profile)) {
        await supabase.auth.signOut();
        const loginUrl = new URL("/login", req.url);
        loginUrl.searchParams.set("error", "provisional_expired");
        // Même pattern de propagation que la garde domaine — les cookies sb-*
        // effacés par `signOut` doivent atteindre le browser, sinon la session
        // locale persiste jusqu'à expiration JWT.
        const redirectResponse = NextResponse.redirect(loginUrl);
        propagateAuthCookies(supabaseResponse, redirectResponse);
        return redirectResponse;
      }

      // Route API : 403 avec code explicite plutôt qu'un redirect (les
      // appels fetch ne suivent pas l'auth flow).
      if (isProtectedApiRoute(pathname)) {
        return new NextResponse(
          JSON.stringify({
            error: "password_change_required",
            message: "Veuillez définir votre mot de passe avant d'accéder à l'API.",
          }),
          { status: 403, headers: { "content-type": "application/json" } },
        );
      }

      // Route UI : redirect /reset-password (qui détectera la session et
      // affichera le form en mode first-login).
      return NextResponse.redirect(new URL(RESET_PASSWORD_PATH, req.url));
    }

    // ---------- 7. Gate admin ----------
    // Un superadmin peut également accéder aux routes admin (son rôle est supérieur).
    if (isAdminRoute(pathname) && profile.role !== "admin" && !isSuperAdmin(profile)) {
      if (isProtectedApiRoute(pathname)) {
        return new NextResponse(
          JSON.stringify({
            error: "forbidden_role",
            message: "Réservé aux administrateurs.",
          }),
          { status: 403, headers: { "content-type": "application/json" } },
        );
      }
      // UI : on redirige vers ao-du-jour avec un flash error pour signaler.
      const fallback = new URL("/sourcing/ao-du-jour", req.url);
      fallback.searchParams.set("error", "forbidden");
      return NextResponse.redirect(fallback);
    }

    // ---------- 8. Gate superadmin ----------
    // Réservé à l'éditeur edifio (contact@edifio.fr + steissier@alyosingenierie.fr).
    // Décision Board 2026-05-27.
    if (isSuperAdminRoute(pathname) && !isSuperAdmin(profile)) {
      if (isProtectedApiRoute(pathname)) {
        return new NextResponse(
          JSON.stringify({
            error: "forbidden_role",
            message: "Réservé aux superadministrateurs.",
          }),
          { status: 403, headers: { "content-type": "application/json" } },
        );
      }
      const fallback = new URL("/sourcing/ao-du-jour", req.url);
      fallback.searchParams.set("error", "forbidden");
      return NextResponse.redirect(fallback);
    }

    // ---------- 9. Accès autorisé ----------
    return supabaseResponse;
  } catch (err) {
    console.error("[middleware:unhandled]", {
      pathname,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : null,
    });
    // P3 (2026-05-22) — Même règle que les autres branches : sur une route
    // API, on renvoie du JSON, pas un redirect HTML. Le caller UI traite
    // alors l'erreur proprement (état d'erreur inline) plutôt que de planter
    // au JSON.parse.
    if (isProtectedApiRoute(pathname)) {
      return jsonUnauthorizedApi(
        500,
        "internal_error",
        "Une erreur serveur est survenue. Veuillez réessayer.",
      );
    }
    return redirectToLogin(req, pathname);
  }
}

/**
 * Helper — construit une réponse JSON pour les routes `/api/protected/*` et
 * `/api/admin/*` quand le middleware doit refuser l'accès. Le statut HTTP
 * dépend de la raison (401 session absente, 403 domaine/role refusé, 503 env
 * indisponible, 500 erreur inattendue).
 *
 * Pourquoi : Next.js `redirect()` produit un 307 vers une page HTML. Les
 * fetch côté browser suivent ce redirect par défaut et reçoivent du HTML
 * inattendu. Le caller UI plante alors à `await resp.json()`. En renvoyant
 * du JSON dès le middleware, le caller voit `resp.status === 401` (ou 403,
 * 503, 500) et peut afficher un message « session expirée » + redirect
 * manuel vers `/login`.
 */
function jsonUnauthorizedApi(status: number, error: string, message: string): NextResponse {
  return new NextResponse(JSON.stringify({ ok: false, error, message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function redirectToLogin(req: NextRequest, pathname: string): NextResponse {
  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

/**
 * Recopie les cookies posés sur `source` (typiquement le `supabaseResponse`
 * mué par le `setAll` de `createServerClient` après un `signOut`) vers
 * `target` (la réponse finale renvoyée par le middleware).
 *
 * Pourquoi : `supabase.auth.signOut()` efface les cookies sb-* via `setAll`,
 * mais ces mutations sont posées sur `supabaseResponse`. Si on renvoie un
 * *autre* `NextResponse` (redirect, 403 JSON), les cookies effacés n'atteignent
 * jamais le browser → la session locale persiste jusqu'à expiration JWT.
 *
 * Option A défensive : on recopie tout ce que Supabase a posé, sans présumer
 * du nommage (le pattern sb-<projectRef>-auth-token peut évoluer). Cf.
 * `specs/middleware_domain_gate.md` §2 C4 « session invalidée immédiatement ».
 */
function propagateAuthCookies(source: NextResponse, target: NextResponse): void {
  source.cookies.getAll().forEach((cookie) => {
    target.cookies.set(cookie);
  });
}

function extractClientIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") ?? null;
}

/**
 * Audit log `access_attempt` — limitation Edge runtime documentée.
 *
 * Contexte : ce middleware tourne en **Edge Runtime Vercel** (déclaré
 * implicitement — Next.js force le middleware en Edge). Le helper `audit()`
 * de `src/lib/audit/index.ts` ne peut PAS être appelé ici parce qu'il importe :
 *  - `createSupabaseAdminClient` (`@supabase/supabase-js` — incompatible Edge
 *    pour le service_role : le client ouvre des sockets TCP via Node:net) ;
 *  - `db/client` (transitif via les schemas Zod du payload audit — `postgres`
 *    requiert Node:net + Node:crypto fullsize).
 *
 * Trois options envisagées :
 *  1. **Console.warn structuré** (retenu) — JSON-parsable, capté par Vercel
 *     logs / Datadog. Coût zéro, pas de surface d'attaque supplémentaire.
 *  2. **Fetch vers `/api/audit/access-attempt`** — overhead 1 fetch par
 *     requête HTTP du site, latence ajoutée à chaque navigation, risque de
 *     boucle infinie si la route plante (re-tape middleware → re-tape audit).
 *     Rejeté pour MVP.
 *  3. **Branche audit côté `auth/callback`** — déjà tracé via l'action `login`
 *     (cf. AUDIT_ACTIONS) à la PR future qui branchera Supabase auth callback.
 *     L'`access_attempt` middleware reste un signal séparé (granularité par
 *     pathname) qui n'a pas d'équivalent côté callback.
 *
 * Décision Board 2026-05-14 (cf. note de suivi `CC_260514_AUDIT_ACCESS_ATTEMPT.md`) :
 * conserver `console.warn` structuré pour le MVP. Une PR Edge-compatible
 * (REST direct PostgREST via `fetch` natif Edge, sans SDK Supabase) sera
 * traitée en Phase 2 si le besoin BDD se confirme côté analytics sécurité.
 *
 * Le schéma Zod `accessAttemptSchema` reste un placeholder (cf.
 * `src/lib/audit/schemas.ts` A13) — sera durci en strict à la PR Phase 2.
 */
async function logAccessAttempt(payload: {
  email: string | null;
  pathname: string;
  allowed: boolean;
  ip: string | null;
  userAgent: string | null;
}): Promise<void> {
  // TODO(Phase 2) — Brancher INSERT audit_logs via PostgREST REST direct
  // (fetch natif Edge). Cf. JSDoc ci-dessus pour la justification du
  // console.warn temporaire.
  console.warn("[audit_log:access_attempt]", JSON.stringify(payload));
}
