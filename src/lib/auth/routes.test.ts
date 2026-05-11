import { describe, expect, it } from "vitest";

import {
  isProtectedApiRoute,
  isProtectedUiRoute,
  isPublicRoute,
  PROTECTED_API_PREFIX,
  PROTECTED_PREFIX,
  PUBLIC_ROUTES,
} from "./routes";

/**
 * Tests des helpers de routage middleware
 * (cf. `specs/middleware_domain_gate.md` §3.1).
 */
describe("constantes", () => {
  it("PUBLIC_ROUTES contient exactement les 5 routes publiques de la spec", () => {
    expect(PUBLIC_ROUTES).toEqual(["/", "/about", "/login", "/auth/callback", "/forbidden"]);
  });

  it("PROTECTED_PREFIX vaut /sourcing", () => {
    expect(PROTECTED_PREFIX).toBe("/sourcing");
  });

  it("PROTECTED_API_PREFIX vaut /api/protected", () => {
    expect(PROTECTED_API_PREFIX).toBe("/api/protected");
  });
});

describe("isPublicRoute", () => {
  it.each(["/", "/about", "/login", "/auth/callback", "/forbidden"])(
    "%s est publique",
    (pathname) => {
      expect(isPublicRoute(pathname)).toBe(true);
    },
  );

  it.each([
    "/sourcing",
    "/sourcing/ao-du-jour",
    "/api/protected/tenders/select",
    "/random",
    "/abouttt",
    "/login/extra",
  ])("%s n'est pas publique (match strict, pas de préfixe)", (pathname) => {
    expect(isPublicRoute(pathname)).toBe(false);
  });
});

describe("isProtectedUiRoute", () => {
  it.each(["/sourcing", "/sourcing/ao-du-jour", "/sourcing/tandem/123"])(
    "%s est protégée UI",
    (pathname) => {
      expect(isProtectedUiRoute(pathname)).toBe(true);
    },
  );

  it.each(["/", "/about", "/login", "/api/protected/anything", "/sourcin"])(
    "%s n'est PAS protégée UI",
    (pathname) => {
      expect(isProtectedUiRoute(pathname)).toBe(false);
    },
  );
});

describe("isProtectedApiRoute", () => {
  it.each(["/api/protected", "/api/protected/tenders/select", "/api/protected/architects"])(
    "%s est protégée API",
    (pathname) => {
      expect(isProtectedApiRoute(pathname)).toBe(true);
    },
  );

  it.each([
    "/api/auth/callback",
    "/api/health",
    "/sourcing",
    "/api/public/anything",
    "/api/protecte", // typo intentionnelle — match strict
  ])("%s n'est PAS protégée API", (pathname) => {
    expect(isProtectedApiRoute(pathname)).toBe(false);
  });
});
