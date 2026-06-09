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
import { and, desc, eq, gte, isNotNull, lte, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { architects } from "@/db/schema/architects";
import { architectResponses, architectTokens } from "@/db/schema/selections";
import { tenders } from "@/db/schema/tenders";
import { isAdmin, toUserProfile } from "@/lib/auth/types";
import { getRequiredOrgId, NoOrganizationMembershipError } from "@/lib/auth/get-required-org-id";
import { markArchitectNotificationsSeen } from "@/lib/notifications/architect-responses";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ErrorBanner } from "@/app/sourcing/ao-du-jour/ErrorBanner";
import {
  RangeFilter,
  parseRange,
  rangeDaysAgo,
  parseCustomRange,
} from "@/app/sourcing/admin/_shared/RangeFilter";
import { TandemTable } from "./TandemTable";

export const metadata = { title: "Activité Tandem · edifio Sourcing" };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// `formatDateTime` et `statusLabel` migrés vers TandemTable.tsx (I1 — Client
// Component pour pouvoir formater par ligne après filtre).

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

interface PageProps {
  searchParams?: Promise<{ range?: string; from?: string; to?: string }>;
}

function formatDateForInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function TandemActivityPage(props: PageProps) {
  const searchParams = await props.searchParams;
  // 1. Auth + admin.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/sourcing/admin/tandem-activity");
  const profile = toUserProfile(user);
  if (!isAdmin(profile)) redirect("/sourcing/ao-du-jour?error=forbidden");

  // Lot 1.6-bis (Hugo, 2026-06-09) — suppression du fallback ALYOS_ORG_ID.
  // Si pas de membership : redirect /no-org (ne JAMAIS fallback — fuite CC-2).
  let orgId: string;
  try {
    orgId = await getRequiredOrgId(user.id);
  } catch (err) {
    if (err instanceof NoOrganizationMembershipError) {
      redirect("/no-org");
    }
    throw err;
  }

  // H7 — marque les notifications comme vues à l'ouverture de la page.
  // Best-effort : si l'UPDATE rate, on continue sans casser la page.
  try {
    await markArchitectNotificationsSeen(db, user.id);
  } catch (err) {
    console.warn("[admin-tandem-activity:mark-seen:fail]", err);
  }

  // I1 + J1 — fenêtre temporelle dynamique. Override via ?range=7|30|90 ou
  // ?range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD.
  const range = parseRange(searchParams?.range);
  const custom = range === "custom" ? parseCustomRange(searchParams?.from, searchParams?.to) : null;
  const effectiveRange: typeof range = range === "custom" && !custom ? "30" : range;
  const rangeFrom = custom ? custom.from : rangeDaysAgo(effectiveRange);
  const rangeTo = custom ? custom.to : new Date();
  const rangeLabel = custom
    ? `${custom.from.toLocaleDateString("fr-FR")} → ${custom.to.toLocaleDateString("fr-FR")}`
    : `${range} derniers jours`;

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

  try {
    // 2a. Counts globaux (fenêtre temporelle dynamique I1 + J1).
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
          gte(architectTokens.createdAt, rangeFrom),
          lte(architectTokens.createdAt, rangeTo),
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
          gte(architectTokens.createdAt, rangeFrom),
          lte(architectTokens.createdAt, rangeTo),
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
          gte(architectTokens.createdAt, rangeFrom),
          lte(architectTokens.createdAt, rangeTo),
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
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink md:text-3xl">
            Activité Tandem
          </h1>
          <p className="mt-1 text-sm text-muted">
            Vue agrégée des sollicitations architectes sur {rangeLabel}, avec taux de réponse et
            délai moyen.
          </p>
        </div>
        <RangeFilter
          basePath="/sourcing/admin/tandem-activity"
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

          {/* Tableau récent — Client Component avec recherche + export CSV (I1). */}
          <section>
            <h2 className="mb-3 font-display text-base font-semibold text-ink">
              30 dernières sollicitations
            </h2>
            <TandemTable
              rows={recent.map((r) => ({
                id: r.id,
                status: r.status,
                respondedAtIso: r.respondedAt ? r.respondedAt.toISOString() : null,
                createdAtIso: r.createdAt.toISOString(),
                followupSentAtIso: r.followupSentAt ? r.followupSentAt.toISOString() : null,
                tenderTitle: r.tenderTitle,
                architectCabinet: r.architectCabinet,
              }))}
            />
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
