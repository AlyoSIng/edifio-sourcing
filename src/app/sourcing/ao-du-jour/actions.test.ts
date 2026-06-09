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

// Phase A multi-tenant : getRequiredOrgId fait un SELECT sur memberships.
// En tests (pas de DATABASE_URL), on retourne ALYOS_ORG_ID directement.
vi.mock("@/lib/auth/get-required-org-id", () => ({
  getRequiredOrgId: async () => "11111111-1111-1111-1111-111111111111",
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
// ADR-014 (2026-06-05) — OUT_OF_DOMAIN_EMAIL et outOfDomainUser() supprimés :
// la garde `isAuthorizedEmail` est levée (ouverture multi-tenant).

/**
 * Type explicite du snapshot — aligné sur `TenderSnapshot` interne actions.ts.
 * Permet `score: null` dans les fixtures sans inférence string.
 *
 * Salve U : enrichi avec buyer / cpv / department / amount pour le payload
 * `learning_events` (snapshot du tender au moment de l'écartement).
 */
interface FakeTenderSnapshot {
  status: string;
  score: string | null;
  externalRef: string;
  buyer: string;
  cpv: string[];
  department: string | null;
  amount: string | null;
}

const SOURCED_SNAPSHOT: FakeTenderSnapshot = {
  status: "sourced",
  score: "87.00",
  externalRef: "25-AO-00142",
  buyer: "Ville de Marseille",
  cpv: ["45000000"],
  department: "13",
  amount: "850000.00",
};

const SELECTED_SNAPSHOT: FakeTenderSnapshot = {
  status: "selected_solo",
  score: "87.00",
  externalRef: "25-AO-00142",
  buyer: "Ville de Marseille",
  cpv: ["45000000"],
  department: "13",
  amount: "850000.00",
};

const SOURCED_SNAPSHOT_NO_SCORE: FakeTenderSnapshot = {
  status: "sourced",
  score: null,
  externalRef: "25-AO-00143",
  buyer: "Ville de Nice",
  cpv: [],
  department: "06",
  amount: null,
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

  // Insert chain : on capture les `values`. L'ordre d'insertion est stable et
  // suffit à distinguer tender_events (intra-TX, 1er) de learning_events
  // (post-commit, 2e) dans les assertions reject.
  function buildInsertChain(label: string) {
    return () => ({
      values: async (values: Record<string, unknown>) => {
        capture.inserts.push({ table: label, values });
      },
    });
  }

  // Transaction : on fournit un tx avec select/update/insert (tender_events).
  const fakeTx = {
    select: () => buildSelectChain(),
    update: buildUpdateChain(),
    insert: buildInsertChain("tender_events"),
  };

  const fakeDb = {
    transaction: async <T>(cb: (tx: typeof fakeTx) => Promise<T>): Promise<T> => {
      return cb(fakeTx);
    },
    // Salve U : rejectTenderAction insère learning_events POST-commit, donc
    // hors transaction (dbInstance.insert directement). On capture aussi.
    insert: buildInsertChain("learning_events"),
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

  // ADR-014 (2026-06-05) — garde domaine `isAuthorizedEmail` retirée :
  // ouverture multi-tenant (PROTECT + orgs futures). Le test
  // `forbidden_domain` est supprimé. La garde tenant reste assurée par
  // `getRequiredOrgId` + RLS BDD (testée séparément côté pgTAP).

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

  /**
   * Whitelist stricte `{24, 72, 168}` (décision Board 2026-05-24 « +1/+3/+7 j
   * stricte », revue Hugo MEDIUM-1).
   *
   * On boucle sur toutes les valeurs hors-whitelist plausibles (entier hors
   * set, négatif, zéro, non-entier, NaN, Infinity, string, null, undefined)
   * et on vérifie :
   *   (a) retour `{ ok: false, error: "invalid_input" }`
   *   (b) AUCUNE mutation BDD (UPDATE / INSERT)
   *   (c) AUCUN audit log inséré (`auditFn` non appelé)
   *
   * → Garde-fou contre régression silencieuse : si quelqu'un assouplit la
   *   validation côté server, ce test pète immédiatement.
   */
  it.each([
    { label: "entier hors set (48)", value: 48 },
    { label: "entier hors set (720)", value: 720 },
    { label: "entier hors set (87600 = 10 ans)", value: 87600 },
    { label: "entier hors set (Number.MAX_SAFE_INTEGER)", value: Number.MAX_SAFE_INTEGER },
    { label: "négatif (-24)", value: -24 },
    { label: "zéro (0)", value: 0 },
    { label: "non-entier (24.5)", value: 24.5 },
    { label: "NaN", value: Number.NaN },
    { label: "+Infinity", value: Number.POSITIVE_INFINITY },
    { label: "-Infinity", value: Number.NEGATIVE_INFINITY },
    { label: 'string ("24")', value: "24" as unknown as number },
    { label: "null", value: null as unknown as number },
    { label: "undefined", value: undefined as unknown as number },
    { label: "objet", value: {} as unknown as number },
  ])("rejette hoursOffset hors whitelist : $label", async ({ value }) => {
    const { db, capture } = buildFakeDb({ snapshot: SOURCED_SNAPSHOT });
    const auditFn = makeAuditSpy();

    const result = await deferTenderAction(VALID_TENDER_ID, value, {
      db,
      authClient: fakeAuthClient(alyosUser()),
      auditFn,
    });

    // (a) erreur métier correcte
    expect(result).toEqual({ ok: false, error: "invalid_input" });

    // (b) aucune mutation BDD (transaction non démarrée)
    expect(capture.updates).toHaveLength(0);
    expect(capture.inserts).toHaveLength(0);

    // (c) aucun audit log (le helper audit n'est appelé qu'après commit)
    expect(auditFn).not.toHaveBeenCalled();
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
  it("happy path motif actionnable : status=dropped + event rejected + learning_events + audit A15", async () => {
    const { db, capture } = buildFakeDb({ snapshot: SOURCED_SNAPSHOT });
    const auditFn = makeAuditSpy();
    const verbatim = "Trop loin de nos équipes";

    const result = await rejectTenderAction(VALID_TENDER_ID, "out_of_area", verbatim, {
      db,
      authClient: fakeAuthClient(alyosUser()),
      auditFn,
    });

    expect(result).toEqual({ ok: true });
    expect(capture.updates[0]?.set.status).toBe("dropped");

    // 1er insert (intra-TX) = tender_events
    const tenderEvent = capture.inserts.find((i) => i.table === "tender_events");
    expect(tenderEvent?.values.eventType).toBe("rejected");
    expect(
      (tenderEvent?.values.data as { extra?: { reason_code?: string } }).extra?.reason_code,
    ).toBe("out_of_area");

    // 2e insert (post-commit) = learning_events avec reasonCode + payload snapshot
    const learningEvent = capture.inserts.find((i) => i.table === "learning_events");
    expect(learningEvent).toBeDefined();
    expect(learningEvent?.values.eventType).toBe("rejected");
    expect(learningEvent?.values.reasonCode).toBe("out_of_area");
    expect(learningEvent?.values.verbatim).toBe(verbatim);
    expect(learningEvent?.values.payload).toEqual({
      buyer: SOURCED_SNAPSHOT.buyer,
      cpv_codes: SOURCED_SNAPSHOT.cpv,
      geo_zone: SOURCED_SNAPSHOT.department,
      amount: 850000,
    });

    // audit A15 : `reason` porte le verbatim libre (schéma inchangé)
    expect(auditFn).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "tender_reject",
        data: expect.objectContaining({
          tender_id: VALID_TENDER_ID,
          tender_ref: SOURCED_SNAPSHOT.externalRef,
          reason: verbatim,
          score_at_reject: 87,
        }),
      }),
    );
  });

  it("happy path sans verbatim (verbatim=null) : learning_events verbatim=null", async () => {
    const { db, capture } = buildFakeDb({ snapshot: SOURCED_SNAPSHOT });
    const auditFn = makeAuditSpy();

    const result = await rejectTenderAction(VALID_TENDER_ID, "too_competitive", null, {
      db,
      authClient: fakeAuthClient(alyosUser()),
      auditFn,
    });

    expect(result).toEqual({ ok: true });
    const learningEvent = capture.inserts.find((i) => i.table === "learning_events");
    expect(learningEvent?.values.reasonCode).toBe("too_competitive");
    expect(learningEvent?.values.verbatim).toBeNull();
    expect(auditFn).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reason: null }),
      }),
    );
  });

  it("reasonCode invalide → fallback 'other' (rétrocompat, pas d'échec)", async () => {
    const { db, capture } = buildFakeDb({ snapshot: SOURCED_SNAPSHOT });
    const result = await rejectTenderAction(
      VALID_TENDER_ID,
      "garbage" as unknown as "other",
      null,
      {
        db,
        authClient: fakeAuthClient(alyosUser()),
        auditFn: makeAuditSpy(),
      },
    );
    expect(result).toEqual({ ok: true });
    const learningEvent = capture.inserts.find((i) => i.table === "learning_events");
    expect(learningEvent?.values.reasonCode).toBe("other");
  });

  it("retourne invalid_input si verbatim > 280 caractères", async () => {
    const { db } = buildFakeDb({ snapshot: SOURCED_SNAPSHOT });
    const result = await rejectTenderAction(VALID_TENDER_ID, "out_of_area", "x".repeat(281), {
      db,
      authClient: fakeAuthClient(alyosUser()),
      auditFn: makeAuditSpy(),
    });
    expect(result).toEqual({ ok: false, error: "invalid_input" });
  });

  it("accepte verbatim exactement 280 caractères (borne incluse)", async () => {
    const { db } = buildFakeDb({ snapshot: SOURCED_SNAPSHOT });
    const result = await rejectTenderAction(VALID_TENDER_ID, "out_of_scope", "x".repeat(280), {
      db,
      authClient: fakeAuthClient(alyosUser()),
      auditFn: makeAuditSpy(),
    });
    expect(result).toEqual({ ok: true });
  });

  it("score absent : payload audit score_at_reject=null + payload amount=null", async () => {
    const { db, capture } = buildFakeDb({ snapshot: SOURCED_SNAPSHOT_NO_SCORE });
    const auditFn = makeAuditSpy();
    const result = await rejectTenderAction(VALID_TENDER_ID, "budget_too_low", null, {
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
    const learningEvent = capture.inserts.find((i) => i.table === "learning_events");
    expect((learningEvent?.values.payload as { amount: number | null }).amount).toBeNull();
  });

  it("écriture learning_events best-effort : un échec n'empêche pas le rejet", async () => {
    const { db, capture } = buildFakeDb({ snapshot: SOURCED_SNAPSHOT });
    // On surcharge l'insert top-level (learning_events) pour qu'il throw.
    (db as unknown as { insert: () => unknown }).insert = () => ({
      values: async () => {
        throw new Error("learning insert boom");
      },
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await rejectTenderAction(VALID_TENDER_ID, "out_of_area", null, {
      db,
      authClient: fakeAuthClient(alyosUser()),
      auditFn: makeAuditSpy(),
    });

    // Le rejet réussit malgré l'échec de l'insert learning_events.
    expect(result).toEqual({ ok: true });
    expect(capture.updates[0]?.set.status).toBe("dropped");
    spy.mockRestore();
  });

  it("retourne invalid_state si tender déjà traité", async () => {
    const { db } = buildFakeDb({ snapshot: SELECTED_SNAPSHOT });
    const result = await rejectTenderAction(VALID_TENDER_ID, "out_of_area", "motif", {
      db,
      authClient: fakeAuthClient(alyosUser()),
      auditFn: makeAuditSpy(),
    });
    expect(result).toEqual({ ok: false, error: "invalid_state" });
  });

  it("retourne not_authenticated sans session", async () => {
    const { db } = buildFakeDb({ snapshot: SOURCED_SNAPSHOT });
    const result = await rejectTenderAction(VALID_TENDER_ID, "out_of_area", null, {
      db,
      authClient: fakeAuthClient(null),
      auditFn: makeAuditSpy(),
    });
    expect(result).toEqual({ ok: false, error: "not_authenticated" });
  });
});
