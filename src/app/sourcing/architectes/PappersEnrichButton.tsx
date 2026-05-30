"use client";

/**
 * PappersEnrichButton — composant client de la moulinette d'enrichissement Pappers.
 *
 * Déclenche l'enrichissement par batches successifs de 50 architectes.
 * Affiche une progress bar + stats cumulées en temps réel.
 * Option "Dry run" : simule l'enrichissement sans écrire en BDD.
 *
 * Source de vérité spec : tâche 4 moulinette Pappers.
 */

import { useState } from "react";

import { enrichArchitectsFromPappers } from "./actions";
import type { PappersEnrichResult } from "./actions";

type RunState = "idle" | "running" | "done" | "error";

interface CumulativeStats {
  updated: number;
  skipped: number;
  notFound: number;
  processed: number;
  total: number;
}

const BATCH_SIZE = 50;

export function PappersEnrichButton() {
  const [runState, setRunState] = useState<RunState>("idle");
  const [dryRun, setDryRun] = useState(false);
  const [stats, setStats] = useState<CumulativeStats | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleEnrich = async () => {
    setRunState("running");
    setStats(null);
    setErrorMessage(null);

    try {
      let offset = 0;
      let total = 0;
      const cumulative: CumulativeStats = {
        updated: 0,
        skipped: 0,
        notFound: 0,
        processed: 0,
        total: 0,
      };

      // Boucle batch jusqu'à avoir traité tous les architectes
      do {
        const result: PappersEnrichResult = await enrichArchitectsFromPappers({
          limit: BATCH_SIZE,
          offset,
          dryRun,
        });

        total = result.total;
        cumulative.total = result.total;
        cumulative.updated += result.updated;
        cumulative.skipped += result.skipped;
        cumulative.notFound += result.notFound;
        cumulative.processed = Math.min(offset + BATCH_SIZE, total);

        setStats({ ...cumulative });

        offset = result.nextOffset;
      } while (offset < total);

      setRunState("done");
    } catch (err) {
      console.error("[PappersEnrichButton] Erreur inattendue:", err);
      setErrorMessage(
        err instanceof Error ? err.message : "Erreur inattendue lors de l'enrichissement.",
      );
      setRunState("error");
    }
  };

  const progressPercent =
    stats && stats.total > 0 ? Math.round((stats.processed / stats.total) * 100) : 0;

  const isRunning = runState === "running";

  return (
    <div className="flex flex-col gap-2">
      {/* Contrôles */}
      <div className="flex items-center gap-2">
        {/* Checkbox Dry run */}
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-line bg-white px-3 py-1 text-xs text-ink">
          <input
            type="checkbox"
            checked={dryRun}
            onChange={(e) => setDryRun(e.target.checked)}
            disabled={isRunning}
            className="accent-brand-red"
            aria-label="Mode dry run (simulation sans écriture en base)"
          />
          Dry run
        </label>

        {/* Bouton principal */}
        <button
          type="button"
          onClick={handleEnrich}
          disabled={isRunning}
          className="focus:ring-brand-red/40 hover:bg-surface inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-white px-3 text-xs font-medium text-ink focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Enrichir les fiches architectes depuis l'API Pappers"
        >
          {/* Icone "éclair" (SVG inline, pas de dépendance externe) */}
          <svg
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            className="h-3.5 w-3.5 text-amber-500"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" />
          </svg>
          {isRunning ? "Enrichissement en cours…" : "Enrichir depuis Pappers"}
          {dryRun && !isRunning ? " (simulation)" : ""}
        </button>
      </div>

      {/* Progress bar (visible seulement pendant l'exécution) */}
      {isRunning && stats ? (
        <div className="flex flex-col gap-1" role="status" aria-live="polite">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
            <div
              className="h-full bg-brand-red transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
              aria-valuenow={progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              role="progressbar"
              aria-label={`Progression : ${progressPercent}%`}
            />
          </div>
          <p className="text-[11px] text-muted">
            {stats.processed} / {stats.total} — {stats.updated} mis à jour · {stats.skipped} ignorés
            · {stats.notFound} non trouvés
          </p>
        </div>
      ) : null}

      {/* Message final — done */}
      {runState === "done" && stats ? (
        <p
          className="rounded-md bg-green-50 px-3 py-1.5 text-xs text-green-800"
          role="status"
          aria-live="polite"
        >
          {dryRun ? "Simulation terminée — " : ""}
          {stats.updated} fiche{stats.updated !== 1 ? "s" : ""} enrichie
          {stats.updated !== 1 ? "s" : ""}, {stats.skipped} ignorée
          {stats.skipped !== 1 ? "s" : ""}, {stats.notFound} non trouvée
          {stats.notFound !== 1 ? "s" : ""}.
        </p>
      ) : null}

      {/* Message erreur */}
      {runState === "error" && errorMessage ? (
        <p
          className="rounded-md bg-red-50 px-3 py-1.5 text-xs text-red-800"
          role="alert"
          aria-live="assertive"
        >
          Erreur : {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
