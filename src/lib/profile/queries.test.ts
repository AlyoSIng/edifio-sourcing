/**
 * Tests unitaires `queries.ts` — helpers profil de recherche (P2 Gate 6).
 *
 * Couvre :
 *  - `getActiveSearchProfile` : retourne le row si actif, `null` sinon
 *  - `updateSearchProfile` : retourne le row mis à jour ; lève si introuvable
 *
 * Pattern de mock identique à `src/lib/sourcing/queries.test.ts` (chaîne
 * fluide Drizzle capturée pour assertions ciblées).
 *
 * Le contrôle multi-tenant (cross-tenant via RLS) est couvert par pgTAP, pas
 * ici. Ce test valide juste le contrat Drizzle applicatif (chaîne, filtre
 * `organization_id`, RETURNING).
 */

import { describe, expect, it } from "vitest";

import type { SearchProfile } from "@/db/schema/config";

import type { DrizzleClient, SearchProfilePatch } from "./queries";
import { getActiveSearchProfile, updateSearchProfile } from "./queries";

// ----------------------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------------------

const ORG_ALYOS = "11111111-1111-1111-1111-111111111111";
const PROFILE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const SAMPLE_PROFILE: SearchProfile = {
  id: PROFILE_ID,
  organizationId: ORG_ALYOS,
  name: "Profil AlyoS BTP - sourcing principal",
  keywords: {
    positive: ["btp", "renovation"],
    negative: ["informatique"],
    exact: ["alyos"],
  },
  cpvCodes: ["45000000", "71000000"],
  geoZones: ["33", "40"],
  marketTypes: ["travaux"],
  amountMin: null,
  amountMax: null,
  active: true,
  cronTime: "06:30:00",
  cronDays: [1, 2, 3, 4, 5],
  createdAt: new Date("2026-05-20T00:00:00.000Z"),
  updatedAt: new Date("2026-05-22T00:00:00.000Z"),
};

const SAMPLE_PATCH: SearchProfilePatch = {
  keywords: {
    positive: ["btp", "construction"],
    negative: ["informatique", "mobilier"],
    exact: ["alyos", "edifio"],
  },
  cpvCodes: ["45000000"],
  geoZones: ["33", "40", "47"],
  marketTypes: ["travaux", "services"],
  amountMin: "50000.00",
  amountMax: "1000000.00",
};

// ----------------------------------------------------------------------------
// Mock builder — chaîne fluide Drizzle .select / .update
// ----------------------------------------------------------------------------

interface SelectCapture {
  whereExpr?: unknown;
  orderByArgs?: unknown[];
  limitN?: number;
}

interface UpdateCapture {
  setValues?: Record<string, unknown>;
  whereExpr?: unknown;
}

/**
 * Construit un faux client Drizzle qui retourne `rows` pour la chaîne
 * `.select().from().where().orderBy().limit()`.
 */
function buildFakeSelectDb<TRow>(rows: TRow[]): { db: DrizzleClient; capture: SelectCapture } {
  const capture: SelectCapture = {};

  const fakeDb = {
    select: () => ({
      from: () => ({
        where: (expr: unknown) => {
          capture.whereExpr = expr;
          return {
            orderBy: (...args: unknown[]) => {
              capture.orderByArgs = args;
              return {
                limit: (n: number) => {
                  capture.limitN = n;
                  return Promise.resolve(rows);
                },
              };
            },
          };
        },
      }),
    }),
  };

  return {
    db: fakeDb as unknown as DrizzleClient,
    capture,
  };
}

/**
 * Construit un faux client Drizzle qui retourne `rows` pour la chaîne
 * `.update().set().where().returning()`.
 */
function buildFakeUpdateDb<TRow>(rows: TRow[]): { db: DrizzleClient; capture: UpdateCapture } {
  const capture: UpdateCapture = {};

  const fakeDb = {
    update: () => ({
      set: (values: Record<string, unknown>) => {
        capture.setValues = values;
        return {
          where: (expr: unknown) => {
            capture.whereExpr = expr;
            return {
              returning: () => Promise.resolve(rows),
            };
          },
        };
      },
    }),
  };

  return {
    db: fakeDb as unknown as DrizzleClient,
    capture,
  };
}

