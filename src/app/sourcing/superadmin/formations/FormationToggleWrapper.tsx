"use client";

/**
 * FormationToggleWrapper — bouton "Nouvelle formation" + formulaire inline toggleable
 *
 * Client Component léger qui encapsule l'état d'ouverture du formulaire.
 * Même pattern que `NewsToggleWrapper`.
 */

import { useState } from "react";

import { FormationForm } from "./FormationForm";

interface FormationToggleWrapperProps {
  nextOrder: number;
}

export function FormationToggleWrapper({ nextOrder }: FormationToggleWrapperProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center rounded-full bg-brand-red px-3 py-1.5 text-xs font-medium text-white hover:brightness-110"
        >
          + Nouvelle formation
        </button>
      )}
      {isOpen && <FormationForm nextOrder={nextOrder} onClose={() => setIsOpen(false)} />}
    </>
  );
}
