"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Client Component du callback — gère l'implicit flow (`#access_token=...`)
 * que `auth.admin.generateLink` produit (notamment pour les tests E2E).
 *
 * Le fragment d'URL n'est jamais envoyé au serveur, donc seul ce composant
 * (qui s'exécute côté navigateur) peut l'extraire et établir la session via
 * `supabase.auth.setSession({ access_token, refresh_token })`.
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
          router.replace("/login?error=magic_link_invalid");
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
