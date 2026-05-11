import { createServerClient, type CookieOptions } from "@supabase/ssr";
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
 */

/**
 * Matcher Next.js — exclut les ressources statiques et les assets
 * du périmètre du middleware (cf. spec §3.1).
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff|woff2|ico)$).*)",
  ],
};

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  // C1 / C5 — routes publiques : laisser passer sans vérification de session.
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // Toute route non publique ET non protégée est laissée passer aussi
  // (par exemple une route exploratoire en dev). Le contrôle s'applique
  // uniquement aux préfixes /sourcing et /api/protected.
  const requiresAuth = isProtectedUiRoute(pathname) || isProtectedApiRoute(pathname);
  if (!requiresAuth) {
    return NextResponse.next();
  }

  // Garde-fou env — si Supabase n'est pas encore configuré (étape 3 Gate 6
  // pas terminée), on traite tout comme anonyme : redirection vers /login.
  // Évite que le middleware crashe le serveur dev avant l'install Supabase.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn(
      "[middleware] NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY manquant — comportement anonyme par défaut (étape 3 Gate 6 non finalisée ?)",
    );
    return redirectToLogin(req, pathname);
  }

  // Récupérer la session via Supabase SSR — pose les cookies de refresh
  // automatiquement si besoin sur la réponse `res`.
  const res = NextResponse.next();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return req.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        res.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        res.cookies.set({ name, value: "", ...options });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // C2 / C8 / C9 — pas de session valide (anonyme, expirée, JWT tampering) :
  // redirection vers /login avec la route demandée en query string.
  if (!user) {
    return redirectToLogin(req, pathname);
  }

  // C3 / C4 / C7 / C10 / C11 / C12 — décision sur le domaine email.
  // Normalisation lowercase + match strict gérés par isAuthorizedEmail.
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

  // C3 / C6 — accès autorisé, on laisse passer la requête (avec les cookies
  // de refresh éventuellement posés par Supabase sur `res`).
  return res;
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
 * Extrait l'IP cliente. Sur Vercel Edge, `req.ip` est posée par la
 * plateforme ; en dev local ou derrière un proxy, on retombe sur
 * `x-forwarded-for` (premier IP de la liste).
 */
function extractClientIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.ip ?? null;
}

/**
 * Stub d'audit log — version étape 2 Gate 6.
 *
 * À l'étape 7 (post-décision ORM + première migration), brancher l'insertion
 * réelle dans `audit_logs` (action = `access_attempt`, cf. `specs/audit_log_v1.md`
 * et le schéma `specs/schema_v1.sql`). Pour l'instant on log côté serveur uniquement.
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
