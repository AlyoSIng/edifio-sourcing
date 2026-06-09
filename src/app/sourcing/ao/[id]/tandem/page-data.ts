/**
 * Data loader — page short-list Tandem `/sourcing/ao/[id]/tandem`.
 *
 * Server-side helper consommé par `page.tsx` (Server Component). Charge :
 *   - le tender cible (filtre tenant explicite via l'`organizationId` du caller)
 *   - le statut tender (utilisé pour bloquer l'accès si statut invalide :
 *     un tender `rejected` ou en pipeline `won` ne doit pas être re-Tandem)
 *   - les `match_proposals` déjà persistés (s'ils existent — l'utilisateur
 *     peut revenir sur la page après envoi d'une 1re sollicitation, on
 *     affiche les rangs persistés au lieu de re-runner le matcher)
 *   - les `architect_responses` connues du couple (tender, archi) — pour
 *     marquer les archis déjà sollicités comme « envoyé » dans l'UI.
 *
 * Si aucun `match_proposals` n'est persisté : on délègue au caller
 * (Server Action `matchArchitectsForTender` réutilisée par le composant
 * Client via `useEffect` initial), pour éviter de doubler la logique
 * matcher ici. Cette page peut donc revenir à 0 match si la BDD est vide,
 * et le composant Client déclenche le match au mount.
 *
 * Résilience runtime (memory `feedback_nextjs_runtime_page_resilience`) :
 *   - try/catch absorbé autour des `db.select`. En CI E2E sans
 *     `DATABASE_URL` ou si Supabase blip, on rend `<ErrorBanner>`.
 *
 * RLS / tenant : la query `db` consomme la session Drizzle directe (postgres
 * rôle, bypass RLS). On porte le filtre `organizationId = <orgId du caller>`
 * explicitement (defense in depth applicative).
 */

import { and, desc, eq } from "drizzle-orm";

import { db as defaultDb } from "@/db/client";
import { architects, type Architect } from "@/db/schema/architects";
import { responseFiles, type ResponseFile } from "@/db/schema/library";
import { architectResponses, matchProposals, type ArchitectResponse } from "@/db/schema/selections";
import { tenderDocuments, tenders, type Tender, type TenderDocument } from "@/db/schema/tenders";

type DrizzleClient = typeof defaultDb;

export interface TandemShortlistData {
  tender: Pick<
    Tender,
    | "id"
    | "title"
    | "buyer"
    | "deadline"
    | "amount"
    | "cpv"
    | "status"
    | "sourceUrl"
    | "dceUrl"
    | "department"
  >;
  /**
   * Snapshot des architectes proposés. Triés par rank ASC (1, 2, 3…).
   * Liste vide si le matcher n'a pas encore été exécuté (page côté Client
   * déclenchera `matchArchitectsForTender` au mount).
   */
  proposals: Array<{
    architect: Pick<
      Architect,
      | "id"
      | "cabinet"
      | "contactName"
      | "tutoiement"
      | "specialtyCodes"
      | "geoZones"
      | "pastCollabsCount"
      | "preferred"
      | "email"
    >;
    score: number;
    rank: number;
    rationale: string | null;
    /** Statut de la réponse archi, si une sollicitation a déjà été envoyée. */
    responseStatus: ArchitectResponse["status"] | null;
  }>;
  /**
   * Documents DCE de l'AO (`tender_documents`). Chargés uniquement quand le
   * tender a au moins atteint le status `architect_accepted` — sert à la
   * section « Dossier prêt » affichée après acceptation architecte.
   * Tableau vide si aucun doc / status antérieur à acceptation.
   */
  tenderDocs: Array<
    Pick<TenderDocument, "id" | "name" | "kind" | "sizeBytes" | "storagePath" | "uploadedAt">
  >;
  /**
   * Pièces de réponse pré-remplies (`response_files` — DC1, DC2, CERFA, etc.).
   * Même politique de chargement conditionnel que `tenderDocs`.
   */
  responseFiles: Array<
    Pick<
      ResponseFile,
      "id" | "name" | "kind" | "sizeBytes" | "storagePath" | "validated" | "createdAt"
    >
  >;
}

export type LoadTandemShortlistError = "tender_not_found" | "invalid_state" | "internal_error";

export type LoadTandemShortlistResult =
  | { ok: true; data: TandemShortlistData }
  | { ok: false; error: LoadTandemShortlistError };

/**
 * Charge la donnée nécessaire à la page short-list Tandem.
 *
 * @param tenderId — UUID du tender (depuis le param de route)
 * @param organizationId — UUID de l'org courante (résolu par le caller via
 *                        `getRequiredOrgId(user.id)`)
 * @param deps — injection pour tests
 */
