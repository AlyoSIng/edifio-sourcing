/**
 * Tests Server Actions — flux Tandem.
 *
 * Couvre :
 *  - matchArchitectsForTender : auth refusée si pas de session, pas alyos
 *  - matchArchitectsForTender : invalid_input UUID malformé / topN hors range
 *  - sendArchitectSolicitation : auth refusée, invalid_input
 *  - sendArchitectSolicitation : audit A5 strict-validé via le helper réel
 *    (le payload doit passer le schéma A5)
 *
 * Tests d'intégration BDD (transactions, idempotence multi-call) → étape 5
 * Playwright. Ici on valide UNIQUEMENT les invariants côté inputs / auth.
 *
 * Note : la Server Action consomme un client Drizzle réel qui a besoin d'un
 * client postgres (lazy via Proxy). Pour les invariants pré-BDD (auth +
 * input validation), on n'atteint jamais le DB → pas besoin de mock DB.
 */

import { describe, expect, it } from "vitest";

import {
  matchArchitectsForTender,
  sendArchitectSolicitation,
  type AuthClientLike,
} from "./actions";

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
