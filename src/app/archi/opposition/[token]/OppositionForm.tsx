"use client";

/**
 * Formulaire Client pour la page d'opposition RGPD.
 *
 * Affiche un bouton « Confirmer mon opposition » qui POST vers la Server
 * Action `executeOpposition` passée en prop (closurée sur le token côté
 * serveur — le token n'apparaît jamais dans le bundle client).
 *
 * Workflow :
 *   - clic → busy state
 *   - succès → redirige vers la même URL avec `?done=1`
 *   - échec → message d'erreur inline (générique, pas de leak)
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  /** Server Action passée par la page parente (closure sur le token). */
  action: () => Promise<{ ok: boolean }>;
}

export function OppositionForm({ action }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (!result.ok) {
        setError(
          "Impossible d'enregistrer votre opposition pour le moment. Réessayez dans quelques instants.",
        );
        return;
      }
      // Recharge la même URL avec `?done=1` → page de confirmation.
      router.refresh();
      // navigation explicite via window pour s'assurer du paramètre.
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("done", "1");
        window.location.assign(url.toString());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <div
          role="alert"
          className="rounded-md border border-l-4 border-line border-l-error bg-error-bg px-4 py-3 text-sm text-error"
        >
          {error}
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={busy}
        className="self-start rounded-md bg-error px-5 py-3 text-base font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Enregistrement…" : "Confirmer mon opposition"}
      </button>
    </div>
  );
}
