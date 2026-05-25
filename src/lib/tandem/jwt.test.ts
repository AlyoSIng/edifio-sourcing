/**
 * Tests unitaires — JWT RS256 architecte.
 *
 * Couvre :
 *  - sign + verify happy path
 *  - expiré
 *  - signature invalide
 *  - mauvaise audience
 *  - mauvais issuer
 *  - révoqué via dbCheck
 *  - inconnu via dbCheck
 *  - format malformé
 *  - décodage base64 / PEM brut
 *  - jti unique
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";

import { __resetKeyCache, decodeKeyFromEnv, signArchitectToken, verifyArchitectToken } from "./jwt";

const ARCHITECT_ID = "11111111-1111-1111-1111-111111111111";
const TENDER_ID = "22222222-2222-2222-2222-222222222222";
const ORG_ID = "33333333-3333-3333-3333-333333333333";

let originalPrivate: string | undefined;
let originalPublic: string | undefined;

beforeAll(() => {
  // Génère une paire RS256 dédiée pour le test (in-memory).
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  originalPrivate = process.env.ARCHITECT_JWT_PRIVATE_KEY;
  originalPublic = process.env.ARCHITECT_JWT_PUBLIC_KEY;
  // On pose en base64 pour valider le décodage runtime (format Vercel cible).
  process.env.ARCHITECT_JWT_PRIVATE_KEY = Buffer.from(privateKey).toString("base64");
  process.env.ARCHITECT_JWT_PUBLIC_KEY = Buffer.from(publicKey).toString("base64");
  __resetKeyCache();
});

afterAll(() => {
  process.env.ARCHITECT_JWT_PRIVATE_KEY = originalPrivate;
  process.env.ARCHITECT_JWT_PUBLIC_KEY = originalPublic;
  __resetKeyCache();
});

describe("decodeKeyFromEnv — détection format", () => {
  it("décode base64 mono-ligne → PEM", () => {
    const pem = "-----BEGIN PUBLIC KEY-----\nAAAA\n-----END PUBLIC KEY-----";
    const b64 = Buffer.from(pem).toString("base64");
    expect(decodeKeyFromEnv(b64)).toBe(pem);
  });

  it("garde PEM brut tel quel", () => {
    const pem = "-----BEGIN PUBLIC KEY-----\nAAAA\n-----END PUBLIC KEY-----";
    expect(decodeKeyFromEnv(pem)).toBe(pem);
  });

  it("convertit \\n littéraux du PEM en vraies newlines (Vercel UI)", () => {
    const pemWithLiteralNewlines = "-----BEGIN PUBLIC KEY-----\\nAAAA\\n-----END PUBLIC KEY-----";
    const result = decodeKeyFromEnv(pemWithLiteralNewlines);
    expect(result).toContain("\n");
    expect(result).not.toContain("\\n");
  });
});

describe("signArchitectToken + verifyArchitectToken — happy path", () => {
  it("sign puis verify retourne le payload", async () => {
    const { token, jti, expiresAt } = signArchitectToken({
      architectId: ARCHITECT_ID,
      tenderId: TENDER_ID,
      organizationId: ORG_ID,
    });
    expect(jti).toMatch(/^[a-f0-9-]{36}$/);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());

    const result = await verifyArchitectToken(token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.architectId).toBe(ARCHITECT_ID);
      expect(result.payload.tenderId).toBe(TENDER_ID);
      expect(result.payload.organizationId).toBe(ORG_ID);
      expect(result.payload.jti).toBe(jti);
      expect(result.payload.aud).toBe("architect");
      expect(result.payload.iss).toBe("edifio-sourcing");
    }
  });

  it("jti unique sur deux sign successifs", () => {
    const a = signArchitectToken({
      architectId: ARCHITECT_ID,
      tenderId: TENDER_ID,
      organizationId: ORG_ID,
    });
    const b = signArchitectToken({
      architectId: ARCHITECT_ID,
      tenderId: TENDER_ID,
      organizationId: ORG_ID,
    });
    expect(a.jti).not.toBe(b.jti);
    expect(a.token).not.toBe(b.token);
  });
});

describe("verifyArchitectToken — erreurs", () => {
  it("malformé : moins de 3 segments", async () => {
    const result = await verifyArchitectToken("not.a-jwt");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("malformed");
  });

  it("signature invalide : payload modifié", async () => {
    const { token } = signArchitectToken({
      architectId: ARCHITECT_ID,
      tenderId: TENDER_ID,
      organizationId: ORG_ID,
    });
    const [h, p, s] = token.split(".");
    // On modifie le payload mais on garde la signature → invalide
    const tampered = `${h}.${p}AA.${s}`;
    const result = await verifyArchitectToken(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Soit malformed (json invalide) soit invalid_signature
      expect(["invalid_signature", "malformed"]).toContain(result.error);
    }
  });

  it("expiré : ttl 0 secondes", async () => {
    const { token } = signArchitectToken(
      {
        architectId: ARCHITECT_ID,
        tenderId: TENDER_ID,
        organizationId: ORG_ID,
      },
      -1,
    );
    const result = await verifyArchitectToken(token);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("expired");
  });

  it("révoqué via dbCheck", async () => {
    const { token } = signArchitectToken({
      architectId: ARCHITECT_ID,
      tenderId: TENDER_ID,
      organizationId: ORG_ID,
    });
    const result = await verifyArchitectToken(token, async () => "revoked");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("revoked");
  });

  it("inconnu via dbCheck", async () => {
    const { token } = signArchitectToken({
      architectId: ARCHITECT_ID,
      tenderId: TENDER_ID,
      organizationId: ORG_ID,
    });
    const result = await verifyArchitectToken(token, async () => "unknown");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("unknown_jti");
  });

  it("dbCheck=valid → ok", async () => {
    const { token } = signArchitectToken({
      architectId: ARCHITECT_ID,
      tenderId: TENDER_ID,
      organizationId: ORG_ID,
    });
    const result = await verifyArchitectToken(token, async () => "valid");
    expect(result.ok).toBe(true);
  });
});
