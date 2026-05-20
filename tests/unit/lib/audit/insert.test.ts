import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests — helper `insertAuditLog` (cf. `src/lib/audit/insert.ts`).
 *
 * On mock `@/db/client` au niveau module pour intercepter les chaînes
 * Drizzle `db.select(...).from(...).where(...).limit(...)` et
 * `db.insert(...).values(...)`. L'objectif n'est PAS de tester Drizzle
 * lui-même mais de vérifier les 4 invariants documentés dans la JSDoc
 * du helper : audit ≠ correctness, snapshot acteur, IP/UA extraits,
 * skip silencieux si pas de membership.
 */

const insertSpy = vi.fn((_payload: Record<string, unknown>) => Promise.resolve());

const membershipResultRef: { value: Array<{ organizationId: string }> } = { value: [] };
const insertThrowsRef: { value: boolean } = { value: false };

vi.mock("@/db/client", () => {
  const buildSelectChain = () => ({
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(membershipResultRef.value),
      }),
    }),
  });

  return {
    db: {
      select: () => buildSelectChain(),
      insert: () => ({
        values: (payload: Record<string, unknown>) => {
          if (insertThrowsRef.value) {
            return Promise.reject(new Error("postgres connection refused"));
          }
          insertSpy(payload);
          return Promise.resolve();
        },
      }),
    },
  };
});

vi.mock("@/db/schema", () => ({
  auditLogs: { __table: "audit_logs" },
  memberships: { userId: { __col: "user_id" }, organizationId: { __col: "organization_id" } },
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ __eq: [col, val] }),
}));

// Import APRÈS les vi.mock — sinon le module original est résolu en premier.
const { insertAuditLog } = await import("@/lib/audit/insert");

const baseActor = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "admin@alyosingenierie.fr",
  role: "admin" as const,
  mustChangePassword: false,
  provisionalPasswordExpiresAt: null,
  firstName: "Admin",
  lastName: "AlyoS",
};

function makeReq(headers: Record<string, string>) {
  return {
    headers: {
      get: (k: string) => headers[k.toLowerCase()] ?? null,
    },
  } as unknown as Parameters<typeof insertAuditLog>[0]["req"];
}

describe("insertAuditLog", () => {
  beforeEach(() => {
    insertSpy.mockClear();
    membershipResultRef.value = [{ organizationId: "22222222-2222-2222-2222-222222222222" }];
    insertThrowsRef.value = false;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("insère le log avec snapshot acteur + IP + UA quand le caller a une membership", async () => {
    await insertAuditLog({
      req: makeReq({
        "x-forwarded-for": "203.0.113.42, 70.41.3.18",
        "user-agent": "Mozilla/5.0 (Macintosh)",
      }),
      action: "membership_change",
      actor: baseActor,
      subject: { type: "user", id: "33333333-3333-3333-3333-333333333333" },
      data: {
        target_user_id: "33333333-3333-3333-3333-333333333333",
        target_email: "newbie@alyosingenierie.fr",
        to_role: "user",
        operation: "invite",
      },
    });

    expect(insertSpy).toHaveBeenCalledTimes(1);
    const payload = insertSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      organizationId: "22222222-2222-2222-2222-222222222222",
      actorId: baseActor.id,
      actorEmail: baseActor.email,
      actorRole: "admin",
      action: "membership_change",
      subjectType: "user",
      subjectId: "33333333-3333-3333-3333-333333333333",
      ipAddress: "203.0.113.42",
      userAgent: "Mozilla/5.0 (Macintosh)",
    });
  });

  it("normalise IP/UA à null quand les headers sont absents", async () => {
    await insertAuditLog({
      req: makeReq({}),
      action: "membership_change",
      actor: baseActor,
      data: {
        target_user_id: "33333333-3333-3333-3333-333333333333",
        target_email: "x@alyosingenierie.fr",
        operation: "regenerate_provisional",
      },
    });

    const payload = insertSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.ipAddress).toBeNull();
    expect(payload.userAgent).toBeNull();
  });

  it("skip silencieusement (warn, pas d'INSERT) quand pas de membership", async () => {
    membershipResultRef.value = [];
    const warnSpy = vi.spyOn(console, "warn");

    await insertAuditLog({
      req: makeReq({}),
      action: "login",
      actor: baseActor,
      data: { method: "email_password", success: true },
    });

    expect(insertSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      "[audit_log:no_membership]",
      expect.objectContaining({ actor_id: baseActor.id, action: "login" }),
    );
  });

  it("ne throw JAMAIS si l'INSERT échoue — log error et continue", async () => {
    insertThrowsRef.value = true;
    const errorSpy = vi.spyOn(console, "error");

    await expect(
      insertAuditLog({
        req: makeReq({}),
        action: "membership_change",
        actor: baseActor,
        data: {
          target_user_id: "33333333-3333-3333-3333-333333333333",
          target_email: "x@alyosingenierie.fr",
          operation: "invite",
        },
      }),
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      "[audit_log:insert:fail]",
      expect.objectContaining({
        action: "membership_change",
        actor_id: baseActor.id,
      }),
    );
  });

  it("subject est optionnel — null en BDD si non fourni", async () => {
    await insertAuditLog({
      req: makeReq({}),
      action: "login",
      actor: baseActor,
      data: { method: "email_password", success: true },
    });

    const payload = insertSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.subjectType).toBeNull();
    expect(payload.subjectId).toBeNull();
  });
});
