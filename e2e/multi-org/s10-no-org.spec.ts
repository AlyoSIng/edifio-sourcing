import { expect, test } from "@playwright/test";

import {
  cleanupMultiOrgFixtures,
  seedMultiOrgFixtures,
  MULTI_ORG_USERS,
} from "../fixtures/multi-org-seed";
import { signInWith } from "../helpers/auth";

/**
 * S10 — Page `/no-org` propre (anti-leak AlyoS).
 *
 * Source de vérité : `gates/RECETTE_FINALE_PROTECT_BASCULE_JUILLET.md` §2 (S10).
 *
 * Cette page est la sortie propre du `NoOrganizationMembershipError` levé par
 * `getRequiredOrgId` (Lot 1.6-bis — Hugo) quand un user authentifié n'a aucune
 * membership. Elle est CRITIQUE : sans elle, le call-site aurait soit retourné
 * un 500 brutal, soit (pire) été tenté de fallback sur ALYOS_ORG_ID.
 *
 * Assertions DOM strictes (coupe-circuit CC-2) :
 *   - h1 = "Compte non rattaché"
 *   - bouton "Se déconnecter"
 *   - mailto sebastien@edifio.fr
 *   - **AUCUN** lien vers `/sourcing/*`
 *   - **AUCUNE** mention de noms d'entités AlyoS (ALYOS Architectes etc.)
 *   - **AUCUN** data-attribute organization_id
 *   - le clic sur "Se déconnecter" ramène à /login
 *
 * Critère KO bloquant : un seul des asserts DOM fail → fuite de branding/data
 * AlyoS sur user externe.
 *
 * Tags : `@multi-org`, `@p0`.
 */

test.describe("@multi-org @p0 S10 — Page /no-org sans leak AlyoS", () => {
  test.beforeAll(async () => {
    await seedMultiOrgFixtures();
  });

  test.afterAll(async () => {
    await cleanupMultiOrgFixtures();
  });

  test("User orphelin atterrit sur /no-org après navigation app", async ({ page }) => {
    await signInWith(page, MULTI_ORG_USERS.ORPHAN);
    // Le user n'a aucune membership → `getRequiredOrgId` throw → redirect /no-org.
    await page.goto("/sourcing/ao-du-jour");
    await expect(page).toHaveURL(/\/no-org/, { timeout: 15_000 });
  });

  test("DOM /no-org : h1 + bouton logout + mailto présents", async ({ page }) => {
    await signInWith(page, MULTI_ORG_USERS.ORPHAN);
    await page.goto("/no-org");

    // h1 explicite.
    const h1 = page.locator("h1");
    await expect(h1).toContainText(/Compte non rattaché/i);

    // Bouton "Se déconnecter" présent (form action signOutAction).
    const logoutButton = page.locator("form button[type=submit]", { hasText: /Se déconnecter/i });
    await expect(logoutButton).toBeVisible();

    // Mailto vers sebastien@edifio.fr (lien + bouton "Contacter le support").
    const mailtoLink = page.locator('a[href^="mailto:sebastien@edifio.fr"]');
    await expect(mailtoLink.first()).toBeVisible();
  });

  test("DOM /no-org : AUCUN lien /sourcing/*", async ({ page }) => {
    await signInWith(page, MULTI_ORG_USERS.ORPHAN);
    await page.goto("/no-org");

    const sourcingLinks = page.locator('a[href^="/sourcing/"], a[href*="/sourcing/"]');
    await expect(sourcingLinks, "Aucun lien /sourcing/* ne doit fuiter sur /no-org").toHaveCount(0);
  });

  test("DOM /no-org : AUCUNE mention d'entités AlyoS de la fixture", async ({ page }) => {
    await signInWith(page, MULTI_ORG_USERS.ORPHAN);
    await page.goto("/no-org");
    const html = await page.content();

    // Pas de fuite des entités de la fixture multi-org (cabinets, BE, etc.).
    expect(html).not.toContain("ALYOS Architectes");
    expect(html).not.toContain("ALYOS BE");
    expect(html).not.toContain("ALYOS Entreprise");
    // Pas de fuite des emails d'admin (sanity).
    expect(html).not.toContain(MULTI_ORG_USERS.ALYOS.admin);

    // Pas de data-attribute organization_id.
    const dataOrgAttrs = page.locator("[data-org-id], [data-organization-id], [data-organization]");
    await expect(dataOrgAttrs).toHaveCount(0);
  });

  test("DOM /no-org : copyright mentionne uniquement AlyoS comme éditeur (autorisé)", async ({
    page,
  }) => {
    // Note : la page contient légitimement "© edifio · AlyoS Ingénierie {year}"
    // dans le footer (cf. src/app/no-org/page.tsx L80). C'est une mention
    // d'**éditeur**, pas un leak de données. On vérifie sa présence pour la
    // cohérence de marque, mais on ne le compte pas comme leak.
    await signInWith(page, MULTI_ORG_USERS.ORPHAN);
    await page.goto("/no-org");
    const html = await page.content();
    expect(html).toContain("AlyoS Ingénierie");
  });

  test("Clic Se déconnecter ramène à /login", async ({ page }) => {
    await signInWith(page, MULTI_ORG_USERS.ORPHAN);
    await page.goto("/no-org");

    const logoutButton = page.locator("form button[type=submit]", { hasText: /Se déconnecter/i });
    await logoutButton.click();

    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });
});
