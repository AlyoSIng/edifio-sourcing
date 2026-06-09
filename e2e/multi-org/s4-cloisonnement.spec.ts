import { expect, test } from "@playwright/test";

import {
  cleanupMultiOrgFixtures,
  seedMultiOrgFixtures,
  MULTI_ORG_IDS,
} from "../fixtures/multi-org-seed";
import { signInAsAdminOf } from "../helpers/learning";
import { assertOrgIsolation, countRowsForOrg } from "../helpers/db-checks";

/**
 * S4 — Cloisonnement multi-org CRITIQUE (coupe-circuit principal).
 *
 * Source de vérité : `gates/RECETTE_FINALE_PROTECT_BASCULE_JUILLET.md` §2 (S4).
 *
 * **Ce spec est le test le plus important de la suite multi-org.** S'il échoue
 * → fuite cross-tenant prouvée → STOP bascule juillet, escalade Steve immédiate
 * (cf. §5 rollback niveau 2 de la recette finale).
 *
 * Méthode (ultra-rigoureuse) :
 *   1. Côté BDD (via service_role) : vérifier qu'il existe bien 3 entités par
 *      type et par org dans la fixture (preuve d'état initial).
 *   2. Login admin ALYOS → /sourcing/architectes → assert présence de noms
 *      ALYOS, **absence stricte** de tout nom PROTECT ou DUPONT.
 *   3. Même check sur /sourcing/bureaux-etudes et /sourcing/entreprises.
 *   4. Logout, login admin PROTECT → symétrique : présence PROTECT, absence
 *      stricte de tout nom ALYOS ou DUPONT.
 *   5. Spot-check final côté BDD : aucune row mal taggée org_id.
 *
 * Critère KO : un seul nom de l'autre tenant visible côté UI, OU une row
 * service_role avec un mauvais organization_id.
 *
 * Tags : `@multi-org`, `@p0`.
 */

test.describe("@multi-org @p0 S4 — Cloisonnement multi-org strict", () => {
  test.beforeAll(async () => {
    await seedMultiOrgFixtures();
  });

  test.afterAll(async () => {
    await cleanupMultiOrgFixtures();
  });

  test("Pré-conditions BDD — 3 entités par type et par org dans la fixture", async () => {
    // Architectes : 3 par org.
    expect(await countRowsForOrg("architects", MULTI_ORG_IDS.ALYOS)).toBeGreaterThanOrEqual(3);
    expect(await countRowsForOrg("architects", MULTI_ORG_IDS.PROTECT)).toBeGreaterThanOrEqual(3);
    expect(
      await countRowsForOrg("architects", MULTI_ORG_IDS.CABINET_DUPONT),
    ).toBeGreaterThanOrEqual(3);

    // BE : 3 par org.
    expect(await countRowsForOrg("bureaux_etudes", MULTI_ORG_IDS.ALYOS)).toBeGreaterThanOrEqual(3);
    expect(await countRowsForOrg("bureaux_etudes", MULTI_ORG_IDS.PROTECT)).toBeGreaterThanOrEqual(
      3,
    );

    // Entreprises : 3 par org.
    expect(await countRowsForOrg("companies", MULTI_ORG_IDS.ALYOS)).toBeGreaterThanOrEqual(3);
    expect(await countRowsForOrg("companies", MULTI_ORG_IDS.PROTECT)).toBeGreaterThanOrEqual(3);

    // Spot-check isolation : aucune row mal taggée.
    await assertOrgIsolation("architects", MULTI_ORG_IDS.ALYOS, 3);
    await assertOrgIsolation("architects", MULTI_ORG_IDS.PROTECT, 3);
    await assertOrgIsolation("bureaux_etudes", MULTI_ORG_IDS.ALYOS, 3);
    await assertOrgIsolation("bureaux_etudes", MULTI_ORG_IDS.PROTECT, 3);
    await assertOrgIsolation("companies", MULTI_ORG_IDS.ALYOS, 3);
    await assertOrgIsolation("companies", MULTI_ORG_IDS.PROTECT, 3);
  });

  test("Admin ALYOS voit SES architectes, PAS ceux PROTECT ni DUPONT", async ({ page }) => {
    await signInAsAdminOf(page, "ALYOS");
    await page.goto("/sourcing/architectes");
    const html = await page.content();

    // Présence : au moins un cabinet ALYOS visible.
    expect(html).toContain("ALYOS Architectes");

    // **Absence stricte** : aucun nom PROTECT ni DUPONT.
    expect(html).not.toContain("PROTECT Architectes");
    expect(html).not.toContain("DUPONT Architectes");
  });

  test("Admin ALYOS voit SES BE, PAS ceux PROTECT ni DUPONT", async ({ page }) => {
    await signInAsAdminOf(page, "ALYOS");
    await page.goto("/sourcing/bureaux-etudes");
    const html = await page.content();

    expect(html).toContain("ALYOS BE");
    expect(html).not.toContain("PROTECT BE");
    expect(html).not.toContain("DUPONT BE");
  });

  test("Admin ALYOS voit SES entreprises, PAS celles PROTECT ni DUPONT", async ({ page }) => {
    await signInAsAdminOf(page, "ALYOS");
    await page.goto("/sourcing/entreprises");
    const html = await page.content();

    expect(html).toContain("ALYOS Entreprise");
    expect(html).not.toContain("PROTECT Entreprise");
    expect(html).not.toContain("DUPONT Entreprise");
  });

  test("Admin PROTECT voit SES architectes, PAS ceux ALYOS ni DUPONT (symétrie)", async ({
    page,
  }) => {
    await signInAsAdminOf(page, "PROTECT");
    await page.goto("/sourcing/architectes");
    const html = await page.content();

    expect(html).toContain("PROTECT Architectes");
    expect(html).not.toContain("ALYOS Architectes");
    expect(html).not.toContain("DUPONT Architectes");
  });

  test("Admin PROTECT voit SES BE, PAS ceux ALYOS ni DUPONT (symétrie)", async ({ page }) => {
    await signInAsAdminOf(page, "PROTECT");
    await page.goto("/sourcing/bureaux-etudes");
    const html = await page.content();

    expect(html).toContain("PROTECT BE");
    expect(html).not.toContain("ALYOS BE");
    expect(html).not.toContain("DUPONT BE");
  });

  test("Admin PROTECT voit SES entreprises, PAS celles ALYOS ni DUPONT (symétrie)", async ({
    page,
  }) => {
    await signInAsAdminOf(page, "PROTECT");
    await page.goto("/sourcing/entreprises");
    const html = await page.content();

    expect(html).toContain("PROTECT Entreprise");
    expect(html).not.toContain("ALYOS Entreprise");
    expect(html).not.toContain("DUPONT Entreprise");
  });

  test("Admin DUPONT voit SES entités, PAS celles ALYOS ni PROTECT (3e tenant)", async ({
    page,
  }) => {
    await signInAsAdminOf(page, "CABINET_DUPONT");
    await page.goto("/sourcing/architectes");
    const html = await page.content();

    expect(html).toContain("DUPONT Architectes");
    expect(html).not.toContain("ALYOS Architectes");
    expect(html).not.toContain("PROTECT Architectes");
  });
});
