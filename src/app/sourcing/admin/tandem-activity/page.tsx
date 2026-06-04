/**
 * Page admin — Activité Tandem (H5, Steve 2026-06-04).
 *
 * Vue agrégée de toutes les sollicitations Tandem de l'organisation :
 *  - KPI cards : pending / accepted / declined / info_requested
 *  - Taux de réponse (acceptés / total) et délai moyen (sollicitation → réponse)
 *  - Tableau détaillé des sollicitations récentes (90 derniers jours) avec
 *    AO, archi, statut, date de sollicitation, date de réponse, relance J+3
 *
 * Server Component admin (pas superadmin — un admin AlyoS doit pouvoir
 * piloter son activité commerciale).
 */

import { redirect } from "next/navigation";
import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { architects } from "@/db/schema/architects";
import { architectResponses, architectTokens } from "@/db/schema/selections";
import { tenders } from "@/db/schema/tenders";
import { isAdmin, toUserProfile } from "@/lib/auth/types";
import { getRequiredOrgId } from "@/lib/auth/get-required-org-id";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ALYOS_ORG_ID } from "@/lib/constants/organization";
import { ErrorBanner } from "@/app/sourcing/ao-du-jour/ErrorBanner";

export const metadata = { title: "Activité Tandem · edifio Sourcing" };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateTime(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(status: string): { label: string; className: string } {
  switch (status) {
    case "pending":
      return { label: "En attente", className: "bg-amber-50 text-amber-700" };
    case "accepted":
      return { label: "Accepté", className: "bg-emerald-50 text-emerald-700" };
    case "declined":
      return { label: "Décliné", className: "bg-error-bg text-error" };
    case "info_requested":
      return { label: "Demande d'infos", className: "bg-paper-2 text-ink-2" };
    default:
      return { label: status, className: "bg-paper-2 text-ink-2" };
  }
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

export default async function TandemActivityPage() {
  // 1. Auth + admin.
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/sourcing/admin/tandem-activity");
  const profile = toUserProfile(user);
  if (!isAdmin(profile)) redirect("/sourcing/ao-du-jour?error=forbidden");

  let orgId: string;
  try {
    orgId = await getRequiredOrgId(user.id);
  } catch (err) {
    console.error("[admin-tandem-activity:org:fail]", err);
    orgId = ALYOS_ORG_ID;
  }

  // 2. Agrégats.
  let fetchError: string | null = null;
  const counts = { pending: 0, accepted: 0, declined: 0, infoRequested: 0, total: 0 };
  const kpis = { responseRatePct: 0, avgResponseHours: 0 };
  let recent: Array<{
    id: string;
    status: string;
    respondedAt: Date | null;
    createdAt: Date;
    followupSentAt: Date | null;
    tenderTitle: string;
    architectCabinet: string;
  }> = [];

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  try {
    // 2a. Counts globaux (90 derniers jours).
    const countRows = await db
      .select({
        status: architectResponses.status,
        n: sql<number>`count(*)::int`,
      })
      .from(architectResponses)
      .innerJoin(architectTokens, eq(architectTokens.id, architectResponses.tokenId))
      .where(
        and(
          eq(architectResponses.organizationId, orgId),
          gte(architectTokens.createdAt, ninetyDaysAgo),
        ),
      )
      .groupBy(architectResponses.status);
    for (const row of countRows) {
      const n = Number(row.n);
      counts.total += n;
      if (row.status === "pending") counts.pending = n;
      else if (row.status === "accepted") counts.accepted = n;
      else if (row.status === "declined") counts.declined = n;
      else if (row.status === "info_requested") counts.infoRequested = n;
    }

    // 2b. Taux de réponse + délai moyen (sollicitation → réponse).
    if (counts.total > 0) {
      kpis.responseRatePct = Math.round(
        ((counts.accepted + counts.declined + counts.infoRequested) / counts.total) * 100,
      );
    }
    const [avgRow] = await db
      .select({
        avgHours: sql<string>`coalesce(avg(extract(epoch from (${architectResponses.respondedAt} - ${architectTokens.createdAt})) / 3600), 0)::text`,
      })
      .from(architectResponses)
      .innerJoin(architectTokens, eq(architectTokens.id, architectResponses.tokenId))
      .where(
        and(
          eq(architectResponses.organizationId, orgId),
          isNotNull(architectResponses.respondedAt),
          gte(architectTokens.createdAt, ninetyDaysAgo),
        ),
      );
    kpis.avgResponseHours = avgRow ? Math.round(Number(avgRow.avgHours)) : 0;

    // 2c. Tableau récent (30 dernières sollicitations).
    const recentRows = await db
      .select({
        id: architectResponses.id,
        status: architectResponses.status,
        respondedAt: architectResponses.respondedAt,
        createdAt: architectTokens.createdAt,
        followupSentAt: architectResponses.followupSentAt,
        tenderTitle: tenders.title,
        architectCabinet: architects.cabinet,
      })
      .from(architectResponses)
      .innerJoin(architectTokens, eq(architectTokens.id, architectResponses.tokenId))
      .innerJoin(tenders, eq(tenders.id, architectResponses.tenderId))
      .innerJoin(architects, eq(architects.id, architectResponses.architectId))
      .where(
        and(
          eq(architectResponses.organizationId, orgId),
          gte(architectTokens.createdAt, ninetyDaysAgo),
        ),
      )
      .orderBy(desc(architectTokens.createdAt))
      .limit(30);

    recent = recentRows.map((r) => ({
      id: r.id,
      status: r.status,
      respondedAt: r.respondedAt,
      createdAt: r.createdAt,
      followupSentAt: r.followupSentAt,
      tenderTitle: r.tenderTitle,
      architectCabinet: r.architectCabinet,
    }));
  } catch (err) {
    console.error("[admin-tandem-activity:fetch:fail]", err);
    fetchError = "db-error";
  }

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink md:text-3xl">
          Activité Tandem
        </h1>
        <p className="mt-1 text-sm text-muted">
          Vue agrégée des sollicitations architectes sur les 90 derniers jours, avec taux de réponse
          et délai moyen.
        </p>
      </header>

      {fetchError ? (
        <ErrorBanner
          message={fetchError}
          title="Indisponible"
          description="Impossible de charger les agrégats — réessaie dans quelques instants."
        />
      ) : (
        <>
          {/* KPIs */}
          <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            <KpiCard label="Sollicitations" value={String(counts.total)} />
            <KpiCard
              label="En attente"
              value={String(counts.pending)}
              colorClass="text-amber-700"
            />
            <KpiCard
              label="Acceptés"
              value={String(counts.accepted)}
              colorClass="text-emerald-700"
            />
            <KpiCard label="Déclinés" value={String(counts.declined)} colorClass="text-error" />
            <KpiCard label="Taux de réponse" value={`${kpis.responseRatePct} %`} />
            <KpiCard label="Délai moyen" value={`${kpis.avgResponseHours} h`} />
          </section>

          {/* Tableau récent */}
          <section>
            <h2 className="mb-3 font-display text-base font-semibold text-ink">
              30 dernières sollicitations
            </h2>
            {recent.length === 0 ? (
              <p className="text-sm italic text-muted">
                Aucune sollicitation Tandem sur les 90 derniers jours.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-line bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-paper-2">
                    <tr>
                      <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-ink-2">
                        AO
                      </th>
                      <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-ink-2">
                        Architecte
                      </th>
                      <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-ink-2">
                        Statut
                      </th>
                      <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-ink-2">
                        Sollicité
                      </th>
                      <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-ink-2">
                        Répondu
                      </th>
                      <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-ink-2">
                        Relance J+3
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {recent.map((row) => {
                      const status = statusLabel(row.status);
                      return (
                        <tr key={row.id}>
                          <td className="max-w-[280px] truncate px-3 py-2 text-ink">
                            {row.tenderTitle}
                          </td>
                          <td className="px-3 py-2 text-ink-2">{row.architectCabinet}</td>
                          <td className="px-3 py-2">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${status.className}`}
                            >
                              {status.label}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono text-[11px] text-muted">
                            {formatDateTime(row.createdAt)}
                          </td>
                          <td className="px-3 py-2 font-mono text-[11px] text-muted">
                            {formatDateTime(row.respondedAt)}
                          </td>
                          <td className="px-3 py-2 font-mono text-[11px] text-muted">
                            {row.followupSentAt ? formatDateTime(row.followupSentAt) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  colorClass,
}: {
  label: string;
  value: string;
  colorClass?: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-white p-3">
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-1 font-display text-xl font-semibold ${colorClass ?? "text-ink"}`}>
        {value}
      </p>
    </div>
  );
}
