"use client";

/**
 * Bouton « Export CSV AO du jour » — Steve 2026-06-03.
 *
 * Au clic :
 *  1. Appelle la Server Action `exportAosDuJourCsvAction`.
 *  2. Reçoit `{ csv, filename }` et crée un `Blob` côté client.
 *  3. Préfixe le contenu d'un BOM UTF-8 (`﻿`) pour qu'Excel français
 *     reconnaisse l'encodage automatiquement.
 *  4. Déclenche le download via un `<a>` éphémère.
 *
 * État UX :
 *  - Bouton actif → animation `…` pendant le fetch
 *  - Succès → animation disparait, plus de feedback (le download est visible)
 *  - Erreur → bandeau texte rouge inline (réutilise emitError du contexte parent
 *    serait plus propre — ici on log + window.alert pour rester simple).
 */

import { useTransition } from "react";

import { exportAosDuJourCsvAction } from "./export-actions";

export function ExportCsvButton({ className = "" }: { className?: string }) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await exportAosDuJourCsvAction();
      if (!result.ok) {
        // UX simple — pas de toast système ici, on alerte. Si besoin on
        // branchera sur le mécanisme global d'erreur de la page (cf.
        // TenderActionsErrorToast) dans une itération suivante.
        const msg =
          result.error === "not_authenticated"
            ? "Session expirée — reconnectez-vous."
            : result.error === "forbidden_domain"
              ? "Accès refusé."
              : "Erreur d'export — réessayez ou contactez l'administrateur.";
        window.alert(msg);
        return;
      }

      // BOM UTF-8 (﻿) → Excel français reconnaît automatiquement
      // l'encodage et n'affiche pas les caractères mojibake (Ã©, etc.).
      const blob = new Blob(["﻿" + result.csv], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      // Microtask cleanup — donne le temps au browser de lancer le download
      // avant de révoquer l'URL (sinon Safari abort).
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 0);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className={[
        "inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-paper-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      ].join(" ")}
      title="Télécharge tous les AO du jour (tous profils) au format CSV — ouvrable dans Excel"
    >
      {isPending ? "Export…" : "📥 Export Excel (CSV)"}
    </button>
  );
}
