"use client";

/**
 * NewTestToggle — bouton "+ Nouveau test" avec panneau formulaire togglable.
 *
 * Client Component léger utilisé dans la page Tests guidés superadmin.
 * Gère l'état d'affichage du formulaire GuidedTestForm.
 * À la création réussie, recharge la page via window.location.reload()
 * pour que le Server Component rafraîchisse la liste.
 *
 * Décision Board 2026-05-27 — module superadmin éditeur edifio.
 */

import { useState } from "react";

import { GuidedTestForm } from "./GuidedTestForm";

interface NewTestToggleProps {
  /**
   * Si `true`, le formulaire est affiché directement à l'ouverture de la page.
   * Utilisé sur la page vide (aucun test configuré).
   */
  defaultOpen?: boolean;
}

/**
 * Bouton "+ Nouveau test" qui ouvre le formulaire de création en dessous.
 * Après création réussie, recharge la page pour mettre à jour la liste.
 */
export function NewTestToggle({ defaultOpen = false }: NewTestToggleProps) {
  const [showForm, setShowForm] = useState(defaultOpen);

  function handleCreated() {
    // Recharge le Server Component pour afficher le nouveau test
    window.location.reload();
  }

  if (showForm) {
    return (
      <div className="w-full max-w-lg">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-ink-2">Nouveau test</span>
          <button
            type="button"
            onClick={() => setShowForm(false)}
            className="text-xs text-muted hover:text-ink"
          >
            Annuler
          </button>
        </div>
        <GuidedTestForm onCreated={handleCreated} />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setShowForm(true)}
      className={[
        "inline-flex items-center rounded-md bg-brand-red px-3 py-1.5",
        "text-xs font-medium text-white hover:brightness-110",
      ].join(" ")}
    >
      + Nouveau test
    </button>
  );
}
