/**
 * Data loader — page Pipeline cotraitance `/sourcing/cotraitance`.
 *
 * Charge tous les tenders en cours de processus Tandem (5 statuts) avec leurs
 * match_proposals et architect_responses associés.
 *
 * Résilience runtime (memory `feedback_nextjs_runtime_page_resilience`) :
 *   - try/catch absorbé : si DATABASE_URL absent (CI sans BDD) ou Supabase blip,
 *     on retourne `{ ok: false, error: "internal_error" }`.
 *
 * RLS / tenant : filtre `organization_id = organizationId` explicite (defense
 * in depth applicative — le rôle postgres bypasse le RLS déclaratif).
 *
 * Source de vérité :
 *   - `specs/module_tandem_engine_v1.md` §3 (pipeline Tandem)
 *   - `handoff/BRIEF_TANDEM_260521.md` §vue cross-AO
 *   - `handoff/PLAN_TANDEM_NADIA_260522.md` §Pipeline cotraitance
 */

import { and, desc, eq, inArray } from "drizzle-orm";

import { db as defaultDb } from "@/db/client";
import { architects } from "@/db/schema/architects";
import { architectResponses, matchProposals } from "@/db/schema/selections";
import { tenders } from "@/db/schema/tenders";

type DrizzleClient = typeof defaultDb;

// ---------------------------------------------------------------------------
// Types publics
// ---------------------------------------------------------------------------

export interface PipelineEntry {
  tender: {
    id: string;
    title: string;
    buyer: string;
    deadline: Date | null;
    status: string;
    updatedAt: Date;
  };
  solicitations: Array<{
    rank: number;
    score: number;
    architect: {
      id: string;
      cabinet: string;
      contactName: string | null;
      email: string;
    };
    responseStatus: "pending" | "accepted" | "declined" | "info_requested" | null;
    respondedAt: Date | null;
    /** Date de création du match_proposal — approximation de la date de sollicitation. */
    solicitedAt: Date;
  }>;
}

export type LoadPipelineResult =
  | { ok: true; data: PipelineEntry[] }
  | { ok: false; error: "internal_error" };

// ---------------------------------------------------------------------------
// Statuts Tandem inclus dans la pipeline
// ---------------------------------------------------------------------------

/** Valeurs de `tenders.status` qui qualifient un AO comme « en pipeline Tandem ». */
const TANDEM_PIPELINE_STATUSES = [
  "selected_tandem",
  "awaiting_architect",
  "architect_accepted",
  "architect_declined",
  "architect_info_requested",
] as const;

type TandemPipelineStatus = (typeof TANDEM_PIPELINE_STATUSES)[number];

// ---------------------------------------------------------------------------
// Loader principal
// ---------------------------------------------------------------------------

/**
 * Charge les données de la page pipeline cotraitance.
 *
 * @param organizationId - UUID du tenant courant (ALYOS_ORG_ID en MVP)
 * @param deps           - injection pour tests (db mockable)
 */
export async function loadCotraitancePipelineData(
  organizationId: string,
  deps: { db?: DrizzleClient } = {},
): Promise<LoadPipelineResult> {
  const db = deps.db ?? defaultDb;

  try {
    // -----------------------------------------------------------------------
    // 1. Fetch de tous les tenders en mode Tandem
    //    ORDER BY updatedAt DESC : les AOs récemment actifs d'abord.
    // -----------------------------------------------------------------------
    const tenderRows = await db
      .select({
        id: tenders.id,
        title: tenders.title,
        buyer: tenders.buyer,
        deadline: tenders.deadline,
        status: tenders.status,
        updatedAt: tenders.updatedAt,
      })
      .from(tenders)
      .where(
        and(
          eq(tenders.organizationId, organizationId),
          inArray(tenders.status, TANDEM_PIPELINE_STATUSES as unknown as TandemPipelineStatus[]),
        ),
      )
      .orderBy(desc(tenders.updatedAt));

    if (tenderRows.length === 0) {
      return { ok: true, data: [] };
    }

    const tenderIds = tenderRows.map((t) => t.id);

    // -----------------------------------------------------------------------
    // 2. Fetch des match_proposals avec JOIN architects pour les tenders trouvés
    //    LEFT JOIN architectResponses pour l'état de réponse.
    //    On fait 2 queries séparées pour éviter un produit cartésien complexe.
    // -----------------------------------------------------------------------

    // 2a. match_proposals + architects
    const proposalRows = await db
      .select({
        tenderId: matchProposals.tenderId,
        rank: matchProposals.rank,
        score: matchProposals.score,
        solicitedAt: matchProposals.createdAt,
        architect: {
          id: architects.id,
          cabinet: architects.cabinet,
          contactName: architects.contactName,
          email: architects.email,
        },
      })
      .from(matchProposals)
      .innerJoin(architects, eq(architects.id, matchProposals.architectId))
      .where(
        and(
          eq(matchProposals.organizationId, organizationId),
          inArray(matchProposals.tenderId, tenderIds),
        ),
      )
      .orderBy(matchProposals.tenderId, matchProposals.rank);

    // 2b. architect_responses — map (tenderId, architectId) → réponse
    const responseRows = await db
      .select({
        tenderId: architectResponses.tenderId,
        architectId: architectResponses.architectId,
        status: architectResponses.status,
        respondedAt: architectResponses.respondedAt,
      })
      .from(architectResponses)
      .where(
        and(
          eq(architectResponses.organizationId, organizationId),
          inArray(architectResponses.tenderId, tenderIds),
        ),
      );

    // Clé composite tenderId::architectId → réponse
    const responseMap = new Map<
      string,
      { status: "pending" | "accepted" | "declined" | "info_requested"; respondedAt: Date | null }
    >(
      responseRows.map((r) => [
        `${r.tenderId}::${r.architectId}`,
        { status: r.status, respondedAt: r.respondedAt },
      ]),
    );

    // -----------------------------------------------------------------------
    // 3. Assemblage : Map<tenderId, PipelineEntry>
    // -----------------------------------------------------------------------
    const pipelineMap = new Map<string, PipelineEntry>();

    // Initialiser chaque tender (ordre conservé depuis la query DESC updatedAt)
    for (const t of tenderRows) {
      pipelineMap.set(t.id, {
        tender: {
          id: t.id,
          title: t.title,
          buyer: t.buyer,
          deadline: t.deadline,
          status: t.status,
          updatedAt: t.updatedAt,
        },
        solicitations: [],
      });
    }

    // Rattacher chaque proposal à son tender
    for (const p of proposalRows) {
      const entry = pipelineMap.get(p.tenderId);
      if (!entry) continue;

      // L'email est nullable dans le schema, mais on ne soumet au matching
      // que les architectes solicitable (email NOT NULL). Guard défensif.
      const email = p.architect.email ?? "";

      const responseKey = `${p.tenderId}::${p.architect.id}`;
      const response = responseMap.get(responseKey) ?? null;

      entry.solicitations.push({
        rank: p.rank,
        score: parseFloat(p.score as unknown as string),
        architect: {
          id: p.architect.id,
          cabinet: p.architect.cabinet,
          contactName: p.architect.contactName,
          email,
        },
        responseStatus: response?.status ?? null,
        respondedAt: response?.respondedAt ?? null,
        solicitedAt: p.solicitedAt,
      });
    }

    return { ok: true, data: Array.from(pipelineMap.values()) };
  } catch (err) {
    console.error("[cotraitance-pipeline:load_failed]", err);
    return { ok: false, error: "internal_error" };
  }
}
