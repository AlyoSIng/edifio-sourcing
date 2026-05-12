import { describe, expect, it } from "vitest";

import { isRateLimitError } from "./rate-limit";

/**
 * Tests — détection rate-limit Supabase Auth (Board Q4/A 2026-05-12).
 *
 * On reproduit les 3 formes possibles d'erreur (selon version
 * `@supabase/supabase-js`) — sans dépendre de la lib elle-même.
 */

describe("isRateLimitError", () => {
  it("retourne false pour des valeurs falsy", () => {
    expect(isRateLimitError(null)).toBe(false);
    expect(isRateLimitError(undefined)).toBe(false);
    expect(isRateLimitError(0)).toBe(false);
    expect(isRateLimitError("")).toBe(false);
  });

  it("retourne false pour des erreurs hors rate-limit", () => {
    expect(isRateLimitError({ status: 400, message: "Bad request" })).toBe(false);
    expect(isRateLimitError({ status: 401, message: "Invalid login credentials" })).toBe(false);
    expect(isRateLimitError({ status: 500, message: "Internal server error" })).toBe(false);
    expect(isRateLimitError({ code: "invalid_grant", message: "..." })).toBe(false);
  });

  it("détecte `status === 429`", () => {
    expect(isRateLimitError({ status: 429, message: "Too Many Requests" })).toBe(true);
    expect(isRateLimitError({ status: 429 })).toBe(true);
  });

  it('détecte `code === "over_request_rate_limit"`', () => {
    expect(
      isRateLimitError({ code: "over_request_rate_limit", message: "Too many requests" }),
    ).toBe(true);
  });

  it("détecte un message contenant `rate limit` (case-insensitive)", () => {
    expect(isRateLimitError({ message: "Rate limit exceeded" })).toBe(true);
    expect(isRateLimitError({ message: "rate-limit exceeded" })).toBe(true);
    expect(isRateLimitError({ message: "RATE LIMIT for email auth" })).toBe(true);
  });

  it("ne se fait pas piéger par des messages similaires mais non rate-limit", () => {
    expect(isRateLimitError({ message: "ratecard not found" })).toBe(false);
    expect(isRateLimitError({ message: "limited time offer" })).toBe(false);
  });
});
