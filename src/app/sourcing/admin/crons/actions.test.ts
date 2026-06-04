/**
 * Tests triggerCronAction (polish I3 — Steve 2026-06-04).
 *
 * Couvre les invariants sécurité + comportement :
 *   - Refus 401 si pas authentifié
 *   - Refus forbidden si pas superadmin
 *   - Refus whitelist si cron_name inconnu (anti-injection path)
 *   - CRON_SECRET absent → erreur explicite
 *   - fetch sur l'URL interne avec Authorization Bearer correct
 *   - Renvoie httpStatus + durée + preview de la réponse
 *
 * Stratégie : on mocke supabase server client + auth/types (isSuperAdmin),
 * et on stub global.fetch pour capturer l'appel HTTP.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// Mocks — hoisting vi.mock
// ============================================================================

interface MockUser {
  id: string;
  email: string;
}

let mockUser: MockUser | null = null;
let mockIsSuperAdmin = false;

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: mockUser }, error: null }),
    },
  }),
}));

vi.mock("@/lib/auth/types", () => ({
  toUserProfile: (u: MockUser) => u,
  isSuperAdmin: () => mockIsSuperAdmin,
}));

vi.mock("@/lib/site-url", () => ({
  getSiteUrl: () => "https://test.example.com",
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Import APRÈS les vi.mock (hoisting Vitest les remonte au top du module).
import { triggerCronAction } from "./actions";

const ADMIN_USER: MockUser = { id: "user-1", email: "steve@alyosingenierie.fr" };

describe("triggerCronAction — auth", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "test-secret-32-bytes-aaaaaaaaaaaaaa");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("refuse si pas authentifié", async () => {
    mockUser = null;
    mockIsSuperAdmin = false;
    const result = await triggerCronAction("sourcing-run");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Non authentifié");
  });

  it("refuse si authentifié mais pas superadmin", async () => {
    mockUser = ADMIN_USER;
    mockIsSuperAdmin = false;
    const result = await triggerCronAction("sourcing-run");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Forbidden");
  });
});

describe("triggerCronAction — whitelist cron_name", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "test-secret-32-bytes-aaaaaaaaaaaaaa");
    mockUser = ADMIN_USER;
    mockIsSuperAdmin = true;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("refuse un cron_name absent de la whitelist (anti-injection path)", async () => {
    const result = await triggerCronAction("../etc/passwd");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Cron inconnu");
  });

  it("refuse un cron_name vide", async () => {
    const result = await triggerCronAction("");
    expect(result.ok).toBe(false);
  });

  it("accepte les 4 cron_name autorisés", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    for (const name of [
      "sourcing-run",
      "tandem-followup",
      "library-expiry-digest",
      "dossier-zip-cleanup",
    ]) {
      const result = await triggerCronAction(name);
      expect(result.ok).toBe(true);
      expect(result.httpStatus).toBe(200);
    }
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

describe("triggerCronAction — CRON_SECRET", () => {
  beforeEach(() => {
    mockUser = ADMIN_USER;
    mockIsSuperAdmin = true;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("refuse si CRON_SECRET non configuré côté serveur", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await triggerCronAction("sourcing-run");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("CRON_SECRET");
    consoleErr.mockRestore();
  });
});

describe("triggerCronAction — fetch", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "test-secret-32-bytes-aaaaaaaaaaaaaa");
    mockUser = ADMIN_USER;
    mockIsSuperAdmin = true;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("POST sur l'URL interne avec Bearer dans le header (jamais GET)", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response('{"ok":true,"sent":3}', { status: 200 }));

    await triggerCronAction("tandem-followup");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://test.example.com/api/cron/tandem-followup");
    expect((init as RequestInit).method).toBe("POST");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer test-secret-32-bytes-aaaaaaaaaaaaaa");
  });

  it("renvoie httpStatus 500 + ok=false si la route répond 500", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response('{"error":"boom"}', { status: 500 }));

    const result = await triggerCronAction("sourcing-run");
    expect(result.ok).toBe(false);
    expect(result.httpStatus).toBe(500);
    expect(result.responsePreview).toContain("boom");
  });

  it("renvoie une durée et un aperçu de la réponse (200 premiers char)", async () => {
    const longPayload = "x".repeat(500);
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(longPayload, { status: 200 }));

    const result = await triggerCronAction("sourcing-run");
    expect(result.ok).toBe(true);
    expect(typeof result.durationMs).toBe("number");
    expect(result.responsePreview!.length).toBe(200);
  });

  it("capture une exception fetch et renvoie ok=false sans throw", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    const consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});

    let propagated = false;
    let result;
    try {
      result = await triggerCronAction("sourcing-run");
    } catch {
      propagated = true;
    }

    expect(propagated).toBe(false);
    expect(result!.ok).toBe(false);
    expect(result!.error).toContain("ECONNREFUSED");
    consoleErr.mockRestore();
  });
});
