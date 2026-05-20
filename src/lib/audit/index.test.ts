/**
 * Tests unitaires du helper `audit()` — edifio Sourcing.
 *
 * Couvre :
 *  - shape du payload INSERT (enrichissement complet depuis session + headers)
 *  - extraction `x-forwarded-for` (1er IP de la liste séparée par virgules)
 *  - extraction `user-agent`
 *  - cas sans `request` : ip_address / user_agent = null
 *  - cas sans session : organization_id / actor_* = null
 *  - validation Zod : throw en NODE_ENV=test si payload non conforme
 *  - non-throw quand le client Supabase admin retourne une erreur INSERT
 *    (modulo NODE_ENV=test qui propage — comportement documenté)
 *
 * Mock Supabase : on remplace `@/lib/supabase/server` via `vi.mock()` au top.
 * Les deux factories retournent des doubles capturant les appels pour
 * assertions.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ----------------------------------------------------------------------------
// Mock du module Supabase (avant import du helper)
// ----------------------------------------------------------------------------

const mockInsert = vi.fn();
const mockGetUser = vi.fn();

// `vi.mock()` est hoisté — accède directement aux mocks par nom de variable
// est interdit (ReferenceError). On expose les mocks via un objet qu'on
// référence indirectement (idiome Vitest).
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({
    auth: {
      getUser: () => mockGetUser(),
    },
  }),
  createSupabaseAdminClient: () => ({
    from: () => ({
      insert: (payload: unknown) => mockInsert(payload),
    }),
  }),
}));

// Import APRES le mock (sinon le helper capture le vrai module)
import { audit } from "./index";

// ----------------------------------------------------------------------------
// Fixture session helper
// ----------------------------------------------------------------------------

const ORG_A_ID = "11111111-1111-1111-1111-111111111111";
const USER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_EMAIL = "alice@alyosingenierie.fr";

function mockAuthenticatedSession(): void {
  mockGetUser.mockResolvedValue({
    data: {
      user: {
        id: USER_ID,
        email: USER_EMAIL,
        app_metadata: {
          organization_id: ORG_A_ID,
          role: "admin",
        },
      },
    },
  });
}

function mockUnauthenticatedSession(): void {
  mockGetUser.mockResolvedValue({ data: { user: null } });
}

function mockInsertSuccess(): void {
  mockInsert.mockResolvedValue({ data: null, error: null });
}

// Tender_select valide réutilisable
const VALID_TENDER_SELECT = {
  tender_id: "33333333-3333-3333-3333-333333333333",
  tender_ref: "25-AO-00142",
  mode: "solo" as const,
  score: 87,
};

// ----------------------------------------------------------------------------
// Lifecycle
// ----------------------------------------------------------------------------

beforeEach(() => {
  mockInsert.mockReset();
  mockGetUser.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ----------------------------------------------------------------------------
// Cas nominal — enrichissement complet
// ----------------------------------------------------------------------------

describe("audit() — enrichissement nominal", () => {
  it("INSERT payload contient tous les champs enrichis depuis session + headers", async () => {
    mockAuthenticatedSession();
    mockInsertSuccess();

    const request = new Request("https://sourcing.alyosingenierie.fr/api/select", {
      method: "POST",
      headers: {
        "x-forwarded-for": "203.0.113.42, 198.51.100.7",
        "user-agent": "Mozilla/5.0 (compatible; edifio-test)",
      },
    });

    await audit({
      action: "tender_select",
      data: VALID_TENDER_SELECT,
      subjectType: "tender",
      subjectId: VALID_TENDER_SELECT.tender_id,
      request,
    });

    expect(mockInsert).toHaveBeenCalledTimes(1);
    const payload = mockInsert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).toBeDefined();

    expect(payload.organization_id).toBe(ORG_A_ID);
    expect(payload.actor_id).toBe(USER_ID);
    expect(payload.actor_email).toBe(USER_EMAIL);
    expect(payload.actor_role).toBe("admin");
    expect(payload.action).toBe("tender_select");
    expect(payload.subject_type).toBe("tender");
    expect(payload.subject_id).toBe(VALID_TENDER_SELECT.tender_id);
    // Premier IP de la liste x-forwarded-for, trimé
    expect(payload.ip_address).toBe("203.0.113.42");
    expect(payload.user_agent).toBe("Mozilla/5.0 (compatible; edifio-test)");
    expect(payload.data).toEqual(VALID_TENDER_SELECT);
  });

  it("extrait correctement le 1er IP quand x-forwarded-for contient une liste", async () => {
    mockAuthenticatedSession();
    mockInsertSuccess();

    const request = new Request("https://e.test/", {
      headers: { "x-forwarded-for": "  10.0.0.1  , 192.168.1.1" },
    });
    await audit({ action: "tender_select", data: VALID_TENDER_SELECT, request });

    const payload = mockInsert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.ip_address).toBe("10.0.0.1");
  });

  it("ip_address / user_agent = null si request non fournie", async () => {
    mockAuthenticatedSession();
    mockInsertSuccess();

    await audit({ action: "tender_select", data: VALID_TENDER_SELECT });

    const payload = mockInsert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.ip_address).toBeNull();
    expect(payload.user_agent).toBeNull();
  });

  it("subject_type / subject_id = null par défaut", async () => {
    mockAuthenticatedSession();
    mockInsertSuccess();

    await audit({ action: "tender_select", data: VALID_TENDER_SELECT });

    const payload = mockInsert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.subject_type).toBeNull();
    expect(payload.subject_id).toBeNull();
  });
});

// ----------------------------------------------------------------------------
// Session manquante
// ----------------------------------------------------------------------------

describe("audit() — session manquante", () => {
  it("organization_id / actor_* = null quand pas de session active", async () => {
    mockUnauthenticatedSession();
    mockInsertSuccess();

    await audit({ action: "tender_select", data: VALID_TENDER_SELECT });

    const payload = mockInsert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.organization_id).toBeNull();
    expect(payload.actor_id).toBeNull();
    expect(payload.actor_email).toBeNull();
    expect(payload.actor_role).toBeNull();
    // L'INSERT se fait quand même : l'audit accepte des contextes anonymes
    // (ex. action=access_attempt avant qu'on ait identifié l'user).
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });
});

// ----------------------------------------------------------------------------
// Validation Zod
// ----------------------------------------------------------------------------

describe("audit() — validation Zod", () => {
  it("rejette un payload tender_select invalide (en NODE_ENV=test, propage)", async () => {
    mockAuthenticatedSession();
    mockInsertSuccess();

    await expect(
      audit({
        action: "tender_select",
        // @ts-expect-error volontaire : on teste que Zod attrape un payload non conforme
        data: { tender_id: "not-uuid", tender_ref: "", mode: "studio", score: 999 },
      }),
    ).rejects.toThrow();

    // INSERT NE DOIT PAS être appelé si la validation a échoué
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------------------
// Erreur Supabase non-bloquante en prod (mais propagée en test)
// ----------------------------------------------------------------------------

describe("audit() — comportement face à une erreur INSERT Supabase", () => {
  it("propage l'erreur en NODE_ENV=test (pour faciliter la détection régressions)", async () => {
    mockAuthenticatedSession();
    mockInsert.mockResolvedValue({
      data: null,
      error: { message: "supabase down", code: "PGRST500" },
    });

    // En test on propage, conformément à la JSDoc du helper.
    await expect(
      audit({ action: "tender_select", data: VALID_TENDER_SELECT }),
    ).rejects.toBeDefined();
  });

  it("ne propage pas l'erreur en NODE_ENV=production (best-effort)", async () => {
    const originalEnv = process.env.NODE_ENV;
    // @ts-expect-error NODE_ENV est readonly en TS, override pour le test
    process.env.NODE_ENV = "production";

    try {
      mockAuthenticatedSession();
      mockInsert.mockResolvedValue({
        data: null,
        error: { message: "supabase down", code: "PGRST500" },
      });

      // Ne throw PAS — best-effort prod.
      await expect(
        audit({ action: "tender_select", data: VALID_TENDER_SELECT }),
      ).resolves.toBeUndefined();
    } finally {
      // @ts-expect-error restore
      process.env.NODE_ENV = originalEnv;
    }
  });
});
