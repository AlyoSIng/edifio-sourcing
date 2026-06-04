/**
 * Page admin — Observabilité crons (chantier I3, Steve 2026-06-04).
 *
 * Liste les 100 dernières exécutions Vercel Cron, toutes tâches confondues :
 * sourcing-run, tandem-followup, library-expiry-digest, dossier-zip-cleanup.
 *
 * Pour chaque run on affiche : tâche, début, durée, statut (running / ok /
 * error), aperçu payload (1 ligne) ou message d'erreur. La table est en
 * RLS FORCE sans policy authenticated → on lit via service_role.
 *
 * Réservée superadmin (pas admin) : c'est de l'observabilité système.
 */

import { redirect } from "next/navigation";

import { isSuperAdmin, toUserProfile } from "@/lib/auth/types";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { ErrorBanner } from "@/app/sourcing/ao-du-jour/ErrorBanner";

import { TriggerPanel } from "./TriggerPanel";

export const metadata = { title: "Crons · edifio Sourcing" };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HISTORY_LIMIT = 100;

interface CronRunRow {
  id: string;
  cron_name: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  status: string;
  payload: unknown;
  error_message: string | null;
}

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
    // On affiche les 3 premières paires de l'objet (compteurs principaux).
    const keys = Object.keys(obj).slice(0, 3);
    if (keys.length === 0) return "{}";
    return keys.map((k) => `${k}: ${JSON.stringify(obj[k])}`).join(" · ");
  } catch {
    return "(payload non sérialisable)";
  }
}

export default async function CronsPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/sourcing/admin/crons");
  const profile = toUserProfile(user);
  if (!isSuperAdmin(profile)) redirect("/sourcing/ao-du-jour?error=forbidden");

  let fetchError: string | null = null;
  let rows: CronRunRow[] = [];

  try {
    // La table est en RLS FORCE sans policy authenticated — on doit passer
    // par service_role pour lire.
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("cron_run_log")
      .select("id, cron_name, started_at, finished_at, duration_ms, status, payload, error_message")
      .order("started_at", { ascending: false })
      .limit(HISTORY_LIMIT);
    if (error) throw error;
    rows = (data ?? []) as CronRunRow[];
  } catch (err) {
    console.error("[admin-crons:fetch:fail]", err);
    fetchError = "db-error";
  }

  // Agrégats par cron_name (sur les rows chargées).
  const byName = new Map<
    string,
    { total: number; ok: number; error: number; running: number; lastStartedAt: string | null }
  >();
  for (const row of rows) {
    const entry = byName.get(row.cron_name) ?? {
      total: 0,
      ok: 0,
      error: 0,
      running: 0,
      lastStartedAt: null,
    };
    entry.total++;
    if (row.status === "ok") entry.ok++;
    else if (row.status === "error") entry.error++;
    else if (row.status === "running") entry.running++;
    if (!entry.lastStartedAt || row.started_at > entry.lastStartedAt) {
      entry.lastStartedAt = row.started_at;
    }
    byName.set(row.cron_name, entry);
  }

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink md:text-3xl">
          Crons
        </h1>
        <p className="mt-1 text-sm text-muted">
          {HISTORY_LIMIT} dernières exécutions Vercel Cron, toutes tâches confondues. La row passe
          de <em>« En cours »</em> à <em>OK</em> ou <em>Erreur</em> en fin de run.
        </p>
      </header>

      {/* Polish I3 — déclenchement manuel des 4 crons (superadmin only). */}
      <TriggerPanel />

      {fetchError ? (
        <ErrorBanner
          message={fetchError}
          title="Indisponible"
          description="Impossible de charger l'historique des crons — réessaie dans quelques instants."
        />
      ) : rows.length === 0 ? (
        <p className="text-sm italic text-muted">
          Aucune exécution enregistrée pour le moment. La première run insérera une row à son
          déclenchement (manuel ou Vercel Cron).
        </p>
      ) : (
        <>
          {/* Agrégats par tâche */}
          <section className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from(byName.entries()).map(([name, agg]) => (
              <div key={name} className="rounded-lg border border-line bg-white p-3">
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted">{name}</p>
                <p className="mt-1 font-display text-lg font-semibold text-ink">
                  {agg.ok} <span className="text-xs text-muted">OK</span>
                  {agg.error > 0 && (
                    <>
                      {" · "}
                      <span className="text-error">{agg.error} erreurs</span>
                    </>
                  )}
                  {agg.running > 0 && (
                    <>
                      {" · "}
                      <span className="text-amber-700">{agg.running} en cours</span>
                    </>
                  )}
                </p>
                <p className="mt-1 font-mono text-[10px] text-muted">
                  Dernier : {formatDateTime(agg.lastStartedAt)}
                </p>
              </div>
            ))}
          </section>

          {/* Tableau détaillé */}
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
                {rows.map((row) => {
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
        </>
      )}
    </div>
  );
}
