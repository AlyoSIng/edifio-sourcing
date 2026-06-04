/**
 * Types partagés entre la page Server Component `/sourcing/admin/crons` et
 * le Client Component `CronsFilters` (chantier J5 — Steve 2026-06-04).
 *
 * Le row Postgres `cron_run_log` est sérialisé avec ses timestamps en ISO
 * string pour traverser la frontière Server → Client sans souci.
 */

export interface CronRunRow {
  id: string;
  cron_name: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  status: string;
  payload: unknown;
  error_message: string | null;
}
