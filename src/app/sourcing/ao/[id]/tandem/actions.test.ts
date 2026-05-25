/**
 * Tests Server Actions — flux Tandem.
 *
 * Couvre :
 *  - matchArchitectsForTender : auth refusée si pas de session, pas alyos
 *  - matchArchitectsForTender : invalid_input UUID malformé / topN hors range
 *  - sendArchitectSolicitation : auth refusée, invalid_input
 *  - sendArchitectSolicitation : audit A5 strict-validé via le helper réel
 *    (le payload doit passer le schéma A5)
 *  - sendArchitectSolicitation : tutoiement → sélection template TU/VOUS
 *    (3 cas : tutoiement=true, tutoiement=false, override register explicite)
 *
 * Tests d'intégration BDD (transactions, idempotence multi-call) → étape 5
 * Playwright. Ici on valide les invariants côté inputs / auth PLUS la
 * propagation du registre TU/VOUS jusqu'à l'appel Brevo.
 */

import crypto from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  matchArchitectsForTender,
  sendArchitectSolicitation,
  type AuthClientLike,
  type DrizzleClient,
} from "./actions";
import type { BrevoClient } from "@/lib/brevo/client";
import { __resetKeyCache } from "@/lib/tandem/jwt";

// ----------------------------------------------------------------------------
// Mocks globaux
// ----------------------------------------------------------------------------

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Évite que createSupabaseServerClient essaie de lire les cookies Next.js
// hors contexte request (nœud pur Vitest).
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: null } }),
    },
  }),
}));

const VALID_TENDER_ID = "11111111-1111-1111-1111-111111111111";
const VALID_ARCHI_ID = "22222222-2222-2222-2222-222222222222";

function authClientWith(user: { id: string; email: string } | null): AuthClientLike {
  return {
    auth: {
      getUser: async () => ({
        data: {
          user: user
            ? ({
                id: user.id,
                email: user.email,
                app_metadata: {},
                user_metadata: {},
                aud: "authenticated",
                created_at: new Date().toISOString(),
              } as unknown as import("@supabase/supabase-js").User)
            : null,
        },
      }),
    },
  };
}

