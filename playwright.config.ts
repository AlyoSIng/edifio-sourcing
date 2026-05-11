import path from "node:path";

import { loadEnvConfig } from "@next/env";
import { defineConfig, devices } from "@playwright/test";

/**
 * Configuration Playwright pour les tests E2E.
 *
 * Source de vérité des cas testés : `specs/middleware_domain_gate.md` §4.
 *
 * Chargement des variables d'environnement via `@next/env` (le même loader
 * que Next.js → lit `.env.local`, `.env.preview`, etc. dans le bon ordre).
 * Nécessaire pour que les helpers E2E aient accès à `SUPABASE_SERVICE_ROLE_KEY`
 * (admin API pour générer les magic-links).
 */
loadEnvConfig(path.resolve(__dirname));

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: !isCI,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
