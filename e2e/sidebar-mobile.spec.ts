import { expect, test } from "@playwright/test";

/**
 * Tests E2E — Sidebar mobile hamburger (Tâche A7, Q1 Board 2026-05-22).
 *
 * Couvre 4 scénarios principaux :
 *  C1 — Mobile viewport (< 768 px) : bouton hamburger visible dans la Topbar,
 *       sidebar desktop inline cachée
 *  C2 — Click hamburger : drawer slide-in visible, backdrop apparaît, scroll
 *       body bloqué, focus déplacé sur le 1er lien
 *  C3 — Click backdrop : drawer slide-out, scroll body restauré
 *  C4 — Touche Escape : drawer slide-out
 *  C5 (bonus) — Click sur lien : navigation + drawer fermé automatiquement
 *
 * Camille (qa) étoffera les assertions (snapshots a11y, axe-core, screenshots
 * Playwright viewport mobile 375x667). Pour l'instant, scaffold `test.fixme()`
 * avec sélecteurs préliminaires.
 *
 * ----------------------------------------------------------------------------
 * Skip-policy
 * ----------------------------------------------------------------------------
 * Ces tests nécessitent un user connecté (les pages `/sourcing/*` sont
 * protégées par le middleware domaine). Comme `admin-profil.spec.ts`, on
 * skippe si `!DATABASE_URL` côté webServer.
 *
 * Pour faire tourner ces tests en local :
 *   1. .env.local avec DATABASE_URL pointant sur Postgres local
 *   2. pnpm db:seed:prod (compte e2e-test+admin-sidebar@alyosingenierie.fr)
 *   3. pnpm test:e2e e2e/sidebar-mobile.spec.ts
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);

const MOBILE_VIEWPORT = { width: 375, height: 667 };

test.describe("Sidebar mobile hamburger — A7 Q1 Board", () => {
  test.skip(!hasDatabase, "DATABASE_URL manquant — skip E2E sidebar mobile");

  test.use({ viewport: MOBILE_VIEWPORT });

  test.fixme("C1 — Mobile viewport : hamburger visible, sidebar inline cachée", async ({
    page,
  }) => {
    // TODO Camille : login admin + goto /sourcing/ao-du-jour
    await page.goto("/sourcing/ao-du-jour");
    const hamburger = page.getByRole("button", { name: /Ouvrir le menu/i });
    await expect(hamburger).toBeVisible();
    const desktopSidebar = page.getByRole("complementary", { name: /Navigation principale/i });
    await expect(desktopSidebar).toBeHidden();
  });

  test.fixme("C2 — Click hamburger ouvre le drawer + focus 1er lien", async ({ page }) => {
    await page.goto("/sourcing/ao-du-jour");
    await page.getByRole("button", { name: /Ouvrir le menu/i }).click();
    const drawer = page.getByRole("dialog", { name: /Menu de navigation/i });
    await expect(drawer).toBeVisible();
    // Backdrop présent
    // TODO Camille : assertion sur classe `bg-ink/60` ou data-attr
    // Focus sur 1er lien (logo edifio)
    const firstLink = drawer.getByRole("link", { name: /edifio Sourcing — Accueil/i });
    await expect(firstLink).toBeFocused();
    // Scroll body bloqué
    const bodyOverflow = await page.evaluate(() => document.body.style.overflow);
    expect(bodyOverflow).toBe("hidden");
  });

  test.fixme("C3 — Click backdrop ferme le drawer + scroll restauré", async ({ page }) => {
    await page.goto("/sourcing/ao-du-jour");
    await page.getByRole("button", { name: /Ouvrir le menu/i }).click();
    await expect(page.getByRole("dialog", { name: /Menu de navigation/i })).toBeVisible();

    // Click sur le backdrop (zone hors drawer ; viewport 375 → x=350 hors drawer 280px)
    await page.mouse.click(350, 300);
    await expect(page.getByRole("dialog", { name: /Menu de navigation/i })).toBeHidden();

    const bodyOverflow = await page.evaluate(() => document.body.style.overflow);
    expect(bodyOverflow).not.toBe("hidden");
  });

  test.fixme("C4 — Escape ferme le drawer", async ({ page }) => {
    await page.goto("/sourcing/ao-du-jour");
    await page.getByRole("button", { name: /Ouvrir le menu/i }).click();
    await expect(page.getByRole("dialog", { name: /Menu de navigation/i })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: /Menu de navigation/i })).toBeHidden();
  });

  test.fixme("C5 — Click sur un lien ferme le drawer + navigation", async ({ page }) => {
    await page.goto("/sourcing/ao-du-jour");
    await page.getByRole("button", { name: /Ouvrir le menu/i }).click();
    const drawer = page.getByRole("dialog", { name: /Menu de navigation/i });
    await expect(drawer).toBeVisible();

    // Click sur item "AO du jour" (déjà actif → re-navigation no-op mais ferme
    // quand même le drawer)
    await drawer.getByRole("link", { name: /AO du jour/i }).click();
    await expect(drawer).toBeHidden();
    await expect(page).toHaveURL(/\/sourcing\/ao-du-jour/);
  });
});
