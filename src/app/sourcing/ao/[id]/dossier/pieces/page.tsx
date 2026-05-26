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
import { and, desc, eq } from "drizzle-orm";

import { ErrorBanner } from "@/app/sourcing/ao-du-jour/ErrorBanner";
import { db } from "@/db/client";
import { tenderEvents, tenders } from "@/db/schema/tenders";
import { presentationLibrary } from "@/db/schema/library";
import { toUserProfile } from "@/lib/auth/types";
import { isAuthorizedEmail } from "@/lib/auth/domain";
import { ALYOS_ORG_ID } from "@/lib/constants/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { matchPiecesWithLibrary } from "@/lib/dossier/pieces-match";
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
  params: { id: string };
}

const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export default async function PiecesPage({ params }: PageProps) {
  // 1. Auth check défensif
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/sourcing/ao/${params.id}/dossier/pieces`);
  const profile = toUserProfile(user);
  if (!isAuthorizedEmail(profile.email)) redirect("/forbidden");

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
    // 3a. Tender
    const [tender] = await db
      .select({ id: tenders.id, title: tenders.title, buyer: tenders.buyer })
      .from(tenders)
      .where(and(eq(tenders.id, tenderId), eq(tenders.organizationId, ALYOS_ORG_ID)))
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
          eq(tenderEvents.organizationId, ALYOS_ORG_ID),
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
      .where(eq(presentationLibrary.organizationId, ALYOS_ORG_ID));

    // 3d. DC1 / DC2 existants
    const { dc1: existingDc1, dc2: existingDc2 } = await loadExistingCerfa(tenderId);

    // 4. Matching pièces RC vs bibliothèque
    const pieceMatches = rcAnalysis
      ? matchPiecesWithLibrary(rcAnalysis.pieces_demandees, libraryItems)
      : [];

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
            href={`/sourcing/ao/${tenderId}/dossier`}
            className="hover:text-ink hover:underline focus:outline-none"
          >
            Dossier
          </a>
          <span aria-hidden>/</span>
          <a
            href={`/sourcing/ao/${tenderId}/dossier/cerfa`}
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
              href={`/sourcing/ao/${tenderId}/dossier`}
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
