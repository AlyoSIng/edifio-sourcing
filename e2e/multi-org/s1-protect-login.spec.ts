import { expect, test } from "@playwright/test";

import { cleanupMultiOrgFixtures, seedMultiOrgFixtures } from "../fixtures/multi-org-seed";
import { signInAsAdminOf } from "../helpers/learning";

/**
 * S1 — Connexion PROTECT sans erreur forbidden_domain.
 *
 * Source de vérité : `gates/RECETTE_FINALE_PROTECT_BASCULE_JUILLET.md` §2 (S1).
 * Couvre l'ouverture multi-tenant ADR-014 (Board 2026-06-05) — un user
 * `@protect-marseille.com` (hors `@alyosingenierie.fr` historique) doit pouvoir
 * se connecter et atteindre `/sourcing/ao-du-jour` SANS rencontrer la garde
 * domaine retirée (qui aurait redirigé vers `/forbidden?error=forbidden_domain`
 * dans l'ancien middleware).
 *
 * Critère KO bloquant (CC-2 escalade) : l'utilisateur tombe sur `/forbidden`
 * ou la page contient un DOM `forbidden_domain` → ADR-014 n'a pas pris.
 *
 * Tags : `@multi-org`, `@p0`.
 */

test.describe("@multi-org @p0 S1 — Connexion PROTECT sans forbidden_domain", () => {
  test.beforeAll(async () => {
    await seedMultiOrgFixtures();
  });

  test.afterAll(async () => {
    await cleanupMultiOrgFixtures();
  });

  test("Admin PROTECT atterrit sur /sourcing/ao-du-jour", async ({ page }) => {
    await signInAsAdminOf(page, "PROTECT");

    // page.goto déclenche le middleware. Si la garde domaine était encore
    // active, on serait redirigé vers /forbidden. ADR-014 → on doit atteindre
    // /sourcing/ao-du-jour directement.
    await page.goto("/sourcing/ao-du-jour");
    await expect(page).toHaveURL(/\/sourcing\/ao-du-jour/, { timeout: 15_000 });

    // Anti-régression DOM : aucune trace de l'ancien code d'erreur.
    const html = await page.content();
    expect(html).not.toContain("forbidden_domain");
    // Sanity : pas de stack trace 500.
    expect(html).not.toContain("Application error: a server-side exception");
    expect(html).not.toContain("UnhandledError");
  });

  test("Member PROTECT atterrit également sur l'app (rôle user)", async ({ page }) => {
    const { MULTI_ORG_USERS } = await import("../fixtures/multi-org-seed");
    const { signInWith } = await import("../helpers/auth");
    await signInWith(page, MULTI_ORG_USERS.PROTECT.member);

    await page.goto("/sourcing/ao-du-jour");
    await expect(page).toHaveURL(/\/sourcing\/ao-du-jour/, { timeout: 15_000 });
  });

  test("Login DOM ne mentionne pas 'forbidden_domain' après login PROTECT", async ({ page }) => {
    await signInAsAdminOf(page, "PROTECT");
    // On va sur la page d'accueil sourcing — l'AppShell ne doit afficher aucun
    // texte d'erreur lié à la garde domaine.
    await page.goto("/sourcing/ao-du-jour");
    await expect(page.locator("body")).not.toContainText(/forbidden_domain/i);
    await expect(page.locator("body")).not.toContainText(/domaine non autoris/i);
  });
});
