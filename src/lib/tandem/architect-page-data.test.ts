/**
 * Tests unitaires — loadArchitectPageData (invariants verify uniquement).
 *
 * Tests d'intégration BDD (fetch tender + architect + match + response) →
 * Playwright étape 5. Ici on valide UNIQUEMENT que les erreurs de verify JWT
 * remontent proprement sans atteindre la couche BDD.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";

import { loadArchitectPageData } from "./architect-page-data";
import { __resetKeyCache, signArchitectToken } from "./jwt";
import { signOppositionToken } from "./opposition-jwt";

let originalPrivate: string | undefined;
let originalPublic: string | undefined;

beforeAll(() => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  originalPrivate = process.env.ARCHITECT_JWT_PRIVATE_KEY;
  originalPublic = process.env.ARCHITECT_JWT_PUBLIC_KEY;
  process.env.ARCHITECT_JWT_PRIVATE_KEY = Buffer.from(privateKey).toString("base64");
  process.env.ARCHITECT_JWT_PUBLIC_KEY = Buffer.from(publicKey).toString("base64");
  __resetKeyCache();
});

afterAll(() => {
  process.env.ARCHITECT_JWT_PRIVATE_KEY = originalPrivate;
  process.env.ARCHITECT_JWT_PUBLIC_KEY = originalPublic;
  __resetKeyCache();
});

describe("loadArchitectPageData — verify pré-BDD", () => {
  it("retourne malformed si token n'a pas 3 segments", async () => {
    const result = await loadArchitectPageData("not-a-jwt");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("malformed");
  });

  it("retourne expired si token signé mais ttl négatif", async () => {
    const { token } = signArchitectToken(
      {
        architectId: "11111111-1111-1111-1111-111111111111",
        tenderId: "22222222-2222-2222-2222-222222222222",
        organizationId: "33333333-3333-3333-3333-333333333333",
      },
      -10,
    );
    const result = await loadArchitectPageData(token);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("expired");
  });

  it("retourne invalid_audience si on présente un JWT aud=opposition", async () => {
    const { token } = signOppositionToken({
      architectId: "11111111-1111-1111-1111-111111111111",
      organizationId: "33333333-3333-3333-3333-333333333333",
    });
    const result = await loadArchitectPageData(token);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid_audience");
  });
});
