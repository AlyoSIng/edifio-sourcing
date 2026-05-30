"use client";

import { useState } from "react";

/**
 * Bouton « Renvoyer » — regénère un mot de passe provisoire pour un user
 * existant et lui renvoie l'email de bienvenue (Board Q1/A.3 2026-05-12).
 *
 * Affiché uniquement pour les users dont `must_change_password === true`
 * (provisoire en attente ou expiré) — pour les comptes actifs, le bouton
 * n'a pas de sens.
 *
 * UI minimaliste : message inline (succès / erreur) qui prend la place du
 * bouton après le clic. Pas de système de toast à brancher pour un MVP.
 */

type State =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export function RegeneratePasswordButton({ userId, email }: { userId: string; email: string }) {
  const [state, setState] = useState<State>({ status: "idle" });

  async function handleClick() {
    setState({ status: "submitting" });
    try {
      const resp = await fetch(`/api/admin/users/${userId}/regenerate-password`, {
        method: "POST",
      });

      // P3 (2026-05-22) — Le middleware renvoie désormais un JSON 401 plutôt
      // qu'un 307 vers /login sur les routes API. On gère ici le cas session
      // expirée : redirect manuel vers /login avec un `next` pour reprendre
      // l'écran admin après reconnexion.
      if (resp.status === 401) {
        setState({
          status: "error",
          message: "Session expirée — redirection vers la page de connexion...",
        });
        const next = encodeURIComponent("/sourcing/admin/users");
        window.location.href = `/login?next=${next}`;
        return;
      }

      const json = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        warning?: string;
      };
      if (!resp.ok || !json.ok) {
        setState({
          status: "error",
          message: json.message ?? `Erreur HTTP ${resp.status}`,
        });
        return;
      }
      setState({
        status: "success",
        message: json.warning ? json.warning : `Lien renvoyé à ${email}.`,
      });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (state.status === "success") {
    return (
      <span role="status" className="text-[11px] font-medium text-success">
        {state.message}
      </span>
    );
  }

  if (state.status === "error") {
    return (
      <span role="alert" className="text-[11px] font-medium text-error">
        {state.message}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={state.status === "submitting"}
      className="rounded-full border border-line-2 bg-white px-2.5 py-1 text-[11px] font-semibold text-ink transition hover:bg-paper-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:bg-paper-3 disabled:text-muted"
    >
      {state.status === "submitting" ? "Envoi…" : "Renvoyer"}
    </button>
  );
}
