/**
 * Data loader — page dossier IA `/sourcing/ao/[id]/dossier`.
 *
 * Server-side helper consommé par `page.tsx` (Server Component).
 * Charge :
 *   - le tender cible (filtre tenant explicite via `ALYOS_ORG_ID`)
 *   - le document RC le plus récent depuis `tender_documents` (kind = 'RC')
 *   - la dernière analyse RC depuis `tender_events` (eventType = 'rc_analyzed')
 *
 * Résilience runtime (memory `feedback_nextjs_runtime_page_resilience`) :
 *   try/catch absorbé → `{ ok: false, error }` pour éviter le 500 brutal.
 *
 * RLS / tenant : filtre `organizationId = ALYOS_ORG_ID` explicite sur chaque
 * requête (defense in depth applicative, le rôle postgres bypass RLS).
 */

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { tenderDocuments, tenderEvents, tenders } from "@/db/schema/tenders";
import { ALYOS_ORG_ID } from "@/lib/constants/organization";
import type { RcAnalysis } from "@/lib/ai/schemas";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DossierPageData {
  tender: {
    id: string;
    title: string;
    buyer: string;
    dceUrl: string | null;
    status: string;
    deadline: Date | null;
  };
  /** Document RC le plus récent stocké dans `tender_documents` (kind='RC'). Null si absent. */
  rcDocument: {
    id: string;
    name: string;
    storagePath: string;
    sizeBytes: number | null;
    analyzed: boolean;
    uploadedAt: Date;
  } | null;
  /**
   * Résultat de la dernière analyse RC (issu du dernier tender_event
   * où `eventType = 'rc_analyzed'`). Null si pas encore analysé.
   */
  rcAnalysis: RcAnalysis | null;
}

export type LoadDossierResult =
  | { ok: true; data: DossierPageData }
  | { ok: false; error: "tender_not_found" | "internal_error" };

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Charge toutes les données nécessaires à la page dossier IA.
 *
 * @param tenderId UUID du tender (paramètre de route `[id]`)
 */
export async function loadDossierPageData(tenderId: string): Promise<LoadDossierResult> {
  try {
    // 1. Charger le tender (filtre tenant)
    const [tender] = await db
      .select({
        id: tenders.id,
        title: tenders.title,
        buyer: tenders.buyer,
        dceUrl: tenders.dceUrl,
        status: tenders.status,
        deadline: tenders.deadline,
      })
      .from(tenders)
      .where(and(eq(tenders.id, tenderId), eq(tenders.organizationId, ALYOS_ORG_ID)))
      .limit(1);

    if (!tender) {
      return { ok: false, error: "tender_not_found" };
    }

    // 2. Charger le document RC le plus récent (kind='RC')
    const [rcDoc] = await db
      .select({
        id: tenderDocuments.id,
        name: tenderDocuments.name,
        storagePath: tenderDocuments.storagePath,
        sizeBytes: tenderDocuments.sizeBytes,
        analyzed: tenderDocuments.analyzed,
        uploadedAt: tenderDocuments.uploadedAt,
      })
      .from(tenderDocuments)
      .where(
        and(
          eq(tenderDocuments.tenderId, tenderId),
          eq(tenderDocuments.organizationId, ALYOS_ORG_ID),
          eq(tenderDocuments.kind, "RC"),
        ),
      )
      .orderBy(desc(tenderDocuments.uploadedAt))
      .limit(1);

    // 3. Charger le dernier événement rc_analyzed (contient l'analyse dans data)
    const [rcAnalyzedEvent] = await db
      .select({
        data: tenderEvents.data,
      })
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

    // Extraction de l'analyse depuis le champ data de l'événement
    // L'analyse est stockée sous data.extra.rc_analysis (cf. actions.ts)
    let rcAnalysis: RcAnalysis | null = null;
    if (rcAnalyzedEvent?.data) {
      const extra = (rcAnalyzedEvent.data as { extra?: { rc_analysis?: unknown } }).extra;
      if (extra?.rc_analysis) {
        // On ne re-valide pas ici (déjà validé à l'insertion) — cast direct
        rcAnalysis = extra.rc_analysis as RcAnalysis;
      }
    }

    return {
      ok: true,
      data: {
        tender,
        rcDocument: rcDoc ?? null,
        rcAnalysis,
      },
    };
  } catch (err) {
    console.error("[dossier:load_failed]", err);
    return { ok: false, error: "internal_error" };
  }
}
