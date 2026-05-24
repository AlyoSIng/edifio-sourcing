/**
 * Tests Vitest — Server Actions `actions.ts` (PR n°5).
 *
 * Couvre les 3 actions `selectTenderAction`, `deferTenderAction`,
 * `rejectTenderAction` :
 *  - happy paths (return `{ ok: true }`, side effects vérifiés)
 *  - auth fail (`not_authenticated`, `forbidden_domain`)
 *  - input invalide (UUID HS, mode HS, hoursOffset négatif, reason > 280)
 *  - état métier (tender introuvable, status != sourced)
 *  - audit log appelé avec le bon code et payload conforme aux schémas Zod
 *
 * Stratégie de mock :
 *  - Supabase auth → `AuthClientLike` minimal injecté via deps
 *  - Drizzle → `FakeDb` qui implémente `.transaction(cb)` en appelant cb
 *    sur un `tx` qui retourne nos snapshots préenregistrés
 *  - `audit` → spy via `vi.fn()` qui re-valide le payload contre les
 *    schémas Zod (garde-fou contre régression spec)
 *  - `revalidatePath` → mocké au niveau `next/cache` pour éviter l'erreur
 *    « revalidatePath must be invoked from a Server Action »
 */

import type { User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AUDIT_SCHEMAS } from "@/lib/audit/schemas";

import type { AuthClientLike, DrizzleClient } from "./actions";
import { deferTenderAction, rejectTenderAction, selectTenderAction } from "./actions";

// ----------------------------------------------------------------------------
// Mocks globaux
// ----------------------------------------------------------------------------

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// On mocke @/lib/supabase/server pour éviter qu'il essaie de lire
// les cookies Next.js hors contexte request (tests vitest = node pur).
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: null } }),
    },
  }),
  createSupabaseAdminClient: () => ({
    from: () => ({ insert: async () => ({ error: null }) }),
  }),
}));

// ----------------------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------------------

const VALID_TENDER_ID = "11111111-1111-1111-1111-111111111111";
const ALYOS_EMAIL = "alex@alyosingenierie.fr";
const OUT_OF_DOMAIN_EMAIL = "outsider@gmail.com";

/**
 * Type explicite du snapshot — aligné sur `TenderSnapshot` interne actions.ts.
 * Permet `score: null` dans les fixtures sans inférence string.
 */
interface FakeTenderSnapshot {
  status: string;
  score: string | null;
  externalRef: string;
}

const SOURCED_SNAPSHOT: FakeTenderSnapshot = {
  status: "sourced",
  score: "87.00",
  externalRef: "25-AO-00142",
};

const SELECTED_SNAPSHOT: FakeTenderSnapshot = {
  status: "selected_solo",
  score: "87.00",
  externalRef: "25-AO-00142",
};

const SOURCED_SNAPSHOT_NO_SCORE: FakeTenderSnapshot = {
  status: "sourced",
  score: null,
  externalRef: "25-AO-00143",
};

// ----------------------------------------------------------------------------
// Fake auth client builder
// ----------------------------------------------------------------------------

function fakeAuthClient(user: User | null): AuthClientLike {
  return {
    auth: {
      getUser: async () => ({ data: { user } }),
    },
  };
}

function alyosUser(): User {
  // Construction minimale d'un User Supabase. Le helper toUserProfile()
  // ne lit que `email`, `id`, et `user_metadata` côté types.ts.
  return {
    id: "user-1",
    email: ALYOS_EMAIL,
    user_metadata: { role: "user" },
    app_metadata: { organization_id: "org-1", role: "user" },
    aud: "authenticated",
    created_at: "2026-05-21T00:00:00Z",
  } as unknown as User;
}

function outOfDomainUser(): User {
  return {
    id: "user-2",
    email: OUT_OF_DOMAIN_EMAIL,
    user_metadata: {},
    app_metadata: {},
    aud: "authenticated",
    created_at: "2026-05-21T00:00:00Z",
  } as unknown as User;
}

// ----------------------------------------------------------------------------
// Fake Drizzle client builder
// ----------------------------------------------------------------------------

interface FakeDbConfig {
  /** Snapshot retourné par le SELECT FOR UPDATE (null = tender introuvable) */
  snapshot: FakeTenderSnapshot | null;
  /**
   * Valeur ISO retournée par le RETURNING du UPDATE (pour deferTenderAction).
   * Défaut : 2026-05-22T06:30:00.000Z (now + 24h fictif).
   */
  deferredUntilIso?: string;
  /**
   * Si vrai, on simule un throw Drizzle pendant le SELECT (cas internal_error).
   */
  throwOnSelect?: boolean;
}

