"use client";

/**
 * PitchPdfForm — formulaire de configuration / modification de l'URL
 * de la plaquette commerciale PDF (Google Drive, Dropbox, etc.)
 *
 * Client Component utilisé dans la page Plaquette superadmin.
 * Appelle `savePitchUrlAction` via useTransition pour rester non bloquant.
 *
 * Props :
 *   - `initialUrl` : URL actuelle (vide si non configurée), pré-remplit le champ
 *   - `onSuccess`  : callback appelé après une sauvegarde réussie (pour replier
 *                    le formulaire de modification ou rafraîchir l'état parent)
 *
 * Décision Board 2026-05-27 — module superadmin éditeur edifio.
 */

import { useState, useTransition } from "react";

import { savePitchUrlAction } from "./actions";

interface PitchPdfFormProps {
  /** URL actuelle — vide ("") si pas encore configurée. */
  initialUrl?: string;
  /** Appelé après une sauvegarde réussie. */
  onSuccess?: () => void;
}

/**
 * Formulaire de configuration de l'URL du PDF plaquette commerciale.
 * Affiche un champ URL + bouton de sauvegarde.
 * Erreurs affichées inline sous le champ.
 */
export function PitchPdfForm({ initialUrl = "", onSuccess }: PitchPdfFormProps) {
  const [url, setUrl] = useState(initialUrl);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const trimUrl = url.trim();
    if (!trimUrl) {
      setError("L'URL est obligatoire.");
      return;
    }
    if (!trimUrl.startsWith("http://") && !trimUrl.startsWith("https://")) {
      setError("L'URL doit commencer par http:// ou https://.");
      return;
    }

    startTransition(async () => {
      const result = await savePitchUrlAction(trimUrl);
      if (!result.ok) {
        setError(result.error ?? "Une erreur est survenue.");
      } else {
        onSuccess?.();
      }
    });
  }

  return (
    <div className="rounded-md border border-line bg-white p-5 shadow-sm">
      <h3 className="mb-1 text-sm font-semibold text-ink">
        {initialUrl ? "Modifier l'URL de la plaquette" : "Configurer l'URL de la plaquette"}
      </h3>
      <p className="mb-4 text-xs text-muted">
        Collez le lien de partage de votre PDF (Google Drive « partager → lien », Dropbox, etc.). Le
        PDF sera affiché directement sur cette page.
      </p>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="pitch-pdf-url" className="mb-1 block text-xs font-medium text-ink-2">
            URL du PDF plaquette <span className="text-error">*</span>
          </label>
          <input
            id="pitch-pdf-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            maxLength={2000}
            placeholder="https://drive.google.com/file/d/…/view?usp=sharing"
            disabled={isPending}
            className={[
              "w-full rounded-md border px-3 py-2 text-sm text-ink placeholder:text-muted",
              "focus:border-brand-red focus:outline-none focus:ring-1 focus:ring-brand-red",
              "disabled:opacity-50",
              "border-line bg-white",
            ].join(" ")}
          />
        </div>

        {/* Erreur */}
        {error && (
          <div
            role="alert"
            className={[
              "rounded-md border border-l-4 border-line border-l-error",
              "bg-error-bg px-4 py-3 text-sm text-error",
            ].join(" ")}
          >
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2">
          <button
            type="submit"
            disabled={!url.trim() || isPending}
            className={[
              "inline-flex items-center rounded-md bg-brand-red px-3 py-1.5",
              "text-xs font-medium text-white hover:brightness-110",
              "disabled:cursor-not-allowed disabled:opacity-50",
            ].join(" ")}
          >
            {isPending ? "Sauvegarde…" : "Enregistrer l'URL"}
          </button>
        </div>
      </form>
    </div>
  );
}
