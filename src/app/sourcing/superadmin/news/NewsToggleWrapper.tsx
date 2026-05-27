"use client";

/**
 * NewsToggleWrapper — bouton "Nouvelle actualité" + formulaire inline toggleable
 *
 * Client Component léger qui encapsule l'état d'ouverture du formulaire.
 * Utilisé dans la page Server Component `news/page.tsx` pour injecter
 * le seul état client nécessaire (ouvert/fermé) sans rendre la page entière cliente.
 *
 * Décision Board 2026-05-27 — module superadmin éditeur edifio.
 */

import { useState } from "react";

import { NewsForm } from "./NewsForm";

/**
 * Affiche le bouton "Nouvelle actualité".
 * Au clic, affiche le formulaire de création inline ; le formulaire rappelle
 * `onClose` (succès ou annulation) pour se replier.
 */
export function NewsToggleWrapper() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Bouton d'ouverture du formulaire */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className={[
            "inline-flex items-center rounded-md bg-brand-red px-3 py-1.5",
            "text-xs font-medium text-white hover:brightness-110",
          ].join(" ")}
        >
          + Nouvelle actualité
        </button>
      )}

      {/* Formulaire inline — visible seulement quand isOpen */}
      {isOpen && <NewsForm onClose={() => setIsOpen(false)} />}
    </>
  );
}
