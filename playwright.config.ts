import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const isCI = !!process.env.CI;

/**
 * Configuration Playwright pour les tests E2E.
 *
 * Source de vérité des cas testés : specs/middleware_domain_gate.md §4.
 * À l'étape 2 Gate 6, les 7 tests middleware sont marqués `.skip` (TODO unskip
 * étape 3 quand Supabase Auth magic-link sera branché — la vraie session est
 * nécessaire pour valider C3/C4/C7/C11). Cf. e2e/middleware-domain.spec.ts.
 *
 * Les navigateurs ne sont volontairement PAS téléchargés à cette étape
 * (`pnpm exec playwright install` non lancé). À faire à l'étape 3.
 */
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
  // Pas de webServer config ici : le serveur Next.js est démarré à part
  // (pnpm dev ou Vercel preview). À ajuster étape 4 quand la CI démarrera le
  // serveur automatiquement.
});
