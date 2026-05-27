/**
 * Tests d'intégration de la route GET / POST `/api/cron/sourcing-run`.
 *
 * Stratégie : on mocke `@/db/client` (Proxy lazy normalement) et le connecteur
 * BOAMP. Le reste (normalize / dedup / filter / score / insertTender via mock
 * db) tourne réellement — c'est le « E2E sourcing-cron » du plan PR #3, sans
 * Playwright ni Supabase live (couverts par les vrais E2E Gate 7).
 *
 * Couvre :
 *  - **GET** est exporté (sans cet export, Vercel Cron tape `405 Method Not
 *    Allowed` à chaque tick — bug post-merge corrigé après observation des
 *    logs Vercel)
 *  - GET 401 si CRON_SECRET absent / Bearer manquant / Bearer faux
 *  - GET 200 + summary si OK
 *  - GET 200 + comptage filter + insert via vrai pipeline
 *  - GET 200 + dedup intra-batch
 *  - GET 200 + failedProfiles si connecteur throw
 *  - POST (conservé pour déclenchement manuel) : parité comportementale
 *    stricte avec GET sur l'auth + le pipeline (smoke tests)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SearchProfile } from "@/db/schema/config";

import type { BoampConnector } from "@/lib/sourcing/connectors/boamp";
import type { BoampApiRecord, RawTender } from "@/lib/sourcing/types";

// ============================================================================
// Mocks — hoisting Vitest (les vi.mock sont remontés au top du module)
// ============================================================================

// Variables de contrôle des mocks — mutées par chaque test avant l'appel POST.
let mockProfiles: SearchProfile[] = [];
let mockConnector: BoampConnector = {
  fetchSinceLastRun: async () => [],
};
const mockInserts: unknown[] = [];

vi.mock("@/db/client", () => {
  // Reproduit la shape du Proxy lazy : `db.select().from(...).where(...)` et
  // `db.insert().values().onConflictDoUpdate().returning()`. Les `select()`
  // sur `platforms` retournent un id stub ; les `select()` sur `searchProfiles`
  // retournent `mockProfiles`.
  const platformsRow = [{ id: "platform-stub-uuid" }];

  const platformsChain = {
    from: () => platformsChain,
    where: () => platformsChain,
    limit: async () => platformsRow,
  };

  const profilesChain = {
    from: () => profilesChain,
    where: async () => mockProfiles,
  };

  const selectImpl = () => {
    // Le caller `resolvePlatformId` chaîne `.where(...).limit(1)`. Le caller
    // route `load profiles` chaîne `.where(...)` direct awaité. On expose
    // donc un chain qui supporte `.limit()` ET qui est lui-même thenable
    // — discrimination via la branche que prend le caller (await vs .limit).
    return {
      from: () => ({
        where: () => ({
          limit: async () => platformsRow,
          then: (
            onFulfilled?: (v: SearchProfile[]) => unknown,
            onRejected?: (e: unknown) => unknown,
          ) => Promise.resolve(mockProfiles).then(onFulfilled, onRejected),
        }),
      }),
    };
  };

  const insertImpl = () => {
    const chain = {
      values: (v: unknown) => {
        mockInserts.push(v);
        return chain;
      },
      onConflictDoUpdate: () => chain,
      returning: async () => {
        const t = new Date("2026-05-20T12:00:00Z");
        return [{ id: `tender-${mockInserts.length}`, createdAt: t, updatedAt: t }];
      },
    };
    return chain;
  };

  return {
    db: {
      select: selectImpl,
      insert: insertImpl,
    },
  };
});

vi.mock("@/lib/sourcing/connectors/boamp", () => ({
  createBoampConnector: () => mockConnector,
}));

// On importe la route APRÈS les vi.mock — les imports internes (db, connector)
// récupéreront les versions mockées grâce au hoisting de vi.mock.
import { GET, POST } from "./route";

// ============================================================================
// Helpers
// ============================================================================

function makeProfile(overrides: Partial<SearchProfile> = {}): SearchProfile {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    organizationId: "22222222-2222-2222-2222-222222222222",
    name: "Profil rénovation BTP",
    isDefault: true,
    displayOrder: 0,
    keywords: { positive: ["rénovation"], negative: [], exact: [] },
    cpvCodes: ["45"],
    geoZones: [],
    marketTypes: [],
    amountMin: null,
    amountMax: null,
    active: true,
    cronTime: "06:30:00",
    cronDays: [1, 2, 3, 4, 5],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeRaw(idweb: string, fields: Partial<BoampApiRecord> = {}): RawTender {
  const record: BoampApiRecord = {
    idweb,
    objet: "Rénovation thermique école",
    nomacheteur: "Mairie test",
    codecpv_principal: "45211350",
    datelimitereponse: "2026-06-30T17:00:00+02:00",
    ...fields,
  };
  return {
    externalRef: idweb,
    platformCode: "boamp",
    rawData: {
      platform_code: "boamp",
      record: record as unknown as Record<string, unknown>,
      fetched_at: "2026-05-20T12:00:00.000Z",
    },
    fetchedAt: "2026-05-20T12:00:00.000Z",
  };
}

function buildRequest(authHeader: string | null, method: "GET" | "POST" = "GET"): Request {
  const headers = new Headers();
  if (authHeader !== null) headers.set("authorization", authHeader);
  return new Request("http://localhost/api/cron/sourcing-run", {
    method,
    headers,
  });
}

// ============================================================================
// Tests
// ============================================================================

const SECRET = "test-secret-32-bytes-aaaaaaaaaaaaaaaa";

// ============================================================================
// Anti-régression 405 — Vercel Cron tape exclusivement GET sur la route.
// Sans `export GET` côté `route.ts`, Next.js App Router répond automatiquement
// `405 Method Not Allowed` aux ticks cron — bug observé en prod après le
// premier déploiement (logs Vercel : `GET 405 /api/cron/sourcing-run`).
// ============================================================================

describe("exports HTTP — anti-régression 405", () => {
  it("exporte un handler GET (sinon Vercel cron → 405 Method Not Allowed)", () => {
    expect(typeof GET).toBe("function");
  });

  it("exporte un handler POST (déclenchement manuel curl / scripts ops)", () => {
    expect(typeof POST).toBe("function");
  });
});

describe("GET /api/cron/sourcing-run — authentification", () => {
  beforeEach(() => {
    mockProfiles = [];
    mockConnector = { fetchSinceLastRun: async () => [] };
    mockInserts.length = 0;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renvoie 401 si CRON_SECRET n'est pas configuré côté env", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const consoleErrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET(buildRequest(`Bearer ${SECRET}`, "GET") as never);
    expect(res.status).toBe(401);
    consoleErrSpy.mockRestore();
  });

  it("renvoie 401 si le header Authorization est absent", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const res = await GET(buildRequest(null, "GET") as never);
    expect(res.status).toBe(401);
  });

  it("renvoie 401 si le Bearer ne matche pas le secret", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const res = await GET(buildRequest("Bearer wrong-secret", "GET") as never);
    expect(res.status).toBe(401);
  });

  it("renvoie 200 et un summary vide si aucun profil actif", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    mockProfiles = [];
    const res = await GET(buildRequest(`Bearer ${SECRET}`, "GET") as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; totalProfiles: number };
    expect(body.ok).toBe(true);
    expect(body.totalProfiles).toBe(0);
  });
});

describe("GET /api/cron/sourcing-run — pipeline", () => {
  beforeEach(() => {
    mockProfiles = [];
    mockConnector = { fetchSinceLastRun: async () => [] };
    mockInserts.length = 0;
    vi.stubEnv("CRON_SECRET", SECRET);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("pipeline complet : fetch 3 → filter 1 → insert 2 avec scores 0-100", async () => {
    mockProfiles = [makeProfile()];
    mockConnector = {
      fetchSinceLastRun: async () => [
        makeRaw("A1", { objet: "Rénovation école A" }),
        makeRaw("A2", { objet: "Marché de fournitures bureau" }), // filtré
        makeRaw("A3", { objet: "Rénovation collège B" }),
      ],
    };

    const res = await GET(buildRequest(`Bearer ${SECRET}`, "GET") as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      totalProfiles: number;
      results: Array<{
        fetched: number;
        filtered: Record<string, number>;
        inserted: number;
        updated: number;
      }>;
    };

    expect(body.ok).toBe(true);
    expect(body.totalProfiles).toBe(1);
    expect(body.results).toHaveLength(1);
    expect(body.results[0]?.fetched).toBe(3);
    expect(body.results[0]?.filtered).toEqual({ no_positive_keyword: 1 });
    expect(body.results[0]?.inserted).toBe(2);

    // Vérifie scores 0-100 sur les INSERT
    for (const insert of mockInserts) {
      const value = insert as { score: string };
      const score = Number(value.score);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it("dedup cross-batch : 2 raws identiques (buyer+title+deadline) → 1 inséré", async () => {
    mockProfiles = [makeProfile()];
    mockConnector = {
      fetchSinceLastRun: async () => [
        makeRaw("A1", {
          objet: "Rénovation thermique école Jules Ferry",
          nomacheteur: "Mairie de Bordeaux",
          datelimitereponse: "2026-06-30T17:00:00+02:00",
        }),
        makeRaw("DUP-A1", {
          objet: "Rénovation thermique école Jules Ferry",
          nomacheteur: "Mairie de Bordeaux",
          datelimitereponse: "2026-06-30T15:00:00Z",
        }),
      ],
    };

    const res = await GET(buildRequest(`Bearer ${SECRET}`, "GET") as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      results: Array<{ dedupSkipped: number; inserted: number }>;
    };
    expect(body.results[0]?.dedupSkipped).toBe(1);
    expect(body.results[0]?.inserted).toBe(1);
  });

  it("connecteur qui throw → 200 + failedProfiles[] (les autres profils continuent)", async () => {
    const profileA = makeProfile({ id: "00000000-0000-0000-0000-00000000000A" });
    const profileB = makeProfile({ id: "00000000-0000-0000-0000-00000000000B" });
    mockProfiles = [profileA, profileB];

    let callIdx = 0;
    mockConnector = {
      fetchSinceLastRun: async () => {
        callIdx += 1;
        if (callIdx === 1) return [makeRaw("OK-1")];
        throw new Error("BOAMP indisponible");
      },
    };
    const consoleErrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await GET(buildRequest(`Bearer ${SECRET}`, "GET") as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      results: Array<{ profileId: string; inserted: number }>;
      failedProfiles: Array<{ profileId: string; message: string }>;
    };
    expect(body.results).toHaveLength(1);
    expect(body.results[0]?.profileId).toBe(profileA.id);
    expect(body.failedProfiles).toHaveLength(1);
    expect(body.failedProfiles[0]?.profileId).toBe(profileB.id);
    expect(body.failedProfiles[0]?.message).toMatch(/BOAMP indisponible/);
    consoleErrSpy.mockRestore();
  });
});

// ============================================================================
// POST — parité de comportement avec GET (déclenchement manuel curl/ops).
// Smoke tests uniquement : on prouve que POST traverse le même handler que
// GET sur les chemins auth + pipeline OK. Les cas détaillés sont couverts
// par les blocs GET ci-dessus.
// ============================================================================

describe("POST /api/cron/sourcing-run — parité déclenchement manuel", () => {
  beforeEach(() => {
    mockProfiles = [];
    mockConnector = { fetchSinceLastRun: async () => [] };
    mockInserts.length = 0;
    vi.stubEnv("CRON_SECRET", SECRET);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("POST sans Bearer → 401 (parité GET)", async () => {
    const res = await POST(buildRequest(null, "POST") as never);
    expect(res.status).toBe(401);
  });

  it("POST avec bon Bearer + aucun profil → 200 summary vide (parité GET)", async () => {
    mockProfiles = [];
    const res = await POST(buildRequest(`Bearer ${SECRET}`, "POST") as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; totalProfiles: number };
    expect(body.ok).toBe(true);
    expect(body.totalProfiles).toBe(0);
  });
});
