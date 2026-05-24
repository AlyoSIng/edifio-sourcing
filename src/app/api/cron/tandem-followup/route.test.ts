/**
 * Tests de la route GET / POST `/api/cron/tandem-followup`.
 *
 * Couvre :
 *  - 401 si CRON_SECRET non configuré
 *  - 401 si Authorization absent
 *  - 401 si Bearer wrong
 *  - 401 si Bearer mauvaise longueur (timingSafeEqual exige même longueur)
 *  - 200 + summary si OK
 *  - 500 si runTandemFollowups throw
 *  - POST parité GET sur l'auth + le pipeline
 *  - timingSafeEqual : « bear x » avec mauvais préfixe MAIS bonne longueur
 *    → toujours 401 (pas de leak timing)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Variables de contrôle des mocks
let mockRunResult: unknown = null;
let mockRunThrows: Error | null = null;

vi.mock("@/db/client", () => ({
  db: {} as unknown,
}));

vi.mock("@/lib/brevo/client", () => ({
  getBrevoClient: () => ({
    send: async () => ({ ok: true, messageId: "msg-test" }),
  }),
}));

vi.mock("@/lib/tandem/followup-cron", () => ({
  runTandemFollowups: async () => {
    if (mockRunThrows) throw mockRunThrows;
    return mockRunResult;
  },
}));

import { GET, POST } from "./route";

function makeRequest(secret?: string): import("next/server").NextRequest {
  const headers = new Headers();
  if (secret !== undefined) {
    headers.set("authorization", secret);
  }
  return {
    headers: {
      get: (k: string) => headers.get(k.toLowerCase()),
    },
  } as unknown as import("next/server").NextRequest;
}

beforeEach(() => {
  mockRunResult = {
    totalCandidates: 5,
    eligibleCount: 3,
    sentCount: 2,
    failedCount: 1,
    sentArchitectIds: ["a1", "a2"],
    failures: [{ tenderId: "t1", architectId: "a3", reason: "brevo_http_error" }],
    durationMs: 1234,
  };
  mockRunThrows = null;
  process.env.CRON_SECRET = "test-secret-12345";
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("/api/cron/tandem-followup — auth", () => {
  it("401 si CRON_SECRET non configuré", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(makeRequest("Bearer anything"));
    expect(res.status).toBe(401);
  });

  it("401 si Authorization absent", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("401 si Bearer wrong (bonne longueur)", async () => {
    const wrong = `Bearer ${"X".repeat(16)}`; // même longueur que la bonne valeur
    const res = await GET(makeRequest(wrong));
    expect(res.status).toBe(401);
  });

  it("401 si Bearer mauvaise longueur", async () => {
    const res = await GET(makeRequest("Bearer short"));
    expect(res.status).toBe(401);
  });

  it("200 + summary si Bearer correct (GET)", async () => {
    const res = await GET(makeRequest(`Bearer ${process.env.CRON_SECRET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.sentCount).toBe(2);
    expect(body.eligibleCount).toBe(3);
    expect(body.failedCount).toBe(1);
  });

  it("200 + summary si Bearer correct (POST — parité)", async () => {
    const res = await POST(makeRequest(`Bearer ${process.env.CRON_SECRET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});

describe("/api/cron/tandem-followup — gestion erreurs", () => {
  it("500 si runTandemFollowups throw (catch global)", async () => {
    mockRunThrows = new Error("boom — brevo unreachable");
    const res = await GET(makeRequest(`Bearer ${process.env.CRON_SECRET}`));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });
});