interface FakeDbCapture {
  updates: Array<{ set: Record<string, unknown>; where: unknown }>;
  inserts: Array<{ table: string; values: Record<string, unknown> }>;
}

function buildFakeDb(config: FakeDbConfig): {
  db: DrizzleClient;
  capture: FakeDbCapture;
} {
  const capture: FakeDbCapture = { updates: [], inserts: [] };
  const deferredUntilIso = config.deferredUntilIso ?? "2026-05-22T06:30:00.000Z";

  // SELECT chain: tx.select({...}).from(tenders).where(...).for("update").limit(1)
  function buildSelectChain() {
    if (config.throwOnSelect) {
      return {
        from: () => {
          throw new Error("DB SELECT boom");
        },
      };
    }
    return {
      from: () => ({
        where: () => ({
          for: () => ({
            limit: async () => (config.snapshot ? [config.snapshot] : []),
          }),
        }),
      }),
    };
  }

  // UPDATE chain: tx.update(tenders).set({...}).where(...).returning({...})?
  function buildUpdateChain() {
    return () => ({
      set: (setObj: Record<string, unknown>) => ({
        where: (whereExpr: unknown) => {
          capture.updates.push({ set: setObj, where: whereExpr });
          return {
            // Cas defer (avec returning)
            returning: async () => [{ deferredUntil: new Date(deferredUntilIso) }],
            // Cas select/reject (sans returning) — on retourne une promise resolved
            then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(onFulfilled([])),
          };
        },
      }),
    });
  }

  function buildInsertChain() {
    return () => ({
      values: async (values: Record<string, unknown>) => {
        capture.inserts.push({ table: "tender_events", values });
      },
    });
  }

  // Transaction : on fournit un tx avec select/update/insert
  const fakeTx = {
    select: () => buildSelectChain(),
    update: buildUpdateChain(),
    insert: buildInsertChain(),
  };

  const fakeDb = {
    transaction: async <T>(cb: (tx: typeof fakeTx) => Promise<T>): Promise<T> => {
      return cb(fakeTx);
    },
  };

  return { db: fakeDb as unknown as DrizzleClient, capture };
}

// ----------------------------------------------------------------------------
// Helpers tests
// ----------------------------------------------------------------------------

