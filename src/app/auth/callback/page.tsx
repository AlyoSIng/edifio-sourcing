import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import { ClientCallbackHandler } from "./ClientCallbackHandler";

/**
 * Page de callback Supabase Auth — **route legacy, ADR-011**.
 *
 * Depuis l'abandon des flows tokenisés (magic-link + recovery), le flow auth
 * de production n'utilise plus jamais cette route. Elle reste cependant
 * accessible pour deux raisons :
 *
 *   1. **PKCE résiduel** — si une chaîne d'invitation legacy arrive ici avec
 *      `?code=...` (par ex. un test E2E qui passe encore par
 *      `auth.admin.generateLink({type:"magiclink"})` pour bootstrap une
 *      session sans UI), on l'échange contre une session et on redirige
 *      vers `/sourcing/ao-du-jour`. Le brief Board peut décider de la
 *      retirer une fois les helpers E2E migrés vers un login UI complet.
 *
 *   2. **Fragment d'erreur Supabase** — quand un ancien lien recovery /
 *      magic-link est cliqué après que son token a été consommé par un
 *      scanner email, Supabase peut rediriger ici avec un fragment
 *      `#error=…`. Le Client Component plus bas le décode et le route vers
 *      `/auth/error`. Cf. ADR-011.
 *
 * Source : `specs/adr_011_auth_strategy_post_scanner.md`.
 */

const DEFAULT_NEXT = "/sourcing/ao-du-jour";

export default async function AuthCallback({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const code = params.code;
  const errorParam = params.error;
  const next = sanitizeNext(params.next) ?? DEFAULT_NEXT;

  // PKCE résiduel — échange code → session, redirect destination.
  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      redirect("/auth/error?code=otp_expired");
    }
    redirect(next);
  }

  // Erreur explicite renvoyée par Supabase en query string — redirect direct
  // vers la page d'erreur dédiée.
  if (errorParam) {
    const errorParams = new URLSearchParams();
    errorParams.set("code", errorParam);
    redirect(`/auth/error?${errorParams.toString()}`);
  }

  // Pas de query string utilisable → on délègue au Client Component qui
  // inspecte le fragment (#error=…) côté browser. Cf. ClientCallbackHandler.
  return <ClientCallbackHandler />;
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
