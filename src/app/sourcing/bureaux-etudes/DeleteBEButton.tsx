"use client";

/**
 * Bouton de suppression hard d'un bureau d'études — admin uniquement.
 *
 * UX 2 clics (pas de modal) :
 *  - idle    : bouton rouge discret "Supprimer"
 *  - confirm : bouton rouge + texte "Confirmer ?" + bouton "Annuler"
 *  - pending : texte "Suppression…" + disabled
 *
 * Après succès : `window.location.reload()` pour rafraîchir la liste côté serveur.
 */

import { useTransition, useState } from "react";

import { deleteBEAction } from "./actions";

interface DeleteBEButtonProps {
  /** UUID du bureau d'études à supprimer. */
  beId: string;
  /** Nom du cabinet — affiché dans le texte de confirmation. */
  cabinet: string;
}

export function DeleteBEButton({ beId, cabinet }: DeleteBEButtonProps) {
  const [state, setState] = useState<"idle" | "confirm" | "pending">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isDisabled = state === "pending" || isPending;

  function handleClickDelete() {
    setErrorMsg(null);
    setState("confirm");
  }

  function handleClickCancel() {
    setState("idle");
    setErrorMsg(null);
  }

  function handleClickConfirm() {
    setState("pending");
    setErrorMsg(null);

    startTransition(async () => {
      const result = await deleteBEAction(beId);

      if (result.ok) {
        window.location.reload();
        return;
      }

      switch (result.error) {
        case "not_found":
          // Déjà supprimé — on recharge silencieusement
          window.location.reload();
          break;
        default:
          setErrorMsg("Erreur, réessayez.");
          setState("idle");
      }
    });
  }

  if (state === "idle") {
    return (
      <span className="inline-flex flex-col items-start gap-0.5">
        <button
          type="button"
          onClick={handleClickDelete}
          className="text-xs text-red-500 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-400/40"
          aria-label={`Supprimer ${cabinet}`}
        >
          Supprimer
        </button>
        {errorMsg ? <span className="text-[11px] text-red-600">{errorMsg}</span> : null}
      </span>
    );
  }

  if (state === "confirm") {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={handleClickConfirm}
          disabled={isDisabled}
          className="text-xs font-semibold text-red-700 hover:text-red-900 focus:outline-none focus:ring-2 focus:ring-red-400/40 disabled:opacity-50"
          aria-label={`Confirmer la suppression de ${cabinet}`}
        >
          Confirmer ?
        </button>
        <button
          type="button"
          onClick={handleClickCancel}
          disabled={isDisabled}
          className="focus:ring-brand-red/40 text-xs text-muted hover:text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
          aria-label="Annuler la suppression"
        >
          Annuler
        </button>
      </span>
    );
  }

  // état "pending"
  return (
    <span className="text-xs text-muted" aria-live="polite">
      Suppression…
    </span>
  );
}
