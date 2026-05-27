"use client";

/**
 * FaqToggleWrapper — bouton "Nouvelle question" + formulaire inline toggleable.
 * Même pattern que `NewsToggleWrapper`.
 */

import { useState } from "react";

import { FaqItemForm } from "./FaqItemForm";

interface FaqToggleWrapperProps {
  nextOrder: number;
}

export function FaqToggleWrapper({ nextOrder }: FaqToggleWrapperProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center rounded-md bg-brand-red px-3 py-1.5 text-xs font-medium text-white hover:brightness-110"
        >
          + Nouvelle question
        </button>
      )}
      {isOpen && <FaqItemForm nextOrder={nextOrder} onClose={() => setIsOpen(false)} />}
    </>
  );
}
