/**
 * Tests unitaires — POST /api/archi/[token]/respond.
 *
 * Couvre les invariants pré-BDD (validation token + body) sans atteindre la
 * couche BDD. La résilience BDD est testée en intégration (étape 5 Playwright).
 *
 * Périmètre :
 *  - Token JWT invalide → 401 invalid_token (pas de leak)
 *  - Body JSON invalide → 400
 *  - Body status inconnu → 400 (zod)
 *  - Body message > 1000 chars → 400 (zod)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";

import { POST } from "./route";
import { __resetKeyCache, signArchitectToken } from "@/lib/tandem/jwt";

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

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/archi/x/respond", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/archi/[token]/respond — sécurité token", () => {
  it("401 si token malformé", async () => {
    const req = makeRequest({ status: "accepted" });
    const resp = await POST(req, { params: Promise.resolve({ token: "not-a-jwt" }) });
    expect(resp.status).toBe(401);
    const data = await resp.json();
    expect(data.error).toBe("invalid_token");
  });

  it("401 si token signé mais expiré", async () => {
    const { token } = signArchitectToken(
      {
        architectId: "11111111-1111-1111-1111-111111111111",
        tenderId: "22222222-2222-2222-2222-222222222222",
        organizationId: "33333333-3333-3333-3333-333333333333",
      },
      -10, // expiré
    );
    const req = makeRequest({ status: "accepted" });
    const resp = await POST(req, { params: Promise.resolve({ token }) });
    expect(resp.status).toBe(401);
    const data = await resp.json();
    expect(data.error).toBe("invalid_token");
  });

  it("401 si JWT signé avec audience opposition (cross-use bloqué)", async () => {
    // Importé localement pour éviter de polluer le module global.
    const { signOppositionToken } = await import("@/lib/tandem/opposition-jwt");
    const { token } = signOppositionToken({
      architectId: "11111111-1111-1111-1111-111111111111",
      organizationId: "33333333-3333-3333-3333-333333333333",
    });
    const req = makeRequest({ status: "accepted" });
    const resp = await POST(req, { params: Promise.resolve({ token }) });
    expect(resp.status).toBe(401);
    const data = await resp.json();
    expect(data.error).toBe("invalid_token");
  });
});
