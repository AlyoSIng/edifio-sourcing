"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Composant Client réutilisable qui inspecte `window.location.hash` au mount
 * pour détecter un flow Supabase Auth « recovery » (mot de passe oublié).
 *
 * Contexte de l'incident INC-2026-05-18-02 :
 *
 * Supabase envoie le lien de recovery sous forme implicit flow — les tokens
 * sont placés dans le **fragment** de l'URL (`#access_token=...&type=recovery`).
 * Le fragment n'est jamais envoyé au serveur, donc un Server Component (comme
 * la landing `/` ou la page `/login`) ne peut pas le lire. Sans handler Client,
 * l'utilisateur reste bloqué sur la landing et ne peut jamais réinitialiser
 * son mot de passe.
 *
 * Stratégie : ce composant rend `null` par défaut et est embarqué silencieux
 * sur les pages publiques où le fragment recovery peut atterrir (`/` et
 * `/login`). Il ne fait quelque chose QUE si `type=recovery` est détecté.
 *
 * Pourquoi un composant séparé de `ClientCallbackHandler` ?
 * Le handler `/auth/callback` est dédié au flow magic-link (legacy + E2E)
 * et redirige vers `/sourcing/ao-du-jour`. Le flow recovery doit rediriger
 * vers `/auth/update-password` pour forcer le changement de mot de passe.
 * Garder deux composants évite la régression sur le flow magic-link et
 * facilite l'évolution future (le flow recovery est aussi le seul à
 * encoder `type=recovery` dans le fragment — la garde explicite est plus
 * lisible que des branches imbriquées).
 *
 * Réf : `DECISIONS.md` 2026-05-19 (Alex), pivot auth password 2026-05-10
 * (CLAUDE.md §4).
 */

type Status = "idle" | "processing";

export function RecoveryHashHandler() {
  const router = useRouter();
  const handledRef = useRef(false);
  const [status, setStatus] = useState<Status>("idle");

  useEffect(() => {
    // `useRef` anti-double-exec en mode React Strict (Next.js dev) — l'appel
    // à `setSession` ne doit s'exécuter qu'une fois par mount réel.
    if (handledRef.current) return;

    // Le hash n'est dispo que côté navigateur — on garde la garde même si
    // l'effect ne tourne déjà que côté client, par sécurité.
    if (typeof window === "undefined") return;

    const hash = window.location.hash.slice(1);
    if (!hash) return;

    const params = new URLSearchParams(hash);
    const type = params.get("type");

    // Garde explicite : on ne s'active QUE sur les fragments recovery.
    // Un éventuel `#section` natif (ancre intra-page) n'a pas de `type=`,
    // donc on sort sans bruit. Idem pour un fragment magic-link orphelin
    // (qui n'aurait normalement pas atterri sur `/` ou `/login`, mais on
    // se laisse insensibles si le cas arrive).
    if (type !== "recovery") return;

    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (!accessToken || !refreshToken) {
      // Hash recovery mal formé → on vide l'URL et on renvoie sur /login
      // avec un code d'erreur pour qu'on puisse afficher un message utile.
      console.error("[auth/recovery] tokens manquants dans le fragment recovery");
      router.replace("/login?error=recovery_invalid");
      return;
    }

    handledRef.current = true;
    setStatus("processing");

    const supabase = createSupabaseBrowserClient();
    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        if (error) {
          console.error("[auth/recovery:setSession]", error.message);
          router.replace("/login?error=recovery_invalid");
          return;
        }
        // Nettoyer le fragment pour ne pas laisser les tokens traîner dans
        // l'URL (historique navigateur, partage accidentel).
        window.history.replaceState(null, "", window.location.pathname);
        router.replace("/auth/update-password");
      });
  }, [router]);

  if (status === "idle") return null;

  // Overlay discret affiché pendant le redirect — limite l'effet "clignotement"
  // de la landing publique avant que le router navigue vers update-password.
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-50/95"
    >
      <p className="text-sm text-neutral-600">Redirection en cours…</p>
    </div>
  );
}
