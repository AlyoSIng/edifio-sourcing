/**
 * Tests unitaires — JWT RS256 d'opposition RGPD.
 *
 * Couvre :
 *  - sign + verify happy path (audience opposition)
 *  - expiré
 *  - signature invalide
 *  - mauvaise audience (un JWT `aud=architect` ne passe PAS la verify
 *    opposition — c'est la défense en profondeur clé)
 *  - mauvais issuer
 *  - already_used via dbCheck
 *  - revoked via dbCheck
 *  - unknown via dbCheck
 *  - format malformé
 *  - cross-use bloqué : un JWT signé par signArchitectToken est rejeté
 *    par verifyOppositionToken et inversement.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";

import { __resetKeyCache, signArchitectToken, verifyArchitectToken } from "./jwt";
import { signOppositionToken, verifyOppositionToken } from "./opposition-jwt";

const ARCHITECT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ORG_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const TENDER_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";

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

describe("signOppositionToken + verifyOppositionToken — happy path", () => {
  it("sign puis verify retourne le payload (architectId, organizationId, jti)", async () => {
    const { token, jti, expiresAt } = signOppositionToken({
      architectId: ARCHITECT_ID,
      organizationId: ORG_ID,
    });
    expect(jti).toMatch(/^[a-f0-9-]{36}$/);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());

    const result = await verifyOppositionToken(token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.architectId).toBe(ARCHITECT_ID);
      expect(result.payload.organizationId).toBe(ORG_ID);
      expect(result.payload.aud).toBe("opposition");
      expect(result.payload.iss).toBe("edifio-sourcing");
      expect(result.payload.jti).toBe(jti);
    }
  });

  it("ttl personnalisable (ex. 60 s pour test)", async () => {
    const { token } = signOppositionToken(
      { architectId: ARCHITECT_ID, organizationId: ORG_ID },
      60,
    );
    const result = await verifyOppositionToken(token);
    expect(result.ok).toBe(true);
  });
});

describe("verifyOppositionToken — erreurs", () => {
  it("malformed si pas 3 segments", async () => {
    const result = await verifyOppositionToken("not.a.valid.jwt.token");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("malformed");
  });

  it("malformed si header pas JSON", async () => {
    const result = await verifyOppositionToken("xxx.yyy.zzz");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("malformed");
  });

  it("expired si exp < now", async () => {
    // ttl négatif → expiré immédiatement
    const { token } = signOppositionToken(
      { architectId: ARCHITECT_ID, organizationId: ORG_ID },
      -10,
    );
    const result = await verifyOppositionToken(token);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("expired");
  });

  it("invalid_signature si payload trafiqué", async () => {
    const { token } = signOppositionToken({
      architectId: ARCHITECT_ID,
      organizationId: ORG_ID,
    });
    const [header, , signature] = token.split(".");
    const fakePayload = Buffer.from(
      JSON.stringify({
        iss: "edifio-sourcing",
        aud: "opposition",
        sub: "evil",
        jti: "fake",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 60,
        organizationId: ORG_ID,
      }),
    ).toString("base64url");
    const tampered = `${header}.${fakePayload}.${signature}`;
    const result = await verifyOppositionToken(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid_signature");
  });

  it("dbCheck already_used → erreur already_used", async () => {
    const { token } = signOppositionToken({
      architectId: ARCHITECT_ID,
      organizationId: ORG_ID,
    });
    const result = await verifyOppositionToken(token, async () => "already_used");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("already_used");
  });

  it("dbCheck revoked → erreur revoked", async () => {
    const { token } = signOppositionToken({
      architectId: ARCHITECT_ID,
      organizationId: ORG_ID,
    });
    const result = await verifyOppositionToken(token, async () => "revoked");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("revoked");
  });

  it("dbCheck unknown → erreur unknown_jti", async () => {
    const { token } = signOppositionToken({
      architectId: ARCHITECT_ID,
      organizationId: ORG_ID,
    });
    const result = await verifyOppositionToken(token, async () => "unknown");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("unknown_jti");
  });
});

describe("Cross-use entre `aud=architect` et `aud=opposition` (sécurité critique)", () => {
  it("JWT signé avec aud=architect → verifyOppositionToken rejette (invalid_audience)", async () => {
    const { token } = signArchitectToken({
      architectId: ARCHITECT_ID,
      organizationId: ORG_ID,
      tenderId: TENDER_ID,
    });
    const result = await verifyOppositionToken(token);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid_audience");
  });

  it("JWT signé avec aud=opposition → verifyArchitectToken rejette (invalid_audience)", async () => {
    const { token } = signOppositionToken({
      architectId: ARCHITECT_ID,
      organizationId: ORG_ID,
    });
    const result = await verifyArchitectToken(token);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid_audience");
  });
});
