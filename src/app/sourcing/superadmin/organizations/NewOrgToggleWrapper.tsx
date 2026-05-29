"use client";

/**
 * NewOrgToggleWrapper — bouton "Nouvelle organisation" + formulaire inline toggleable.
 * Même pattern que `FaqToggleWrapper`.
 */

import { useState } from "react";

import { NewOrgForm } from "./NewOrgForm";

export function NewOrgToggleWrapper() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center rounded-md bg-brand-red px-3 py-1.5 text-xs font-medium text-white hover:brightness-110"
        >
          + Nouvelle organisation
        </button>
      )}
      {isOpen && <NewOrgForm onClose={() => setIsOpen(false)} />}
    </>
  );
}