// ----------------------------------------------------------------------------
// getActiveSearchProfile
// ----------------------------------------------------------------------------

describe("getActiveSearchProfile", () => {
  it("retourne le row complet quand un profil actif existe", async () => {
    const { db, capture } = buildFakeSelectDb<SearchProfile>([SAMPLE_PROFILE]);

    const result = await getActiveSearchProfile(ORG_ALYOS, db);

    expect(result).toEqual(SAMPLE_PROFILE);
    expect(capture.limitN).toBe(1);
    expect(capture.whereExpr).toBeDefined();
    expect(capture.orderByArgs).toBeDefined();
  });

  it("retourne null si aucun profil actif", async () => {
    const { db, capture } = buildFakeSelectDb<SearchProfile>([]);

    const result = await getActiveSearchProfile(ORG_ALYOS, db);

    expect(result).toBeNull();
    expect(capture.limitN).toBe(1);
  });

  it("propage l'erreur si Drizzle throw (pas de try/catch interne)", async () => {
    const boom = new Error("DATABASE_URL is not set");
    const fakeDb = {
      select: () => {
        throw boom;
      },
    } as unknown as DrizzleClient;

    await expect(getActiveSearchProfile(ORG_ALYOS, fakeDb)).rejects.toThrow(
      "DATABASE_URL is not set",
    );
  });
});

// ----------------------------------------------------------------------------
// updateSearchProfile
// ----------------------------------------------------------------------------

describe("updateSearchProfile", () => {
  it("retourne le row mis à jour quand l'UPDATE affecte 1 ligne", async () => {
    const updated: SearchProfile = {
      ...SAMPLE_PROFILE,
      keywords: SAMPLE_PATCH.keywords,
      cpvCodes: SAMPLE_PATCH.cpvCodes,
      geoZones: SAMPLE_PATCH.geoZones,
      marketTypes: SAMPLE_PATCH.marketTypes,
      amountMin: SAMPLE_PATCH.amountMin,
      amountMax: SAMPLE_PATCH.amountMax,
    };
    const { db, capture } = buildFakeUpdateDb<SearchProfile>([updated]);

    const result = await updateSearchProfile(ORG_ALYOS, PROFILE_ID, SAMPLE_PATCH, db);

    expect(result).toEqual(updated);
    expect(capture.setValues).toBeDefined();
    expect(capture.setValues?.keywords).toEqual(SAMPLE_PATCH.keywords);
    expect(capture.setValues?.cpvCodes).toEqual(SAMPLE_PATCH.cpvCodes);
    expect(capture.setValues?.amountMin).toBe("50000.00");
    // updatedAt explicitement re-posé (pas auto par Drizzle 0.39)
    expect(capture.setValues?.updatedAt).toBeInstanceOf(Date);
    expect(capture.whereExpr).toBeDefined();
  });

  it("lève Error('profile_not_found') si aucun row affecté", async () => {
    const { db } = buildFakeUpdateDb<SearchProfile>([]);

    await expect(updateSearchProfile(ORG_ALYOS, PROFILE_ID, SAMPLE_PATCH, db)).rejects.toThrow(
      "profile_not_found",
    );
  });

  it("propage l'erreur Drizzle si la requête plante", async () => {
    const boom = new Error("connection terminated unexpectedly");
    const fakeDb = {
      update: () => {
        throw boom;
      },
    } as unknown as DrizzleClient;

    await expect(updateSearchProfile(ORG_ALYOS, PROFILE_ID, SAMPLE_PATCH, fakeDb)).rejects.toThrow(
      "connection terminated unexpectedly",
    );
  });

  it("préserve les bornes amountMin/amountMax null (pas de filtre)", async () => {
    const patchNoBounds: SearchProfilePatch = {
      ...SAMPLE_PATCH,
      amountMin: null,
      amountMax: null,
    };
    const { db, capture } = buildFakeUpdateDb<SearchProfile>([SAMPLE_PROFILE]);

    await updateSearchProfile(ORG_ALYOS, PROFILE_ID, patchNoBounds, db);

    expect(capture.setValues?.amountMin).toBeNull();
    expect(capture.setValues?.amountMax).toBeNull();
  });
});
