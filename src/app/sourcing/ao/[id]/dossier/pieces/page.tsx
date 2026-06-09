/**
 * Page pièces complémentaires — `/sourcing/ao/[id]/dossier/pieces`.
 *
 * Server Component protégé (middleware `@alyosingenierie.fr`).
 *
 * Charge :
 *   - L'analyse RC (depuis `tender_events` event_type='rc_analyzed')
 *   - Les items de la `presentation_library` AlyoS
 *   - Les response_files DC1/DC2 existants (pour savoir si l'étape CERFA est done)
 *
 * Si DC1 ou DC2 non validés → message d'avertissement (pas de redirect,
 * l'utilisateur peut quand même consulter la liste des pièces).
 *
 * Résilience runtime (memory `feedback_nextjs_runtime_page_resilience`) :
 *   try/catch absorbé sur toutes les requêtes BDD → `<ErrorBanner>`.
 *
 * Source de vérité : brief Board PR-D 2026-05-25.
 */

import { redirect } from "next/navigation";
import { and, desc, eq, isNull } from "drizzle-orm";

import { ErrorBanner } from "@/app/sourcing/ao-du-jour/ErrorBanner";
import { db } from "@/db/client";
import { architects } from "@/db/schema/architects";
import { dossierDispatches } from "@/db/schema/dossier-dispatches";
import { tenderEvents, tenders } from "@/db/schema/tenders";
import { presentationLibrary } from "@/db/schema/library";
import { libraryItemIndex } from "@/db/schema/library-index";
import { getRequiredOrgId, NoOrganizationMembershipError } from "@/lib/auth/get-required-org-id";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { matchPiecesWithLibrary } from "@/lib/dossier/pieces-match";
import { classifyLibraryExpiry } from "@/lib/library/expiry";
import { rcAnalysisSchema } from "@/lib/ai/schemas";
import { PiecesClient } from "./PiecesClient";
import { loadExistingCerfa } from "../cerfa/actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export const metadata = {
  title: "Pièces complémentaires · edifio Sourcing",
};

interface PageProps {
  params: Promise<{ id: string }>;
  /**
   * Query params :
   *   - `archi` : UUID de l'architecte sélectionné pour préparer son dossier
   *     en mode Tandem multi-archi (Phase 3). Propagé sur tous les liens de
   *     la page (retour Dossier, lien vers CERFA) pour conserver le contexte.
   *     UUID invalide → ignoré, comportement standard (pas d'archi).
   *   - `be`    : UUID du BE cotraitant (Lot B Cotraitance BE). Mutuellement
   *     exclusif avec `archi` — si les deux sont posés, `archi` prime. Sert
   *     uniquement à la compilation du ZIP (DC2 spécifique BE) et au hint UX.
   */
  searchParams?: Promise<{ archi?: string; be?: string }>;
}

