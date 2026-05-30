"use client";

/**
 * PappersEnrichSingleButton — enrichissement Pappers unitaire pour la fiche architecte.
 *
 * Appelle la Server Action `enrichSingleArchitectFromPappers` et affiche
 * le résultat inline sans rechargement de page.
 * Admin uniquement (la page parent ne rend ce composant que si `adminUser`).
 */

import { useState, useTransition } from "react";

import { enrichSingleArchitectFromPappers } from "../actions";
import type { EnrichSingleResult } from "../actions";

/** Traduit un code erreur en message lisible FR. */
function errorLabel(error: Extract<EnrichSingleResult, { ok: false }>["error"]): string {
  const labels: Record<typeof error, string> = {
    not_authenticated: "Non authentifié.",
    forbidden_domain: "Domaine non autorisé.",
    forbidden_role: "Action réservée aux administrateurs.",
    invalid_input: "Identifiant invalide.",
    not_found: "Architecte introuvable.",
    pappers_unavailable: "API Pappers indisponible (clé manquante).",
    internal_error: "Erreur interne. Réessayer.",
  };
  return labels[error];
}

interface Props {
  architectId: string;
}

export function PappersEnrichSingleButton({ architectId }: Props) {
  const [state, setState] = useState<"idle" | "pending" | "done" | "error">("idle");
  const [result, setResult] = useState<{ updated: boolean; summary: string } | null>(null);
  const [, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      setState("pending");
      const res = await enrichSingleArchitectFromPappers(architectId);
      if (res.ok) {
        setResult({ updated: res.updated, summary: res.summary });
        setState("done");
      } else {
        setResult({ updated: false, summary: errorLabel(res.error) });
        setState("error");
      }
    });
  }

  const isPending = state === "pending";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Bouton principal */}
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending || state === "done"}
        className="focus:ring-brand-red/40 hover:bg-surface inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-white px-3 text-xs font-medium text-ink focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="Enrichir cette fiche depuis l'API Pappers"
      >
        {/* Icône éclair SVG amber — identique à PappersEnrichButton */}
        <svg
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
          className={`h-3.5 w-3.5 text-amber-500 ${isPending ? "animate-spin" : ""}`}
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          {isPending ? (
            <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z" />
          ) : (
            <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" />
          )}
        </svg>
        {isPending ? "Recherche…" : "Enrichir depuis Pappers"}
      </button>

      {/* Résultat inline */}
      {state === "done" && result ? (
        result.updated ? (
          <>
            <span
              className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-0.5 text-[11px] font-medium text-green-800"
              role="status"
              aria-live="polite"
            >
              &#10003; {result.summary}
            </span>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="text-[11px] text-brand-red underline hover:no-underline"
            >
              Actualiser la page
            </button>
          </>
        ) : (
          <span
            className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-medium text-gray-600"
            role="status"
            aria-live="polite"
          >
            {result.summary}
          </span>
        )
      ) : null}

      {state === "error" && result ? (
        <span
          className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-medium text-red-800"
          role="alert"
          aria-live="assertive"
        >
          Erreur : {result.summary}
        </span>
      ) : null}
    </div>
  );
}
