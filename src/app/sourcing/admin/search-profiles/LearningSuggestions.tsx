"use client";

/**
 * LearningSuggestions — panneau « Suggestions d'ajustement » (Salve U).
 *
 * Affiche les suggestions calculées (`computeSuggestions`) à partir des AO
 * écartés avec un motif structuré récurrent. Chaque suggestion propose
 * d'ajuster le profil de recherche par défaut. Human-in-the-loop : l'admin
 * clique **Appliquer** (modifie le profil) ou **Ignorer** (n'en parle plus).
 *
 * Si aucune suggestion : le composant ne rend RIEN (pas de section vide) —
 * géré côté parent (page.tsx) qui ne monte le composant que s'il y a des
 * suggestions, mais on re-garde ici aussi (defense-in-depth).
 */

import { useState, useTransition } from "react";

import type {
  ProfileSuggestion,
  SuggestedChange,
} from "@/lib/sourcing/learning/suggest-profile-adjustment";
import type { RejectionReasonCode } from "@/lib/sourcing/learning/rejection-reasons";

import {
  applyProfileSuggestionAction,
  dismissSuggestionAction,
  type LearningActionResult,
} from "./learning-actions";

interface LearningSuggestionsProps {
  /** UUID du profil par défaut ciblé par les suggestions. */
  defaultProfileId: string;
  /** Suggestions calculées côté serveur (sérialisables). */
  suggestions: ProfileSuggestion[];
}

function mapError(result: Extract<LearningActionResult, { ok: false }>): string {
  switch (result.error) {
    case "not_authenticated":
      return "Session expirée. Rafraîchis la page.";
    case "forbidden_domain":
      return "Domaine non autorisé (@alyosingenierie.fr requis).";
    case "forbidden_role":
      return "Action réservée aux administrateurs.";
    case "invalid_input":
      return "Suggestion invalide. Actualise la page.";
    case "profile_not_found":
      return "Profil introuvable. Actualise la page.";
    case "internal_error":
    default:
      return "Erreur technique. Réessaye dans quelques instants.";
  }
}

export function LearningSuggestions({ defaultProfileId, suggestions }: LearningSuggestionsProps) {
  const [items, setItems] = useState<ProfileSuggestion[]>(suggestions);
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  function showSuccess(msg: string) {
    setSuccessMsg(msg);
    window.setTimeout(() => setSuccessMsg(null), 3_000);
  }

  function handleApply(reasonCode: RejectionReasonCode, change: SuggestedChange) {
    setActionError(null);
    startTransition(async () => {
      const res = await applyProfileSuggestionAction(defaultProfileId, reasonCode, change);
      if (!res.ok) {
        setActionError(mapError(res));
        return;
      }
      setItems((prev) => prev.filter((s) => s.reasonCode !== reasonCode));
      showSuccess("Profil ajusté. La suggestion a été appliquée.");
    });
  }

  function handleDismiss(reasonCode: RejectionReasonCode) {
    setActionError(null);
    startTransition(async () => {
      const res = await dismissSuggestionAction(reasonCode);
      if (!res.ok) {
        setActionError(mapError(res));
        return;
      }
      setItems((prev) => prev.filter((s) => s.reasonCode !== reasonCode));
      showSuccess("Suggestion ignorée.");
    });
  }

  // Defense-in-depth : rien à afficher si plus aucune suggestion.
  if (items.length === 0) return null;

  return (
    <section
      aria-labelledby="learning-suggestions-title"
      className="rounded-md border border-line bg-amber-50/60 p-4"
    >
      <h2
        id="learning-suggestions-title"
        className="mb-1 font-display text-base font-semibold text-ink"
      >
        Suggestions d&apos;ajustement
      </h2>
      <p className="mb-4 text-sm text-muted">
        À partir des AO que tu as écartés avec un motif récurrent, edifio te propose d&apos;affiner
        ton profil de recherche par défaut. Tu gardes la main : applique ou ignore.
      </p>

      {successMsg ? (
        <div
          role="status"
          aria-live="polite"
          className="mb-3 rounded-sm border-l-4 border-success bg-success-bg px-4 py-2 text-sm text-success"
        >
          {successMsg}
        </div>
      ) : null}

      {actionError ? (
        <div
          role="alert"
          aria-live="assertive"
          className="mb-3 rounded-sm border-l-4 border-error bg-error-bg px-4 py-2 text-sm text-error"
        >
          {actionError}
        </div>
      ) : null}

      <ul className="space-y-3">
        {items.map((s) => (
          <li key={s.reasonCode} className="rounded-md border border-line bg-white px-4 py-3">
            <p className="text-sm text-ink">{s.description}</p>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleApply(s.reasonCode, s.suggestedChange)}
                className="rounded-full bg-brand-red px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-red-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red focus-visible:ring-offset-1 disabled:opacity-50"
              >
                Appliquer
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleDismiss(s.reasonCode)}
                className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-paper-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-line-2 focus-visible:ring-offset-1 disabled:opacity-50"
              >
                Ignorer
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
