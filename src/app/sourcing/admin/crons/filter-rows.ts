/**
 * Pure filter pour les rows cron_run_log (chantier J7 — Steve 2026-06-04).
 *
 * Extrait dans un fichier `.ts` séparé pour testabilité unitaire sans
 * tirer le JSX du Client Component `CronsFilters.tsx`.
 */

import type { CronRunRow } from "./crons-types";

export type StatusFilter = "all" | "ok" | "error" | "running";

export function filterCronRows(
  rows: CronRunRow[],
  nameFilter: string,
  statusFilter: StatusFilter,
): CronRunRow[] {
  return rows.filter((r) => {
    if (nameFilter !== "all" && r.cron_name !== nameFilter) return false;
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    return true;
  });
}
