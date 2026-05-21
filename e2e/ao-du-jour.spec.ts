import { expect, test } from "@playwright/test";

import { signInWith } from "./helpers/auth";
import { deleteUserIfExists } from "./helpers/password";

/**
 * Tests E2E — page `/sourcing/ao-du-jour` (V1 read-only — PR n°4).
 *
 * Couvre :
 *   1. Accès non authentifié → redirect /login?next=/sourcing/ao-du-jour
 *   2. Accès authentifié @alyosingenierie.fr → page rendue avec <h1> visible
 *
 * Hors scope (PR ultérieure) :
 *   - test des actions Sélectionner / Différer / Rejeter (pas wireup V1)
 *   - test du tri par score (pas d'interaction utilisateur V1)
 *   - test du compteur dynamique après cron (E2E non-déterministe, couvert
 *     par les tests unit `queries.test.ts` côté contrat data)
 *
 * Pattern aligné sur `e2e/auth-password.spec.ts` (helper `signInWith` via
 * route `/api/test/seed-session` posant directement les cookies sb-*).
 */

const TEST_EMAIL = "e2e-test+ao-du-jour@alyosingenierie.fr";

test.describe("Page AO du jour — V1 read-only", () => {
  test.afterAll(async () => {
    try {
      await deleteUserIfExists(TEST_EMAIL);
    } catch {
      /* best-effort cleanup */
    }
  });

  test("redirect vers /login si pas authentifié", async ({ page }) => {
    await page.goto("/sourcing/ao-du-jour");
    await expect(page).toHaveURL(/\/login\?next=%2Fsourcing%2Fao-du-jour/);
  });

  test("page rendue après login @alyosingenierie.fr", async ({ page }) => {
    await signInWith(page, TEST_EMAIL);

    await page.goto("/sourcing/ao-du-jour");
    // Le <h1> de la page contient "AO du jour" (cf. page.tsx).
    await expect(page.getByRole("heading", { level: 1, name: /AO du jour/i })).toBeVisible();
  });
});
