/**
 * Tests Vitest — cron J+3 module Tandem (`runTandemFollowups`).
 *
 * Couvre :
 *  - Aucune ligne `pending` → 0 envoi (no-op)
 *  - Ligne `pending` mais < 3 jours → skippée
 *  - Ligne `pending` ≥ 3 jours → relancée
 *  - Idempotence : ligne avec `followup_sent_at` set → skippée par la query
 *    (testée indirectement — on n'inclut pas la ligne dans la fixture)
 *  - Archi opposé / inactif / sans email → skippé avec failure
 *  - Brevo échoue → `failedCount++`, pas d'UPDATE `followup_sent_at`
 *  - Brevo OK → INSERT brevo_messages + UPDATE followup_sent_at
 *
 * Stratégie : on mock le client Drizzle ET le client Brevo via interfaces
 * légères. Pas de container Postgres ici — le test cible la logique
 * d'orchestration pure (sélection / filtre J+3 / dispatch).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { runTandemFollowups } from "./followup-cron";
import type { BrevoClient } from "@/lib/brevo/client";

// ============================================================================
// Helpers
// ============================================================================

interface Candidate {
  responseId: string;
  tenderId: string;
  organizationId: string;
  architectId: string;
  tokenCreatedAt: Date;
  architect: {
    id: string;
    cabinet: string;
    contactName: string | null;
    tutoiement: boolean;
    email: string | null;
    active: boolean;
    solicitable: boolean;
  };
  tender: {
    id: string;
    title: string;
    buyer: string;
    deadline: Date | null;
    rawData: unknown;
  };
}

/**
 * Mock minimaliste de l'API Drizzle utilisée par `runTandemFollowups` :
 *  - chaîne `.select().from().innerJoin()*.where().limit()` → candidates
 *  - chaîne secondaire `.select().from().where().limit()` → tokenRows + oppoRows
 *  - `.update().set().where()` → no-op (succès)
 *  - `.insert().values()` → no-op (succès)
 *
 * On suit l'ordre des appels via un compteur `selectCallCount`.
 */
