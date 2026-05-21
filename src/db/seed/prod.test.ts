/**
 * Tests seed PROD minimal -- edifio Sourcing.
 *
 * Source : Phase A initialisation BDD prod (Decision Board 2026-05-20).
 *
 * Strategie : pas de connexion BDD reelle, pas d'effet de bord disque.
 * On mock `@/db/client` (chain `db.insert().values().onConflictDoNothing()`
 * + `db.select().from()`) -- meme pattern que `orchestrator.test.ts` et
 * `route.test.ts`. On capture chaque appel `db.insert(table)` dans un array
 * d'inspections pour asserter :
 *
 *   (a) la DOUBLE GARDE refuse hors prod (NODE_ENV != production sans
 *       --allow-prod, OU DATABASE_URL localhost sans --allow-prod)
 *   (b) les 5 tables AUTORISEES sont touchees (organizations, platforms,
 *       architect_specialties, ai_prompts, search_profiles)
 *   (c) les 8 tables INTERDITES ne sont JAMAIS touchees (users, memberships,
 *       tenders, tender_events, architects, ai_runs, brevo_messages,
 *       audit_logs) -- assertion par exclusion sur l'array d'inserts
 *
 * Pas d'assertion sur le contenu jsonb des prompts (deja couverte par
 * `ai-prompts.test.ts` -- on importe le meme catalogue).
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// Variables de controle des mocks -- mutees entre tests
// ============================================================================

interface InsertCall {
  /** Reference vers l'objet `pgTable` Drizzle (organizations, platforms, ...) */
  tableRef: unknown;
  /** Payload passe a `.values(...)` */
  values: unknown;
  /** Indique si onConflictDoNothing a ete chaine */
  onConflictDoNothing: boolean;
}

const insertCalls: InsertCall[] = [];

/**
 * Mock `@/db/client` -- hoisted par Vitest. La chain reproduit la shape
 * minimale requise par `prod.ts` :
 *   - db.insert(table).values(v).onConflictDoNothing() -> resolvable
 *   - db.insert(table).values(v) (sans onConflict) -> resolvable
 *   - db.select(...).from(...) -> Promise<[]> (pas de profil existant en
 *     prod neuve, le seed va donc inserer le search_profile)
 */
vi.mock("@/db/client", () => {
  const insertImpl = (tableRef: unknown) => {
    const call: InsertCall = { tableRef, values: undefined, onConflictDoNothing: false };
    insertCalls.push(call);
    const chain = {
      values: (v: unknown) => {
        call.values = v;
        // Chain thenable -- si caller `await db.insert().values()`, ca resolve.
        return {
          onConflictDoNothing: () => {
            call.onConflictDoNothing = true;
            return Promise.resolve(undefined);
          },
          then: (onFulfilled?: (v: undefined) => unknown, onRejected?: (e: unknown) => unknown) =>
            Promise.resolve(undefined).then(onFulfilled, onRejected),
        };
      },
    };
    return chain;
  };

  const selectImpl = () => ({
    from: () => Promise.resolve([]),
  });

  return {
    db: {
      insert: insertImpl,
      select: selectImpl,
    },
  };
});

// On importe APRES vi.mock (hoisting Vitest).
import { assertProdContext, ORG_A_ID, ORG_A_NAME, PROD_PLATFORM_IDS, runSeedProd } from "./prod";
import {
  aiPrompts,
  architectSpecialties,
  architects,
  aiRuns,
  auditLogs,
  brevoMessages,
  memberships,
  organizations,
  platforms,
  searchProfiles,
  tenderEvents,
  tenders,
  users,
} from "../schema";

// ============================================================================
// Helpers
// ============================================================================

/**
 * Pour eviter de polluer le cwd test avec `prod-seed-report.json`, on
 * isole l'ecriture du rapport dans un dossier tmp. On chdir avant chaque
 * test et on cleanup apres.
 */
let originalCwd: string;
let tmpDir: string;

