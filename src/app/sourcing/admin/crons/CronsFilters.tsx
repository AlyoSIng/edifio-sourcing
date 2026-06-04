"use client";

/**
 * Filtres Client pour le tableau /sourcing/admin/crons (J5 — Steve 2026-06-04).
 *
 * Filtre par cron_name (Tous + une entrée par cron observé) et par status
 * (Tous / OK / Erreur / En cours). Composant Client pour ne pas re-fetch
 * côté serveur — les 100 dernières rows sont déjà chargées, on filtre
 * juste l'affichage.
 *
 * Le composant émet via callback ; le parent passe la liste filtrée au
 * tableau (qui reste un Server Component dans page.tsx).
 *
 * Alternative considérée : pousser le filtre dans l'URL (?cron=...&status=...)
 * et re-fetch côté Server. Pas nécessaire ici car 100 rows c'est très petit
 * et le filtre client est instantané.
 */

import { useState, useMemo } from "react";

import type { CronRunRow } from "./crons-types";
import { filterCronRows, type StatusFilter } from "./filter-rows";

// I4 — helpers extraits dans `./filter-rows.ts` pour être testables sans JSX.
// Ré-export pour préserver l'API publique côté pages.
export { filterCronRows, type StatusFilter } from "./filter-rows";

export interface CronsFiltersProps {
  rows: CronRunRow[];
  /** Liste des cron_names distincts pour générer le toggle dynamiquement. */
  cronNames: string[];
  children: (filtered: CronRunRow[]) => React.ReactNode;
}

export function CronsFilters({ rows, cronNames, children }: CronsFiltersProps) {
  const [nameFilter, setNameFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const filtered = useMemo(
    () => filterCronRows(rows, nameFilter, statusFilter),
    [rows, nameFilter, statusFilter],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-paper-2 p-3">
        {/* Filtre cron_name */}
        <div className="flex items-center gap-1.5">
          <label htmlFor="cron-name-filter" className="text-xs text-ink-2">
            Tâche
          </label>
          <select
            id="cron-name-filter"
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            className="rounded border border-line bg-white px-2 py-1 text-xs"
          >
            <option value="all">Toutes</option>
            {cronNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        {/* Filtre status — segmenté */}
        <nav
          className="inline-flex items-center rounded-full border border-line bg-white p-0.5"
          aria-label="Filtrer par statut"
        >
          {(
            [
              { v: "all" as const, l: "Tous" },
              { v: "ok" as const, l: "OK" },
              { v: "error" as const, l: "Erreur" },
              { v: "running" as const, l: "En cours" },
            ] as const
          ).map((opt) => {
            const active = statusFilter === opt.v;
            return (
              <button
                key={opt.v}
                type="button"
                onClick={() => setStatusFilter(opt.v)}
                className={[
                  "rounded-full px-3 py-1 text-xs font-medium transition",
                  active ? "bg-ink text-white" : "text-ink-2 hover:bg-paper-2",
                ].join(" ")}
              >
                {opt.l}
              </button>
            );
          })}
        </nav>

        <span className="ml-auto text-xs text-muted">
          {filtered.length} / {rows.length} exécution{filtered.length > 1 ? "s" : ""}
        </span>
      </div>

      {children(filtered)}
    </div>
  );
}
