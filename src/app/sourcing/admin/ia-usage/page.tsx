/**
 * Page admin — Coûts IA mensuel (chantier H3, Steve 2026-06-04).
 *
 * Agrégation `ai_runs` JOIN `ai_prompts` par mois et par prompt :
 *  - KPI cards mois en cours : coût USD total + nombre de runs + tokens
 *  - Tableau byPrompt (12 derniers mois) : trié par coût décroissant
 *  - Barres CSS byMonth (6 derniers mois) : visualisation tendance
 *
 * Server Component, superadmin uniquement. Pas de lib graphique (économie
 * de bundle — barres CSS suffisent pour le MVP).
 *
 * Résilience runtime : try/catch absorbé (règle MEMORY) → ErrorBanner si
 * BDD inatteignable, jamais de 500 brutal côté admin.
 */

import { redirect } from "next/navigation";
import { sql, desc, eq, gte } from "drizzle-orm";

import { db } from "@/db/client";
import { aiPrompts, aiRuns } from "@/db/schema/ai";
import { isSuperAdmin, toUserProfile } from "@/lib/auth/types";
import { getRequiredOrgId } from "@/lib/auth/get-required-org-id";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ALYOS_ORG_ID } from "@/lib/constants/organization";
import { ErrorBanner } from "@/app/sourcing/ao-du-jour/ErrorBanner";
import {
  RangeFilter,
  parseRange,
  rangeDaysAgo,
  parseCustomRange,
} from "@/app/sourcing/admin/_shared/RangeFilter";

