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

/**
 * Mode « cible distante » — quand on lance les E2E contre une preview Vercel
 * déjà déployée (workflow `ci-e2e-preview.yml`), on N'a PAS besoin que
 * Playwright démarre un webServer local : la cible est l'URL preview portée
 * par `PLAYWRIGHT_BASE_URL`. Le flag dédié `PLAYWRIGHT_SKIP_WEB_SERVER=1`
 * désactive le bloc `webServer` du config.
 *
 * Pourquoi ne pas simplement se reposer sur `PLAYWRIGHT_BASE_URL !== localhost` ?
 * Parce qu'on veut une opt-in explicite : un dev qui pose `PLAYWRIGHT_BASE_URL`
 * sur un tunnel ngrok local pourrait quand même vouloir le webServer. Le flag
 * sépare clairement l'intention (« j'ai déjà un serveur prêt, ne lance rien »).
 */
const skipWebServer = process.env.PLAYWRIGHT_SKIP_WEB_SERVER === "1";

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
  // En mode « cible distante » (preview Vercel), pas de webServer — la cible
  // est déjà UP. Sinon : webServer local (build CI ou dev local).
  webServer: skipWebServer
    ? undefined
    : {
        // En CI, on bascule sur le build de prod (`next start`) : `next dev`
        // compile chaque route à la première requête, ce qui sur les runners
        // ubuntu dépasse fréquemment les timeouts de navigation (10 s par défaut
        // sur `page.waitForURL`). Le build initial prend ~30-45 s mais le
        // routing devient instantané ensuite.
        // En local on garde `pnpm dev` pour le hot-reload.
        command: isCI ? "pnpm build && pnpm start" : "pnpm dev",
        url: baseURL,
        reuseExistingServer: !isCI,
        // 240 s en CI pour absorber le build initial ; 120 s en local pour le
        // démarrage normal de next dev.
        timeout: isCI ? 240_000 : 120_000,
        stdout: "ignore",
        stderr: "pipe",
      },
});