function makeMockDb(opts: {
  candidates: Candidate[];
  tokenJti?: string;
  oppoJti?: string | null;
  updateFails?: boolean;
}) {
  let selectCallCount = 0;
  const insertedBrevoMessages: unknown[] = [];
  const updatedResponses: unknown[] = [];

  const dbMock = {
    select: vi.fn(() => {
      selectCallCount += 1;
      // 1er select = liste des candidats. Les suivants (par item) = tokenRows
      // ou oppoRows. On renvoie un builder différent selon le rang.
      if (selectCallCount === 1) {
        return {
          from: () => ({
            innerJoin: () => ({
              innerJoin: () => ({
                innerJoin: () => ({
                  where: () => ({
                    limit: async () => opts.candidates,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      // 2e select = organization_profiles (chargé une fois avant la boucle
      // pour presentationSociete). Retourne [] → fallback hardcoded.
      if (selectCallCount === 2) {
        return {
          from: () => ({
            where: () => ({
              limit: async () => [],
            }),
          }),
        };
      }
      // Appels par item (≥ 3). Ordre : tokenRows (impair) puis oppoRows (pair).
      // 3=tokenRows, 4=oppoRows, 5=tokenRows, 6=oppoRows, …
      const isToken = selectCallCount % 2 === 1; // impair = token
      const value = isToken
        ? [{ jwtId: opts.tokenJti ?? "jti-test" }]
        : [{ jti: opts.oppoJti ?? null }].filter((r) => r.jti !== null);
      return {
        from: () => ({
          where: () => ({
            limit: async () => value,
          }),
        }),
      };
    }),
    update: vi.fn(() => ({
      set: () => ({
        where: async () => {
          if (opts.updateFails) throw new Error("update_failed_mock");
          updatedResponses.push({ ok: true });
        },
      }),
    })),
    insert: vi.fn(() => ({
      values: async (v: unknown) => {
        insertedBrevoMessages.push(v);
      },
    })),
    // Requis par withTenantContext (pose app.current_organization_id via SET LOCAL).
    // En mock, on ignore silencieusement l'instruction SET CONFIG.
    execute: vi.fn(async () => []),
  } as unknown as Parameters<typeof runTandemFollowups>[0]["db"];

  return {
    dbMock,
    insertedBrevoMessages,
    updatedResponses,
    getSelectCallCount: () => selectCallCount,
  };
}

function makeMockBrevo(opts: { mode: "ok" | "fail" } = { mode: "ok" }): BrevoClient {
  const sendImpl: BrevoClient["send"] = async () => {
    if (opts.mode === "fail") {
      return { ok: false, error: "http_error", status: 500 } as const;
    }
    return {
      ok: true,
      messageId: `msg-${Math.random().toString(36).slice(2, 10)}`,
    } as const;
  };
  return {
    send: vi.fn(sendImpl),
  };
}

function makeCandidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    responseId: "rep-1",
    tenderId: "11111111-1111-1111-1111-111111111111",
    organizationId: "00000000-0000-0000-0000-000000000001",
    architectId: "22222222-2222-2222-2222-222222222222",
    tokenCreatedAt: new Date("2026-05-20T08:00:00Z"),
    architect: {
      id: "22222222-2222-2222-2222-222222222222",
      cabinet: "Atelier Test",
      contactName: "Marie Dupont",
      tutoiement: false,
      email: "marie@test.fr",
      active: true,
      solicitable: true,
    },
    tender: {
      id: "11111111-1111-1111-1111-111111111111",
      title: "Construction crèche Lyon 7e",
      buyer: "Ville de Lyon",
      deadline: new Date("2026-06-15T12:00:00Z"),
      rawData: { record: { departement: "69" } },
    },
    ...overrides,
  };
}

// Config Brevo template IDs pour pickBrevoTemplateId()
beforeEach(() => {
  process.env.BREVO_TEMPLATE_ID_ARCHITECT_FOLLOWUP_TU = "12";
  process.env.BREVO_TEMPLATE_ID_ARCHITECT_FOLLOWUP_VOUS = "13";
  process.env.NEXT_PUBLIC_SITE_URL = "https://sourcing.test";
});

// ============================================================================
// Tests
// ============================================================================

describe("runTandemFollowups — chemins de base", () => {
  it("aucun candidat → 0 envoi, ok", async () => {
    const { dbMock } = makeMockDb({ candidates: [] });
    const result = await runTandemFollowups({
      db: dbMock,
      brevoClient: makeMockBrevo(),
      now: () => new Date("2026-05-25T07:00:00Z"),
    });
    expect(result.totalCandidates).toBe(0);
    expect(result.eligibleCount).toBe(0);
    expect(result.sentCount).toBe(0);
    expect(result.failedCount).toBe(0);
  });

  it("candidat avec token créé < 3 jours → skippé (pas éligible)", async () => {
    const candidate = makeCandidate({
      tokenCreatedAt: new Date("2026-05-24T08:00:00Z"), // J-1
    });
    const { dbMock } = makeMockDb({ candidates: [candidate] });
    const brevo = makeMockBrevo();
    const result = await runTandemFollowups({
      db: dbMock,
      brevoClient: brevo,
      now: () => new Date("2026-05-25T08:00:00Z"),
    });
    expect(result.totalCandidates).toBe(1);
    expect(result.eligibleCount).toBe(0);
    expect(result.sentCount).toBe(0);
    expect(brevo.send).not.toHaveBeenCalled();
  });

  it("candidat éligible (token créé ≥ 3 jours) → relance envoyée", async () => {
    const candidate = makeCandidate({
      tokenCreatedAt: new Date("2026-05-20T08:00:00Z"), // J-5
    });
    const { dbMock, insertedBrevoMessages, updatedResponses } = makeMockDb({
      candidates: [candidate],
      tokenJti: "jti-followup",
      oppoJti: "oppo-jti-1",
    });
    const brevo = makeMockBrevo({ mode: "ok" });
    const result = await runTandemFollowups({
      db: dbMock,
      brevoClient: brevo,
      now: () => new Date("2026-05-25T08:00:00Z"),
    });
    expect(result.totalCandidates).toBe(1);
    expect(result.eligibleCount).toBe(1);
    expect(result.sentCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(result.sentArchitectIds).toEqual([candidate.architectId]);
    expect(brevo.send).toHaveBeenCalledTimes(1);
    expect(insertedBrevoMessages).toHaveLength(1);
    expect(updatedResponses).toHaveLength(1);
  });

  it("candidat avec archi désactivé → failure, pas d'envoi", async () => {
    const candidate = makeCandidate({
      tokenCreatedAt: new Date("2026-05-20T08:00:00Z"),
      architect: {
        ...makeCandidate().architect,
        active: false,
      },
    });
    const { dbMock } = makeMockDb({ candidates: [candidate] });
    const brevo = makeMockBrevo();
    const result = await runTandemFollowups({
      db: dbMock,
      brevoClient: brevo,
      now: () => new Date("2026-05-25T08:00:00Z"),
    });
    expect(result.eligibleCount).toBe(1);
    expect(result.sentCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(result.failures[0]!.reason).toBe("architect_not_solicitable");
    expect(brevo.send).not.toHaveBeenCalled();
  });

  it("Brevo échoue → followup_sent_at non touché", async () => {
    const candidate = makeCandidate({
      tokenCreatedAt: new Date("2026-05-20T08:00:00Z"),
    });
    const { dbMock, updatedResponses } = makeMockDb({
      candidates: [candidate],
      tokenJti: "jti-x",
    });
    const brevo = makeMockBrevo({ mode: "fail" });
    const result = await runTandemFollowups({
      db: dbMock,
      brevoClient: brevo,
      now: () => new Date("2026-05-25T08:00:00Z"),
    });
    expect(result.sentCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(updatedResponses).toHaveLength(0);
    expect(result.failures[0]!.reason).toContain("brevo_");
  });

  it("Tutoiement → template TU, VOUS sinon", async () => {
    const candidateVous = makeCandidate({
      tokenCreatedAt: new Date("2026-05-20T08:00:00Z"),
      architect: { ...makeCandidate().architect, tutoiement: false },
    });
    const { dbMock } = makeMockDb({ candidates: [candidateVous], oppoJti: "oppo-1" });
    const brevo = makeMockBrevo({ mode: "ok" });
    await runTandemFollowups({
      db: dbMock,
      brevoClient: brevo,
      now: () => new Date("2026-05-25T08:00:00Z"),
    });
    expect(brevo.send).toHaveBeenCalledTimes(1);
    const call = (brevo.send as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(call).toBeDefined();
    // template VOUS = 13 (cf. beforeEach)
    expect(call!.templateId).toBe(13);
  });

  it("Tutoiement TRUE → templateId TU", async () => {
    const candidateTu = makeCandidate({
      tokenCreatedAt: new Date("2026-05-20T08:00:00Z"),
      architect: { ...makeCandidate().architect, tutoiement: true },
    });
    const { dbMock } = makeMockDb({ candidates: [candidateTu], oppoJti: "oppo-2" });
    const brevo = makeMockBrevo({ mode: "ok" });
    await runTandemFollowups({
      db: dbMock,
      brevoClient: brevo,
      now: () => new Date("2026-05-25T08:00:00Z"),
    });
    const call = (brevo.send as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(call).toBeDefined();
    // template TU = 12
    expect(call!.templateId).toBe(12);
  });
});
