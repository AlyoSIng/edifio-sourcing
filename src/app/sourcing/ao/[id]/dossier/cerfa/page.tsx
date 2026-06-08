/**
 * Page CERFA — `/sourcing/ao/[id]/dossier/cerfa`.
 *
 * Server Component protégé (middleware `@alyosingenierie.fr`).
 * Affiche les formulaires DC1 + DC2 préremplis depuis les données AlyoS.
 *
 * Prérequis : l'analyse RC doit avoir été effectuée (présence d'un event
 * `rc_analyzed` en BDD). Si absent → redirect vers `/sourcing/ao/{id}/dossier`.
 *
 * Résilience runtime (memory `feedback_nextjs_runtime_page_resilience`) :
 *   try/catch absorbé autour de toutes les requêtes BDD → `<ErrorBanner>`.
 *
 * Source de vérité : brief Board PR-C 2026-05-25.
 */

import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";

import { ErrorBanner } from "@/app/sourcing/ao-du-jour/ErrorBanner";
import { db } from "@/db/client";
import { architects } from "@/db/schema/architects";
import { bureauEtudes } from "@/db/schema/bureaux-etudes";
import { architectResponses } from "@/db/schema/selections";
import { tenderBeCotraitants } from "@/db/schema/tender-cotraitants";
import { tenderEvents, tenders } from "@/db/schema/tenders";
import { organizations } from "@/db/schema/organizations";
import { organizationProfiles } from "@/db/schema/messaging";
import { withTenantContext } from "@/lib/db/with-tenant-context";
import { toUserProfile } from "@/lib/auth/types";
import { isAuthorizedEmail } from "@/lib/auth/domain";
import { getRequiredOrgId } from "@/lib/auth/get-required-org-id";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ALYOS_ORG_ID } from "@/lib/constants/organization";
import { buildDc1, buildDc2 } from "@/lib/dossier/cerfa-prefill";
import type { AcceptedArchitect, BeCotraitantSnapshot } from "../page-data";
import { CerfaFormClient } from "./CerfaFormClient";
import { loadExistingCerfa } from "./actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export const metadata = {
  title: "DC1 & DC2 · edifio Sourcing",
};

interface PageProps {
  params: Promise<{ id: string }>;
  /**
   * Query params :
   *   - `archi` : UUID de l'architecte sélectionné comme mandataire du
   *     groupement (Phase 3 Tandem multi-archi). Si fourni et valide,
   *     le DC1 est pré-rempli depuis les coordonnées de cet architecte
   *     au lieu d'AlyoS. UUID invalide / archi non accepté pour cet AO
   *     → fallback Solo (DC1 = AlyoS, archi ignoré).
   *   - `be` : UUID du BE cotraitant sélectionné (Lot B — Cotraitance BE).
   *     Si fourni et valide (BE présent dans `tender_be_cotraitants` pour
   *     ce tender), le DC2 est pré-rempli depuis sa fiche au lieu d'AlyoS.
   *     UUID invalide / BE non cotraitant → fallback standard (DC2 = AlyoS).
   *
   * Mutual exclusivity : `archi` et `be` ne se mélangent pas (Tandem ≠
   * Cotraitance BE). Si les deux sont présents → `archi` prime (Tandem) et
   * `be` est ignoré.
   */
  searchParams?: Promise<{ archi?: string; be?: string }>;
}

