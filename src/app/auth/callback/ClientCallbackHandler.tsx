"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { parseHashError } from "@/lib/auth/parse-hash-error";

/**
 * Client Component du callback — gère le fragment d'erreur Supabase.
 *
 * **ADR-011** : depuis l'abandon des flows tokenisés (magic-link + recovery),
 * `/auth/callback` ne reçoit plus de fragment `#access_token=…` à décoder.
 * La seule chose qu'on peut encore voir côté fragment, c'est un
 * `#error=…&error_code=otp_expired&…` posé par Supabase quand un ancien
 * lien en cache / partagé est cliqué après que son token a été consommé
 * (typiquement par un scanner email d'entreprise — Microsoft Defender Safe
 * Links, Proofpoint). On nettoie le fragment et on redirige vers
 * `/auth/error?code=…` qui affiche un message UX clair + un CTA
 * `/forgot-password`.
 *
 * Fragment vide ou non reconnu → redirection sur `/login` (signal neutre :
 * l'utilisateur a probablement atterri ici par erreur).
 *
 * Le `useRef` évite la double exécution de l'effet en mode React Strict
 * (Next.js dev) — la redirection ne doit s'exécuter qu'une fois.
 */
export function ClientCallbackHandler() {
  const router = useRouter();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    const hash = window.location.hash.slice(1);
    if (!hash) {
      router.replace("/login");
      return;
    }

    const errorInfo = parseHashError(hash);
    if (errorInfo) {
      window.history.replaceState(null, "", window.location.pathname);
      const errorParams = new URLSearchParams();
      errorParams.set("code", errorInfo.code);
      if (errorInfo.description) errorParams.set("description", errorInfo.description);
      router.replace(`/auth/error?${errorParams.toString()}`);
      return;
    }

    // Fragment présent mais non reconnu — on nettoie et on retourne au login.
    window.history.replaceState(null, "", window.location.pathname);
    router.replace("/login");
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper-2">
      <p className="text-sm text-ink-2">Redirection en cours…</p>
    </main>
  );
}
