"use client";

/**
 * MarketStudyViewer — affichage de l'iframe + toggle formulaire de modification
 *
 * Client Component utilisé dans la page Étude de marché superadmin.
 * Reçoit l'URL configurée en prop et gère l'état du formulaire de modification.
 *
 * Si `url` est fournie :
 *   - Affiche l'iframe du tableau de bord externe
 *   - Bouton "Modifier l'URL" pour afficher le formulaire de modification
 * Si le formulaire est ouvert, il remplace temporairement l'iframe.
 *
 * Décision Board 2026-05-27 — module superadmin éditeur edifio.
 */

import { useState } from "react";

import { MarketStudyForm } from "./MarketStudyForm";

interface MarketStudyViewerProps {
  /** URL configurée dans `app_content`. */
  url: string;
}

/**
 * Affiche l'iframe du tableau de bord ou le formulaire de modification.
 * Le bouton "Modifier l'URL" bascule entre les deux vues.
 */
export function MarketStudyViewer({ url }: MarketStudyViewerProps) {
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
    return <MarketStudyForm initialUrl={url} onSuccess={() => setIsEditing(false)} />;
  }

  return (
    <div className="space-y-3">
      {/* Barre d'actions au-dessus de l'iframe */}
      <div className="flex items-center justify-between">
        <p className="max-w-xl truncate font-mono text-xs text-muted" title={url}>
          {url}
        </p>
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className={[
            "inline-flex shrink-0 items-center rounded-md border border-line bg-paper-2 px-3 py-1.5",
            "text-xs font-medium text-ink-2 hover:bg-paper-3 hover:text-ink",
          ].join(" ")}
        >
          Modifier l&apos;URL
        </button>
      </div>

      {/* Iframe du tableau de bord externe */}
      <iframe
        src={url}
        title="Étude de marché"
        allowFullScreen
        className="w-full rounded-md border border-line"
        style={{ height: "70vh" }}
      />
    </div>
  );
}
