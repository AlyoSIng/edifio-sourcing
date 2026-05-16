import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isTestRouteEnabled } from "./route";

/**
 * Test unit du triple-gate de la route /api/test/seed-session.
 *
 * Garde-fou anti-prod : si quelqu'un retire l'une des 3 conditions par
 * inadvertance, ce test échoue. Cf. brief Board 2026-05-16 — option α.
 *
 * Note : on ne teste pas la logique métier (sign-in Supabase) en unit, c'est
 * couvert par les E2E Playwright qui invoquent la vraie route via fetch.
 *
 * On utilise `vi.stubEnv` (API officielle Vitest) plutôt qu'une mutation
 * directe de `process.env` : avec `@types/node` 20+ la propriété `NODE_ENV`
 * est typée readonly. `vi.stubEnv` contourne proprement et restaure
 * automatiquement via `vi.unstubAllEnvs` en teardown.
 */

describe("seed-session triple-gate (isTestRouteEnabled)", () => {
  beforeEach(() => {
    // Repart d'un env propre — chaque cas pose explicitement ce qu'il teste.
    vi.stubEnv("NODE_ENV", "");
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "");
    vi.stubEnv("E2E_TEST_ROUTES_ENABLED", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ouvre si NODE_ENV=development ET opt-in === '1'", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("E2E_TEST_ROUTES_ENABLED", "1");
    expect(isTestRouteEnabled()).toBe(true);
  });

  it("ouvre si NEXT_PUBLIC_APP_ENV=preview ET opt-in === '1' (Vercel preview)", () => {
    vi.stubEnv("NODE_ENV", "production"); // Vercel pose toujours production
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "preview");
    vi.stubEnv("E2E_TEST_ROUTES_ENABLED", "1");
    expect(isTestRouteEnabled()).toBe(true);
  });

  it("ferme si NODE_ENV=production ET NEXT_PUBLIC_APP_ENV=production ET opt-in === '1'", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production");
    vi.stubEnv("E2E_TEST_ROUTES_ENABLED", "1");
    expect(isTestRouteEnabled()).toBe(false);
  });

  it("ferme si NODE_ENV=development MAIS opt-in absent", () => {
    vi.stubEnv("NODE_ENV", "development");
    // E2E_TEST_ROUTES_ENABLED reste à "" (≠ "1")
    expect(isTestRouteEnabled()).toBe(false);
  });

  it("ferme si NODE_ENV=development MAIS opt-in === '0'", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("E2E_TEST_ROUTES_ENABLED", "0");
    expect(isTestRouteEnabled()).toBe(false);
  });

  it("ferme si NODE_ENV=development MAIS opt-in === 'true' (valeur exacte '1' requise)", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("E2E_TEST_ROUTES_ENABLED", "true");
    expect(isTestRouteEnabled()).toBe(false);
  });
});
