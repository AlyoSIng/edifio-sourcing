import { expect, test } from "@playwright/test";

import { signInWith } from "./helpers/auth";
import { deleteUserIfExists } from "./helpers/password";

/**
 * Tests E2E — page `/sourcing/ao-du-jour` (V1 read-only — PR n°4).
 *
 * Couvre :
 *   1. Accès non authentifié → redirect /login?next=/sourcing/ao-du-jour
 *   2. Accès authentifié @alyosingenierie.fr → page rendue avec <h1> visible
 *      ET soit la bannière d'erreur (role="alert"), soit l'empty state
 *      (role="status") — contrat de résilience runtime (cf. ci-dessous).
 *
 * Contrat de résilience (hotfix PR #22 — Board 2026-05-21) :
 *   - En CI E2E, le job `ci-e2e` NE FOURNIT PAS `DATABASE_URL` au webServer
 *     Playwright (par design : l'env E2E couvre middleware + auth + Resend,
 *     pas le métier BDD). On s'attend donc à voir l'`ErrorBanner`
 *     (role="alert") car le Proxy lazy `db` throw au premier `.select()`.
 *   - En local avec BDD vide (cron pas tourné), on verra l'`EmptyState`
 *     (role="status"). La 2e assertion accepte les deux cas pour rester
 *     déterministe en CI tout en documentant le contrat de résilience.
 *   - Dans tous les cas, le <h1>AO du jour</h1> DOIT être rendu — c'est
 *     l'invariant qui découple les autres tests E2E (auth-password) de
 *     la disponibilité de la BDD.
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
    // Le <h1> de la page contient "AO du jour" (cf. page.tsx). Invariant
    // garanti par le try/catch de résilience runtime (PR #22 hotfix).
    await expect(page.getByRole("heading", { level: 1, name: /AO du jour/i })).toBeVisible();

    // Contrat de résilience : on rend SOIT l'ErrorBanner (role="alert", cas
    // CI sans `DATABASE_URL`), SOIT l'EmptyState (role="status", cas BDD
    // vide en local), SOIT la liste (<article>, cas dev avec BDD populée).
    // Documente le fait qu'on n'a jamais de crash 500 et qu'on a toujours
    // un contenu visible utilisateur sous le <h1>.
    await expect(
      page.getByRole("alert").or(page.getByRole("status")).or(page.locator("article")).first(),
    ).toBeVisible();
  });
});
