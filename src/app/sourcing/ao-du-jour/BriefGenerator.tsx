"use client";

/**
 * BriefGenerator — bouton « Générer le brief » / « Regénérer le brief »
 *
 * Client Component discret — appelle `generateTenderBriefAction` on click.
 * Le Server Component se rafraîchit automatiquement via `revalidatePath`.
 *
 * Props :
 *   - tenderId  : UUID de l'AO
 *   - hasBrief  : true = brief déjà généré (bouton "Regénérer") / false = "Générer"
 *
 * Style discret (spec Bloc F) : texte [10px] brand-red, pas de bouton primaire.
 */

import { useState, useTransition } from "react";

import { generateTenderBriefAction } from "./actions";

interface BriefGeneratorProps {
  tenderId: string;
  hasBrief: boolean;
}

export function BriefGenerator({ tenderId, hasBrief }: BriefGeneratorProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await generateTenderBriefAction(tenderId);
      if (!result.ok) {
        setError(result.error ?? "Erreur lors de la génération du brief.");
      }
      // Sur succès : revalidatePath rafraîchit le Server Component automatiquement
    });
  }

  return (
    <span className="mt-1 flex flex-col gap-0.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="self-start text-[10px] text-brand-red underline-offset-2 hover:underline disabled:opacity-50"
        aria-label={
          hasBrief ? "Regénérer le brief IA pour cet AO" : "Générer le brief IA pour cet AO"
        }
      >
        {isPending ? "Génération…" : hasBrief ? "Regénérer le brief" : "Générer le brief"}
      </button>
      {error && (
        <span className="text-[10px] text-error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