const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export default async function PiecesPage(props: PageProps) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  // 1. Auth check défensif
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/sourcing/ao/${params.id}/dossier/pieces`);
  // ADR-014 (2026-06-05) — garde domaine `isAuthorizedEmail` retirée :
  // ouverture multi-tenant (PROTECT + orgs futures). Les autres gardes
  // restent (auth ci-dessus, tenant via `getRequiredOrgId` + RLS ci-dessous).
  // Résolution dynamique de l'org (Phase A multi-tenant).
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

  // 2. Validation UUID
  if (!UUID_SHAPE.test(params.id)) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-8">
        <ErrorBanner message="Identifiant d'AO invalide." />
      </main>
    );
  }

  const tenderId = params.id;

  // Résolution du param archi (Phase 3 — propagation contexte multi-archi).
  // Pas de validation BDD ici (defense in depth déjà faite par la page
  // dossier/cerfa qui consomment archi). On filtre juste sur la forme UUID
  // pour éviter de propager une valeur arbitraire dans les URLs.
  const archiParamRaw = searchParams?.archi;
  const archiParam = archiParamRaw && UUID_SHAPE.test(archiParamRaw) ? archiParamRaw : null;

  // Résolution du param be (Lot B — Cotraitance BE). Mutuellement exclusif
  // avec archiParam : si archi est posé, on ignore be (cohérent avec la
  // règle de précédence du Server Action `compileDossierAction`).
  const beParamRaw = searchParams?.be;
  const beParam = !archiParam && beParamRaw && UUID_SHAPE.test(beParamRaw) ? beParamRaw : null;

  // Query string propagé sur tous les liens internes vers /dossier et
  // /dossier/cerfa. Priorité archi > be (un seul des deux pose un query param).
  const archiQuery = archiParam ? `?archi=${archiParam}` : beParam ? `?be=${beParam}` : "";

  // 3. Chargement des données — résilience runtime
  try {
    // 3a. Tender
    const [tender] = await db
      .select({ id: tenders.id, title: tenders.title, buyer: tenders.buyer })
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

    // 3b. Dernier événement rc_analyzed (contient l'analyse RC)
    const [rcAnalyzedEvent] = await db
      .select({ data: tenderEvents.data })
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

    // Extraction de l'analyse RC — parsée avec Zod pour détecter les évolutions
    // de schéma entre le moment du run IA et l'affichage (W-2 Hugo)
    let rcAnalysis = null;
    if (rcAnalyzedEvent?.data) {
      const extra = (rcAnalyzedEvent.data as { extra?: { rc_analysis?: unknown } }).extra;
      if (extra?.rc_analysis) {
        const parsed = rcAnalysisSchema.safeParse(extra.rc_analysis);
        if (parsed.success) {
          rcAnalysis = parsed.data;
        } else {
          console.warn("[pieces-page:rc-analysis:schema-mismatch]", parsed.error.flatten());
          // rcAnalysis reste null → l'UI affiche le message "Aucune analyse RC disponible"
        }
      }
    }

    // 3c. Bibliothèque entreprise AlyoS
    const libraryItems = await db
      .select()
      .from(presentationLibrary)
      .where(eq(presentationLibrary.organizationId, orgId));

    // 3c-bis. Métadonnées d'indexation IA (chantier E V2 — Steve 2026-06-03).
    //   On charge `library_item_index` pour cette org et on construit une Map
    //   { library_item_id → { extracted_title, keywords } } que
    //   `matchPiecesWithLibrary` consomme pour élargir la surface de matching.
    //   Try/catch isolé : si la migration 0041 n'est pas encore appliquée,
    //   on dégrade silencieusement vers l'ancienne logique (kind + name).
    let indexByItemId = new Map<string, { extractedTitle: string | null; keywords: string[] }>();
    try {
      const idxRows = await db
        .select({
          libraryItemId: libraryItemIndex.libraryItemId,
          extractedTitle: libraryItemIndex.extractedTitle,
          keywords: libraryItemIndex.keywords,
        })
        .from(libraryItemIndex)
        .where(eq(libraryItemIndex.organizationId, orgId));
      indexByItemId = new Map(
        idxRows.map((r) => [
          r.libraryItemId,
          { extractedTitle: r.extractedTitle, keywords: r.keywords ?? [] },
        ]),
      );
    } catch (err) {
      console.warn("[pieces-page:index-load:fail]", err);
    }

    // 3d. DC1 / DC2 existants
    const { dc1: existingDc1, dc2: existingDc2 } = await loadExistingCerfa(tenderId, orgId);

    // 4. Matching pièces RC vs bibliothèque (boosté par les métadonnées IA si dispo).
    const pieceMatches = rcAnalysis
      ? matchPiecesWithLibrary(rcAnalysis.pieces_demandees, libraryItems, indexByItemId)
      : [];

    // 4b. Classification des items biblio par état d'expiration (chantier G2.1).
    //    Steve 2026-06-03 — éviter d'envoyer un dossier avec URSSAF périmée.
    //    Les items `expired` sont déjà filtrés par compileDossierAction côté
    //    pipeline ZIP — on les signale ici pour que l'admin pense à les
    //    renouveler. Les `expiringSoon` (≤ J+30) sont encore inclus mais à
    //    surveiller.
    const expiry = classifyLibraryExpiry(libraryItems);
    const expirySummary = {
      expired: expiry.expired.map((it) => ({
        id: it.id,
        name: it.name,
        validUntilIso: String(it.validUntil ?? "").slice(0, 10),
      })),
      expiringSoon: expiry.expiringSoon.map((it) => ({
        id: it.id,
        name: it.name,
        validUntilIso: String(it.validUntil ?? "").slice(0, 10),
      })),
    };

    // 4c. Aperçu de la composition du ZIP (G3 — Steve 2026-06-03). Reproduit
    //    le même filtre que compileDossierAction pour montrer à l'admin
    //    exactement ce qui partira dans le ZIP avant qu'il clique Compiler.
    //    Catégorise en : forcedItems (Pouvoir), matchedItems (matchés RC),
    //    extraItems (biblio valide ni template ni déjà cité).
    const matchedLibraryIds = new Set(
      pieceMatches.map((m) => m.libraryItem?.id).filter((id): id is string => Boolean(id)),
    );
    const pouvoirItem = libraryItems
      .filter((it) => it.kind === "pouvoir_mandataire")
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
    const TEMPLATE_KINDS_PREVIEW = new Set(["dc1", "dc2", "dc4"]);
    const extraItemsPreview = expiry.validLong
      .concat(expiry.expiringSoon)
      .filter((it) => {
        if (TEMPLATE_KINDS_PREVIEW.has(it.kind)) return false;
        if (pouvoirItem && it.id === pouvoirItem.id) return false;
        if (matchedLibraryIds.has(it.id)) return false;
        return true;
      })
      .map((it) => ({ id: it.id, name: it.name, kind: it.kind }));

    const matchedItemsPreview = pieceMatches
      .filter((m) => m.libraryItem && m.status === "available")
      .map((m) => ({
        id: m.libraryItem!.id,
        name: m.libraryItem!.name,
        pieceLabel: m.piece.nom,
      }));

    const zipComposition = {
      hasPouvoir: Boolean(pouvoirItem),
      pouvoirName: pouvoirItem?.name ?? null,
      hasRc: rcAnalysis !== null,
      matchedItems: matchedItemsPreview,
      extraItems: extraItemsPreview,
      excludedExpiredCount: expiry.expired.length,
    };

    // 5. Si archi sélectionné, charge son cabinet (pour le bouton "Envoyer à
    //    l'archi") + le dernier dispatch (pour afficher « Envoyé le X »).
    let selectedArchitect: { id: string; cabinet: string; email: string | null } | null = null;
    let lastDispatch: { dispatchId: string; sentAtIso: string; recipientEmail: string } | null =
      null;
    if (archiParam) {
      const [archi] = await db
        .select({
          id: architects.id,
          cabinet: architects.cabinet,
          email: architects.email,
        })
        .from(architects)
        .where(and(eq(architects.id, archiParam), eq(architects.organizationId, orgId)))
        .limit(1);
      if (archi) {
        selectedArchitect = archi;
        const [disp] = await db
          .select({
            id: dossierDispatches.id,
            sentAt: dossierDispatches.sentAt,
            recipientEmail: dossierDispatches.recipientEmail,
          })
          .from(dossierDispatches)
          .where(
            and(
              eq(dossierDispatches.tenderId, tenderId),
              eq(dossierDispatches.architectId, archiParam),
              eq(dossierDispatches.organizationId, orgId),
              // H6 — Steve 2026-06-04 : on ignore les dispatches annulés.
              isNull(dossierDispatches.cancelledAt),
            ),
          )
          .orderBy(desc(dossierDispatches.sentAt))
          .limit(1);
        if (disp) {
          lastDispatch = {
            dispatchId: disp.id,
            sentAtIso: disp.sentAt.toISOString(),
            recipientEmail: disp.recipientEmail,
          };
        }
      }
    }

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
            href={`/sourcing/ao/${tenderId}/dossier${archiQuery}`}
            className="hover:text-ink hover:underline focus:outline-none"
          >
            Dossier
          </a>
          <span aria-hidden>/</span>
          <a
            href={`/sourcing/ao/${tenderId}/dossier/cerfa${archiQuery}`}
            className="hover:text-ink hover:underline focus:outline-none"
          >
            DC1 &amp; DC2
          </a>
          <span aria-hidden>/</span>
          <span className="text-ink">Pièces</span>
        </nav>

        {/* En-tête */}
        <header className="mb-6">
          <span className="pill-eyebrow">Dossier de candidature</span>
          <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-ink md:text-3xl">
            Pièces complémentaires
          </h1>
          <p className="mt-2 text-sm text-ink-2">
            Statut des pièces extraites du RC par rapport à votre bibliothèque de documents AlyoS.
          </p>
        </header>

        {/* Avertissement si analyse RC absente */}
        {!rcAnalysis && (
          <div
            role="alert"
            className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          >
            Aucune analyse RC disponible — retournez à la{" "}
            <a
              href={`/sourcing/ao/${tenderId}/dossier${archiQuery}`}
              className="font-medium underline hover:opacity-80"
            >
              page Dossier
            </a>{" "}
            et lancez l&apos;analyse du RC avec Sonnet 4.6.
          </div>
        )}

        <PiecesClient
          tenderId={tenderId}
          existingDc1={existingDc1}
          existingDc2={existingDc2}
          pieceMatches={pieceMatches}
          archiParam={archiParam}
          beParam={beParam}
          selectedArchitect={selectedArchitect}
          lastDispatch={lastDispatch}
          expirySummary={expirySummary}
          zipComposition={zipComposition}
        />
      </main>
    );
  } catch (err) {
    console.error("[pieces-page:unhandled]", err);
    return (
      <main className="mx-auto max-w-5xl px-6 py-8">
        <ErrorBanner message="Erreur de chargement — réessayez ou contactez l'administrateur." />
      </main>
    );
  }
}
