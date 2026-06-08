/**
 * Tests Vitest — Server Actions `learning-actions.ts` (Salve U).
 *
 * Couvre `applyProfileSuggestionAction` + `dismissSuggestionAction` :
 *  - auth fail (not_authenticated / forbidden_domain / forbidden_role)
 *  - validation input (UUID profil, reasonCode non actionnable, change incohérent)
 *  - profil introuvable
 *  - happy paths : patch profil correct selon le type de change + UPDATE
 *    learning_events
 *
 * Stratégie de mock : FakeDb minimal qui capture les UPDATE/SELECT, client
 * Supabase auth injecté, audit mocké au niveau module.
 */

import type { User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthClientLike, DrizzleClient } from "./learning-actions";
import { applyProfileSuggestionAction, dismissSuggestionAction } from "./learning-actions";

// ----------------------------------------------------------------------------
// Mocks globaux
// ----------------------------------------------------------------------------

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/get-required-org-id", () => ({
  getRequiredOrgId: async () => "11111111-1111-1111-1111-111111111111",
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
}));

// Audit best-effort → no-op résolu.
vi.mock("@/lib/audit", () => ({
  audit: vi.fn(async () => undefined),
}));

// ----------------------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------------------

const PROFILE_ID = "22222222-2222-2222-2222-222222222222";
const ALYOS_ADMIN_EMAIL = "admin@alyosingenierie.fr";
const OUT_OF_DOMAIN_EMAIL = "outsider@gmail.com";

interface FakeProfileRow {
  id: string;
  name: string;
  geoZones: string[];
  amountMin: string | null;
  keywords: { positive: string[]; negative: string[]; exact: string[] };
}

const DEFAULT_PROFILE: FakeProfileRow = {
  id: PROFILE_ID,
  name: "Profil AlyoS BTP",
  geoZones: ["13", "83", "06"],
  amountMin: "100000.00",
  keywords: { positive: ["rénovation"], negative: ["informatique"], exact: [] },
};

function adminUser(): User {
  return {
    id: "user-admin",
    email: ALYOS_ADMIN_EMAIL,
    user_metadata: { role: "admin" },
    app_metadata: { role: "admin" },
    aud: "authenticated",
    created_at: "2026-06-08T00:00:00Z",
  } as unknown as User;
}

function nonAdminUser(): User {
  return {
    id: "user-std",
    email: ALYOS_ADMIN_EMAIL,
    user_metadata: { role: "user" },
    app_metadata: { role: "user" },
    aud: "authenticated",
    created_at: "2026-06-08T00:00:00Z",
  } as unknown as User;
}

function outOfDomainUser(): User {
  return {
    id: "user-out",
    email: OUT_OF_DOMAIN_EMAIL,
    user_metadata: { role: "admin" },
    app_metadata: { role: "admin" },
    aud: "authenticated",
    created_at: "2026-06-08T00:00:00Z",
  } as unknown as User;
}

function fakeAuthClient(user: User | null): AuthClientLike {
  return { auth: { getUser: async () => ({ data: { user } }) } };
}

// ----------------------------------------------------------------------------
// Fake Drizzle
// ----------------------------------------------------------------------------

interface FakeDbCapture {
  profileUpdates: Array<Record<string, unknown>>;
  learningUpdates: Array<Record<string, unknown>>;
}

