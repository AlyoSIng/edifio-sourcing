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
  PUBLIC_ARCHITECT_API_PREFIX,
  PUBLIC_ARCHITECT_PREFIX,
  PUBLIC_BREVO_WEBHOOK_PATH,
  PUBLIC_COTRAITANT_PREFIX,
  PUBLIC_ROUTES,
} from "./routes";

/**
 * Tests des helpers de routage middleware
 * (cf. `specs/middleware_domain_gate.md` §3.1 + extension auth password pivot
 * 2026-05-11 : ajout `/forgot-password` et `/reset-password` aux routes
 * publiques + nouveau préfixe admin).
 */
describe("constantes", () => {
  it("PUBLIC_ROUTES contient les routes publiques (étendu /pricing + /trial-expired ADR-014/T-billing + /no-org Lot 1.6-bis)", () => {
    expect(PUBLIC_ROUTES).toEqual([
      "/",
      "/about",
      "/pricing",
      "/login",
      "/auth/callback",
      "/forbidden",
      "/forgot-password",
      "/reset-password",
      "/trial-expired",
      "/no-org",
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

  it("PUBLIC_ARCHITECT_PREFIX vaut /archi/ (module Tandem)", () => {
    expect(PUBLIC_ARCHITECT_PREFIX).toBe("/archi/");
  });

  it("PUBLIC_ARCHITECT_API_PREFIX vaut /api/archi/ (module Tandem)", () => {
    expect(PUBLIC_ARCHITECT_API_PREFIX).toBe("/api/archi/");
  });

  it("PUBLIC_BREVO_WEBHOOK_PATH vaut /api/webhooks/brevo (module Tandem)", () => {
    expect(PUBLIC_BREVO_WEBHOOK_PATH).toBe("/api/webhooks/brevo");
  });

  it("PUBLIC_COTRAITANT_PREFIX vaut /cotraitant/ (partage cotraitant)", () => {
    expect(PUBLIC_COTRAITANT_PREFIX).toBe("/cotraitant/");
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
    "/archi/abc.def.ghi",
    "/archi/opposition/abc.def.ghi",
    "/api/archi/abc/respond",
    "/api/webhooks/brevo",
  ])("%s est publique (module Tandem — auth crypto côté handler)", (pathname) => {
    expect(isPublicRoute(pathname)).toBe(true);
  });

  it.each(["/cotraitant/550e8400-e29b-41d4-a716-446655440000", "/cotraitant/any-token-here"])(
    "%s est publique (partage cotraitant — token opaque)",
    (pathname) => {
      expect(isPublicRoute(pathname)).toBe(true);
    },
  );

  it("/cotraitant sans slash final n'est PAS publique (match préfixe strict)", () => {
    expect(isPublicRoute("/cotraitant")).toBe(false);
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
    // Variantes proches qui NE doivent PAS passer (anti-bypass) :
    "/archi", // pas de slash final
    "/api/archi", // pas de slash final
    "/api/webhooks/brevoo", // typo
    "/api/webhooks/brevo/extra", // pas exact-match
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
