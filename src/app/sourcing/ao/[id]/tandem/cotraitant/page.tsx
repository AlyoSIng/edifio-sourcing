/**
 * Page Cotraitant d'un AO — `/sourcing/ao/[id]/tandem/cotraitant`.
 *
 * Server Component protégé (middleware @alyosingenierie.fr + /sourcing/*).
 * Charge :
 *  - Le cotraitant éventuellement associé à l'AO (avec sa fiche)
 *  - La liste globale des cotraitants (pour la sélection)
 *  - Les documents liés (filtrés par cotraitant + AO)
 * et délègue le rendu interactif à TandemCotraitantClient.
 *
 * Résilience runtime : try/catch absorbé (cf. memory feedback_nextjs_runtime_page_resilience).
 *
 * Source de vérité : demande Board 2026-05-26 (bibliothèque cotraitants).
 */

import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { tenders } from "@/db/schema/tenders";
import { ErrorBanner } from "@/app/sourcing/ao-du-jour/ErrorBanner";
import { isAuthorizedEmail } from "@/lib/auth/domain";
import { isAdmin, toUserProfile } from "@/lib/auth/types";
import { getRequiredOrgId } from "@/lib/auth/get-required-org-id";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ALYOS_ORG_ID } from "@/lib/constants/organization";

import {
  getTenderCotraitant,
  listCotraitants,
  listDocumentsForCotraitant,
} from "@/app/sourcing/cotraitants/actions";
import { TandemCotraitantClient } from "./TandemCotraitantClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Cotraitant — edifio Sourcing",
};

const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TandemCotraitantPage(props: PageProps) {
  const params = await props.params;
  // Auth check défensif
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/sourcing/ao/${params.id}/tandem/cotraitant`);
  const profile = toUserProfile(user);
  if (!isAuthorizedEmail(profile.email)) redirect("/forbidden");
  // Résolution dynamique de l'org (Phase A multi-tenant).
  // Try/catch propre : si la requête memberships échoue, fallback sur ALYOS_ORG_ID
  // plutôt que crash 500 de la page entière.
  let orgId: string;
  try {
    orgId = await getRequiredOrgId(user.id);
  } catch (err) {
    console.error("[ao-tandem-cotraitant:org-resolution-failed]", err);
    orgId = ALYOS_ORG_ID;
  }

  if (!UUID_SHAPE.test(params.id)) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-8">
        <ErrorBanner message="Identifiant d'AO invalide." />
      </main>
    );
  }

  const adminUser = isAdmin(profile);

  // -------------------------------------------------------------------------
  // Chargement parallèle avec résilience
  // -------------------------------------------------------------------------
  let tenderTitle = "";
  let tenderBuyer = "";
  let associationData: Awaited<ReturnType<typeof getTenderCotraitant>> = null;
  let allCotraitants: Awaited<ReturnType<typeof listCotraitants>> = [];
  let documents: Awaited<ReturnType<typeof listDocumentsForCotraitant>> = [];
  let fetchError: string | null = null;

  try {
    // Titre de l'AO pour l'affichage
    const tenderRows = await db
      .select({ title: tenders.title, buyer: tenders.buyer })
      .from(tenders)
      .where(and(eq(tenders.id, params.id), eq(tenders.organizationId, orgId)))
      .limit(1);

    tenderTitle = tenderRows[0]?.title ?? "";
    tenderBuyer = tenderRows[0]?.buyer ?? "";

    // Données cotraitant
    [associationData, allCotraitants] = await Promise.all([
      getTenderCotraitant(params.id),
      listCotraitants(),
    ]);

    // Documents liés (uniquement si un cotraitant est associé)
    if (associationData) {
      documents = await listDocumentsForCotraitant(associationData.cotraitant.id, params.id);
    }
  } catch (err) {
    console.error("[tandem-cotraitant-page:fetch-failed]", err);
    fetchError = err instanceof Error ? err.message : String(err);
  }

  if (fetchError) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-8">
        <ErrorBanner message={fetchError} />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6">
        <nav className="mb-2 text-xs text-muted" aria-label="Fil d'Ariane">
          <a href={`/sourcing/ao/${params.id}/tandem`} className="hover:underline">
            ← Retour short-list
          </a>
        </nav>
        <span className="pill-eyebrow">Cotraitance</span>
        <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-ink md:text-3xl">
          Cotraitant
        </h1>
        {tenderTitle ? (
          <p className="mt-2 text-sm text-ink-2">
            <strong className="text-ink">{tenderTitle}</strong>
            {tenderBuyer ? <> · {tenderBuyer}</> : null}
          </p>
        ) : null}
      </header>

      <TandemCotraitantClient
        tenderId={params.id}
        isAdmin={adminUser}
        initialAssociation={
          associationData
            ? {
                associationId: associationData.association.id,
                cotraitant: associationData.cotraitant,
              }
            : null
        }
        allCotraitants={allCotraitants}
        initialDocuments={documents}
      />
    </main>
  );
}
