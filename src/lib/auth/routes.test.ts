import { describe, expect, it } from "vitest";

import {
  ADMIN_API_PREFIX,
  ADMIN_PREFIX,
  isAdminRoute,
  isProtectedApiRoute,
  isProtectedUiRoute,
  isPublicRoute,
  PROTECTED_API_PREFIX,
  PROTECTED_PREFIX,
  PUBLIC_ROUTES,
} from "./routes";

/**
 * Tests des helpers de routage middleware
 * (cf. `specs/middleware_domain_gate.md` §3.1 + extension auth password pivot
 * 2026-05-11 : ajout `/forgot-password` et `/reset-password` aux routes
 * publiques + nouveau préfixe admin).
 */
describe("constantes", () => {
  it("PUBLIC_ROUTES contient les 7 routes publiques de la spec étendue", () => {
    expect(PUBLIC_ROUTES).toEqual([
      "/",
      "/about",
      "/login",
      "/auth/callback",
      "/forbidden",
      "/forgot-password",
      "/reset-password",
    ]);
  });

  it("PROTECTED_PREFIX vaut /sourcing", () => {
    expect(PROTECTED_PREFIX).toBe("/sourcing");
  });

  it("PROTECTED_API_PREFIX vaut /api/protected", () => {
    expect(PROTECTED_API_PREFIX).toBe("/api/protected");
  });

  it("ADMIN_PREFIX vaut /sourcing/admin", () => {
    expect(ADMIN_PREFIX).toBe("/sourcing/admin");
  });

  it("ADMIN_API_PREFIX vaut /api/admin", () => {
    expect(ADMIN_API_PREFIX).toBe("/api/admin");
  });
});

describe("isPublicRoute", () => {
  it.each([
    "/",
    "/about",
    "/login",
    "/auth/callback",
    "/forbidden",
    "/forgot-password",
    "/reset-password",
  ])("%s est publique", (pathname) => {
    expect(isPublicRoute(pathname)).toBe(true);
  });

  it.each([
    "/sourcing",
    "/sourcing/ao-du-jour",
    "/api/protected/tenders/select",
    "/random",
    "/abouttt",
    "/login/extra",
    "/reset-passwordd",
    "/forgot-password/extra",
  ])("%s n'est pas publique (match strict, pas de préfixe)", (pathname) => {
    expect(isPublicRoute(pathname)).toBe(false);
  });
});

describe("isProtectedUiRoute", () => {
  it.each(["/sourcing", "/sourcing/ao-du-jour", "/sourcing/tandem/123", "/sourcing/admin/users"])(
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
  it.each([
    "/api/protected",
    "/api/protected/tenders/select",
    "/api/protected/architects",
    "/api/admin",
    "/api/admin/users",
  ])("%s est protégée API", (pathname) => {
    expect(isProtectedApiRoute(pathname)).toBe(true);
  });

  it.each([
    "/api/auth/callback",
    "/api/health",
    "/sourcing",
    "/api/public/anything",
    "/api/protecte", // typo intentionnelle — match strict
    "/api/admi", // typo intentionnelle — match strict
  ])("%s n'est PAS protégée API", (pathname) => {
    expect(isProtectedApiRoute(pathname)).toBe(false);
  });
});

describe("isAdminRoute", () => {
  it.each(["/sourcing/admin", "/sourcing/admin/users", "/api/admin", "/api/admin/users/abc"])(
    "%s requiert role admin",
    (pathname) => {
      expect(isAdminRoute(pathname)).toBe(true);
    },
  );

  it.each(["/sourcing", "/sourcing/ao-du-jour", "/api/protected/tenders", "/admin"])(
    "%s ne requiert PAS role admin",
    (pathname) => {
      expect(isAdminRoute(pathname)).toBe(false);
    },
  );
});
