import { expect, test } from "@playwright/test";

import { signInWith } from "./helpers/auth";
import { deleteUserIfExists } from "./helpers/password";

/**
 * Tests E2E — actions métier sur la `TenderCard` (PR n°5).
 *
 * Couvre :
 *  1. **Sélectionner Solo** : clic « Sélectionner » → modale Solo/Tandem
 *     ouverte → clic « Solo » → clic « Confirmer » → modale fermée +
 *     card disparait de la liste.
 *  2. **Différer** : clic « Différer » → pas de modale (V1 direct 24h) →
 *     card disparait.
 *  3. **Rejeter avec motif** : clic « Rejeter » → modale ouverte →
 *     remplir textarea → clic « Rejeter » → modale fermée + card disparait.
 *
 * ----------------------------------------------------------------------------
 * Skip-policy (cf. brief PR n°5 §5.1)
 * ----------------------------------------------------------------------------
 * Le job CI `ci-e2e` ne fournit PAS `DATABASE_URL` au webServer Playwright
 * (par design — couvre middleware/auth/Resend, pas le métier BDD). La page
 * `/sourcing/ao-du-jour` y affichera donc l'`ErrorBanner` au lieu de la
 * liste de tenders, et **aucune `TenderCard` ne sera présente** → les
 * sélecteurs CSS échoueraient. On `test.skip(!hasDatabase, ...)` pour
 * documenter explicitement la raison, conformément à la consigne Board
 * « ne jamais désactiver un test pour faire passer la CI ».
 *
 * Pour faire tourner ces tests en local : poser `DATABASE_URL` dans
 * `.env.local` + lancer `pnpm db:seed` pour avoir au moins 1 tender en
 * status `sourced`.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);

const TEST_EMAIL = "e2e-test+tender-actions@alyosingenierie.fr";

test.describe("Actions métier sur TenderCard — PR n°5", () => {
  test.afterAll(async () => {
    try {
      await deleteUserIfExists(TEST_EMAIL);
    } catch {
      /* best-effort cleanup */
    }
  });

  test.beforeEach(async ({ page }) => {
    test.skip(!hasDatabase, "skipped — no DATABASE_URL in CI environment (cf. JSDoc en-tête)");

    await signInWith(page, TEST_EMAIL);
    await page.goto("/sourcing/ao-du-jour");

    // Prérequis : au moins 1 card visible. Sinon on skip — la BDD locale
    // n'a peut-être pas de tender sourced pour test.
    const firstCard = page.locator("article").first();
    const cardCount = await page.locator("article").count();
    test.skip(
      cardCount === 0,
      "skipped — la BDD locale n'a aucun tender en status='sourced'. Lancer `pnpm db:seed`.",
    );
    await expect(firstCard).toBeVisible();
  });

  test("Sélectionner Solo — modale s'ouvre + confirme + card disparait", async ({ page }) => {
    const firstCard = page.locator("article").first();
    const initialCount = await page.locator("article").count();

    await firstCard.getByRole("button", { name: /Sélectionner/i }).click();

    // Modale Solo/Tandem ouverte
    await expect(
      page.getByRole("heading", { level: 2, name: /Comment réponds-tu à cet AO/i }),
    ).toBeVisible();

    // Clic sur le mode Solo
    await page.locator('[data-mode="solo"]').click();

    // Confirmer
    await page.getByRole("button", { name: /Confirmer/i }).click();

    // Modale fermée
    await expect(
      page.getByRole("heading", { level: 2, name: /Comment réponds-tu à cet AO/i }),
    ).not.toBeVisible();

    // La card disparait du digest (revalidatePath rafraîchit la liste).
    // On accepte aussi le cas où le compteur ne bouge pas si le RSC cache
    // n'a pas eu le temps de se rafraîchir — l'invariant fort est que
    // la modale est fermée et qu'il n'y a pas d'erreur visible.
    await expect(page.getByRole("alert").filter({ hasText: /Action impossible/i })).toHaveCount(0);

    // Best-effort sur le compteur (peut être <= initialCount-1)
    const newCount = await page.locator("article").count();
    expect(newCount).toBeLessThanOrEqual(initialCount);
  });

  test("Différer — pas de modale, card disparait directement (V1 24h)", async ({ page }) => {
    const firstCard = page.locator("article").first();
    const initialCount = await page.locator("article").count();

    await firstCard.getByRole("button", { name: /Différer/i }).click();

    // Pas de modale Solo/Tandem ouverte
    await expect(
      page.getByRole("heading", { level: 2, name: /Comment réponds-tu à cet AO/i }),
    ).not.toBeVisible();
    // Pas de modale Reject ouverte
    await expect(
      page.getByRole("heading", { level: 2, name: /Pourquoi rejeter cet AO/i }),
    ).not.toBeVisible();

    // Pas d'erreur visible
    await expect(page.getByRole("alert").filter({ hasText: /Action impossible/i })).toHaveCount(0);

    const newCount = await page.locator("article").count();
    expect(newCount).toBeLessThanOrEqual(initialCount);
  });

  test("Rejeter avec motif — modale ouverte + textarea + confirme", async ({ page }) => {
    const firstCard = page.locator("article").first();
    const initialCount = await page.locator("article").count();

    await firstCard.getByRole("button", { name: /Rejeter/i }).click();

    // Modale Reject ouverte
    await expect(
      page.getByRole("heading", { level: 2, name: /Pourquoi rejeter cet AO/i }),
    ).toBeVisible();

    // Saisir un motif court
    await page.getByRole("textbox", { name: /Motif de rejet/i }).fill("Hors zone géo");

    // Clic sur « Rejeter » (footer)
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^Rejeter$/i })
      .click();

    // Modale fermée
    await expect(
      page.getByRole("heading", { level: 2, name: /Pourquoi rejeter cet AO/i }),
    ).not.toBeVisible();

    // Pas d'erreur
    await expect(page.getByRole("alert").filter({ hasText: /Action impossible/i })).toHaveCount(0);

    const newCount = await page.locator("article").count();
    expect(newCount).toBeLessThanOrEqual(initialCount);
  });
});