function makeAuditSpy() {
  return vi.fn(async (params: { action: string; data: Record<string, unknown> }) => {
    // Garde-fou : valide le payload contre le schéma Zod registré. Si on
    // change le schéma sans mettre à jour le call-site, ce test pète.
    const schema = AUDIT_SCHEMAS[params.action as keyof typeof AUDIT_SCHEMAS];
    if (!schema) throw new Error(`Pas de schéma Zod pour action=${params.action}`);
    const parsed = schema.safeParse(params.data);
    if (!parsed.success) {
      throw new Error(
        `Payload audit invalide pour ${params.action} : ${JSON.stringify(parsed.error.issues)}`,
      );
    }
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================================
// selectTenderAction
// ============================================================================

describe("selectTenderAction", () => {
  it("happy path solo : retourne ok + UPDATE + audit + revalidate", async () => {
    const { db, capture } = buildFakeDb({ snapshot: SOURCED_SNAPSHOT });
    const auditFn = makeAuditSpy();

    const result = await selectTenderAction(VALID_TENDER_ID, "solo", {
      db,
      authClient: fakeAuthClient(alyosUser()),
      auditFn,
    });

    expect(result).toEqual({ ok: true });
    expect(capture.updates).toHaveLength(1);
    expect(capture.updates[0]?.set.status).toBe("selected_solo");
    expect(capture.updates[0]?.set.deferredUntil).toBeNull();
    expect(capture.inserts).toHaveLength(1);
    expect(capture.inserts[0]?.values.eventType).toBe("selected");
    expect(auditFn).toHaveBeenCalledTimes(1);
    expect(auditFn).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "tender_select",
        subjectId: VALID_TENDER_ID,
        data: expect.objectContaining({
          tender_id: VALID_TENDER_ID,
          tender_ref: SOURCED_SNAPSHOT.externalRef,
          mode: "solo",
          score: 87,
        }),
      }),
    );
  });

  it("happy path tandem : status = selected_tandem", async () => {
    const { db, capture } = buildFakeDb({ snapshot: SOURCED_SNAPSHOT });
    const auditFn = makeAuditSpy();

    const result = await selectTenderAction(VALID_TENDER_ID, "tandem", {
      db,
      authClient: fakeAuthClient(alyosUser()),
      auditFn,
    });

    expect(result).toEqual({ ok: true });
    expect(capture.updates[0]?.set.status).toBe("selected_tandem");
    expect(auditFn).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ mode: "tandem" }),
      }),
    );
  });

  it("retourne not_authenticated si pas de user", async () => {
    const { db } = buildFakeDb({ snapshot: SOURCED_SNAPSHOT });
    const result = await selectTenderAction(VALID_TENDER_ID, "solo", {
      db,
      authClient: fakeAuthClient(null),
      auditFn: makeAuditSpy(),
    });
    expect(result).toEqual({ ok: false, error: "not_authenticated" });
  });

  it("retourne forbidden_domain si email hors @alyosingenierie.fr", async () => {
    const { db } = buildFakeDb({ snapshot: SOURCED_SNAPSHOT });
    const result = await selectTenderAction(VALID_TENDER_ID, "solo", {
      db,
      authClient: fakeAuthClient(outOfDomainUser()),
      auditFn: makeAuditSpy(),
    });
    expect(result).toEqual({ ok: false, error: "forbidden_domain" });
  });

  it("retourne invalid_input si tenderId pas UUID", async () => {
    const { db } = buildFakeDb({ snapshot: SOURCED_SNAPSHOT });
    const result = await selectTenderAction("not-a-uuid", "solo", {
      db,
      authClient: fakeAuthClient(alyosUser()),
      auditFn: makeAuditSpy(),
    });
    expect(result).toEqual({ ok: false, error: "invalid_input" });
  });

  it("retourne invalid_input si mode HS", async () => {
    const { db } = buildFakeDb({ snapshot: SOURCED_SNAPSHOT });
    const result = await selectTenderAction(VALID_TENDER_ID, "studio" as unknown as "solo", {
      db,
      authClient: fakeAuthClient(alyosUser()),
      auditFn: makeAuditSpy(),
    });
    expect(result).toEqual({ ok: false, error: "invalid_input" });
  });

  it("retourne tender_not_found si SELECT vide", async () => {
    const { db } = buildFakeDb({ snapshot: null });
    const result = await selectTenderAction(VALID_TENDER_ID, "solo", {
      db,
      authClient: fakeAuthClient(alyosUser()),
      auditFn: makeAuditSpy(),
    });
    expect(result).toEqual({ ok: false, error: "tender_not_found" });
  });

  it("retourne invalid_state si tender pas en sourced", async () => {
    const { db } = buildFakeDb({ snapshot: SELECTED_SNAPSHOT });
    const result = await selectTenderAction(VALID_TENDER_ID, "solo", {
      db,
      authClient: fakeAuthClient(alyosUser()),
      auditFn: makeAuditSpy(),
    });
    expect(result).toEqual({ ok: false, error: "invalid_state" });
  });

  it("retourne internal_error si Drizzle throw", async () => {
    const { db } = buildFakeDb({ snapshot: SOURCED_SNAPSHOT, throwOnSelect: true });
    // Silence console.error pour ne pas polluer la sortie test
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await selectTenderAction(VALID_TENDER_ID, "solo", {
      db,
      authClient: fakeAuthClient(alyosUser()),
      auditFn: makeAuditSpy(),
    });
    expect(result).toEqual({ ok: false, error: "internal_error" });
    spy.mockRestore();
  });

  it("score absent : payload audit score=0 (fallback)", async () => {
    const { db } = buildFakeDb({ snapshot: SOURCED_SNAPSHOT_NO_SCORE });
    const auditFn = makeAuditSpy();
    const result = await selectTenderAction(VALID_TENDER_ID, "solo", {
      db,
      authClient: fakeAuthClient(alyosUser()),
      auditFn,
    });
    expect(result).toEqual({ ok: true });
    expect(auditFn).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ score: 0 }),
      }),
    );
  });
});

// ============================================================================
// deferTenderAction
// ============================================================================

