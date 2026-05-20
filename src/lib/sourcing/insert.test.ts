/**
 * Tests unitaires de `insertTender` — edifio Sourcing.
 *
 * Source de vérité : `notes-de-suivi/DRAFT_PR2_BOAMP_CONNECTOR.md` §Étape 4/7.
 *
 * Couvre côté unit :
 *  - résolution `platforms.id` à partir de `platformCode`
 *  - payload INSERT (mapping NormalizedTender → row Drizzle)
 *  - clauses onConflictDoUpdate (target + set préservant score/status)
 *  - `isNew=true` quand `created_at === updated_at`
 *  - `isNew=false` quand `updated_at > created_at`
 *  - erreur claire si platforms.code introuvable
 *
 * NB : la vérification RLS (refus cross-tenant, idempotence DB-side) est
 * couverte côté pgTAP dans `tests/rls/05_tenders_insert_idempotence.sql`.
 *
 * Mock Drizzle : on simule une chaîne fluide minimale (.select/.from/.where/
 * .limit, .insert/.values/.onConflictDoUpdate/.returning). On capture les
 * arguments pour assertions.
 */

import { describe, expect, it } from "vitest";

import type { DrizzleClient } from "./insert";
import { insertTender } from "./insert";
import type { NormalizedTender } from "./types";

// ----------------------------------------------------------------------------
// Builders mock
// ----------------------------------------------------------------------------

interface InsertCapture {
  values?: Record<string, unknown>;
  onConflictTarget?: unknown;
  onConflictSet?: Record<string, unknown>;
  returningSelection?: Record<string, unknown>;
}

interface SelectCapture {
  fromTable?: unknown;
  whereExpr?: unknown;
  limitN?: number;
}

/**
 * Construit un faux client Drizzle qui :
 *  - retourne `selectRows` pour la chaîne .select().from().where().limit()
 *  - retourne `returningRows` pour la chaîne .insert().values().onConflictDoUpdate().returning()
 *
 * Le typage `DrizzleClient` est strict en prod, mais en test on injecte ce
 * mock via un cast `as unknown as DrizzleClient` — c'est l'idiome accepté
 * pour les fakes d'ORM (aucun `any`, juste un narrowing assumé).
 */
function buildFakeDb(
  selectRows: Array<{ id: string }>,
  returningRows: Array<{ id: string; createdAt: Date; updatedAt: Date }>,
): { db: DrizzleClient; insertCapture: InsertCapture; selectCapture: SelectCapture } {
  const insertCapture: InsertCapture = {};
  const selectCapture: SelectCapture = {};

  const fakeDb = {
    select: (selection: Record<string, unknown>) => {
      selectCapture.fromTable = selection;
      return {
        from: (table: unknown) => {
          selectCapture.fromTable = table;
          return {
            where: (expr: unknown) => {
              selectCapture.whereExpr = expr;
              return {
                limit: (n: number) => {
                  selectCapture.limitN = n;
                  return Promise.resolve(selectRows);
                },
              };
            },
          };
        },
      };
    },
    insert: () => ({
      values: (vals: Record<string, unknown>) => {
        insertCapture.values = vals;
        return {
          onConflictDoUpdate: (cfg: { target: unknown; set: Record<string, unknown> }) => {
            insertCapture.onConflictTarget = cfg.target;
            insertCapture.onConflictSet = cfg.set;
            return {
              returning: (sel: Record<string, unknown>) => {
                insertCapture.returningSelection = sel;
                return Promise.resolve(returningRows);
              },
            };
          },
        };
      },
    }),
  };

  return {
    db: fakeDb as unknown as DrizzleClient,
    insertCapture,
    selectCapture,
  };
}

// ----------------------------------------------------------------------------
// Fixture NormalizedTender
// ----------------------------------------------------------------------------

const baseTender: NormalizedTender = {
  externalRef: "MOCK-123",
  platformCode: "boamp",
  title: "Test mission MOE",
  buyer: "Mairie de test",
  cpvCodes: ["71300000", "45000000"],
  amount: 250000,
  deadline: new Date("2026-07-01T15:00:00.000Z"),
  questionsDeadline: null,
  visitDate: null,
  dceUrl: "https://exemple.test/dce/abc",
  sourceUrl: "https://www.boamp.fr/avis/detail/MOCK-123",
  rawData: {
    platform_code: "boamp",
    record: { idweb: "MOCK-123", objet: "Mission de MOE" },
    fetched_at: "2026-05-19T12:00:00.000Z",
  },
};

const PLATFORM_BOAMP_ID = "cccc0000-0000-0000-0000-000000000001";
const ORG_A_ID = "11111111-1111-1111-1111-111111111111";
const PROFILE_ID = "aaaa1111-0000-0000-0000-000000000001";

// ----------------------------------------------------------------------------
// Cas nominal — création
// ----------------------------------------------------------------------------

describe("insertTender — résolution platforms.id", () => {
  it("résout platforms.code='boamp' via SELECT id FROM platforms LIMIT 1", async () => {
    const now = new Date("2026-05-19T12:00:00.000Z");
    const { db, selectCapture } = buildFakeDb(
      [{ id: PLATFORM_BOAMP_ID }],
      [{ id: "tender-uuid-1", createdAt: now, updatedAt: now }],
    );

    await insertTender(
      baseTender,
      { organizationId: ORG_A_ID, profileId: PROFILE_ID, score: 75 },
      db,
    );

    // La chaîne select() a bien été appelée (selectRows consommés)
    expect(selectCapture.limitN).toBe(1);
    expect(selectCapture.whereExpr).toBeDefined();
  });

  it("jette une erreur exploitable si platforms.code introuvable", async () => {
    const { db } = buildFakeDb([], []);

    await expect(
      insertTender(baseTender, { organizationId: ORG_A_ID, profileId: null, score: 0 }, db),
    ).rejects.toThrow(/platforms.code='boamp' introuvable/);
  });
});

