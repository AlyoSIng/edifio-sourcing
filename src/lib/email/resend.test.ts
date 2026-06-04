/**
 * Tests sendEmail — fallback RESEND_API_SOURCING_KEY → RESEND_API_KEY.
 *
 * Steve 2026-06-04. Vercel pose `RESEND_API_SOURCING_KEY` pour scoper la clé
 * au module Sourcing. Le code lit cette var d'abord, puis retombe sur le nom
 * historique `RESEND_API_KEY` si la première est absente (compat tests locaux
 * + scripts ops).
 *
 * Stratégie : on stub fetch via `endpoint` override et on vérifie quelle clé
 * a été utilisée dans le header Authorization.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendEmail } from "./resend";

const ORIGINAL_FETCH = global.fetch;

function makeOkResponse() {
  return new Response('{"id":"msg-1"}', {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("sendEmail — RESEND_API_SOURCING_KEY > RESEND_API_KEY", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_FROM_EMAIL", "no-reply@alyosingenierie.fr");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    global.fetch = ORIGINAL_FETCH;
  });

  it("utilise RESEND_API_SOURCING_KEY quand elle est posée", async () => {
    vi.stubEnv("RESEND_API_SOURCING_KEY", "re_sourcing_xxx");
    vi.stubEnv("RESEND_API_KEY", "re_legacy_yyy");

    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      void _input;
      void _init;
      return makeOkResponse();
    });
    global.fetch = fetchMock as typeof fetch;

    await sendEmail({
      to: "test@alyosingenierie.fr",
      subject: "Test",
      html: "<p>Hello</p>",
      text: "Hello",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer re_sourcing_xxx");
  });

  it("fallback sur RESEND_API_KEY si RESEND_API_SOURCING_KEY absente", async () => {
    vi.stubEnv("RESEND_API_SOURCING_KEY", "");
    vi.stubEnv("RESEND_API_KEY", "re_legacy_yyy");

    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      void _input;
      void _init;
      return makeOkResponse();
    });
    global.fetch = fetchMock as typeof fetch;

    await sendEmail({
      to: "test@alyosingenierie.fr",
      subject: "Test",
      html: "<p>Hello</p>",
      text: "Hello",
    });

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer re_legacy_yyy");
  });

  it("throw clair si aucune des 2 clés n'est configurée", async () => {
    vi.stubEnv("RESEND_API_SOURCING_KEY", "");
    vi.stubEnv("RESEND_API_KEY", "");

    await expect(
      sendEmail({
        to: "test@alyosingenierie.fr",
        subject: "Test",
        html: "<p>Hello</p>",
        text: "Hello",
      }),
    ).rejects.toThrow(/RESEND_API_SOURCING_KEY/);
  });
});
