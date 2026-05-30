"use client";

/**
 * Toast d'erreur pour les actions tender (PR n°5).
 *
 * Écoute le CustomEvent `tender-action-error` dispatché par
 * `TenderCardActions` quand une server action renvoie `{ ok: false }`.
 * Affiche le message FR en `role="alert"` pendant 5 secondes puis se cache
 * automatiquement.
 *
 * Pourquoi pas de lib externe ? V1 simple : `<div role="alert">` est natif
 * et accessible (les lecteurs d'écran annoncent immédiatement). Pas de
 * dépendance ajoutée. Pour Phase 2, si besoin de toasts multiples
 * empilés/queue, on basculera sur sonner ou shadcn/ui Toast.
 *
 * Côté lecteurs d'écran : `role="alert"` + `aria-live="assertive"` garantit
 * l'annonce immédiate, distincte du contenu courant.
 */

import { useEffect, useState } from "react";

const AUTO_HIDE_MS = 5_000;

interface ToastState {
  visible: boolean;
  message: string;
}

interface ActionErrorEventDetail {
  message: string;
  code: string;
}

export function TenderActionsErrorToast() {
  const [state, setState] = useState<ToastState>({ visible: false, message: "" });

  useEffect(() => {
    function onError(e: Event) {
      const ce = e as CustomEvent<ActionErrorEventDetail>;
      const message = ce.detail?.message ?? "Erreur technique. Réessaye dans quelques instants.";
      setState({ visible: true, message });
    }
    window.addEventListener("tender-action-error", onError);
    return () => window.removeEventListener("tender-action-error", onError);
  }, []);

  useEffect(() => {
    if (!state.visible) return;
    const timer = window.setTimeout(() => {
      setState((s) => ({ ...s, visible: false }));
    }, AUTO_HIDE_MS);
    return () => window.clearTimeout(timer);
  }, [state.visible]);

  if (!state.visible) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="mb-4 rounded-md border border-error bg-error-bg px-4 py-3 text-sm text-error shadow-sm"
    >
      <strong className="mr-1 font-semibold">Action impossible :</strong>
      {state.message}
    </div>
  );
}
