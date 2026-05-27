"use client";

/**
 * PitchPdfViewer — affichage du PDF via <object> + toggle formulaire de modification
 *
 * Client Component utilisé dans la page Plaquette superadmin.
 * Reçoit l'URL configurée en prop et gère l'état du formulaire de modification.
 *
 * Si `url` est fournie :
 *   - Affiche le PDF dans un <object> plein écran
 *   - Lien "Télécharger le PDF" en nouvelle fenêtre
 *   - Bouton "Modifier l'URL" pour afficher le formulaire de modification
 * Si le formulaire est ouvert, il remplace temporairement le viewer.
 *
 * Décision Board 2026-05-27 — module superadmin éditeur edifio.
 */

import { useState } from "react";

import { PitchPdfForm } from "./PitchPdfForm";

interface PitchPdfViewerProps {
  /** URL configurée dans `app_content`. */
  url: string;
}

/**
 * Affiche le PDF de la plaquette ou le formulaire de modification.
 * Le bouton "Modifier l'URL" bascule entre les deux vues.
 */
export function PitchPdfViewer({ url }: PitchPdfViewerProps) {
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
    return <PitchPdfForm initialUrl={url} onSuccess={() => setIsEditing(false)} />;
  }

  return (
    <div className="space-y-3">
      {/* Barre d'actions au-dessus du viewer */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-xl truncate font-mono text-xs text-muted" title={url}>
          {url}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={[
              "inline-flex items-center rounded-md border border-line bg-paper-2 px-3 py-1.5",
              "text-xs font-medium text-ink-2 hover:bg-paper-3 hover:text-ink",
            ].join(" ")}
          >
            Télécharger le PDF
          </a>
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className={[
              "inline-flex items-center rounded-md border border-line bg-paper-2 px-3 py-1.5",
              "text-xs font-medium text-ink-2 hover:bg-paper-3 hover:text-ink",
            ].join(" ")}
          >
            Modifier l&apos;URL
          </button>
        </div>
      </div>

      {/* Affichage du PDF via <object> */}
      <object
        data={url}
        type="application/pdf"
        className="w-full rounded-md border border-line"
        style={{ height: "75vh" }}
      >
        <p className="p-4 text-sm text-muted">
          Votre navigateur ne peut pas afficher ce PDF.{" "}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-red underline hover:brightness-110"
          >
            Télécharger le PDF
          </a>
        </p>
      </object>
    </div>
  );
}
