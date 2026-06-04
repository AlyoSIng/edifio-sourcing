/**
 * Tests withCronRunLog (chantier I4 — Steve 2026-06-04).
 *
 * On mocke un Drizzle minimal (insert + update fluent API) pour vérifier
 * que :
 *  - INSERT 'running' au début (status: 'running')
 *  - UPDATE avec status: 'ok' + payload + duration_ms quand le runner réussit
 *  - UPDATE avec status: 'error' + error_message + error_stack quand le runner throw
 *  - Si le runner throw, withCronRunLog renvoie { ok: false, error } sans propager
 *  - Si l'INSERT initial rate, le runner s'exécute quand même
 */

import { describe, expect, it, vi } from "vitest";

import { withCronRunLog } from "./log-cron-run";

interface InsertRecord {
  values: Record<string, unknown>;
  returnedId: string;
}

interface UpdateRecord {
  set: Record<string, unknown>;
}

/**
 * Fake Drizzle client minimal. Supporte les 2 chemins utilisés :
 *  - db.insert(table).values(...).returning(...) → renvoie [{ id }]
 *  - db.update(table).set(...).where(...) → renvoie undefined
 */
function makeFakeDb(opts: { insertReturnsId?: string; insertThrows?: boolean } = {}) {
  const inserts: InsertRecord[] = [];
  const updates: UpdateRecord[] = [];
  const returnedId = opts.insertReturnsId ?? "fake-uuid-1";

  const db = {
    insert: vi.fn(() => ({
      values: (vals: Record<string, unknown>) => ({
        returning: () => {
          if (opts.insertThrows) {
            throw new Error("simulated INSERT failure");
          }
          inserts.push({ values: vals, returnedId });
          return Promise.resolve([{ id: returnedId }]);
        },
      }),
    })),
    update: vi.fn(() => ({
      set: (vals: Record<string, unknown>) => ({
        where: () => {
          updates.push({ set: vals });
          return Promise.resolve(undefined);
        },
      }),
    })),
  };

  return { db, inserts, updates };
}

describe("withCronRunLog", () => {
  it("trace une exécution réussie : INSERT 'running' puis UPDATE 'ok' avec payload", async () => {
    const { db, inserts, updates } = makeFakeDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await withCronRunLog(db as any, "test-cron", async () => {
      return { totalSent: 3, durationMs: 42 };
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.result.totalSent).toBe(3);

    expect(inserts).toHaveLength(1);
    expect(inserts[0]!.values.cronName).toBe("test-cron");
    expect(inserts[0]!.values.status).toBe("running");

    expect(updates).toHaveLength(1);
    expect(updates[0]!.set.status).toBe("ok");
    expect(updates[0]!.set.payload).toEqual({ totalSent: 3, durationMs: 42 });
    expect(updates[0]!.set.errorMessage).toBeNull();
    expect(updates[0]!.set.errorStack).toBeNull();
    expect(typeof updates[0]!.set.durationMs).toBe("number");
  });

  it("trace une exécution en erreur : UPDATE 'error' avec message + stack", async () => {
    const { db, inserts, updates } = makeFakeDb();
    const boom = new Error("kaboom");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await withCronRunLog(db as any, "broken-cron", async () => {
      throw boom;
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(boom);

    expect(inserts).toHaveLength(1);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.set.status).toBe("error");
    expect(updates[0]!.set.errorMessage).toBe("kaboom");
    expect(updates[0]!.set.errorStack).toContain("kaboom");
    expect(updates[0]!.set.payload).toBeNull();
  });

  it("ne propage pas l'exception du runner — wrapper résilient", async () => {
    const { db } = makeFakeDb();
    let propagated = false;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await withCronRunLog(db as any, "noisy", async () => {
        throw new Error("noisy crash");
      });
    } catch {
      propagated = true;
    }
    expect(propagated).toBe(false);
  });

  it("exécute le runner même si l'INSERT initial rate (best-effort logging)", async () => {
    const { db, inserts, updates } = makeFakeDb({ insertThrows: true });
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

    let ranRunner = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await withCronRunLog(db as any, "no-trace", async () => {
      ranRunner = true;
      return { ok: 1 };
    });

    expect(ranRunner).toBe(true);
    expect(result.ok).toBe(true);
    // Pas d'INSERT enregistré (la fonction throws), donc pas d'UPDATE non plus
    // (handle.id = "" → finishCronRun no-op).
    expect(inserts).toHaveLength(0);
    expect(updates).toHaveLength(0);
    expect(consoleWarn).toHaveBeenCalled();
    consoleWarn.mockRestore();
  });

  it("sérialise une exception non-Error en string pour errorMessage", async () => {
    const { db, updates } = makeFakeDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await withCronRunLog(db as any, "weird", async () => {
      // Volontairement throw une string (cas pathologique mais possible).
      const literal: unknown = "string-thrown";
      throw literal;
    });

    expect(updates[0]!.set.status).toBe("error");
    expect(updates[0]!.set.errorMessage).toBe("string-thrown");
    expect(updates[0]!.set.errorStack).toBeNull();
  });
});