describe("deferTenderAction", () => {
  it("happy path 24h : UPDATE deferred_until + event deferred + audit A14", async () => {
    const { db, capture } = buildFakeDb({ snapshot: SOURCED_SNAPSHOT });
    const auditFn = makeAuditSpy();

    const result = await deferTenderAction(VALID_TENDER_ID, 24, {
      db,
      authClient: fakeAuthClient(alyosUser()),
      auditFn,
    });

    expect(result).toEqual({ ok: true });
    expect(capture.updates).toHaveLength(1);
    expect(capture.updates[0]?.set.deferredUntil).toBeDefined();
    expect(capture.inserts[0]?.values.eventType).toBe("deferred");
    expect(auditFn).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "tender_defer",
        data: expect.objectContaining({
          tender_id: VALID_TENDER_ID,
          tender_ref: SOURCED_SNAPSHOT.externalRef,
          hours_offset: 24,
        }),
      }),
    );
  });

  /**
   * Shortcuts UI « Reporter » (Addendum spec 2026-05-24 §Exigence 1) :
   *  +1 jour → 24h, +3 jours → 72h, +7 jours → 168h.
   *
   * On boucle sur les 3 mappings UI → server pour verrouiller :
   *   (a) la propagation correcte du `hoursOffset` dans l'audit payload,
   *   (b) la cohérence event.data.extra.hours_offset (tender_events).
   *
   * Toute régression du contrat (ex. cap silencieux à 24h, off-by-one) fera
   * péter ce test. Le `deferred_until` calculé côté Postgres n'est pas
   * testable ici (mock) — on vérifie juste que la valeur est posée non-nulle.
   */
  it.each([
    { label: "+1 jour", hours: 24 },
    { label: "+3 jours", hours: 72 },
    { label: "+7 jours", hours: 168 },
  ])("shortcut $label ($hours h) propage hoursOffset correct", async ({ hours }) => {
    const { db, capture } = buildFakeDb({ snapshot: SOURCED_SNAPSHOT });
    const auditFn = makeAuditSpy();

    const result = await deferTenderAction(VALID_TENDER_ID, hours, {
      db,
      authClient: fakeAuthClient(alyosUser()),
      auditFn,
    });

    expect(result).toEqual({ ok: true });

    // (a) audit log A14 : hours_offset correct
    expect(auditFn).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "tender_defer",
        data: expect.objectContaining({ hours_offset: hours }),
      }),
    );

    // (b) tender_events.data.extra.hours_offset correct
    const insertedEvent = capture.inserts[0]?.values as {
      data?: { extra?: { hours_offset?: number } };
    };
    expect(insertedEvent.data?.extra?.hours_offset).toBe(hours);
  });

  it("retourne invalid_input si hoursOffset négatif", async () => {
    const { db } = buildFakeDb({ snapshot: SOURCED_SNAPSHOT });
    const result = await deferTenderAction(VALID_TENDER_ID, -1, {
      db,
      authClient: fakeAuthClient(alyosUser()),
      auditFn: makeAuditSpy(),
    });
    expect(result).toEqual({ ok: false, error: "invalid_input" });
  });

  it("retourne invalid_input si hoursOffset zéro", async () => {
    const { db } = buildFakeDb({ snapshot: SOURCED_SNAPSHOT });
    const result = await deferTenderAction(VALID_TENDER_ID, 0, {
      db,
      authClient: fakeAuthClient(alyosUser()),
      auditFn: makeAuditSpy(),
    });
    expect(result).toEqual({ ok: false, error: "invalid_input" });
  });

  it("retourne invalid_input si hoursOffset non-entier", async () => {
    const { db } = buildFakeDb({ snapshot: SOURCED_SNAPSHOT });
    const result = await deferTenderAction(VALID_TENDER_ID, 24.5, {
      db,
      authClient: fakeAuthClient(alyosUser()),
      auditFn: makeAuditSpy(),
    });
    expect(result).toEqual({ ok: false, error: "invalid_input" });
  });

  it("retourne invalid_state si tender déjà sélectionné", async () => {
    const { db } = buildFakeDb({ snapshot: SELECTED_SNAPSHOT });
    const result = await deferTenderAction(VALID_TENDER_ID, 24, {
      db,
      authClient: fakeAuthClient(alyosUser()),
      auditFn: makeAuditSpy(),
    });
    expect(result).toEqual({ ok: false, error: "invalid_state" });
  });

  it("retourne tender_not_found si SELECT vide", async () => {
    const { db } = buildFakeDb({ snapshot: null });
    const result = await deferTenderAction(VALID_TENDER_ID, 24, {
      db,
      authClient: fakeAuthClient(alyosUser()),
      auditFn: makeAuditSpy(),
    });
    expect(result).toEqual({ ok: false, error: "tender_not_found" });
  });

  it("retourne not_authenticated sans session", async () => {
    const { db } = buildFakeDb({ snapshot: SOURCED_SNAPSHOT });
    const result = await deferTenderAction(VALID_TENDER_ID, 24, {
      db,
      authClient: fakeAuthClient(null),
      auditFn: makeAuditSpy(),
    });
    expect(result).toEqual({ ok: false, error: "not_authenticated" });
  });
});

