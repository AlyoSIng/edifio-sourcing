"use client";

/**
 * MarketStudyForm — formulaire de configuration / modification de l'URL
 * du tableau de bord étude de marché externe (Google Data Studio, Metabase, etc.)
 *
 * Client Component utilisé dans la page Étude de marché superadmin.
 * Appelle `saveMarketStudyUrlAction` via useTransition pour rester non bloquant.
 *
 * Props :
 *   - `initialUrl` : URL actuelle (vide si non configurée), pré-remplit le champ
 *   - `onSuccess`  : callback appelé après une sauvegarde réussie (pour replier
 *                    le formulaire de modification ou rafraîchir l'état parent)
 *
 * Décision Board 2026-05-27 — module superadmin éditeur edifio.
 */

import { useState, useTransition } from "react";

import { saveMarketStudyUrlAction } from "./actions";

interface MarketStudyFormProps {
  /** URL actuelle — vide ("") si pas encore configurée. */
  initialUrl?: string;
  /** Appelé après une sauvegarde réussie. */
  onSuccess?: () => void;
}

/**
 * Formulaire de configuration de l'URL de l'étude de marché.
 * Affiche un champ URL + bouton de sauvegarde.
 * Erreurs affichées inline sous le champ.
 */
export function MarketStudyForm({ initialUrl = "", onSuccess }: MarketStudyFormProps) {
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
      const result = await saveMarketStudyUrlAction(trimUrl);
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
        {initialUrl ? "Modifier l'URL du tableau de bord" : "Configurer l'URL du tableau de bord"}
      </h3>
      <p className="mb-4 text-xs text-muted">
        Collez l&apos;URL de partage de votre tableau de bord externe (Google Data Studio, Metabase,
        Redash, etc.). Elle sera intégrée en iframe sur cette page.
      </p>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="market-study-url" className="mb-1 block text-xs font-medium text-ink-2">
            URL du tableau de bord <span className="text-error">*</span>
          </label>
          <input
            id="market-study-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            maxLength={2048}
            placeholder="https://datastudio.google.com/reporting/…"
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
