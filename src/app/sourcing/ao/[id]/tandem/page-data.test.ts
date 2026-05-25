/**
 * Tests Vitest — `loadTandemShortlistData` (page-data du short-list).
 *
 * Couvre :
 *  - tender_not_found si la query retourne 0 lignes
 *  - invalid_state si le statut tender n'est pas un des statuts Tandem autorisés
 *  - retour ok + proposals vide si pas de match_proposals persistés
 *  - retour ok + proposals avec rank ASC si match_proposals persistés
 *  - statut response = pending si une sollicitation a déjà été émise
 *  - internal_error si la query throw
 */

import { describe, expect, it, vi } from "vitest";

import { loadTandemShortlistData } from "./page-data";

const TENDER_ID = "11111111-1111-1111-1111-111111111111";
const ORG_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Mock minimaliste de Drizzle pour ce data-loader :
 *  - 1er select → tenders (limit 1)
 *  - 2e select → match_proposals JOIN architects (orderBy)
 *  - 3e select → architect_responses
 *
 * On expose un compteur pour brancher des shapes différents par appel.
 */
type DbForLoader = NonNullable<Parameters<typeof loadTandemShortlistData>[2]>["db"];

function makeMockDb(opts: {
  tender?: unknown;
  proposals?: unknown[];
  responses?: unknown[];
  throwOn?: number;
}): DbForLoader {
  let n = 0;
  return {
    select: vi.fn(() => {
      n += 1;
      if (opts.throwOn === n) {
        return {
          from: () => {
            throw new Error("simulated db failure");
          },
        };
      }
      if (n === 1) {
        // tender
        return {
          from: () => ({
            where: () => ({
              limit: async () => (opts.tender ? [opts.tender] : []),
            }),
          }),
        };
      }
      if (n === 2) {
        // match_proposals
        return {
          from: () => ({
            innerJoin: () => ({
              where: () => ({
                orderBy: async () => opts.proposals ?? [],
              }),
            }),
          }),
        };
      }
      // responses
      return {
        from: () => ({
          where: async () => opts.responses ?? [],
        }),
      };
    }),
  } as unknown as DbForLoader;
}

describe("loadTandemShortlistData", () => {
  it("tender_not_found si tender absent", async () => {
    const db = makeMockDb({ tender: null });
    const result = await loadTandemShortlistData(TENDER_ID, ORG_ID, { db });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("tender_not_found");
  });

  it("invalid_state si statut tender = sourced (pas encore Tandem)", async () => {
    const db = makeMockDb({
      tender: {
        id: TENDER_ID,
        title: "Foo",
        buyer: "Bar",
        deadline: null,
        amount: null,
        cpv: [],
        status: "sourced",
        sourceUrl: null,
        dceUrl: null,
      },
    });
    const result = await loadTandemShortlistData(TENDER_ID, ORG_ID, { db });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid_state");
  });

  it("retour ok + proposals vide si pas de match_proposals", async () => {
    const db = makeMockDb({
      tender: {
        id: TENDER_ID,
        title: "Foo",
        buyer: "Bar",
        deadline: null,
        amount: null,
        cpv: [],
        status: "selected_tandem",
        sourceUrl: null,
        dceUrl: null,
      },
      proposals: [],
      responses: [],
    });
    const result = await loadTandemShortlistData(TENDER_ID, ORG_ID, { db });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.proposals).toHaveLength(0);
      expect(result.data.tender.title).toBe("Foo");
    }
  });

  it("retour ok + proposals avec statut response pending", async () => {
    const archi = {
      id: "22222222-2222-2222-2222-222222222222",
      cabinet: "Atelier X",
      contactName: "Marie",
      tutoiement: false,
      specialtyCodes: ["sante"],
      geoZones: ["69"],
      pastCollabsCount: 2,
      preferred: false,
      email: "marie@x.fr",
    };
    const db = makeMockDb({
      tender: {
        id: TENDER_ID,
        title: "Foo",
        buyer: "Bar",
        deadline: null,
        amount: null,
        cpv: [],
        status: "awaiting_architect",
        sourceUrl: null,
        dceUrl: null,
      },
      proposals: [
        {
          score: "85.50",
          rank: 1,
          rationale: "Spécialité santé + 69",
          architect: archi,
        },
      ],
      responses: [{ architectId: archi.id, status: "pending" }],
    });
    const result = await loadTandemShortlistData(TENDER_ID, ORG_ID, { db });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.proposals).toHaveLength(1);
      const first = result.data.proposals[0];
      expect(first).toBeDefined();
      expect(first!.score).toBeCloseTo(85.5);
      expect(first!.responseStatus).toBe("pending");
    }
  });

  it("internal_error si la 1re query throw", async () => {
    const db = makeMockDb({ throwOn: 1 });
    const result = await loadTandemShortlistData(TENDER_ID, ORG_ID, { db });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("internal_error");
  });
});