// ============================================================================
// rejectTenderAction
// ============================================================================

describe("rejectTenderAction", () => {
  it("happy path avec motif : status=dropped + event rejected + audit A15", async () => {
    const { db, capture } = buildFakeDb({ snapshot: SOURCED_SNAPSHOT });
    const auditFn = makeAuditSpy();
    const reason = "Hors zone géo";

    const result = await rejectTenderAction(VALID_TENDER_ID, reason, {
      db,
      authClient: fakeAuthClient(alyosUser()),
      auditFn,
    });

    expect(result).toEqual({ ok: true });
    expect(capture.updates[0]?.set.status).toBe("dropped");
    expect(capture.inserts[0]?.values.eventType).toBe("rejected");
    expect(auditFn).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "tender_reject",
        data: expect.objectContaining({
          tender_id: VALID_TENDER_ID,
          tender_ref: SOURCED_SNAPSHOT.externalRef,
          reason,
          score_at_reject: 87,
        }),
      }),
    );
  });

  it("happy path sans motif (reason=null)", async () => {
    const { db } = buildFakeDb({ snapshot: SOURCED_SNAPSHOT });
    const auditFn = makeAuditSpy();

    const result = await rejectTenderAction(VALID_TENDER_ID, null, {
      db,
      authClient: fakeAuthClient(alyosUser()),
      auditFn,
    });

    expect(result).toEqual({ ok: true });
    expect(auditFn).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reason: null }),
      }),
    );
  });

  it("retourne invalid_input si reason > 280 caractères", async () => {
    const { db } = buildFakeDb({ snapshot: SOURCED_SNAPSHOT });
    const result = await rejectTenderAction(VALID_TENDER_ID, "x".repeat(281), {
      db,
      authClient: fakeAuthClient(alyosUser()),
      auditFn: makeAuditSpy(),
    });
    expect(result).toEqual({ ok: false, error: "invalid_input" });
  });

  it("accepte reason exactement 280 caractères (borne incluse)", async () => {
    const { db } = buildFakeDb({ snapshot: SOURCED_SNAPSHOT });
    const result = await rejectTenderAction(VALID_TENDER_ID, "x".repeat(280), {
      db,
      authClient: fakeAuthClient(alyosUser()),
      auditFn: makeAuditSpy(),
    });
    expect(result).toEqual({ ok: true });
  });

  it("score absent : payload audit score_at_reject=null", async () => {
    const { db } = buildFakeDb({ snapshot: SOURCED_SNAPSHOT_NO_SCORE });
    const auditFn = makeAuditSpy();
    const result = await rejectTenderAction(VALID_TENDER_ID, null, {
      db,
      authClient: fakeAuthClient(alyosUser()),
      auditFn,
    });
    expect(result).toEqual({ ok: true });
    expect(auditFn).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ score_at_reject: null }),
      }),
    );
  });

  it("retourne invalid_state si tender déjà traité", async () => {
    const { db } = buildFakeDb({ snapshot: SELECTED_SNAPSHOT });
    const result = await rejectTenderAction(VALID_TENDER_ID, "motif", {
      db,
      authClient: fakeAuthClient(alyosUser()),
      auditFn: makeAuditSpy(),
    });
    expect(result).toEqual({ ok: false, error: "invalid_state" });
  });

  it("retourne not_authenticated sans session", async () => {
    const { db } = buildFakeDb({ snapshot: SOURCED_SNAPSHOT });
    const result = await rejectTenderAction(VALID_TENDER_ID, null, {
      db,
      authClient: fakeAuthClient(null),
      auditFn: makeAuditSpy(),
    });
    expect(result).toEqual({ ok: false, error: "not_authenticated" });
  });
});