describe("insertTender — payload INSERT", () => {
  it("mappe tous les champs NormalizedTender vers la row Drizzle", async () => {
    const now = new Date("2026-05-19T12:00:00.000Z");
    const { db, insertCapture } = buildFakeDb(
      [{ id: PLATFORM_BOAMP_ID }],
      [{ id: "tender-uuid-1", createdAt: now, updatedAt: now }],
    );

    await insertTender(
      baseTender,
      { organizationId: ORG_A_ID, profileId: PROFILE_ID, score: 75 },
      db,
    );

    const v = insertCapture.values;
    expect(v).toBeDefined();
    if (!v) throw new Error("insertCapture.values undefined");

    expect(v.organizationId).toBe(ORG_A_ID);
    expect(v.externalRef).toBe("MOCK-123");
    expect(v.platformId).toBe(PLATFORM_BOAMP_ID);
    expect(v.title).toBe("Test mission MOE");
    expect(v.buyer).toBe("Mairie de test");
    expect(v.cpv).toEqual(["71300000", "45000000"]);
    // Numeric Drizzle : on stocke en string pour conserver la précision
    expect(v.amount).toBe("250000");
    expect(v.deadline).toEqual(new Date("2026-07-01T15:00:00.000Z"));
    expect(v.questionsDeadline).toBeNull();
    expect(v.visitDate).toBeNull();
    expect(v.dceUrl).toBe("https://exemple.test/dce/abc");
    expect(v.sourceUrl).toBe("https://www.boamp.fr/avis/detail/MOCK-123");
    expect(v.score).toBe("75");
    expect(v.status).toBe("sourced");
    expect(v.matchingProfileId).toBe(PROFILE_ID);
    expect(v.rawData).toEqual(baseTender.rawData);
  });

  it("passe amount=null quand NormalizedTender.amount est null", async () => {
    const now = new Date();
    const { db, insertCapture } = buildFakeDb(
      [{ id: PLATFORM_BOAMP_ID }],
      [{ id: "x", createdAt: now, updatedAt: now }],
    );
    await insertTender(
      { ...baseTender, amount: null },
      { organizationId: ORG_A_ID, profileId: null, score: 0 },
      db,
    );
    expect(insertCapture.values?.amount).toBeNull();
  });

  it("passe matchingProfileId=null quand profileId est null", async () => {
    const now = new Date();
    const { db, insertCapture } = buildFakeDb(
      [{ id: PLATFORM_BOAMP_ID }],
      [{ id: "x", createdAt: now, updatedAt: now }],
    );
    await insertTender(baseTender, { organizationId: ORG_A_ID, profileId: null, score: 0 }, db);
    expect(insertCapture.values?.matchingProfileId).toBeNull();
  });
});

describe("insertTender — onConflictDoUpdate (politique re-source)", () => {
  it("target = (organizationId, externalRef, platformId)", async () => {
    const now = new Date();
    const { db, insertCapture } = buildFakeDb(
      [{ id: PLATFORM_BOAMP_ID }],
      [{ id: "x", createdAt: now, updatedAt: now }],
    );
    await insertTender(baseTender, { organizationId: ORG_A_ID, profileId: null, score: 0 }, db);

    // Target doit être un tableau de 3 colonnes Drizzle
    expect(Array.isArray(insertCapture.onConflictTarget)).toBe(true);
    expect(insertCapture.onConflictTarget as unknown[]).toHaveLength(3);
  });

  it("set ne touche QUE raw_data + updated_at (préserve score/status/matchingProfileId)", async () => {
    const now = new Date();
    const { db, insertCapture } = buildFakeDb(
      [{ id: PLATFORM_BOAMP_ID }],
      [{ id: "x", createdAt: now, updatedAt: now }],
    );
    await insertTender(
      baseTender,
      { organizationId: ORG_A_ID, profileId: PROFILE_ID, score: 75 },
      db,
    );

    const setKeys = Object.keys(insertCapture.onConflictSet ?? {});
    expect(setKeys.sort()).toEqual(["rawData", "updatedAt"]);
    // Les champs métier ne doivent PAS être mis à jour
    expect(setKeys).not.toContain("score");
    expect(setKeys).not.toContain("status");
    expect(setKeys).not.toContain("matchingProfileId");
    expect(setKeys).not.toContain("title");
  });
});

describe("insertTender — flag isNew", () => {
  it("isNew=true quand created_at === updated_at (cas INSERT initial)", async () => {
    const now = new Date("2026-05-19T12:00:00.000Z");
    const { db } = buildFakeDb(
      [{ id: PLATFORM_BOAMP_ID }],
      [{ id: "tender-1", createdAt: now, updatedAt: now }],
    );

    const result = await insertTender(
      baseTender,
      { organizationId: ORG_A_ID, profileId: null, score: 0 },
      db,
    );
    expect(result.isNew).toBe(true);
    expect(result.id).toBe("tender-1");
  });

  it("isNew=false quand updated_at > created_at (cas UPDATE re-source)", async () => {
    const created = new Date("2026-05-01T10:00:00.000Z");
    const updated = new Date("2026-05-19T12:00:00.000Z");
    const { db } = buildFakeDb(
      [{ id: PLATFORM_BOAMP_ID }],
      [{ id: "tender-existing", createdAt: created, updatedAt: updated }],
    );

    const result = await insertTender(
      baseTender,
      { organizationId: ORG_A_ID, profileId: null, score: 0 },
      db,
    );
    expect(result.isNew).toBe(false);
    expect(result.id).toBe("tender-existing");
  });
});
