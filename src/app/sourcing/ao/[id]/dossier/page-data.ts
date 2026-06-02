/**
 * Data loader — page dossier IA `/sourcing/ao/[id]/dossier`.
 *
 * Server-side helper consommé par `page.tsx` (Server Component).
 * Charge :
 *   - le tender cible (filtre tenant explicite via `orgId`)
 *   - le document RC le plus récent depuis `tender_documents` (kind = 'RC')
 *   - la dernière analyse RC depuis `tender_events` (eventType = 'rc_analyzed')
 *
 * Résilience runtime (memory `feedback_nextjs_runtime_page_resilience`) :
 *   try/catch absorbé → `{ ok: false, error }` pour éviter le 500 brutal.
 *
 * RLS / tenant : filtre `organizationId = orgId` explicite sur chaque
 * requête (defense in depth applicative, le rôle postgres bypass RLS).
 */

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { architects } from "@/db/schema/architects";
import { platforms } from "@/db/schema/config";
import { architectResponses } from "@/db/schema/selections";
import { tenderDocuments, tenderEvents, tenders } from "@/db/schema/tenders";
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
    /** Code de la plateforme source (ex. 'boamp', 'place', 'prive'…) */
    platformCode: string;
    /** Référence externe de l'AO sur la plateforme source (ex. idweb BOAMP) */
    externalRef: string | null;
    /** URL de l'annonce sur la plateforme source (lien externe vers la fiche AO). */
    sourceUrl: string | null;
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
  /**
   * Liste des architectes ayant accepté la sollicitation Tandem pour cet AO.
   * Vide ([]) pour Solo / Cotraitance BE / Tandem sans réponse positive.
   * Le snapshot inclut les champs DC1 requis pour le pré-remplissage CERFA
   * mandataire (Phase 3 — non utilisé Phase 2 mais déjà chargé).
   */
  acceptedArchitects: AcceptedArchitect[];
}

/**
 * Snapshot d'un architecte ayant accepté la sollicitation Tandem pour un AO
 * donné. Le `signedAt` correspond à `architect_responses.responded_at`
 * (timestamp ISO du clic « J'accepte »).
 */
export interface AcceptedArchitect {
  id: string;
  cabinet: string;
  contactName: string | null;
  email: string;
  /** Téléphone du cabinet (DC1 §B — Phase 3 mandataire archi). */
  phone: string | null;
  /** SIREN 9 chars (DC1 §A — Phase 3 mandataire archi). */
  siren: string | null;
  legalRepresentativeName: string | null;
  legalRepresentativeRole: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  zip: string | null;
  city: string | null;
  signatureCity: string | null;
  signedAt: Date | null;
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
 * @param orgId    UUID de l'organisation courante (résolu via getRequiredOrgId)
 */
export async function loadDossierPageData(
  tenderId: string,
  orgId: string,
): Promise<LoadDossierResult> {
  try {
    // 1. Charger le tender + la plateforme (JOIN pour récupérer platformCode)
    const [tender] = await db
      .select({
        id: tenders.id,
        title: tenders.title,
        buyer: tenders.buyer,
        dceUrl: tenders.dceUrl,
        status: tenders.status,
        deadline: tenders.deadline,
        platformCode: platforms.code,
        externalRef: tenders.externalRef,
        sourceUrl: tenders.sourceUrl,
      })
      .from(tenders)
      .innerJoin(platforms, eq(tenders.platformId, platforms.id))
      .where(and(eq(tenders.id, tenderId), eq(tenders.organizationId, orgId)))
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
          eq(tenderDocuments.organizationId, orgId),
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
          eq(tenderEvents.organizationId, orgId),
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

    // 4. Charger les architectes ayant accepté la sollicitation Tandem.
    //    Filtre tenant explicite sur architect_responses ET architects
    //    (defense in depth — le rôle postgres bypass RLS).
    const acceptedArchitectsRows = await db
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
          eq(architects.organizationId, orgId),
        ),
      )
      .orderBy(desc(architectResponses.respondedAt));

    // Filtrage applicatif : un architecte accepté DOIT avoir un email
    // (sinon la sollicitation initiale n'aurait pas pu partir). On force le
    // type non-nullable de `email` côté snapshot pour simplifier la conso UI.
    const acceptedArchitects: AcceptedArchitect[] = acceptedArchitectsRows
      .filter((row): row is typeof row & { email: string } => row.email != null)
      .map((row) => ({
        id: row.id,
        cabinet: row.cabinet,
        contactName: row.contactName,
        email: row.email,
        phone: row.phone,
        siren: row.siren,
        legalRepresentativeName: row.legalRepresentativeName,
        legalRepresentativeRole: row.legalRepresentativeRole,
        addressLine1: row.addressLine1,
        addressLine2: row.addressLine2,
        zip: row.zip,
        city: row.city,
        signatureCity: row.signatureCity,
        signedAt: row.signedAt,
      }));

    return {
      ok: true,
      data: {
        tender,
        rcDocument: rcDoc ?? null,
        rcAnalysis,
        acceptedArchitects,
      },
    };
  } catch (err) {
    console.error("[dossier:load_failed]", err);
    return { ok: false, error: "internal_error" };
  }
}
