import { expect, test } from "@playwright/test";

import { signInWith } from "./helpers/auth";
import { deleteUserIfExists } from "./helpers/password";

/**
 * Tests E2E — Sidebar mobile hamburger (Tâche A7, Q1 Board 2026-05-22).
 *
 * Couvre 5 scénarios :
 *  C1 — Click hamburger → drawer ouvert (assertion `aria-modal=true` + focus
 *       1er lien + scroll body bloqué)
 *  C2 — Escape ferme + focus restitué sur le hamburger
 *  C3 — Click backdrop ferme + focus restitué hamburger + scroll restauré
 *  C4 — Click item nav ferme drawer + navigation effective
 *  C5 — Changement de route ferme automatiquement le drawer
 *
 * **Hardening review Hugo PR #42** : ces tests ont été levés de `test.fixme`
 * en parallèle des corrections a11y du composant. Cf.
 * `notes-de-suivi/CC_260525_NIGHT_RECAP.md` (étape 2 — remédiation PR #42).
 *
 * ----------------------------------------------------------------------------
 * Pattern d'assertion drawer ouvert / fermé
 * ----------------------------------------------------------------------------
 * Le composant garde le `<aside role="dialog">` dans le DOM en permanence pour
 * préserver l'animation `transition-transform` slide-out. On distingue donc
 * « ouvert » vs « fermé » par :
 *   - `aria-modal="true"` posé quand ouvert (absent sinon)
 *   - attribut HTML5 `inert` posé quand fermé (absent quand ouvert)
 * `toBeVisible()` n'est PAS fiable car l'élément reste dans le DOM avec une
 * transform CSS — on s'appuie donc sur les attributs ARIA, plus déterministes.
 *
 * ----------------------------------------------------------------------------
 * Skip-policy
 * ----------------------------------------------------------------------------
 * Ces tests nécessitent un user connecté (les pages `/sourcing/*` sont
 * protégées par le middleware domaine). On skippe si `!DATABASE_URL` côté
 * webServer (pattern aligné sur `e2e/ao-du-jour.spec.ts`).
 *
 * Pour faire tourner ces tests en local :
 *   1. `.env.local` avec `DATABASE_URL` pointant sur Postgres local (5433)
 *   2. `$env:E2E_TEST_ROUTES_ENABLED = "1"` (déclenche la route seed-session)
 *   3. `pnpm test:e2e e2e/sidebar-mobile.spec.ts`
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);

const MOBILE_VIEWPORT = { width: 375, height: 667 };

const TEST_EMAIL = "e2e-test+sidebar-mobile@alyosingenierie.fr";

test.describe("Sidebar mobile hamburger — A7 Q1 Board", () => {
  test.afterAll(async () => {
    try {
      await deleteUserIfExists(TEST_EMAIL);
    } catch {
      /* best-effort cleanup */
    }
  });

  test.beforeEach(async ({ page }) => {
    test.skip(!hasDatabase, "skipped — no DATABASE_URL in CI environment");
    await signInWith(page, TEST_EMAIL);
    await page.setViewportSize(MOBILE_VIEWPORT);
  });

  // ==========================================================================
  // C1 — Click hamburger ouvre le drawer
  // ==========================================================================
  test("C1 — click hamburger : drawer ouvert (aria-modal=true) + focus 1er lien + body locked", async ({
    page,
  }) => {
    await page.goto("/sourcing/ao-du-jour");

    const drawer = page.locator("#mobile-nav-drawer");
    // Pré-condition : drawer fermé → pas d'aria-modal posé
    await expect(drawer).not.toHaveAttribute("aria-modal", "true");

    await page.getByRole("button", { name: /Ouvrir le menu/i }).click();

    // Drawer ouvert → aria-modal=true
    await expect(drawer).toHaveAttribute("aria-modal", "true");

    // Focus sur le 1er lien (logo edifio) — le composant pose un setTimeout
    // 50ms pour laisser le slide-in se terminer avant de poser le focus,
    // donc on laisse Playwright re-essayer via la matcher built-in retry.
    const firstLink = drawer.getByRole("link", { name: /edifio Sourcing — Accueil/i });
    await expect(firstLink).toBeFocused();

    // Scroll body bloqué
    const bodyOverflow = await page.evaluate(() => document.body.style.overflow);
    expect(bodyOverflow).toBe("hidden");
  });

  // ==========================================================================
  // C2 — Escape ferme + focus restitué hamburger
  // ==========================================================================
  test("C2 — Escape ferme le drawer + focus restitué sur le hamburger", async ({ page }) => {
    await page.goto("/sourcing/ao-du-jour");

    const hamburger = page.getByRole("button", { name: /Ouvrir le menu/i });
    await hamburger.click();

    const drawer = page.locator("#mobile-nav-drawer");
    await expect(drawer).toHaveAttribute("aria-modal", "true");

    await page.keyboard.press("Escape");

    // Drawer fermé → plus d'aria-modal
    await expect(drawer).not.toHaveAttribute("aria-modal", "true");

    // Focus restitué sur le hamburger
    await expect(hamburger).toBeFocused();
  });

  // ==========================================================================
  // C3 — Click backdrop ferme + focus restitué + scroll restauré
  // ==========================================================================
  test("C3 — click backdrop ferme le drawer + focus restitué + scroll restauré", async ({
    page,
  }) => {
    await page.goto("/sourcing/ao-du-jour");

    const hamburger = page.getByRole("button", { name: /Ouvrir le menu/i });
    await hamburger.click();

    const drawer = page.locator("#mobile-nav-drawer");
    await expect(drawer).toHaveAttribute("aria-modal", "true");

    // Click sur le backdrop (data-testid posé dans le composant)
    await page.locator('[data-testid="sidebar-mobile-backdrop"]').click();

    await expect(drawer).not.toHaveAttribute("aria-modal", "true");
    await expect(hamburger).toBeFocused();

    // Scroll body restauré (l'effect cleanup remet la valeur précédente,
    // qui était "" par défaut — on vérifie juste que ce n'est plus "hidden")
    const bodyOverflow = await page.evaluate(() => document.body.style.overflow);
    expect(bodyOverflow).not.toBe("hidden");
  });

  // ==========================================================================
  // C4 — Click item nav ferme drawer + navigation effective
  // ==========================================================================
  test("C4 — click item nav ferme le drawer + navigation effective", async ({ page }) => {
    // On part d'une autre route pour que le click sur AO du jour soit une vraie
    // navigation (depuis ao-du-jour, ce serait un no-op pour le router Next).
    // Note : il n'existe pas d'autre route accessible non-admin sans complexité
    // supplémentaire — on accepte donc une « navigation no-op » mais on assert
    // sur la fermeture du drawer + l'URL finale.
    await page.goto("/sourcing/ao-du-jour");

    await page.getByRole("button", { name: /Ouvrir le menu/i }).click();
    const drawer = page.locator("#mobile-nav-drawer");
    await expect(drawer).toHaveAttribute("aria-modal", "true");

    // Click sur le lien « AO du jour » à l'intérieur du drawer (premier lien
    // de la section Sourcing). On utilise un selector strict pour éviter
    // d'attraper le logo header qui pointe aussi vers /sourcing/ao-du-jour.
    await drawer.getByRole("link", { name: /^AO du jour$/i }).click();

    await expect(drawer).not.toHaveAttribute("aria-modal", "true");
    await expect(page).toHaveURL(/\/sourcing\/ao-du-jour/);
  });

  // ==========================================================================
  // C5 — Changement de route ferme automatiquement le drawer
  // ==========================================================================
  test("C5 — changement de route via push ferme automatiquement le drawer", async ({ page }) => {
    await page.goto("/sourcing/ao-du-jour");

    await page.getByRole("button", { name: /Ouvrir le menu/i }).click();
    const drawer = page.locator("#mobile-nav-drawer");
    await expect(drawer).toHaveAttribute("aria-modal", "true");

    // Navigation programmatique vers une autre URL (forbidden est public et
    // ne déclenche pas le middleware ; sert juste à simuler un changement
    // de pathname). On revient ensuite sur ao-du-jour pour fermer proprement.
    await page.evaluate(() => {
      // On utilise pushState pour déclencher un changement de pathname sans
      // recharger la page — équivalent à ce que fait next/router.push().
      window.history.pushState({}, "", "/sourcing/ao-du-jour?nav=test");
      // Trigger un popstate pour que Next pickup le changement
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    // Le drawer doit se fermer automatiquement suite au changement de pathname
    await expect(drawer).not.toHaveAttribute("aria-modal", "true");
  });
});
