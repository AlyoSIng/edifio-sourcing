"use client";

/**
 * NewTicketToggle — bascule affichage/masquage du formulaire de ticket (Client Component).
 *
 * Affiche un bouton "+ Nouveau ticket" qui toggle le TicketForm.
 * Lors de la création réussie (`onCreated`), recharge la page pour afficher
 * le nouveau ticket dans la liste.
 *
 * Décision Board 2026-05-27 — module profil utilisateur edifio Sourcing.
 */

import { useState } from "react";

import { TicketForm } from "./TicketForm";

interface NewTicketToggleProps {
  defaultOpen?: boolean;
}

export function NewTicketToggle({ defaultOpen = false }: NewTicketToggleProps) {
  const [open, setOpen] = useState(defaultOpen);

  function handleCreated() {
    window.location.reload();
  }

  return (
    <div>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mb-4 rounded-full bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800"
        >
          + Nouveau ticket
        </button>
      )}

      {open && (
        <div className="mb-6 rounded-md border border-line bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-base font-semibold text-ink">Nouveau ticket</h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-muted hover:text-ink"
              aria-label="Fermer le formulaire"
            >
              Annuler
            </button>
          </div>
          <TicketForm onCreated={handleCreated} />
        </div>
      )}
    </div>
  );
}
