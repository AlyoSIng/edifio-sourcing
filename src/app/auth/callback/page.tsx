import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import { ClientCallbackHandler } from "./ClientCallbackHandler";

/**
 * Page de callback du magic-link Supabase Auth — gère **les deux flows** :
 *
 * 1. **PKCE flow (`?code=...`)** — flow standard du Server Action
 *    `signInWithOtp` côté browser client. La page Server Component détecte
 *    le `code` en query string, l'échange contre une session côté serveur,
 *    puis redirige (HTTP 307) vers `next` ou `/sourcing/ao-du-jour`.
 *
 * 2. **Implicit flow (`#access_token=...`)** — flow produit par
 *    `auth.admin.generateLink({ type: "magiclink" })` côté admin (utilisé
 *    par les helpers E2E `signInWith`). Le fragment d'URL n'est jamais
 *    envoyé au serveur → c'est le Client Component qui lit
 *    `window.location.hash`, appelle `supabase.auth.setSession()`, puis
 *    redirige.
 *
 * Cette double prise en charge permet aux tests Playwright de bypasser la
 * boîte mail tout en validant la matrice spec §2 du middleware.
 *
 * Source : `specs/middleware_domain_gate.md` §3.1 (callback étendu en
 * étape 3 Gate 6 pour support implicit flow E2E).
 */

const DEFAULT_NEXT = "/sourcing/ao-du-jour";

export default async function AuthCallback({
  searchParams,
}: {
  searchParams:
    | Promise<{ code?: string; error?: string; next?: string }>
    | {
        code?: string;
        error?: string;
        next?: string;
      };
}) {
  const params = await searchParams;
  const code = params.code;
  const errorParam = params.error;
  const next = sanitizeNext(params.next) ?? DEFAULT_NEXT;

  // PKCE flow : ?code=... → échange côté serveur.
  if (code) {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      redirect("/login?error=magic_link_invalid");
    }
    redirect(next);
  }

  // Erreur explicite renvoyée par Supabase (lien expiré, déjà consommé, etc.).
  if (errorParam) {
    redirect("/login?error=magic_link_invalid");
  }

  // Pas de `code` en query → soit c'est un implicit flow avec tokens dans le
  // fragment (#access_token=...), soit une requête bizarre. On délègue au
  // Client Component qui inspecte le fragment côté browser.
  return <ClientCallbackHandler next={next} />;
}

/**
 * N'accepte qu'un chemin relatif strict (commence par `/`, pas `//` ni `\`)
 * pour éviter les attaques par open redirect via le paramètre `next`.
 */
function sanitizeNext(value: string | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  if (value.includes("\\")) return null;
  return value;
}