export const metadata = {
  title: "Coûts IA · edifio Sourcing",
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Helpers de formatage
// ---------------------------------------------------------------------------

function formatDateForInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatUsd(amount: number): string {
  if (amount === 0) return "0 $";
  if (amount < 0.01) return `<0.01 $`;
  return `${amount.toFixed(2)} $`;
}

function formatInt(n: number): string {
  return n.toLocaleString("fr-FR");
}

/** Format `YYYY-MM` → `MMM YYYY` (fr). */
function formatMonth(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-");
  if (!y || !m) return yyyyMm;
  const monthName = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("fr-FR", {
    month: "short",
    year: "numeric",
  });
  return monthName;
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

interface PageProps {
  searchParams?: { range?: string; from?: string; to?: string };
}

export default async function IaUsagePage({ searchParams }: PageProps) {
  // 1. Auth + superadmin guard.
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/sourcing/admin/ia-usage");
  const profile = toUserProfile(user);
  if (!isSuperAdmin(profile)) redirect("/sourcing/ao-du-jour?error=forbidden");

  // Filtre temporel (I1 + J1 custom).
  const range = parseRange(searchParams?.range);
  const custom = range === "custom" ? parseCustomRange(searchParams?.from, searchParams?.to) : null;
  // Si on demande custom mais que les params sont invalides → fallback 30j.
  const effectiveRange: typeof range = range === "custom" && !custom ? "30" : range;
  const rangeFrom = custom ? custom.from : rangeDaysAgo(effectiveRange);
  const rangeTo = custom ? custom.to : new Date();
  const rangeLabel = custom
    ? `${custom.from.toLocaleDateString("fr-FR")} → ${custom.to.toLocaleDateString("fr-FR")}`
    : `${range} j`;

  // 2. Résolution dynamique de l'org (fallback ALYOS_ORG_ID).
  let orgId: string;
  try {
    orgId = await getRequiredOrgId(user.id);
  } catch (err) {
    console.error("[admin-ia-usage:org-resolution-failed]", err);
    orgId = ALYOS_ORG_ID;
  }

  // 3. Chargement des agrégats.
  let fetchError: string | null = null;
  let byPrompt: Array<{
    promptName: string;
    runs: number;
    totalCostUsd: number;
    avgLatencyMs: number;
    totalTokensIn: number;
    totalTokensOut: number;
  }> = [];
  let byMonth: Array<{
    month: string;
    runs: number;
    totalCostUsd: number;
  }> = [];
  let currentMonthTotals = {
    runs: 0,
    totalCostUsd: 0,
    totalTokensIn: 0,
    totalTokensOut: 0,
  };

  try {
    // 3a. byPrompt — agrégé sur la fenêtre choisie (range).
    const byPromptRows = await db
      .select({
        promptName: aiPrompts.name,
        runs: sql<number>`count(*)::int`,
        totalCostUsd: sql<string>`coalesce(sum(${aiRuns.costUsd}), 0)::text`,
        avgLatencyMs: sql<number>`coalesce(avg(${aiRuns.latencyMs}), 0)::int`,
      })
      .from(aiRuns)
      .innerJoin(aiPrompts, eq(aiRuns.promptId, aiPrompts.id))
      .where(
        sql`${aiRuns.organizationId} = ${orgId} AND ${aiRuns.createdAt} >= ${rangeFrom.toISOString()} AND ${aiRuns.createdAt} <= ${rangeTo.toISOString()}`,
      )
      .groupBy(aiPrompts.name)
      .orderBy(desc(sql<string>`coalesce(sum(${aiRuns.costUsd}), 0)`));

    byPrompt = byPromptRows.map((r) => ({
      promptName: r.promptName,
      runs: Number(r.runs),
      totalCostUsd: Number(r.totalCostUsd),
      avgLatencyMs: Number(r.avgLatencyMs),
      totalTokensIn: 0, // tokens_in/out pas stockés en colonnes dédiées ai_runs MVP
      totalTokensOut: 0,
    }));

    // 3b. byMonth — sur la fenêtre choisie (range).
    const byMonthRows = await db
      .select({
        month: sql<string>`to_char(date_trunc('month', ${aiRuns.createdAt}), 'YYYY-MM')`,
        runs: sql<number>`count(*)::int`,
        totalCostUsd: sql<string>`coalesce(sum(${aiRuns.costUsd}), 0)::text`,
      })
      .from(aiRuns)
      .where(
        gte(aiRuns.createdAt, rangeFrom).append(
          sql` AND ${aiRuns.createdAt} <= ${rangeTo.toISOString()} AND ${aiRuns.organizationId} = ${orgId}`,
        ),
      )
      .groupBy(sql`date_trunc('month', ${aiRuns.createdAt})`)
      .orderBy(sql`date_trunc('month', ${aiRuns.createdAt})`);

    byMonth = byMonthRows.map((r) => ({
      month: r.month,
      runs: Number(r.runs),
      totalCostUsd: Number(r.totalCostUsd),
    }));

    // 3c. KPIs mois en cours.
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [currentMonth] = await db
      .select({
        runs: sql<number>`count(*)::int`,
        totalCostUsd: sql<string>`coalesce(sum(${aiRuns.costUsd}), 0)::text`,
      })
      .from(aiRuns)
      .where(
        gte(aiRuns.createdAt, startOfMonth).append(sql` AND ${aiRuns.organizationId} = ${orgId}`),
      );

    if (currentMonth) {
      currentMonthTotals = {
        runs: Number(currentMonth.runs),
        totalCostUsd: Number(currentMonth.totalCostUsd),
        totalTokensIn: 0,
        totalTokensOut: 0,
      };
    }
  } catch (err) {
    console.error("[admin-ia-usage:fetch:fail]", err);
    fetchError = "db-error";
  }

  // 4. Max coût par mois — pour normaliser les barres.
  const maxMonthlyCost = Math.max(...byMonth.map((m) => m.totalCostUsd), 0.01);

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink md:text-3xl">
            Coûts IA
          </h1>
          <p className="mt-1 text-sm text-muted">
            Agrégation des appels Claude (analyse RC, indexation biblio, briefs AO, etc.) par mois
            et par prompt. Données issues de la table <code>ai_runs</code>.
          </p>
        </div>
        <RangeFilter
          basePath="/sourcing/admin/ia-usage"
          current={range}
          customFrom={custom ? formatDateForInput(custom.from) : undefined}
          customTo={custom ? formatDateForInput(custom.to) : undefined}
        />
      </header>

      {fetchError ? (
        <ErrorBanner
          message={fetchError}
          title="Indisponible"
          description="Impossible de charger les agrégats — réessaie dans quelques instants."
        />
      ) : (
        <>
          {/* KPIs mois en cours */}
          <section className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KpiCard
              label="Coût mois en cours"
              value={formatUsd(currentMonthTotals.totalCostUsd)}
            />
            <KpiCard label="Runs mois en cours" value={formatInt(currentMonthTotals.runs)} />
            <KpiCard
              label={`Coût ${rangeLabel} (fenêtre)`}
              value={formatUsd(byPrompt.reduce((acc, p) => acc + p.totalCostUsd, 0))}
            />
          </section>

          {/* Tableau byPrompt */}
          <section className="mb-8">
            <h2 className="mb-3 font-display text-base font-semibold text-ink">
              Par prompt (12 derniers mois)
            </h2>
            {byPrompt.length === 0 ? (
              <p className="text-sm italic text-muted">
                Aucun run IA enregistré pour cette organisation sur les 12 derniers mois.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-line bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-paper-2">
                    <tr>
                      <th className="px-4 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-ink-2">
                        Prompt
                      </th>
                      <th className="px-4 py-2 text-right font-mono text-[11px] uppercase tracking-wider text-ink-2">
                        Runs
                      </th>
                      <th className="px-4 py-2 text-right font-mono text-[11px] uppercase tracking-wider text-ink-2">
                        Coût total
                      </th>
                      <th className="px-4 py-2 text-right font-mono text-[11px] uppercase tracking-wider text-ink-2">
                        Coût moyen / run
                      </th>
                      <th className="px-4 py-2 text-right font-mono text-[11px] uppercase tracking-wider text-ink-2">
                        Latence moy.
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {byPrompt.map((row) => (
                      <tr key={row.promptName}>
                        <td className="px-4 py-2.5 font-mono text-xs text-ink">{row.promptName}</td>
                        <td className="px-4 py-2.5 text-right text-ink-2">{formatInt(row.runs)}</td>
                        <td className="px-4 py-2.5 text-right font-medium text-ink">
                          {formatUsd(row.totalCostUsd)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-muted">
                          {formatUsd(row.totalCostUsd / Math.max(row.runs, 1))}
                        </td>
                        <td className="px-4 py-2.5 text-right text-muted">
                          {formatInt(row.avgLatencyMs)} ms
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Barres CSS byMonth */}
          <section>
            <h2 className="mb-3 font-display text-base font-semibold text-ink">
              Évolution mensuelle (6 derniers mois)
            </h2>
            {byMonth.length === 0 ? (
              <p className="text-sm italic text-muted">Pas encore de données mensuelles.</p>
            ) : (
              <div className="space-y-1.5 rounded-lg border border-line bg-white p-4">
                {byMonth.map((m) => {
                  const widthPct = Math.round((m.totalCostUsd / maxMonthlyCost) * 100);
                  return (
                    <div key={m.month} className="flex items-center gap-3 text-xs">
                      <div className="w-20 shrink-0 font-mono text-[11px] text-ink-2">
                        {formatMonth(m.month)}
                      </div>
                      <div className="relative flex-1 overflow-hidden rounded bg-paper-2">
                        <div
                          className="bg-brand-red/70 h-5 rounded"
                          style={{ width: `${Math.max(widthPct, 2)}%` }}
                          aria-hidden
                        />
                      </div>
                      <div className="w-24 shrink-0 text-right text-ink">
                        {formatUsd(m.totalCostUsd)}
                      </div>
                      <div className="w-16 shrink-0 text-right font-mono text-[10px] text-muted">
                        {formatInt(m.runs)} runs
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sous-composants
// ---------------------------------------------------------------------------

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <p className="font-mono text-[11px] uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold text-ink">{value}</p>
    </div>
  );
}