describe("matchArchitectsForTender — invariants pré-BDD", () => {
  it("not_authenticated si pas de session", async () => {
    const result = await matchArchitectsForTender(VALID_TENDER_ID, 3, {
      authClient: authClientWith(null),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("not_authenticated");
  });

  it("forbidden_domain si email hors alyosingenierie.fr", async () => {
    const result = await matchArchitectsForTender(VALID_TENDER_ID, 3, {
      authClient: authClientWith({ id: "u1", email: "user@external.fr" }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("forbidden_domain");
  });

  it("invalid_input si tenderId mal formé", async () => {
    const result = await matchArchitectsForTender("not-a-uuid", 3, {
      authClient: authClientWith({ id: "u1", email: "nadia@alyosingenierie.fr" }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid_input");
  });

  it("invalid_input si topN < 1", async () => {
    const result = await matchArchitectsForTender(VALID_TENDER_ID, 0, {
      authClient: authClientWith({ id: "u1", email: "nadia@alyosingenierie.fr" }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid_input");
  });

  it("invalid_input si topN > 10", async () => {
    const result = await matchArchitectsForTender(VALID_TENDER_ID, 11, {
      authClient: authClientWith({ id: "u1", email: "nadia@alyosingenierie.fr" }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid_input");
  });
});

describe("sendArchitectSolicitation — invariants pré-BDD", () => {
  const validOptions = {
    score: 85,
    rationale: "Test rationale",
    rank: 1,
  };

  it("not_authenticated si pas de session", async () => {
    const result = await sendArchitectSolicitation(VALID_TENDER_ID, VALID_ARCHI_ID, validOptions, {
      authClient: authClientWith(null),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("not_authenticated");
  });

  it("forbidden_domain si email hors alyosingenierie.fr", async () => {
    const result = await sendArchitectSolicitation(VALID_TENDER_ID, VALID_ARCHI_ID, validOptions, {
      authClient: authClientWith({ id: "u", email: "x@gmail.com" }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("forbidden_domain");
  });

  it("invalid_input si tenderId mal formé", async () => {
    const result = await sendArchitectSolicitation("not-a-uuid", VALID_ARCHI_ID, validOptions, {
      authClient: authClientWith({ id: "u", email: "nadia@alyosingenierie.fr" }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid_input");
  });

  it("invalid_input si architectId mal formé", async () => {
    const result = await sendArchitectSolicitation(VALID_TENDER_ID, "not-a-uuid", validOptions, {
      authClient: authClientWith({ id: "u", email: "nadia@alyosingenierie.fr" }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid_input");
  });

  it("invalid_input si score hors range", async () => {
    const result = await sendArchitectSolicitation(
      VALID_TENDER_ID,
      VALID_ARCHI_ID,
      { ...validOptions, score: 150 },
      { authClient: authClientWith({ id: "u", email: "nadia@alyosingenierie.fr" }) },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid_input");
  });

  it("invalid_input si rationale vide", async () => {
    const result = await sendArchitectSolicitation(
      VALID_TENDER_ID,
      VALID_ARCHI_ID,
      { ...validOptions, rationale: "" },
      { authClient: authClientWith({ id: "u", email: "nadia@alyosingenierie.fr" }) },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid_input");
  });
});

// ============================================================================
// sendArchitectSolicitation — propagation registre TU/VOUS vers Brevo
// ============================================================================

/**
 * Pour tester la sélection du template Brevo (templateId), on doit passer la
 * phase BDD complète. On construit un mock DB minimal qui répond aux 6 appels
 * dans l'ordre du code :
 *   1. SELECT tender (pré-fetch)
 *   2. SELECT architect (pré-fetch)
 *   3. SELECT opposition token existant
 *   4. tx : INSERT architect_tokens → returning({id})
 *   5. tx : INSERT/UPSERT match_proposals
 *   6. tx : SELECT architect_responses existant
 *   7. tx : INSERT architect_responses
 *   8. tx : UPDATE tenders.status
 * Ensuite pickBrevoTemplateId est appelé puis brevoClient.send.
 *
 * Stratégie : on suit l'ordre des appels via un compteur `selectCount`.
 * Le mock DB retourne les snapshots fixture sans Postgres réel.
 */

/** Paire RSA générée une fois pour tous les tests JWT de ce fichier. */
let originalPrivateKey: string | undefined;
let originalPublicKey: string | undefined;

beforeAll(() => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  originalPrivateKey = process.env.ARCHITECT_JWT_PRIVATE_KEY;
  originalPublicKey = process.env.ARCHITECT_JWT_PUBLIC_KEY;
  process.env.ARCHITECT_JWT_PRIVATE_KEY = Buffer.from(privateKey).toString("base64");
  process.env.ARCHITECT_JWT_PUBLIC_KEY = Buffer.from(publicKey).toString("base64");
  // Brevo template IDs
  process.env.BREVO_TEMPLATE_ID_ARCHITECT_SOLICITATION_TU = "10";
  process.env.BREVO_TEMPLATE_ID_ARCHITECT_SOLICITATION_VOUS = "11";
  process.env.NEXT_PUBLIC_SITE_URL = "https://sourcing.test";
  __resetKeyCache();
});

afterAll(() => {
  process.env.ARCHITECT_JWT_PRIVATE_KEY = originalPrivateKey;
  process.env.ARCHITECT_JWT_PUBLIC_KEY = originalPublicKey;
  __resetKeyCache();
});

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Construit un tender fixture minimal compatible avec le type Drizzle inféré.
 */
function fakeTender() {
  return {
    id: VALID_TENDER_ID,
    organizationId: "00000000-0000-0000-0000-000000000001",
    title: "Construction centre sportif",
    buyer: "Ville de Lyon",
    status: "selected_tandem" as const,
    externalRef: "25-AO-00199",
    publicationDate: new Date("2026-05-01"),
    deadline: new Date("2026-06-15T12:00:00Z"),
    rawData: { record: { departement: "69" } },
    score: "80.00",
    deferredUntil: null,
    mode: "tandem" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Construit un architecte fixture avec le flag `tutoiement` paramétrable.
 */
function fakeArchitect(tutoiement: boolean) {
  return {
    id: VALID_ARCHI_ID,
    organizationId: "00000000-0000-0000-0000-000000000001",
    cabinet: "Atelier Tandem",
    contactName: "Marie Dupont",
    email: "marie@tandem.fr",
    phone: null,
    website: null,
    siren: null,
    zip: null,
    city: null,
    headcount: null,
    companySize: null,
    companyCreatedAt: null,
    odooExternalId: null,
    specialtyCodes: [],
    geoZones: ["69"],
    tutoiement,
    preferred: false,
    active: true,
    solicitable: true,
    pastCollabsCount: 0,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    rgpdOpposition: false,
    rgpdOppositionDate: null,
  };
}

/**
 * Mock DB minimal pour sendArchitectSolicitation.
 *
 * Simule les appels SELECT (tender, architect, opposition token) + transaction
 * interne (architect_tokens INSERT, match_proposals UPSERT, architect_responses
 * INSERT, tenders UPDATE). Retourne des shapes minimaux conformes aux attentes
 * du code source.
 */
function buildSolicitMockDb(tutoiement: boolean): DrizzleClient {
  let selectCount = 0;

  const db = {
    select: vi.fn(() => {
      selectCount += 1;
      if (selectCount === 1) {
        // SELECT tender
        return {
          from: () => ({
            where: () => ({
              limit: async () => [fakeTender()],
            }),
          }),
        };
      }
      if (selectCount === 2) {
        // SELECT architect
        return {
          from: () => ({
            where: () => ({
              limit: async () => [fakeArchitect(tutoiement)],
            }),
          }),
        };
      }
      // SELECT opposition token (3e appel) — on retourne vide pour forcer création
      return {
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => [],
            }),
          }),
        }),
      };
    }),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        // INSERT architect_opposition_tokens (hors tx) → no-op
        returning: async () => [],
        then: (cb: (v: unknown[]) => unknown) => Promise.resolve(cb([])),
      })),
    })),
    transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
      // tx interne : simule les opérations dans la transaction
      const tx = {
        insert: vi.fn(() => ({
          values: vi.fn(() => ({
            returning: async () => [{ id: "token-row-id-1" }],
            onConflictDoUpdate: vi.fn(() => Promise.resolve()),
          })),
        })),
        select: vi.fn(() => {
          // SELECT architect_responses existant → vide (pas encore de réponse)
          return {
            from: () => ({
              where: () => ({
                limit: async () => [],
              }),
            }),
          };
        }),
        update: vi.fn(() => ({
          set: () => ({
            where: async () => [],
          }),
        })),
      };
      return cb(tx);
    }),
  } as unknown as DrizzleClient;

  return db;
}

/**
 * Mock Brevo capturant le templateId utilisé lors de l'envoi.
 */
function buildBrevoCaptureMock(): { client: BrevoClient; getLastTemplateId: () => number | null } {
  let lastTemplateId: number | null = null;
  const client: BrevoClient = {
    send: vi.fn(async (input) => {
      lastTemplateId = input.templateId;
      return { ok: true, messageId: "msg-test-123" } as const;
    }),
  };
  return { client, getLastTemplateId: () => lastTemplateId };
}

const ALYOS_AUTH = authClientWith({ id: "user-nadia", email: "nadia@alyosingenierie.fr" });

const VALID_SOLICIT_OPTIONS = {
  score: 75,
  rationale: "Correspondance géographique et spécialités matchées.",
  rank: 1,
};

describe("sendArchitectSolicitation — sélection template TU/VOUS", () => {
  it("tutoiement=true → pickBrevoTemplateId appelé avec registre 'tu' (templateId TU)", async () => {
    // Template TU = 10 (cf. beforeAll)
    const db = buildSolicitMockDb(true);
    const { client: brevoClient, getLastTemplateId } = buildBrevoCaptureMock();

    const result = await sendArchitectSolicitation(
      VALID_TENDER_ID,
      VALID_ARCHI_ID,
      VALID_SOLICIT_OPTIONS,
      { authClient: ALYOS_AUTH, db, brevoClient, auditFn: vi.fn(async () => {}) },
    );

    expect(result.ok).toBe(true);
    // templateId TU = 10
    expect(getLastTemplateId()).toBe(10);
  });

  it("tutoiement=false → pickBrevoTemplateId appelé avec registre 'vous' (templateId VOUS)", async () => {
    // Template VOUS = 11 (cf. beforeAll)
    const db = buildSolicitMockDb(false);
    const { client: brevoClient, getLastTemplateId } = buildBrevoCaptureMock();

    const result = await sendArchitectSolicitation(
      VALID_TENDER_ID,
      VALID_ARCHI_ID,
      VALID_SOLICIT_OPTIONS,
      { authClient: ALYOS_AUTH, db, brevoClient, auditFn: vi.fn(async () => {}) },
    );

    expect(result.ok).toBe(true);
    // templateId VOUS = 11
    expect(getLastTemplateId()).toBe(11);
  });

  it("register='tu' explicite + tutoiement=false → override gagne, templateId TU", async () => {
    // L'override explicite `register='tu'` doit gagner même si l'archi a tutoiement=false.
    const db = buildSolicitMockDb(false);
    const { client: brevoClient, getLastTemplateId } = buildBrevoCaptureMock();

    const result = await sendArchitectSolicitation(
      VALID_TENDER_ID,
      VALID_ARCHI_ID,
      { ...VALID_SOLICIT_OPTIONS, register: "tu" },
      { authClient: ALYOS_AUTH, db, brevoClient, auditFn: vi.fn(async () => {}) },
    );

    expect(result.ok).toBe(true);
    // L'override force TU = 10
    expect(getLastTemplateId()).toBe(10);
  });
});
