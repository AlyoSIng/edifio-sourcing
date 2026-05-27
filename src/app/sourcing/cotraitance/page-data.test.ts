/**
 * Tests Vitest — `loadCotraitancePipelineData` (page pipeline cotraitance).
 *
 * Couvre :
 *  - Aucun AO Tandem en base → résultat vide OK
 *  - AO avec sollicitation pending < 3 jours → isOverdue = false
 *  - AO avec sollicitation pending ≥ 3 jours, relance non envoyée → isOverdue = true, followupSentAt = null
 *  - AO avec sollicitation pending ≥ 3 jours, relance envoyée → isOverdue = true, followupSentAt défini
 *  - AO avec sollicitation acceptée ≥ 3 jours → isOverdue = false (non pending)
 *  - Erreur BDD → { ok: false, error: "internal_error" }
 *
 * Stratégie : mock minimaliste du client Drizzle — on injecte `deps.db`.
 * Aucun container Postgres requis.
 */

import { describe, expect, it } from "vitest";

import type { db as DrizzleClientType } from "@/db/client";
import { loadCotraitancePipelineData } from "./page-data";

// ============================================================================
// Helpers / fixtures
// ============================================================================

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const TENDER_ID = "11111111-1111-1111-1111-111111111111";
const ARCHI_ID = "22222222-2222-2222-2222-222222222222";

/** Retourne une date à `daysAgo` jours en arrière par rapport à maintenant. */
function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

interface MockDbOpts {
  tenders?: Array<{
    id: string;
    title: string;
    buyer: string;
    deadline: Date | null;
    status: string;
    updatedAt: Date;
  }>;
  proposals?: Array<{
    tenderId: string;
    rank: number;
    score: string;
    solicitedAt: Date;
    architect: { id: string; cabinet: string; contactName: string | null; email: string | null };
  }>;
  responses?: Array<{
    tenderId: string;
    architectId: string;
    status: "pending" | "accepted" | "declined" | "info_requested";
    respondedAt: Date | null;
    followupSentAt: Date | null;
  }>;
  /** Si true, la première requête lève une exception. */
  throwError?: boolean;
}

/**
 * Mock minimaliste du client Drizzle pour `loadCotraitancePipelineData`.
 *
 * Stratégie : chaque appel à `.select()` consomme le prochain resolver dans
 * la liste ordonnée :
 *   1. query tenders
 *   2. query proposals (innerJoin architects)
 *   3. query architect_responses
 *
 * La chaîne `.from().innerJoin().where().orderBy()` est interceptée via un
 * objet proxy-like qui appelle le resolver quel que soit l'enchaînement.
 */
function makeMockDb(opts: MockDbOpts) {
  let callIndex = 0;

  // Resolvers dans l'ordre des appels SELECT effectués par le loader.
  const resolvers = [
    // appel 1 : tenders
    async () => {
      if (opts.throwError) throw new Error("db_error_mock");
      return opts.tenders ?? [];
    },
    // appel 2 : proposals (avec innerJoin architects)
    async () => opts.proposals ?? [],
    // appel 3 : architect_responses
    async () => opts.responses ?? [],
  ];

  /** Construit une chaîne de méthodes fluides qui toutes délèguent au resolver courant. */
  function makeChain() {
    const resolveIdx = callIndex++;
    const resolver = resolvers[resolveIdx] ?? (async () => []);
    const terminal = {
      orderBy: () => resolver(),
      limit: () => resolver(),
      then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
        resolver().then(resolve, reject),
    };
    const chain: Record<string, () => typeof chain | typeof terminal> = {};
    ["from", "innerJoin", "where"].forEach((method) => {
      chain[method] = () => ({ ...chain, ...terminal });
    });
    return { ...chain, ...terminal };
  }

  return {
    select: () => makeChain(),
  } as unknown as typeof DrizzleClientType;
}

// ============================================================================
// Tests
// ============================================================================

