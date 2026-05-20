import { describe, expect, it } from "vitest";

import { parseHashError } from "./parse-hash-error";

describe("parseHashError", () => {
  it("retourne null pour une chaîne vide", () => {
    expect(parseHashError("")).toBeNull();
  });

  it("retourne null pour un fragment sans paramètre d'erreur", () => {
    expect(parseHashError("access_token=xyz&refresh_token=abc&expires_in=3600")).toBeNull();
  });

  it("parse un fragment Supabase recovery avec token consommé (scanner email)", () => {
    const result = parseHashError(
      "error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
    );
    expect(result).toEqual({
      code: "otp_expired",
      description: "Email link is invalid or has expired",
    });
  });

  it("priorise error_code sur error quand les deux sont présents", () => {
    const result = parseHashError("error=access_denied&error_code=otp_expired");
    expect(result?.code).toBe("otp_expired");
  });

  it("fallback sur error quand error_code est absent", () => {
    expect(parseHashError("error=access_denied")).toEqual({
      code: "access_denied",
      description: "",
    });
  });

  it("URL-décode correctement les espaces dans description (+ → espace)", () => {
    const result = parseHashError(
      "error_code=otp_expired&error_description=Email+link+has+expired",
    );
    expect(result?.description).toBe("Email link has expired");
  });

  it("URL-décode correctement les caractères encodés (%20, accents)", () => {
    const result = parseHashError(
      "error_code=server_error&error_description=Erreur%20serveur%20inattendue",
    );
    expect(result?.description).toBe("Erreur serveur inattendue");
  });

  it("description par défaut à chaîne vide si non fournie", () => {
    expect(parseHashError("error_code=otp_expired")?.description).toBe("");
  });
});
