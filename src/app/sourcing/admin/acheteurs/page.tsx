/**
 * Page admin — Annuaire des acheteurs (Steve 2026-06-04 — Q4).
 *
 * Liste les buyers de l'organisation, alimenté progressivement par
 * `updateBuyerAddressAction` quand Steve saisit une adresse sur un AO.
 *
 * Server Component admin. Le tableau utilise un Client Component pour la
 * recherche + l'export CSV.
 */

import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { buyers } from "@/db/schema/buyers";
import { isAdmin, toUserProfile } from "@/lib/auth/types";
import { getRequiredOrgId } from "@/lib/auth/get-required-org-id";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ALYOS_ORG_ID } from "@/lib/constants/organization";
import { ErrorBanner } from "@/app/sourcing/ao-du-jour/ErrorBanner";

import { BuyersTable, type BuyerRow } from "./BuyersTable";

export const metadata = { title: "Annuaire acheteurs · edifio Sourcing" };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function BuyersDirectoryPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/sourcing/admin/acheteurs");
  const profile = toUserProfile(user);
  if (!isAdmin(profile)) redirect("/sourcing/ao-du-jour?error=forbidden");

  let orgId: string;
  try {
    orgId = await getRequiredOrgId(user.id);
  } catch (err) {
    console.error("[admin-acheteurs:org:fail]", err);
    orgId = ALYOS_ORG_ID;
  }

  let fetchError: string | null = null;
  let rows: BuyerRow[] = [];

  try {
    const data = await db
      .select({
        id: buyers.id,
        name: buyers.name,
        address: buyers.address,
        siret: buyers.siret,
        siren: buyers.siren,
        contactEmail: buyers.contactEmail,
        contactPhone: buyers.contactPhone,
        notes: buyers.notes,
        updatedAt: buyers.updatedAt,
      })
      .from(buyers)
      .where(eq(buyers.organizationId, orgId))
      .orderBy(desc(buyers.updatedAt));

    rows = data.map((b) => ({
      id: b.id,
      name: b.name,
      address: b.address,
      siret: b.siret,
      siren: b.siren,
      contactEmail: b.contactEmail,
      contactPhone: b.contactPhone,
      notes: b.notes,
      updatedAtIso: b.updatedAt.toISOString(),
    }));
  } catch (err) {
    console.error("[admin-acheteurs:fetch:fail]", err);
    fetchError = "db-error";
  }

  // Statistiques rapides
  const withAddress = rows.filter((r) => r.address !== null).length;
  const withSiret = rows.filter((r) => r.siret !== null).length;

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink md:text-3xl">
          Annuaire des acheteurs
        </h1>
        <p className="mt-1 text-sm text-muted">
          Master data des acheteurs publics. Alimenté automatiquement quand tu renseignes une
          adresse sur un AO — réutilisée ensuite sur les AOs du même acheteur.
        </p>
      </header>

      {fetchError ? (
        <ErrorBanner
          message={fetchError}
          title="Indisponible"
          description="Impossible de charger l'annuaire — réessaie dans quelques instants."
        />
      ) : (
        <>
          {/* KPIs */}
          <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Kpi label="Acheteurs" value={String(rows.length)} />
            <Kpi
              label="Avec adresse"
              value={String(withAddress)}
              sublabel={
                rows.length > 0 ? `${Math.round((withAddress / rows.length) * 100)} %` : undefined
              }
              colorClass="text-emerald-700"
            />
            <Kpi
              label="Avec SIRET"
              value={String(withSiret)}
              sublabel={
                rows.length > 0 ? `${Math.round((withSiret / rows.length) * 100)} %` : undefined
              }
            />
          </section>

          {rows.length === 0 ? (
            <p className="text-sm italic text-muted">
              Aucun acheteur dans l&apos;annuaire pour le moment. Renseigne une adresse sur un AO
              depuis la page <code>/sourcing/ao/[id]</code> pour démarrer.
            </p>
          ) : (
            <BuyersTable rows={rows} />
          )}
        </>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  sublabel,
  colorClass,
}: {
  label: string;
  value: string;
  sublabel?: string;
  colorClass?: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-white p-3">
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-1 font-display text-xl font-semibold ${colorClass ?? "text-ink"}`}>
        {value}
      </p>
      {sublabel && <p className="mt-0.5 font-mono text-[10px] text-muted">{sublabel}</p>}
    </div>
  );
}