const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export default async function CerfaPage(props: PageProps) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  // 1. Auth check défensif
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/sourcing/ao/${params.id}/dossier/cerfa`);
  const profile = toUserProfile(user);
  if (!isAuthorizedEmail(profile.email)) redirect("/forbidden");
  // Résolution dynamique de l'org (Phase A multi-tenant).
  // Try/catch propre : si la requête memberships échoue, fallback sur ALYOS_ORG_ID
  // plutôt que crash 500 de la page entière.
  let orgId: string;
  try {
    orgId = await getRequiredOrgId(user.id);
  } catch (err) {
    console.error("[dossier-cerfa:org-resolution-failed]", err);
    orgId = ALYOS_ORG_ID;
  }

  // 2. Validation UUID
  if (!UUID_SHAPE.test(params.id)) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-8">
        <ErrorBanner message="Identifiant d'AO invalide." />
      </main>
    );
  }

  const tenderId = params.id;

  // 3. Chargement des données — résilience runtime
  try {
    // 3a. Tender (vérif existence + tenant)
    const [tender] = await db
      .select({
        id: tenders.id,
        title: tenders.title,
        buyer: tenders.buyer,
        status: tenders.status,
      })
      .from(tenders)
      .where(and(eq(tenders.id, tenderId), eq(tenders.organizationId, orgId)))
      .limit(1);

    if (!tender) {
      return (
        <main className="mx-auto max-w-5xl px-6 py-8">
          <ErrorBanner message="Cet AO n'existe plus ou est inaccessible." />
        </main>
      );
    }

    // 3b. Vérification que l'analyse RC existe (prérequis)
    const [rcAnalyzedEvent] = await db
      .select({ id: tenderEvents.id })
      .from(tenderEvents)
      .where(
        and(
          eq(tenderEvents.tenderId, tenderId),
          eq(tenderEvents.organizationId, orgId),
          eq(tenderEvents.eventType, "rc_analyzed"),
        ),
      )
      .orderBy(desc(tenderEvents.occurredAt))
      .limit(1);

    if (!rcAnalyzedEvent) {
      // Analyse RC absente → retour à la page dossier
      redirect(`/sourcing/ao/${tenderId}/dossier`);
    }

    // 3c. Organisation AlyoS
    const [org] = await db
      .select({ id: organizations.id, name: organizations.name, siren: organizations.siren })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    // 3d. Profil commercial AlyoS (nullable)
    // withTenantContext pose app.current_organization_id pour FORCE RLS
    // (cf. ANSWER_260527_CTO_RLS_FORCE_EDGE.md + with-tenant-context.ts).
    const [orgProfile] = await withTenantContext(orgId, db, (client) =>
      client
        .select({
          commercialName: organizationProfiles.commercialName,
          agencyDetails: organizationProfiles.agencyDetails,
          phone: organizationProfiles.phone,
          contactEmail: organizationProfiles.contactEmail,
        })
        .from(organizationProfiles)
        .where(eq(organizationProfiles.organizationId, orgId))
        .limit(1),
    );

    // 3e. Fichiers CERFA existants (si déjà validés)
    const { dc1: existingDc1, dc2: existingDc2 } = await loadExistingCerfa(tenderId, orgId);

    // 3f. Résolution archi sélectionné (Phase 3 Tandem multi-archi).
    //     Validation : UUID dans le query param ET architect_responses.status='accepted'
    //     pour ce tender (defense in depth — un UUID arbitraire ne suffit pas).
    //     Fallback null si non fourni / invalide / archi non accepté.
    const archiParam = searchParams?.archi;
    const requestedArchiId = archiParam && UUID_SHAPE.test(archiParam) ? archiParam : null;
    let selectedArchitect: AcceptedArchitect | null = null;
    if (requestedArchiId) {
      const [archiRow] = await db
        .select({
          id: architects.id,
          cabinet: architects.cabinet,
          contactName: architects.contactName,
          email: architects.email,
          phone: architects.phone,
          siren: architects.siren,
          legalRepresentativeName: architects.legalRepresentativeName,
          legalRepresentativeRole: architects.legalRepresentativeRole,
          addressLine1: architects.addressLine1,
          addressLine2: architects.addressLine2,
          zip: architects.zip,
          city: architects.city,
          signatureCity: architects.signatureCity,
          signedAt: architectResponses.respondedAt,
        })
        .from(architectResponses)
        .innerJoin(architects, eq(architectResponses.architectId, architects.id))
        .where(
          and(
            eq(architectResponses.tenderId, tenderId),
            eq(architectResponses.organizationId, orgId),
            eq(architectResponses.status, "accepted"),
            eq(architects.id, requestedArchiId),
            eq(architects.organizationId, orgId),
          ),
        )
        .limit(1);

      // Un archi sans email ne peut pas être mandataire (DC1 §B email obligatoire).
      // Si l'export Odoo a laissé le champ vide, on retombe sur le mode Solo
      // plutôt que de générer un DC1 incomplet.
      if (archiRow && archiRow.email != null) {
        selectedArchitect = {
          id: archiRow.id,
          cabinet: archiRow.cabinet,
          contactName: archiRow.contactName,
          email: archiRow.email,
          phone: archiRow.phone,
          siren: archiRow.siren,
          legalRepresentativeName: archiRow.legalRepresentativeName,
          legalRepresentativeRole: archiRow.legalRepresentativeRole,
          addressLine1: archiRow.addressLine1,
          addressLine2: archiRow.addressLine2,
          zip: archiRow.zip,
          city: archiRow.city,
          signatureCity: archiRow.signatureCity,
          signedAt: archiRow.signedAt,
        };
      }
    }

    // 3g. Résolution BE cotraitant sélectionné (Lot B — Cotraitance BE).
    //     Mutual exclusivity : si `?archi=` est déjà résolu (Tandem prime),
    //     on ignore `?be=` (Tandem ≠ Cotraitance BE). Sinon validation :
    //     UUID dans le query param ET BE présent dans `tender_be_cotraitants`
    //     pour ce tender ET cette org (defense in depth — un UUID arbitraire
    //     ne suffit pas, même si c'est un BE valide d'une autre org).
    const beParam = searchParams?.be;
    const requestedBeId =
      !selectedArchitect && beParam && UUID_SHAPE.test(beParam) ? beParam : null;
    let selectedBe: BeCotraitantSnapshot | null = null;
    if (requestedBeId) {
      const [beRow] = await db
        .select({
          id: bureauEtudes.id,
          cabinet: bureauEtudes.cabinet,
          contactName: bureauEtudes.contactName,
          email: bureauEtudes.email,
          phone: bureauEtudes.phone,
          siren: bureauEtudes.siren,
          addressLine1: bureauEtudes.addressLine1,
          addressLine2: bureauEtudes.addressLine2,
          zip: bureauEtudes.zip,
          city: bureauEtudes.city,
          capitalEur: bureauEtudes.capitalEur,
          signatureCity: bureauEtudes.signatureCity,
          legalRepresentativeName: bureauEtudes.legalRepresentativeName,
          legalRepresentativeRole: bureauEtudes.legalRepresentativeRole,
        })
        .from(tenderBeCotraitants)
        .innerJoin(bureauEtudes, eq(tenderBeCotraitants.beId, bureauEtudes.id))
        .where(
          and(
            eq(tenderBeCotraitants.tenderId, tenderId),
            eq(tenderBeCotraitants.organizationId, orgId),
            eq(tenderBeCotraitants.beId, requestedBeId),
            eq(bureauEtudes.organizationId, orgId),
          ),
        )
        .limit(1);

      if (beRow) {
        selectedBe = {
          id: beRow.id,
          cabinet: beRow.cabinet,
          contactName: beRow.contactName,
          email: beRow.email,
          phone: beRow.phone,
          siren: beRow.siren,
          addressLine1: beRow.addressLine1,
          addressLine2: beRow.addressLine2,
          zip: beRow.zip,
          city: beRow.city,
          capitalEur: beRow.capitalEur,
          signatureCity: beRow.signatureCity,
          legalRepresentativeName: beRow.legalRepresentativeName,
          legalRepresentativeRole: beRow.legalRepresentativeRole,
        };
      }
    }

    // 4. isTandem : au MVP, seuls les AOs `architect_accepted` accèdent au dossier
    // donc isTandem est toujours true ici.
    // Conservé en variable explicite pour préparation Phase 2 Solo.
    const isTandem = tender.status === "architect_accepted";

    const prefillInput = {
      tender: { title: tender.title, buyer: tender.buyer },
      org: { name: org?.name ?? "AlyoS Ingénierie", siren: org?.siren ?? null },
      orgProfile: orgProfile ?? null,
      isTandem,
      selectedArchitect,
      selectedBe,
    };

    // 5. Construction des CERFA préremplis
    const dc1 = buildDc1(prefillInput);
    const dc2 = buildDc2(prefillInput);

    return (
      <main className="mx-auto max-w-5xl px-6 py-8">
        {/* Fil d'Ariane */}
        <nav className="mb-4 flex items-center gap-2 text-xs text-muted" aria-label="Fil d'Ariane">
          <a
            href="/sourcing/cotraitance"
            className="hover:text-ink hover:underline focus:outline-none"
          >
            Cotraitance
          </a>
          <span aria-hidden>/</span>
          <a
            href={`/sourcing/ao/${tenderId}/tandem`}
            className="hover:text-ink hover:underline focus:outline-none"
          >
            Short-list
          </a>
          <span aria-hidden>/</span>
          <a
            href={
              selectedArchitect
                ? `/sourcing/ao/${tenderId}/dossier?archi=${selectedArchitect.id}`
                : `/sourcing/ao/${tenderId}/dossier`
            }
            className="hover:text-ink hover:underline focus:outline-none"
          >
            Dossier
          </a>
          <span aria-hidden>/</span>
          <span className="text-ink">DC1 &amp; DC2</span>
        </nav>

        {/* En-tête */}
        <header className="mb-6">
          <span className="pill-eyebrow">Formulaires CERFA</span>
          <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-ink md:text-3xl">
            DC1 &amp; DC2 — Candidature
          </h1>
          <p className="mt-2 text-sm text-ink-2">
            Formulaires pré-remplis depuis les données AlyoS. Complétez les champs signalés en
            orange puis validez chaque formulaire.
          </p>
        </header>

        {/* Légende sources */}
        <div className="mb-6 flex flex-wrap gap-3">
          <span className="flex items-center gap-1.5 text-xs text-ink-2">
            <span className="inline-block h-2 w-2 rounded-full bg-blue-400" aria-hidden />
            Données société
          </span>
          <span className="flex items-center gap-1.5 text-xs text-ink-2">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
            Données AO
          </span>
          <span className="flex items-center gap-1.5 text-xs text-ink-2">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-400" aria-hidden />À
            compléter manuellement
          </span>
        </div>

        {/* Formulaires DC1 + DC2 */}
        <CerfaFormClient
          dc1={dc1}
          dc2={dc2}
          tenderId={tenderId}
          existingDc1={existingDc1}
          existingDc2={existingDc2}
          selectedArchitect={selectedArchitect}
          selectedBe={selectedBe}
        />

        {/* Lien vers l'étape suivante */}
        <div className="mt-8 flex justify-end">
          <a
            href={
              selectedArchitect
                ? `/sourcing/ao/${tenderId}/dossier/pieces?archi=${selectedArchitect.id}`
                : `/sourcing/ao/${tenderId}/dossier/pieces`
            }
            className="hover:bg-ink/80 inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white transition"
          >
            Pièces complémentaires
            <span aria-hidden>&rarr;</span>
          </a>
        </div>
      </main>
    );
  } catch (err) {
    console.error("[cerfa-page:unhandled]", err);
    return (
      <main className="mx-auto max-w-5xl px-6 py-8">
        <ErrorBanner message="Erreur de chargement — réessayez ou contactez l'administrateur." />
      </main>
    );
  }
}