describe("loadCotraitancePipelineData — badge J+3", () => {
  it("aucun AO → ok=true, data vide", async () => {
    const db = makeMockDb({ tenders: [] });
    const result = await loadCotraitancePipelineData(ORG_ID, { db });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(0);
  });

  it("sollicitation pending < 3 jours → isOverdue = false", async () => {
    const db = makeMockDb({
      tenders: [
        {
          id: TENDER_ID,
          title: "AO test",
          buyer: "Acheteur",
          deadline: null,
          status: "awaiting_architect",
          updatedAt: new Date(),
        },
      ],
      proposals: [
        {
          tenderId: TENDER_ID,
          rank: 1,
          score: "85.00",
          solicitedAt: daysAgo(1), // hier
          architect: { id: ARCHI_ID, cabinet: "Cabinet A", contactName: null, email: "a@test.fr" },
        },
      ],
      responses: [
        {
          tenderId: TENDER_ID,
          architectId: ARCHI_ID,
          status: "pending",
          respondedAt: null,
          followupSentAt: null,
        },
      ],
    });
    const result = await loadCotraitancePipelineData(ORG_ID, { db });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sol = result.data[0]?.solicitations[0];
    expect(sol).toBeDefined();
    expect(sol!.isOverdue).toBe(false);
    expect(sol!.followupSentAt).toBeNull();
  });

  it("sollicitation pending ≥ 3 jours, relance non envoyée → isOverdue=true, followupSentAt=null", async () => {
    const db = makeMockDb({
      tenders: [
        {
          id: TENDER_ID,
          title: "AO test",
          buyer: "Acheteur",
          deadline: null,
          status: "awaiting_architect",
          updatedAt: new Date(),
        },
      ],
      proposals: [
        {
          tenderId: TENDER_ID,
          rank: 1,
          score: "85.00",
          solicitedAt: daysAgo(4), // J-4
          architect: { id: ARCHI_ID, cabinet: "Cabinet A", contactName: null, email: "a@test.fr" },
        },
      ],
      responses: [
        {
          tenderId: TENDER_ID,
          architectId: ARCHI_ID,
          status: "pending",
          respondedAt: null,
          followupSentAt: null,
        },
      ],
    });
    const result = await loadCotraitancePipelineData(ORG_ID, { db });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sol = result.data[0]?.solicitations[0];
    expect(sol).toBeDefined();
    expect(sol!.isOverdue).toBe(true);
    expect(sol!.followupSentAt).toBeNull();
  });

  it("sollicitation pending ≥ 3 jours, relance déjà envoyée → isOverdue=true, followupSentAt défini", async () => {
    const relanceDate = daysAgo(1);
    const db = makeMockDb({
      tenders: [
        {
          id: TENDER_ID,
          title: "AO test",
          buyer: "Acheteur",
          deadline: null,
          status: "awaiting_architect",
          updatedAt: new Date(),
        },
      ],
      proposals: [
        {
          tenderId: TENDER_ID,
          rank: 1,
          score: "85.00",
          solicitedAt: daysAgo(5), // J-5
          architect: { id: ARCHI_ID, cabinet: "Cabinet A", contactName: null, email: "a@test.fr" },
        },
      ],
      responses: [
        {
          tenderId: TENDER_ID,
          architectId: ARCHI_ID,
          status: "pending",
          respondedAt: null,
          followupSentAt: relanceDate,
        },
      ],
    });
    const result = await loadCotraitancePipelineData(ORG_ID, { db });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sol = result.data[0]?.solicitations[0];
    expect(sol).toBeDefined();
    expect(sol!.isOverdue).toBe(true);
    expect(sol!.followupSentAt).toEqual(relanceDate);
  });

  it("sollicitation acceptée ≥ 3 jours → isOverdue=false (non pending)", async () => {
    const db = makeMockDb({
      tenders: [
        {
          id: TENDER_ID,
          title: "AO test",
          buyer: "Acheteur",
          deadline: null,
          status: "architect_accepted",
          updatedAt: new Date(),
        },
      ],
      proposals: [
        {
          tenderId: TENDER_ID,
          rank: 1,
          score: "90.00",
          solicitedAt: daysAgo(6),
          architect: { id: ARCHI_ID, cabinet: "Cabinet A", contactName: null, email: "a@test.fr" },
        },
      ],
      responses: [
        {
          tenderId: TENDER_ID,
          architectId: ARCHI_ID,
          status: "accepted",
          respondedAt: daysAgo(2),
          followupSentAt: null,
        },
      ],
    });
    const result = await loadCotraitancePipelineData(ORG_ID, { db });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sol = result.data[0]?.solicitations[0];
    expect(sol).toBeDefined();
    expect(sol!.isOverdue).toBe(false);
  });

  it("erreur BDD → ok=false, error=internal_error", async () => {
    const db = makeMockDb({ throwError: true });
    const result = await loadCotraitancePipelineData(ORG_ID, { db });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("internal_error");
  });
});
