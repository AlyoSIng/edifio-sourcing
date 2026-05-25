/**
 * Data loader — page short-list Tandem `/sourcing/ao/[id]/tandem`.
 *
 * Server-side helper consommé par `page.tsx` (Server Component). Charge :
 *   - le tender cible (filtre tenant explicite via `ALYOS_ORG_ID`)
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
 * rôle, bypass RLS). On porte le filtre `organizationId = ALYOS_ORG_ID`
 * explicitement (defense in depth applicative).
 */

import { and, eq } from "drizzle-orm";

import { db as defaultDb } from "@/db/client";
import { architects, type Architect } from "@/db/schema/architects";
import { architectResponses, matchProposals, type ArchitectResponse } from "@/db/schema/selections";
import { tenders, type Tender } from "@/db/schema/tenders";

type DrizzleClient = typeof defaultDb;

export interface TandemShortlistData {
  tender: Pick<
    Tender,
    "id" | "title" | "buyer" | "deadline" | "amount" | "cpv" | "status" | "sourceUrl" | "dceUrl"
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
}

export type LoadTandemShortlistError = "tender_not_found" | "invalid_state" | "internal_error";

export type LoadTandemShortlistResult =
  | { ok: true; data: TandemShortlistData }
  | { ok: false; error: LoadTandemShortlistError };

/**
 * Charge la donnée nécessaire à la page short-list Tandem.
 *
 * @param tenderId — UUID du tender (depuis le param de route)
 * @param organizationId — UUID de l'org courante (ALYOS_ORG_ID en MVP)
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

    return { ok: true, data: { tender, proposals } };
  } catch (err) {
    console.error("[tandem-shortlist:load_failed]", err);
    return { ok: false, error: "internal_error" };
  }
}