function buildFakeDb(profileRow: FakeProfileRow | null): {
  db: DrizzleClient;
  capture: FakeDbCapture;
} {
  const capture: FakeDbCapture = { profileUpdates: [], learningUpdates: [] };

  // SELECT chain : .select(...).from(searchProfiles).where(...).limit(1)
  const selectChain = {
    from: () => ({
      where: () => ({
        limit: async () => (profileRow ? [profileRow] : []),
      }),
    }),
  };

  // UPDATE chain. On distingue searchProfiles (patch profil) de learningEvents
  // (marquage applied/dismissed) par le CONTENU du patch : un marquage
  // learning_events ne porte que appliedAt / dismissedAt. Robuste sans dépendre
  // d'un symbole interne Drizzle.
  function updateChain() {
    return {
      set: (patch: Record<string, unknown>) => ({
        where: async () => {
          const keys = Object.keys(patch);
          const isLearningMark =
            keys.length > 0 && keys.every((k) => k === "appliedAt" || k === "dismissedAt");
          if (isLearningMark) capture.learningUpdates.push(patch);
          else capture.profileUpdates.push(patch);
        },
      }),
    };
  }

  const db = {
    select: () => selectChain,
    update: () => updateChain(),
  };

  return { db: db as unknown as DrizzleClient, capture };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================================
// applyProfileSuggestionAction
// ============================================================================

describe("applyProfileSuggestionAction", () => {
  it("not_authenticated sans session", async () => {
    const { db } = buildFakeDb(DEFAULT_PROFILE);
    const res = await applyProfileSuggestionAction(
      PROFILE_ID,
      "out_of_area",
      { kind: "remove_geo_zones", values: ["13"] },
      { db, authClient: fakeAuthClient(null) },
    );
    expect(res).toEqual({ ok: false, error: "not_authenticated" });
  });

  it("forbidden_domain hors @alyosingenierie.fr", async () => {
    const { db } = buildFakeDb(DEFAULT_PROFILE);
    const res = await applyProfileSuggestionAction(
      PROFILE_ID,
      "out_of_area",
      { kind: "remove_geo_zones", values: ["13"] },
      { db, authClient: fakeAuthClient(outOfDomainUser()) },
    );
    expect(res).toEqual({ ok: false, error: "forbidden_domain" });
  });

  it("forbidden_role si non-admin", async () => {
    const { db } = buildFakeDb(DEFAULT_PROFILE);
    const res = await applyProfileSuggestionAction(
      PROFILE_ID,
      "out_of_area",
      { kind: "remove_geo_zones", values: ["13"] },
      { db, authClient: fakeAuthClient(nonAdminUser()) },
    );
    expect(res).toEqual({ ok: false, error: "forbidden_role" });
  });

  it("invalid_input si profileId pas UUID", async () => {
    const { db } = buildFakeDb(DEFAULT_PROFILE);
    const res = await applyProfileSuggestionAction(
      "not-a-uuid",
      "out_of_area",
      { kind: "remove_geo_zones", values: ["13"] },
      { db, authClient: fakeAuthClient(adminUser()) },
    );
    expect(res).toEqual({ ok: false, error: "invalid_input" });
  });

  it("invalid_input si reasonCode non actionnable", async () => {
    const { db } = buildFakeDb(DEFAULT_PROFILE);
    const res = await applyProfileSuggestionAction(
      PROFILE_ID,
      "deadline_too_short" as unknown as "out_of_area",
      { kind: "remove_geo_zones", values: ["13"] },
      { db, authClient: fakeAuthClient(adminUser()) },
    );
    expect(res).toEqual({ ok: false, error: "invalid_input" });
  });

  it("invalid_input si change incohérent avec le motif", async () => {
    const { db } = buildFakeDb(DEFAULT_PROFILE);
    const res = await applyProfileSuggestionAction(
      PROFILE_ID,
      "out_of_area",
      { kind: "set_amount_min", value: 500000 }, // mauvais kind pour out_of_area
      { db, authClient: fakeAuthClient(adminUser()) },
    );
    expect(res).toEqual({ ok: false, error: "invalid_input" });
  });

  it("profile_not_found si SELECT vide", async () => {
    const { db } = buildFakeDb(null);
    const res = await applyProfileSuggestionAction(
      PROFILE_ID,
      "out_of_area",
      { kind: "remove_geo_zones", values: ["13"] },
      { db, authClient: fakeAuthClient(adminUser()) },
    );
    expect(res).toEqual({ ok: false, error: "profile_not_found" });
  });

  it("out_of_area : retire les départements ciblés du profil", async () => {
    const { db, capture } = buildFakeDb(DEFAULT_PROFILE);
    const res = await applyProfileSuggestionAction(
      PROFILE_ID,
      "out_of_area",
      { kind: "remove_geo_zones", values: ["13", "83"] },
      { db, authClient: fakeAuthClient(adminUser()) },
    );
    expect(res).toEqual({ ok: true });
    expect(capture.profileUpdates[0]?.geoZones).toEqual(["06"]);
    // learning_events marqués appliqués
    expect(capture.learningUpdates).toHaveLength(1);
    expect(capture.learningUpdates[0]).toHaveProperty("appliedAt");
  });

  it("budget_too_low : set amountMin formaté à 2 décimales", async () => {
    const { db, capture } = buildFakeDb(DEFAULT_PROFILE);
    const res = await applyProfileSuggestionAction(
      PROFILE_ID,
      "budget_too_low",
      { kind: "set_amount_min", value: 220000 },
      { db, authClient: fakeAuthClient(adminUser()) },
    );
    expect(res).toEqual({ ok: true });
    expect(capture.profileUpdates[0]?.amountMin).toBe("220000.00");
  });

  it("out_of_scope : ajoute les mots-clés négatifs sans doublon", async () => {
    const { db, capture } = buildFakeDb(DEFAULT_PROFILE);
    const res = await applyProfileSuggestionAction(
      PROFILE_ID,
      "out_of_scope",
      { kind: "add_negative_keywords", values: ["logiciel", "informatique"] }, // informatique déjà présent
      { db, authClient: fakeAuthClient(adminUser()) },
    );
    expect(res).toEqual({ ok: true });
    const kw = capture.profileUpdates[0]?.keywords as {
      negative: string[];
    };
    expect(kw.negative).toEqual(["informatique", "logiciel"]);
  });

  it("invalid_input si départements tous mal formés", async () => {
    const { db } = buildFakeDb(DEFAULT_PROFILE);
    const res = await applyProfileSuggestionAction(
      PROFILE_ID,
      "out_of_area",
      { kind: "remove_geo_zones", values: ["XXXX", "@@"] },
      { db, authClient: fakeAuthClient(adminUser()) },
    );
    expect(res).toEqual({ ok: false, error: "invalid_input" });
  });
});

// ============================================================================
// dismissSuggestionAction
// ============================================================================

describe("dismissSuggestionAction", () => {
  it("not_authenticated sans session", async () => {
    const { db } = buildFakeDb(DEFAULT_PROFILE);
    const res = await dismissSuggestionAction("out_of_area", {
      db,
      authClient: fakeAuthClient(null),
    });
    expect(res).toEqual({ ok: false, error: "not_authenticated" });
  });

  it("forbidden_role si non-admin", async () => {
    const { db } = buildFakeDb(DEFAULT_PROFILE);
    const res = await dismissSuggestionAction("out_of_area", {
      db,
      authClient: fakeAuthClient(nonAdminUser()),
    });
    expect(res).toEqual({ ok: false, error: "forbidden_role" });
  });

  it("invalid_input si reasonCode non actionnable", async () => {
    const { db } = buildFakeDb(DEFAULT_PROFILE);
    const res = await dismissSuggestionAction("other" as unknown as "out_of_area", {
      db,
      authClient: fakeAuthClient(adminUser()),
    });
    expect(res).toEqual({ ok: false, error: "invalid_input" });
  });

  it("happy path : marque les learning_events dismissed", async () => {
    const { db, capture } = buildFakeDb(DEFAULT_PROFILE);
    const res = await dismissSuggestionAction("out_of_area", {
      db,
      authClient: fakeAuthClient(adminUser()),
    });
    expect(res).toEqual({ ok: true });
    expect(capture.learningUpdates).toHaveLength(1);
    expect(capture.learningUpdates[0]).toHaveProperty("dismissedAt");
  });
});
