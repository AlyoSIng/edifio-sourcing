"use client";

/**
 * Tableau filtré des cron_run_log (Client Component intégré dans
 * `/sourcing/admin/crons` — chantier J5, Steve 2026-06-04).
 *
 * Encapsule le filtrage (CronsFilters) + l'affichage. Le parent (Server
 * Component) fait le SELECT et passe la liste brute, ce composant gère le
 * filtre + le rendu.
 *
 * Auto-refresh (Steve 2026-06-04 16h30+) : quand au moins une row est
 * `running`, on déclenche un `router.refresh()` toutes les 10 s pour suivre
 * l'évolution sans cliquer ↻. Le polling s'arrête dès que la dernière row
 * running disparaît (reaped ou finie OK/erreur).
 */

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import type { CronRunRow } from "./crons-types";
import { CronsFilters } from "./CronsFilters";

const POLL_INTERVAL_MS = 10_000;

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function statusBadge(status: string): { label: string; cls: string } {
  switch (status) {
    case "ok":
      return { label: "OK", cls: "bg-emerald-50 text-emerald-700" };
    case "error":
      return { label: "Erreur", cls: "bg-error-bg text-error" };
    case "running":
      return { label: "En cours…", cls: "bg-amber-50 text-amber-700" };
    default:
      return { label: status, cls: "bg-paper-2 text-ink-2" };
  }
}

function payloadSummary(payload: unknown): string {
  if (payload === null || payload === undefined) return "—";
  if (typeof payload !== "object") return String(payload);
  try {
    const obj = payload as Record<string, unknown>;
    const keys = Object.keys(obj).slice(0, 3);
    if (keys.length === 0) return "{}";
    return keys.map((k) => `${k}: ${JSON.stringify(obj[k])}`).join(" · ");
  } catch {
    return "(payload non sérialisable)";
  }
}

export function CronsTable({ rows, cronNames }: { rows: CronRunRow[]; cronNames: string[] }) {
  const router = useRouter();
  const hasRunning = rows.some((r) => r.status === "running");

  // Polling auto tant qu'il y a une row running. Le router.refresh() re-fetch
  // les Server Components et déclenche le reapAllOrphanedRunningRows() du
  // load. Dès que toutes les running ont disparu (terminées ou reaped),
  // l'effect se re-monte avec `hasRunning=false` et le polling s'arrête.
  useEffect(() => {
    if (!hasRunning) return;
    const id = setInterval(() => {
      router.refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [hasRunning, router]);

  return (
    <CronsFilters rows={rows} cronNames={cronNames} isPolling={hasRunning}>
      {(filtered) =>
        filtered.length === 0 ? (
          <p className="text-sm italic text-muted">Aucune exécution ne correspond aux filtres.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-white">
            <table className="w-full text-sm">
              <thead className="bg-paper-2">
                <tr>
                  <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-ink-2">
                    Tâche
                  </th>
                  <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-ink-2">
                    Démarré
                  </th>
                  <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-ink-2">
                    Durée
                  </th>
                  <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-ink-2">
                    Statut
                  </th>
                  <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-ink-2">
                    Résultat
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.map((row) => {
                  const badge = statusBadge(row.status);
                  return (
                    <tr key={row.id}>
                      <td className="px-3 py-2 font-mono text-[11px] text-ink">{row.cron_name}</td>
                      <td className="px-3 py-2 font-mono text-[11px] text-muted">
                        {formatDateTime(row.started_at)}
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-muted">
                        {formatDuration(row.duration_ms)}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td
                        className="max-w-[480px] px-3 py-2 font-mono text-[11px] text-ink-2"
                        title={
                          row.error_message ??
                          (typeof row.payload === "object"
                            ? JSON.stringify(row.payload)
                            : undefined)
                        }
                      >
                        {row.status === "error" ? (
                          <span className="text-error">
                            {row.error_message ?? "Erreur sans message"}
                          </span>
                        ) : (
                          <span className="truncate">{payloadSummary(row.payload)}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      }
    </CronsFilters>
  );
}