beforeEach(() => {
  insertCalls.length = 0;
  originalCwd = process.cwd();
  tmpDir = join(
    tmpdir(),
    `edifio-prod-seed-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(tmpDir, { recursive: true });
  // Stub d'un cwd writable et eph emere. `process.chdir` est supporte sur Win+Posix.
  process.chdir(tmpDir);
  // Pre-cree le sous-dossier que `runSeedProd` va vouloir creer.
  mkdirSync(join(tmpDir, "src/db/seed"), { recursive: true });
  // Pre-ecrit un fichier bidon pour s'assurer que ecriture overwrite OK.
  writeFileSync(join(tmpDir, "src/db/seed/prod-seed-report.json"), "{}", "utf8");
});

afterEach(() => {
  process.chdir(originalCwd);
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup -- pas critique si le tmp persiste.
  }
});

// ============================================================================
// TEST 1 -- Double garde anti-regression (CRITIQUE)
// ============================================================================

describe("assertProdContext -- double garde anti-regression", () => {
  it("THROW : NODE_ENV='development' sans --allow-prod", () => {
    expect(() =>
      assertProdContext(
        { NODE_ENV: "development", DATABASE_URL: "postgres://prod-host:5432/db" },
        [],
      ),
    ).toThrowError(/NODE_ENV/);
  });

  it("THROW : NODE_ENV='test' sans --allow-prod", () => {
    expect(() =>
      assertProdContext({ NODE_ENV: "test", DATABASE_URL: "postgres://prod-host:5432/db" }, []),
    ).toThrowError(/NODE_ENV/);
  });

  it("THROW : NODE_ENV='production' MAIS DATABASE_URL contient localhost sans --allow-prod", () => {
    expect(() =>
      assertProdContext(
        { NODE_ENV: "production", DATABASE_URL: "postgres://postgres@localhost:5432/edifio" },
        [],
      ),
    ).toThrowError(/localhost/);
  });

  it("THROW : NODE_ENV='production' MAIS DATABASE_URL contient 127.0.0.1 sans --allow-prod", () => {
    expect(() =>
      assertProdContext(
        { NODE_ENV: "production", DATABASE_URL: "postgres://postgres@127.0.0.1:5432/edifio" },
        [],
      ),
    ).toThrowError(/localhost/); // message d'erreur evoque "localhost / 127.0.0.1"
  });

  it("PASSE : NODE_ENV='production' + DATABASE_URL prod (pas localhost)", () => {
    expect(() =>
      assertProdContext(
        {
          NODE_ENV: "production",
          DATABASE_URL: "postgres://postgres@aws-0-eu-central-1.pooler.supabase.com:5432/postgres",
        },
        [],
      ),
    ).not.toThrow();
  });

  it("PASSE : NODE_ENV='test' + --allow-prod (dry-run local manuel)", () => {
    expect(() =>
      assertProdContext({ NODE_ENV: "test", DATABASE_URL: "postgres://prod-host:5432/db" }, [
        "node",
        "prod.ts",
        "--allow-prod",
      ]),
    ).not.toThrow();
  });

  it("PASSE : NODE_ENV='development' + DATABASE_URL=localhost + --allow-prod (le flag bypass les 2 gardes)", () => {
    expect(() =>
      assertProdContext({ NODE_ENV: "development", DATABASE_URL: "postgres://localhost:5432/db" }, [
        "--allow-prod",
      ]),
    ).not.toThrow();
  });
});

// ============================================================================
// TEST 2 -- Tables AUTORISEES touchees (CRITIQUE)
// ============================================================================

describe("runSeedProd -- les 5 tables autorisees sont seedees", () => {
  it("touche organizations, platforms, architect_specialties, ai_prompts, search_profiles", async () => {
    await runSeedProd({ NODE_ENV: "production", DATABASE_URL: "postgres://prod-host:5432/db" }, []);

    const touchedTables = new Set(insertCalls.map((c) => c.tableRef));

    expect(touchedTables.has(organizations)).toBe(true);
    expect(touchedTables.has(platforms)).toBe(true);
    expect(touchedTables.has(architectSpecialties)).toBe(true);
    expect(touchedTables.has(aiPrompts)).toBe(true);
    expect(touchedTables.has(searchProfiles)).toBe(true);
  });

  it("organizations seede contient ORG_A_ID, ORG_A_NAME, subscriptionTier='studio'", async () => {
    await runSeedProd({ NODE_ENV: "production", DATABASE_URL: "postgres://prod-host:5432/db" }, []);

    const orgCall = insertCalls.find((c) => c.tableRef === organizations);
    expect(orgCall).toBeDefined();
    expect(orgCall?.values).toMatchObject({
      id: ORG_A_ID,
      name: ORG_A_NAME,
      subscriptionTier: "studio",
    });
    // Garde idempotence : onConflictDoNothing doit etre chaine
    expect(orgCall?.onConflictDoNothing).toBe(true);
  });

  it("platforms seede contient 4 lignes (boamp / place / francmarches / mp_info)", async () => {
    await runSeedProd({ NODE_ENV: "production", DATABASE_URL: "postgres://prod-host:5432/db" }, []);

    const platCall = insertCalls.find((c) => c.tableRef === platforms);
    expect(platCall).toBeDefined();
    expect(Array.isArray(platCall?.values)).toBe(true);
    const platValues = platCall?.values as Array<{ code: string; id: string }>;
    expect(platValues).toHaveLength(4);
    expect(platValues.map((p) => p.code).sort()).toEqual([
      "boamp",
      "francmarches",
      "mp_info",
      "place",
    ]);
    expect(platValues.find((p) => p.code === "boamp")?.id).toBe(PROD_PLATFORM_IDS.boamp);
  });

  it("ai_prompts seede contient 12 lignes (catalogue v1 P1-P12)", async () => {
    await runSeedProd({ NODE_ENV: "production", DATABASE_URL: "postgres://prod-host:5432/db" }, []);

    const promptCall = insertCalls.find((c) => c.tableRef === aiPrompts);
    expect(promptCall).toBeDefined();
    expect(Array.isArray(promptCall?.values)).toBe(true);
    expect((promptCall?.values as unknown[]).length).toBe(12);
  });

  it("search_profiles seede 1 ligne active avec organizationId=ORG_A_ID, cpvCodes contient '45000000'", async () => {
    await runSeedProd({ NODE_ENV: "production", DATABASE_URL: "postgres://prod-host:5432/db" }, []);

    const profileCall = insertCalls.find((c) => c.tableRef === searchProfiles);
    expect(profileCall).toBeDefined();
    const profileValues = profileCall?.values as {
      organizationId: string;
      active: boolean;
      cpvCodes: string[];
    };
    expect(profileValues.organizationId).toBe(ORG_A_ID);
    expect(profileValues.active).toBe(true);
    expect(profileValues.cpvCodes).toContain("45000000");
  });
});

// ============================================================================
// TEST 3 -- Tables INTERDITES JAMAIS touchees (CRITIQUE -- exclusion)
// ============================================================================

describe("runSeedProd -- aucune des 8 tables interdites n'est touchee", () => {
  it("ne touche AUCUNE des 8 tables interdites (users, memberships, tenders, tenderEvents, architects, aiRuns, brevoMessages, auditLogs)", async () => {
    await runSeedProd({ NODE_ENV: "production", DATABASE_URL: "postgres://prod-host:5432/db" }, []);

    const touchedTables = new Set(insertCalls.map((c) => c.tableRef));

    // Assertion par exclusion -- si une seule de ces tables est touchee, fail.
    const forbiddenTables = [
      { name: "users", ref: users },
      { name: "memberships", ref: memberships },
      { name: "tenders", ref: tenders },
      { name: "tenderEvents", ref: tenderEvents },
      { name: "architects", ref: architects },
      { name: "aiRuns", ref: aiRuns },
      { name: "brevoMessages", ref: brevoMessages },
      { name: "auditLogs", ref: auditLogs },
    ] as const;

    for (const { name, ref } of forbiddenTables) {
      expect(touchedTables.has(ref), `Table interdite '${name}' touchee par seed prod`).toBe(false);
    }
  });

  it("le rapport ne mentionne aucun compteur pour les tables interdites", async () => {
    const report = await runSeedProd(
      { NODE_ENV: "production", DATABASE_URL: "postgres://prod-host:5432/db" },
      [],
    );

    // Le type SeedProdReportCounts ne contient que 5 clefs. Cette assertion
    // verrouille la shape -- si quelqu'un ajoute "users: 1" dans le rapport,
    // ce test (et le typecheck) signaleront le risque.
    const expectedKeys = [
      "organizations",
      "platforms",
      "architect_specialties",
      "ai_prompts",
      "search_profiles",
    ];
    expect(Object.keys(report.counts).sort()).toEqual(expectedKeys.sort());
  });
});
