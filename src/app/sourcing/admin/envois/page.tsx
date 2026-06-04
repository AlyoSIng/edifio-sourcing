/**
 * Page admin — Historique envois dossier (chantier I2, Steve 2026-06-04).
 *
 * Liste l'intégralité des dossier_dispatches de l'organisation : envois
 * actifs et annulés, avec leur lien signé Storage (status actif / expiré
 * calculé côté Client). Pagination ~200 dernières lignes pour rester véloce.
 *
 * Server Component admin. Le tableau lui-même est un Client Component
 * (EnvoisTable) pour pouvoir filtrer / chercher / exporter sans round-trip.
 */

import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { architects } from "@/db/schema/architects";
import { dossierDispatches } from "@/db/schema/dossier-dispatches";
import { tenders } from "@/db/schema/tenders";
import { isAdmin, toUserProfile } from "@/lib/auth/types";
import { getRequiredOrgId } from "@/lib/auth/get-required-org-id";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ALYOS_ORG_ID } from "@/lib/constants/organization";
import { ErrorBanner } from "@/app/sourcing/ao-du-jour/ErrorBanner";

import { EnvoisTable, type EnvoiRow } from "./EnvoisTable";

export const metadata = { title: "Envois de dossiers · edifio Sourcing" };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HISTORY_LIMIT = 200;

export default async function EnvoisPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/sourcing/admin/envois");
  const profile = toUserProfile(user);
  if (!isAdmin(profile)) redirect("/sourcing/ao-du-jour?error=forbidden");

  let orgId: string;
  try {
    orgId = await getRequiredOrgId(user.id);
  } catch (err) {
    console.error("[admin-envois:org:fail]", err);
    orgId = ALYOS_ORG_ID;
  }

  let fetchError: string | null = null;
  let rows: EnvoiRow[] = [];

  try {
    // Charge les dispatches + AO + archi en un seul JOIN.
    // LEFT JOIN sur tenders et architects — l'archi peut avoir été purgé
    // RGPD entre temps, on garde quand même l'historique d'envoi.
    const data = await db
      .select({
        id: dossierDispatches.id,
        sentAt: dossierDispatches.sentAt,
        signedUrlExpiresAt: dossierDispatches.signedUrlExpiresAt,
        recipientEmail: dossierDispatches.recipientEmail,
        cancelledAt: dossierDispatches.cancelledAt,
        cancellationReason: dossierDispatches.cancellationReason,
        tenderTitle: tenders.title,
        tenderExternalRef: tenders.externalRef,
        architectCabinet: architects.cabinet,
      })
      .from(dossierDispatches)
      .leftJoin(tenders, eq(tenders.id, dossierDispatches.tenderId))
      .leftJoin(architects, eq(architects.id, dossierDispatches.architectId))
      .where(and(eq(dossierDispatches.organizationId, orgId)))
      .orderBy(desc(dossierDispatches.sentAt))
      .limit(HISTORY_LIMIT);

    rows = data.map((d) => ({
      id: d.id,
      tenderTitle: d.tenderTitle ?? "(AO supprimé)",
      tenderExternalRef: d.tenderExternalRef,
      architectCabinet: d.architectCabinet ?? "(archi supprimé)",
      recipientEmail: d.recipientEmail,
      sentAtIso: d.sentAt.toISOString(),
      signedUrlExpiresAtIso: d.signedUrlExpiresAt.toISOString(),
      cancelledAtIso: d.cancelledAt ? d.cancelledAt.toISOString() : null,
      cancellationReason: d.cancellationReason,
    }));
  } catch (err) {
    console.error("[admin-envois:fetch:fail]", err);
    fetchError = "db-error";
  }

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink md:text-3xl">
          Envois de dossiers
        </h1>
        <p className="mt-1 text-sm text-muted">
          Historique des dossiers envoyés aux architectes (limite {HISTORY_LIMIT} envois les plus
          récents). Les envois annulés restent visibles ici pour traçabilité.
        </p>
      </header>

      {fetchError ? (
        <ErrorBanner
          message={fetchError}
          title="Indisponible"
          description="Impossible de charger l'historique — réessaie dans quelques instants."
        />
      ) : rows.length === 0 ? (
        <p className="text-sm italic text-muted">
          Aucun envoi de dossier enregistré pour le moment.
        </p>
      ) : (
        <EnvoisTable rows={rows} />
      )}
    </div>
  );
}
