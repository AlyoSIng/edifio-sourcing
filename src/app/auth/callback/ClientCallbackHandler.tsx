"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { parseHashError } from "@/lib/auth/parse-hash-error";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Client Component du callback — gère trois cas dans le fragment d'URL :
 *
 * 1. **Fragment d'erreur Supabase** (`#error=…&error_code=otp_expired&…`) :
 *    le token a été consommé (typiquement par un scanner email Defender
 *    Safe Links) ou a expiré. On nettoie le fragment et on redirige vers
 *    `/auth/error?code=…` qui affiche un message UX clair. Cf. ADR-011.
 *
 * 2. **Implicit flow réussi** (`#access_token=…&refresh_token=…`) : produit
 *    par `auth.admin.generateLink({ type: "magiclink" })`. On extrait les
 *    tokens, on établit la session via `setSession()`, on redirige vers
 *    `next` (cible métier).
 *
 * 3. **Fragment vide ou inattendu** : redirection sur `/login?error=…`.
 *
 * Le `useRef` évite la double exécution de l'effet en mode React Strict
 * (Next.js dev) — l'appel à `setSession` ne doit s'exécuter qu'une fois.
 */
export function ClientCallbackHandler({ next }: { next: string }) {
  const router = useRouter();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    const hash = window.location.hash.slice(1);
    if (!hash) {
      router.replace("/login?error=magic_link_invalid");
      return;
    }

    // Cas 1 : fragment d'erreur Supabase (token expiré, consommé, accès refusé).
    const errorInfo = parseHashError(hash);
    if (errorInfo) {
      window.history.replaceState(null, "", window.location.pathname);
      const errorParams = new URLSearchParams();
      errorParams.set("code", errorInfo.code);
      if (errorInfo.description) errorParams.set("description", errorInfo.description);
      router.replace(`/auth/error?${errorParams.toString()}`);
      return;
    }

    // Cas 2 : fragment access_token / refresh_token (implicit flow réussi).
    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (!accessToken || !refreshToken) {
      router.replace("/login?error=magic_link_invalid");
      return;
    }

    const supabase = createSupabaseBrowserClient();
    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        if (error) {
          console.error("[auth/callback:setSession]", error.message);
          router.replace("/auth/error?code=server_error");
          return;
        }
        // Nettoyer le fragment pour ne pas le laisser traîner dans l'URL.
        window.history.replaceState(null, "", window.location.pathname);
        router.replace(next);
      });
  }, [next, router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50">
      <p className="text-sm text-neutral-600">Connexion en cours…</p>
    </main>
  );
}