export async function loadTandemShortlistData(
  tenderId: string,
  organizationId: string,
  deps: { db?: DrizzleClient } = {},
): Promise<LoadTandemShortlistResult> {
  const db = deps.db ?? defaultDb;

  try {
    // 1. Fetch tender (filtre tenant)
    const tenderRows = await db
      .select({
        id: tenders.id,
        title: tenders.title,
        buyer: tenders.buyer,
        deadline: tenders.deadline,
        amount: tenders.amount,
        cpv: tenders.cpv,
        status: tenders.status,
        sourceUrl: tenders.sourceUrl,
        dceUrl: tenders.dceUrl,
        department: tenders.department,
      })
      .from(tenders)
      .where(and(eq(tenders.id, tenderId), eq(tenders.organizationId, organizationId)))
      .limit(1);
    const tender = tenderRows[0];
    if (!tender) return { ok: false, error: "tender_not_found" };

    // 2. Validation statut : seuls `selected_tandem`, `awaiting_architect`,
    //    `architect_declined`, `architect_info_requested` autorisent l'accès
    //    à cette page (l'archi a déjà été ou doit être sollicité).
    const allowedStatuses = new Set([
      "selected_tandem",
      "awaiting_architect",
      "architect_declined",
      "architect_info_requested",
      "architect_accepted",
    ]);
    if (!allowedStatuses.has(tender.status)) {
      return { ok: false, error: "invalid_state" };
    }

    // 3. Match proposals déjà persistés (jointure architects pour snapshot)
    const proposalRows = await db
      .select({
        score: matchProposals.score,
        rank: matchProposals.rank,
        rationale: matchProposals.rationale,
        architect: {
          id: architects.id,
          cabinet: architects.cabinet,
          contactName: architects.contactName,
          tutoiement: architects.tutoiement,
          specialtyCodes: architects.specialtyCodes,
          geoZones: architects.geoZones,
          pastCollabsCount: architects.pastCollabsCount,
          preferred: architects.preferred,
          email: architects.email,
        },
      })
      .from(matchProposals)
      .innerJoin(architects, eq(architects.id, matchProposals.architectId))
      .where(
        and(
          eq(matchProposals.tenderId, tenderId),
          eq(matchProposals.organizationId, organizationId),
        ),
      )
      .orderBy(matchProposals.rank);

    // 4. Réponses archi déjà connues
    const responseRows = await db
      .select({
        architectId: architectResponses.architectId,
        status: architectResponses.status,
      })
      .from(architectResponses)
      .where(
        and(
          eq(architectResponses.tenderId, tenderId),
          eq(architectResponses.organizationId, organizationId),
        ),
      );
    const responseByArchitect = new Map<string, ArchitectResponse["status"]>(
      responseRows.map((r) => [r.architectId, r.status]),
    );

    const proposals: TandemShortlistData["proposals"] = proposalRows.map((p) => ({
      architect: p.architect,
      score: parseFloat(p.score as unknown as string),
      rank: p.rank,
      rationale: p.rationale,
      responseStatus: responseByArchitect.get(p.architect.id) ?? null,
    }));

    // 5. Chargement conditionnel des documents — uniquement à partir de
    //    `architect_accepted` (la section « Dossier prêt » côté UI n'est
    //    rendue qu'à partir de ce statut). On évite des selects inutiles
    //    sur les AO encore en `selected_tandem` / `awaiting_architect`.
    const dossierVisibleStatuses = new Set([
      "architect_accepted",
      "dossier_review_required",
      "dossier_ready",
      "dossier_diffused",
      "submitted",
    ]);
    let tenderDocs: TandemShortlistData["tenderDocs"] = [];
    let responseFilesRows: TandemShortlistData["responseFiles"] = [];
    if (dossierVisibleStatuses.has(tender.status)) {
      tenderDocs = await db
        .select({
          id: tenderDocuments.id,
          name: tenderDocuments.name,
          kind: tenderDocuments.kind,
          sizeBytes: tenderDocuments.sizeBytes,
          storagePath: tenderDocuments.storagePath,
          uploadedAt: tenderDocuments.uploadedAt,
        })
        .from(tenderDocuments)
        .where(
          and(
            eq(tenderDocuments.tenderId, tenderId),
            eq(tenderDocuments.organizationId, organizationId),
          ),
        )
        .orderBy(desc(tenderDocuments.uploadedAt));

      responseFilesRows = await db
        .select({
          id: responseFiles.id,
          name: responseFiles.name,
          kind: responseFiles.kind,
          sizeBytes: responseFiles.sizeBytes,
          storagePath: responseFiles.storagePath,
          validated: responseFiles.validated,
          createdAt: responseFiles.createdAt,
        })
        .from(responseFiles)
        .where(
          and(
            eq(responseFiles.tenderId, tenderId),
            eq(responseFiles.organizationId, organizationId),
          ),
        )
        .orderBy(desc(responseFiles.createdAt));
    }

    return {
      ok: true,
      data: { tender, proposals, tenderDocs, responseFiles: responseFilesRows },
    };
  } catch (err) {
    console.error("[tandem-shortlist:load_failed]", err);
    return { ok: false, error: "internal_error" };
  }
}
