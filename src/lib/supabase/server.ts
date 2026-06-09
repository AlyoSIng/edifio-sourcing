import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Client Supabase serveur — pour Server Actions, Route Handlers et Server
 * Components (lecture seule sur ces derniers).
 *
 * Source : `@supabase/ssr` 0.10 — pattern Next.js 14 App Router avec l'API
 * `getAll` / `setAll` (introduite en 0.6, remplace l'API deprecated
 * `get` / `set` / `remove`).
 *
 * Les Server Components ne peuvent PAS écrire de cookies en Next.js 14
 * (limite framework). Le `try/catch` permet d'utiliser le même helper côté
 * Server Component sans planter — la session se rafraîchira au prochain
 * passage dans une Route Handler ou une Server Action.
 *
 * NB : le `middleware.ts` racine instancie son propre client Supabase via
 * les cookies de `NextRequest` / `NextResponse` (cf. spec §3.1) — on ne
 * réutilise pas ce helper dans le middleware.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            // COOKIE_DOMAIN (optionnel, serveur uniquement) — permet de poser
            // le cookie sur le domaine parent `.alyosingenierie.fr` en prod pour
            // le SSO Phase 2 (sourcing. / suivi. / admin.alyosingenierie.fr).
            // Si absent ou vide : comportement inchangé (cookie sur domaine courant).
            const cookieDomain = process.env.COOKIE_DOMAIN || undefined;
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, {
                ...options,
                ...(cookieDomain ? { domain: cookieDomain } : {}),
              });
            });
          } catch {
            // Appel depuis un Server Component — Next 14 ne permet pas
            // d'écrire les cookies ici. Ignoré silencieusement : la session
            // sera rafraîchie au prochain Route Handler ou Server Action.
          }
        },
      },
    },
  );
}

/**
 * Client Supabase admin (service_role) — bypass RLS, à utiliser uniquement
 * côté serveur et UNIQUEMENT pour des opérations système (audit log,
 * provisioning, tests E2E). **NE JAMAIS exposer au bundle client.**
 *
 * Utilise des cookies "no-op" : le client admin ne lit ni ne pose de session
 * utilisateur (par définition il bypass tout).
 */
export function createSupabaseAdminClient() {
  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          /* no-op */
        },
      },
    },
  );
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Variable d'environnement ${name} manquante. Voir .env.example et créer .env.local à la racine du projet.`,
    );
  }
  return value;
}
