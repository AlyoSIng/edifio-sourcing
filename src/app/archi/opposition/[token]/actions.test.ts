/**
 * Tests unitaires — Server Action opposeArchitect.
 *
 * Couvre les invariants pré-BDD (token invalide, audience croisée) sans
 * atteindre la couche BDD. Tests d'intégration BDD (révocation cascade,
 * single-use) → Playwright étape 5.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";

import { opposeArchitect } from "./actions";
import { __resetKeyCache, signArchitectToken } from "@/lib/tandem/jwt";
import { signOppositionToken } from "@/lib/tandem/opposition-jwt";

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

describe("opposeArchitect — sécurité token", () => {
  it("invalid_token si token malformé", async () => {
    const result = await opposeArchitect("not-a-jwt");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid_token");
  });

  it("invalid_token si token expiré", async () => {
    const { token } = signOppositionToken(
      {
        architectId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        organizationId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      },
      -10,
    );
    const result = await opposeArchitect(token);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid_token");
  });

  it("invalid_token si on tente d'utiliser un JWT aud=architect (cross-use bloqué)", async () => {
    const { token } = signArchitectToken({
      architectId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      tenderId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      organizationId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    });
    const result = await opposeArchitect(token);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid_token");
  });
});
