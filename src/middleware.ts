import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isAuthorizedEmail } from "@/lib/auth/domain";
import {
  isAdminRoute,
  isProtectedApiRoute,
  isProtectedUiRoute,
  isPublicRoute,
  RESET_PASSWORD_PATH,
} from "@/lib/auth/routes";
import { isProvisionalPasswordExpired, mustChangePassword, toUserProfile } from "@/lib/auth/types";

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
      return redirectToLogin(req, pathname);
    }

    let supabaseResponse = NextResponse.next({ request: req });

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            req.cookies.set(name, value);
          });
          supabaseResponse = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
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
    if (isAdminRoute(pathname) && profile.role !== "admin") {
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

    // ---------- 8. Accès autorisé ----------
    return supabaseResponse;
  } catch (err) {
    console.error("[middleware:unhandled]", {
      pathname,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : null,
    });
    return redirectToLogin(req, pathname);
  }
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
 * Stub d'audit log — version étape 3 Gate 6.
 *
 * À l'étape 7 (post-décision ORM + première migration), brancher l'insertion
 * réelle dans `audit_logs` (action = `access_attempt`).
 */
async function logAccessAttempt(payload: {
  email: string | null;
  pathname: string;
  allowed: boolean;
  ip: string | null;
  userAgent: string | null;
}): Promise<void> {
  // TODO post-ORM : INSERT INTO audit_logs (...)
  console.warn("[audit_log:access_attempt]", JSON.stringify(payload));
}
