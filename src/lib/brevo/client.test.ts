/**
 * Tests unitaires — client Brevo (mock fetch).
 *
 * Couvre :
 *  - send happy path : POST API Brevo + retour messageId
 *  - missing_api_key : BREVO_API_KEY absent
 *  - invalid_recipient : email malformé
 *  - http_error : Brevo retourne 4xx/5xx
 *  - network : fetch throw
 *  - parse : réponse sans messageId
 *  - header X-Mailin-custom propagé
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { __resetBrevoClientCache, createBrevoClient } from "./client";

describe("createBrevoClient.send", () => {
  let originalEnv: NodeJS.ProcessEnv;
  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.BREVO_API_KEY = "xkeysib-test";
    __resetBrevoClientCache();
  });
  afterEach(() => {
    process.env = originalEnv;
    __resetBrevoClientCache();
  });

  it("envoie un email transactionnel et retourne messageId — happy path", async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    const fakeFetch: typeof fetch = async (url, init) => {
      captured = { url: typeof url === "string" ? url : url.toString(), init: init ?? {} };
      return new Response(JSON.stringify({ messageId: "<msg-123@brevo>" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    };
    const client = createBrevoClient({ fetchFn: fakeFetch });
    const result = await client.send({
      templateId: 42,
      to: { email: "marie@cabinet-test.fr", name: "Marie Dupont" },
      params: { archi_prenom: "Marie" },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.messageId).toBe("<msg-123@brevo>");
    expect(captured).not.toBeNull();
    expect(captured!.url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(captured!.init.method).toBe("POST");
    const headers = captured!.init.headers as Record<string, string>;
    expect(headers["api-key"]).toBe("xkeysib-test");
    const body = JSON.parse(captured!.init.body as string);
    expect(body.templateId).toBe(42);
    expect(body.to[0].email).toBe("marie@cabinet-test.fr");
    expect(body.params.archi_prenom).toBe("Marie");
  });

  it("retourne missing_api_key si BREVO_API_KEY absent", async () => {
    delete process.env.BREVO_API_KEY;
    const client = createBrevoClient({ fetchFn: async () => new Response("{}") });
    const result = await client.send({
      templateId: 1,
      to: { email: "x@y.fr" },
      params: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("missing_api_key");
  });

  it("retourne invalid_recipient si email malformé", async () => {
    const client = createBrevoClient({ fetchFn: async () => new Response("{}") });
    const result = await client.send({
      templateId: 1,
      to: { email: "not-an-email" },
      params: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid_recipient");
  });

  it("retourne http_error si Brevo retourne 4xx", async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ message: "Quota exceeded" }), { status: 402 });
    const client = createBrevoClient({ fetchFn: fakeFetch });
    const result = await client.send({
      templateId: 1,
      to: { email: "x@y.fr" },
      params: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("http_error");
      expect(result.status).toBe(402);
      expect(result.detail).toContain("Quota");
    }
  });

  it("retourne network si fetch throw", async () => {
    const fakeFetch: typeof fetch = async () => {
      throw new Error("ECONNREFUSED");
    };
    const client = createBrevoClient({ fetchFn: fakeFetch });
    const result = await client.send({
      templateId: 1,
      to: { email: "x@y.fr" },
      params: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("network");
  });

  it("retourne parse si réponse sans messageId", async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ status: "queued" }), { status: 201 });
    const client = createBrevoClient({ fetchFn: fakeFetch });
    const result = await client.send({
      templateId: 1,
      to: { email: "x@y.fr" },
      params: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("parse");
  });

  it("propage le header X-Mailin-custom", async () => {
    let captured: RequestInit | null = null;
    const fakeFetch: typeof fetch = async (_url, init) => {
      captured = init ?? null;
      return new Response(JSON.stringify({ messageId: "msg-1" }), { status: 201 });
    };
    const client = createBrevoClient({ fetchFn: fakeFetch });
    await client.send({
      templateId: 1,
      to: { email: "x@y.fr" },
      params: {},
      customHeader: "tender:uuid1;archi:uuid2",
    });
    const body = JSON.parse(captured!.body as string);
    expect(body.headers["X-Mailin-custom"]).toBe("tender:uuid1;archi:uuid2");
  });
});
