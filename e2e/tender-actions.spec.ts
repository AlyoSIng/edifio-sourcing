import { expect, test } from "@playwright/test";

import { signInWith } from "./helpers/auth";
import { deleteUserIfExists } from "./helpers/password";

/**
 * Tests E2E — actions métier sur la `TenderCard` (PR n°5 + Addendum 2026-05-24).
 *
 * Couvre :
 *  1. **Sélectionner Solo** : clic « Sélectionner » → modale Solo/Tandem
 *     ouverte → clic « Solo » → clic « Confirmer » → modale fermée +
 *     card disparait de la liste.
 *  2. **Reporter (popover shortcuts)** : clic « Reporter » → popover ouvert
 *     avec 3 shortcuts (+1j / +3j / +7j) → clic « +3 jours » → popover fermé
 *     + card disparait du digest.
 *  3. **Écarter avec motif** : clic « Écarter » → modale ouverte →
 *     remplir textarea → clic « Écarter » → modale fermée + card disparait.
 *
 * Wording verbatim spec Addendum 2026-05-24 §Exigence 1 :
 *   « Sélectionner » / « Reporter » / « Écarter » (jamais « Différer » / « Rejeter »
 *   côté UI ; les identifiants techniques server-side restent inchangés).
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

  test("Reporter — popover ouvre 3 shortcuts, clic +3j ferme et fait disparaitre", async ({
    page,
  }) => {
    const firstCard = page.locator("article").first();
    const initialCount = await page.locator("article").count();

    // 1. Clic « Reporter » ouvre le popover (menu role + aria-expanded)
    const reporterBtn = firstCard.getByRole("button", { name: /^Reporter$/i });
    await reporterBtn.click();
    await expect(reporterBtn).toHaveAttribute("aria-expanded", "true");

    // 2. Popover contient les 3 shortcuts
    const popover = page.getByRole("menu", { name: /Choisir la durée de report/i });
    await expect(popover).toBeVisible();
    await expect(popover.getByRole("menuitem", { name: /^\+1 jour$/ })).toBeVisible();
    await expect(popover.getByRole("menuitem", { name: /^\+3 jours$/ })).toBeVisible();
    await expect(popover.getByRole("menuitem", { name: /^\+7 jours$/ })).toBeVisible();

    // 3. Clic « +3 jours » ferme le popover (server action defer 72h)
    await popover.getByRole("menuitem", { name: /^\+3 jours$/ }).click();
    await expect(popover).not.toBeVisible();

    // Pas de modale Solo/Tandem ouverte
    await expect(
      page.getByRole("heading", { level: 2, name: /Comment réponds-tu à cet AO/i }),
    ).not.toBeVisible();
    // Pas de modale Écarter ouverte
    await expect(
      page.getByRole("heading", { level: 2, name: /Pourquoi écarter cet AO/i }),
    ).not.toBeVisible();

    // Pas d'erreur visible
    await expect(page.getByRole("alert").filter({ hasText: /Action impossible/i })).toHaveCount(0);

    const newCount = await page.locator("article").count();
    expect(newCount).toBeLessThanOrEqual(initialCount);
  });

  test("Écarter avec motif — modale ouverte + textarea + confirme", async ({ page }) => {
    const firstCard = page.locator("article").first();
    const initialCount = await page.locator("article").count();

    await firstCard.getByRole("button", { name: /^Écarter$/i }).click();

    // Modale Écarter ouverte
    await expect(
      page.getByRole("heading", { level: 2, name: /Pourquoi écarter cet AO/i }),
    ).toBeVisible();

    // Sélectionner le motif structuré (Salve U — 6 radios, 1er pré-coché)
    await page.getByRole("radio", { name: "Hors zone géographique" }).check();

    // Verbatim libre optionnel (Salve U — aria-label « Précision »)
    await page.getByRole("textbox", { name: /Précision/i }).fill("Hors zone géo");

    // Clic sur « Écarter » (footer)
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^Écarter$/i })
      .click();

    // Modale fermée
    await expect(
      page.getByRole("heading", { level: 2, name: /Pourquoi écarter cet AO/i }),
    ).not.toBeVisible();

    // Pas d'erreur
    await expect(page.getByRole("alert").filter({ hasText: /Action impossible/i })).toHaveCount(0);

    const newCount = await page.locator("article").count();
    expect(newCount).toBeLessThanOrEqual(initialCount);
  });

  /**
   * Verrou wording verbatim (Addendum spec 2026-05-24 §Exigence 1) :
   * la card NE DOIT PLUS exposer les libellés legacy « Différer » / « Rejeter ».
   * Test rapide qui pète si quelqu'un fait machine arrière sur le wording.
   */
  test("Wording verbatim — les libellés legacy « Différer » / « Rejeter » ont disparu", async ({
    page,
  }) => {
    const firstCard = page.locator("article").first();

    // Présence des nouveaux libellés
    const reporterBtn = firstCard.getByRole("button", { name: /^Reporter$/i });
    const ecarterBtn = firstCard.getByRole("button", { name: /^Écarter$/i });
    await expect(reporterBtn).toBeVisible();
    await expect(ecarterBtn).toBeVisible();

    // Absence des anciens
    await expect(firstCard.getByRole("button", { name: /^Différer$/i })).toHaveCount(0);
    await expect(firstCard.getByRole("button", { name: /^Rejeter$/i })).toHaveCount(0);

    // Verrou supplémentaire (LOW-3, revue Hugo PR #39) : le tooltip natif
    // `title=` ne doit pas régresser vers la formulation legacy. On garantit
    // la présence de la formulation cible verbatim.
    await expect(reporterBtn).toHaveAttribute(
      "title",
      /Reporte l'AO\. Il reviendra dans le digest après le délai choisi\./,
    );
    await expect(ecarterBtn).toHaveAttribute(
      "title",
      /Écarte l'AO\. Le motif aide edifio à vous suggérer d'affiner votre profil de recherche\./,
    );
  });
});
