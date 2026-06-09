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

import { db } from "@/db/client";
import { isSuperAdmin, toUserProfile } from "@/lib/auth/types";
import { reapAllOrphanedRunningRows } from "@/lib/cron/log-cron-run";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { ErrorBanner } from "@/app/sourcing/ao-du-jour/ErrorBanner";

import { TriggerPanel } from "./TriggerPanel";
import { CronsTable } from "./CronsTable";
import type { CronRunRow } from "./crons-types";

export const metadata = { title: "Crons · edifio Sourcing" };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HISTORY_LIMIT = 100;

function formatAvgDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60_000).toFixed(1)} min`;
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

export default async function CronsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/sourcing/admin/crons");
  const profile = toUserProfile(user);
  if (!isSuperAdmin(profile)) redirect("/sourcing/ao-du-jour?error=forbidden");

  let fetchError: string | null = null;
  let rows: CronRunRow[] = [];

  // Reap pro-actif des rows running orphelines (> 5 min) — Steve voit
  // l'état clean au chargement sans devoir re-trigger le cron concerné.
  // Best-effort : ne casse pas la page si l'UPDATE rate.
  await reapAllOrphanedRunningRows(db);

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
    {
      total: number;
      ok: number;
      error: number;
      running: number;
      lastStartedAt: string | null;
      /** Somme cumulée des duration_ms des runs status='ok' (pour avg). */
      okDurationSum: number;
      okDurationCount: number;
    }
  >();
  for (const row of rows) {
    const entry = byName.get(row.cron_name) ?? {
      total: 0,
      ok: 0,
      error: 0,
      running: 0,
      lastStartedAt: null,
      okDurationSum: 0,
      okDurationCount: 0,
    };
    entry.total++;
    if (row.status === "ok") {
      entry.ok++;
      // K2 — on calcule la durée moyenne des runs OK pour donner une baseline
      // visuelle. Les runs error/running n'entrent pas dans l'avg pour ne
      // pas être biaisée par les timeouts ou les exécutions en cours.
      if (row.duration_ms !== null) {
        entry.okDurationSum += row.duration_ms;
        entry.okDurationCount++;
      }
    } else if (row.status === "error") entry.error++;
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
                {agg.okDurationCount > 0 && (
                  <p
                    className="mt-0.5 font-mono text-[10px] text-muted"
                    title={`Moyenne calculée sur ${agg.okDurationCount} run${agg.okDurationCount > 1 ? "s" : ""} OK (les erreurs et runs En cours ne comptent pas).`}
                  >
                    Moyenne : {formatAvgDuration(agg.okDurationSum / agg.okDurationCount)}
                  </p>
                )}
              </div>
            ))}
          </section>

          {/* Tableau détaillé filtrable (J5). */}
          <CronsTable rows={rows} cronNames={Array.from(byName.keys()).sort()} />
        </>
      )}
    </div>
  );
}
