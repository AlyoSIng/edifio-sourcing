import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isAuthorizedEmail } from "@/lib/auth/domain";
import { isProtectedApiRoute, isProtectedUiRoute, isPublicRoute } from "@/lib/auth/routes";

/**
 * Middleware racine — garde de domaine `@alyosingenierie.fr`.
 *
 * Source de vérité : `specs/middleware_domain_gate.md` §3.1.
 * Implémente la matrice de 12 cas C1-C12 documentée dans §2 de la spec.
 *
 * Garde-fou Board (CLAUDE.md — Limites strictes) : la désactivation de ce
 * middleware est INTERDITE. Toute modification de comportement doit faire
 * l'objet d'une PR validée [CTO Sophie] + remontée Board.
 *
 * Pattern cookies : API `getAll` / `setAll` de `@supabase/ssr` 0.6+ — le
 * setAll recrée `supabaseResponse` à chaque batch de cookies pour propager
 * correctement les rafraîchissements de session côté navigateur (pattern
 * officiel Supabase pour Next.js 14 App Router).
 */

export const config = {
  // Applique le middleware partout sauf sur les internals Next (`_next/*`)
  // et le favicon. Les assets `/public/*.svg|png|...` peuvent passer dans le
  // middleware sans conséquence : ils ne matchent ni `isPublicRoute` ni
  // `isProtectedUiRoute` ni `isProtectedApiRoute` → pass-through immédiat.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  // Garde-fou défensif — toute erreur non capturée dans la logique métier du
  // middleware aurait pour effet un 500 MIDDLEWARE_INVOCATION_FAILED sur Vercel
  // Edge, ce qui exposerait des routes protégées sans contrôle. On préfère
  // logger + redirect /login (fail-closed) en cas d'imprévu.
  try {
    // C1 / C5 — routes publiques : laisser passer sans vérification de session.
    if (isPublicRoute(pathname)) {
      return NextResponse.next();
    }

    // Routes ni publiques ni protégées (par exemple `/random-debug`) : on les
    // laisse passer. Le contrôle s'applique uniquement aux préfixes `/sourcing`
    // et `/api/protected`.
    const requiresAuth = isProtectedUiRoute(pathname) || isProtectedApiRoute(pathname);
    if (!requiresAuth) {
      return NextResponse.next();
    }

    // Garde-fou env — si Supabase n'est pas encore configuré, on traite tout
    // comme anonyme : redirection vers /login. Évite que le middleware crashe
    // le serveur dev avant l'install Supabase.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn(
        "[middleware] NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY manquant — comportement anonyme par défaut.",
      );
      return redirectToLogin(req, pathname);
    }

    // `supabaseResponse` est réinitialisé à chaque appel de `setAll` (pattern
    // officiel @supabase/ssr 0.6+). On garde une `let` pour pouvoir lui
    // réassigner une nouvelle réponse quand les cookies de session sont
    // rafraîchis par `getUser()`.
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
    // et `supabase.auth.getUser()` (warning officiel Supabase — bogue subtil
    // de session aléatoirement perdue sinon).
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // C2 / C8 / C9 — pas de session valide (anonyme, expirée, JWT tampering) :
    // redirection vers /login avec la route demandée en query string.
    if (!user) {
      return redirectToLogin(req, pathname);
    }

    // C3 / C4 / C7 / C10 / C11 / C12 — décision sur le domaine email.
    const email = user.email ?? null;
    const allowed = isAuthorizedEmail(email);

    // Audit log de la tentative d'accès — succès ET échec (cf. spec §6).
    void logAccessAttempt({
      email: email?.toLowerCase() ?? null,
      pathname,
      allowed,
      ip: extractClientIp(req),
      userAgent: req.headers.get("user-agent"),
    });

    if (!allowed) {
      // C4 / C7 — session non Alyos : invalidation immédiate côté Supabase.
      await supabase.auth.signOut();

      // C7 — route API protégée : réponse JSON 403, pas de redirect.
      if (isProtectedApiRoute(pathname)) {
        return new NextResponse(
          JSON.stringify({
            error: "forbidden_domain",
            message: "Accès réservé aux membres AlyoS Ingénierie.",
          }),
          {
            status: 403,
            headers: { "content-type": "application/json" },
          },
        );
      }

      // C4 — route UI protégée : redirection vers la page /forbidden dédiée.
      return NextResponse.redirect(new URL("/forbidden", req.url));
    }

    // C3 / C6 — accès autorisé. On renvoie la `supabaseResponse` qui porte
    // les cookies de session rafraîchis posés par `getUser()`.
    return supabaseResponse;
  } catch (err) {
    // Fail-closed : on log un maximum d'info pour debug Vercel runtime
    // logs, puis on redirige sur /login (route publique sûre) plutôt que
    // de laisser une 500 exposer la route protégée. Si le bug est ailleurs
    // que dans la session, on saura le voir via les logs.
    console.error("[middleware:unhandled]", {
      pathname,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : null,
    });
    return redirectToLogin(req, pathname);
  }
}

/**
 * Redirige vers `/login?next=<pathname>` pour conserver la destination
 * d'origine après authentification (cf. spec §2 cas C2 / C8).
 */
function redirectToLogin(req: NextRequest, pathname: string): NextResponse {
  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

/**
 * Extrait l'IP cliente depuis les headers de la requête. On évite
 * volontairement `req.ip` (déprécié Next 15+, instable sur Edge runtime
 * dans certaines régions Vercel) au profit de `x-forwarded-for` qui est
 * posé par Vercel sur toutes les requêtes.
 *
 * Ordre : `x-forwarded-for` (premier hop) → `x-real-ip` → null.
 */
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
 * réelle dans `audit_logs` (action = `access_attempt`, cf. `specs/audit_log_v1.md`
 * et le schéma `specs/schema_v1.sql`).
 */
async function logAccessAttempt(payload: {
  email: string | null;
  pathname: string;
  allowed: boolean;
  ip: string | null;
  userAgent: string | null;
}): Promise<void> {
  // TODO étape 7 Gate 6 — INSERT INTO audit_logs (action, actor_email, data, ...)
  // via service_role côté Edge Function ou route handler dédié.
  console.warn("[audit_log:access_attempt]", JSON.stringify(payload));
}
