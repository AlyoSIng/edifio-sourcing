/**
 * Tests notifyCronError (polish I3 — Steve 2026-06-04).
 *
 * Couvre les invariants du notifier mail :
 *   - Best-effort : ne throw jamais, même si la DB rate
 *   - Anti-spam : skip si une autre row 'error' existe déjà dans la fenêtre 1h
 *   - Aucun recipient → skip propre
 *   - Échec d'envoi pour un destinataire ne casse pas les autres
 *   - Le sendEmail injecté est bien appelé une fois par destinataire
 *
 * Stratégie : fake Db minimal qui simule .select().from().innerJoin().where()
 * pour le JOIN users↔memberships, et .select().from().where().orderBy().limit()
 * pour le check anti-spam. sendEmail est un mock injecté via opts.
 */

import { describe, expect, it, vi } from "vitest";

import { notifyCronError } from "./notify-error";

interface FakeDbOpts {
  recipientEmails?: string[];
  /** Nombre d'erreurs déjà tracées dans la fenêtre 1h (= 1 si seule la row courante). */
  errorRowsCount?: number;
  /** Throw côté getSuperadminEmails (simule DB down). */
  recipientsThrows?: boolean;
  /** Throw côté shouldSendAlert (simule DB down). */
  antiSpamThrows?: boolean;
}

/**
 * Fake Drizzle qui supporte les 2 chemins :
 *   1. JOIN users↔memberships → renvoie opts.recipientEmails
 *   2. SELECT cron_run_log status='error' → renvoie un total d'erreurs.
 *
 * Discrimine entre les 2 par l'ordre des appels : le 1er .select() chaîne
 * vers .innerJoin() → recipients ; les suivants sont anti-spam.
 */
function makeFakeDb(opts: FakeDbOpts = {}) {
  const recipientEmails = opts.recipientEmails ?? ["admin@alyosingenierie.fr"];
  const errorRowsCount = opts.errorRowsCount ?? 1;

  // Compteur d'appels select pour discriminer
  let selectCallIdx = 0;

  const db = {
    select: vi.fn(() => {
      const thisCallIdx = selectCallIdx++;
      // Chemin 1 — recipients : .from().innerJoin().where() → renvoie users
      // Chemin 2/3 — anti-spam : .from().where().orderBy().limit() → renvoie rows
      //
      // Cette fake API supporte les 2 enchainements en exposant les méthodes
      // sur chaque maillon, le tableau final dépend de thisCallIdx :
      //   - 0e select() est utilisé par shouldSendAlert (premier appelé)
      //   - 1er est aussi shouldSendAlert (count(*))
      //   - 2e est getSuperadminEmails

      const finalRows = () => {
        if (thisCallIdx === 0) {
          if (opts.antiSpamThrows) throw new Error("antispam DB down");
          // Premier select : on renvoie une seule row si errorRowsCount >= 1
          return errorRowsCount >= 1 ? [{ id: "fake-id" }] : [];
        }
        if (thisCallIdx === 1) {
          if (opts.antiSpamThrows) throw new Error("antispam DB down");
          // Deuxième select : count
          return [{ n: errorRowsCount }];
        }
        // Troisième select : recipients
        if (opts.recipientsThrows) throw new Error("recipients DB down");
        return recipientEmails.map((email) => ({ email }));
      };

      return {
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => finalRows(),
            }),
            // direct await pour count(*)::int
            then: (onFulfilled?: (v: unknown) => unknown) =>
              Promise.resolve(finalRows()).then(onFulfilled),
          }),
          innerJoin: () => ({
            where: async () => finalRows(),
          }),
        }),
      };
    }),
  };

  return db;
}

describe("notifyCronError", () => {
  it("envoie un mail aux superadmins quand une erreur survient", async () => {
    const sendEmailMock = vi.fn(async () => ({ id: "msg-1" }));
    const db = makeFakeDb({
      recipientEmails: ["a@alyosingenierie.fr", "b@alyosingenierie.fr"],
      errorRowsCount: 1, // seule la row courante
    });

    await notifyCronError(db as never, "test-cron", new Error("boom"), {
      sendEmailFn: sendEmailMock,
    });

    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    const firstCall = sendEmailMock.mock.calls[0]![0];
    expect(firstCall.subject).toContain("test-cron");
    expect(firstCall.text).toContain("boom");
  });

  it("skip si une autre erreur a déjà été tracée dans la fenêtre 1h (anti-spam)", async () => {
    const sendEmailMock = vi.fn(async () => ({ id: "msg-1" }));
    const db = makeFakeDb({
      errorRowsCount: 3, // 2 erreurs précédentes + la courante
    });

    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
    await notifyCronError(db as never, "test-cron", new Error("boom"), {
      sendEmailFn: sendEmailMock,
    });

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(consoleLog).toHaveBeenCalledWith(expect.stringContaining("antispam:skip"), "test-cron");
    consoleLog.mockRestore();
  });

  it("skip si aucun superadmin n'est trouvé (recipients vides)", async () => {
    const sendEmailMock = vi.fn(async () => ({ id: "msg-1" }));
    const db = makeFakeDb({
      recipientEmails: [],
      errorRowsCount: 1,
    });

    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await notifyCronError(db as never, "test-cron", new Error("boom"), {
      sendEmailFn: sendEmailMock,
    });

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(consoleWarn).toHaveBeenCalledWith(expect.stringContaining("no-recipients"), "test-cron");
    consoleWarn.mockRestore();
  });

  it("ne propage pas l'exception si la DB rate sur recipients (best-effort)", async () => {
    const sendEmailMock = vi.fn(async () => ({ id: "msg-1" }));
    const db = makeFakeDb({
      recipientsThrows: true,
      errorRowsCount: 1,
    });

    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let propagated = false;
    try {
      await notifyCronError(db as never, "test-cron", new Error("boom"), {
        sendEmailFn: sendEmailMock,
      });
    } catch {
      propagated = true;
    }
    expect(propagated).toBe(false);
    expect(sendEmailMock).not.toHaveBeenCalled();
    consoleWarn.mockRestore();
  });

  it("continue si sendEmail rate pour un destinataire (loop résilient)", async () => {
    let calls = 0;
    const sendEmailMock = vi.fn(async () => {
      calls++;
      if (calls === 1) throw new Error("Resend rate limited");
      return { id: `msg-${calls}` };
    });
    const db = makeFakeDb({
      recipientEmails: ["a@alyos.fr", "b@alyos.fr", "c@alyos.fr"],
      errorRowsCount: 1,
    });

    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await notifyCronError(db as never, "test-cron", new Error("boom"), {
      sendEmailFn: sendEmailMock,
    });

    // Les 3 destinataires doivent avoir été tentés malgré le throw du 1er.
    expect(sendEmailMock).toHaveBeenCalledTimes(3);
    consoleWarn.mockRestore();
  });

  it("sérialise un throw non-Error en string pour le subject/text", async () => {
    const sendEmailMock = vi.fn(async () => ({ id: "msg-1" }));
    const db = makeFakeDb({ errorRowsCount: 1 });

    // Volontairement throw une string (cas pathologique mais possible).
    const literal: unknown = "string-thrown";
    await notifyCronError(db as never, "test-cron", literal, {
      sendEmailFn: sendEmailMock,
    });

    const firstCall = sendEmailMock.mock.calls[0]![0];
    expect(firstCall.text).toContain("string-thrown");
    // Pas de stack pour les non-Error.
    expect(firstCall.text).not.toContain("Stack");
  });
});
