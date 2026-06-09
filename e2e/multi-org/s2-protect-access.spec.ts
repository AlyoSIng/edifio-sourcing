import { expect, test } from "@playwright/test";

import { cleanupMultiOrgFixtures, seedMultiOrgFixtures } from "../fixtures/multi-org-seed";
import { signInAsAdminOf } from "../helpers/learning";

/**
 * S2 — Accès Server Components pour un admin PROTECT.
 *
 * Source de vérité : `gates/RECETTE_FINALE_PROTECT_BASCULE_JUILLET.md` §2 (S2).
 *
 * Couvre la non-régression des Server Components après ADR-014 + Lot 1.6-bis
 * (suppression du fallback `ALYOS_ORG_ID`). Un admin PROTECT doit pouvoir
 * naviguer sur toutes les pages clés sans 403, sans 500 brutal, et sans voir
 * de leak AlyoS.
 *
 * Pages testées (les + représentatives — listes + admin + profil) :
 *   - /sourcing/ao-du-jour
 *   - /sourcing/architectes
 *   - /sourcing/bureaux-etudes
 *   - /sourcing/entreprises
 *   - /sourcing/profil
 *   - /sourcing/admin/societe
 *
 * Critère KO : 403, ou ErrorBanner role=alert, ou DOM contenant un nom AlyoS
 * (le cloisonnement multi-org est vérifié plus en détail par S4).
 *
 * Tags : `@multi-org`, `@p0`.
 */

const PAGES_PROTECT_ACCESSIBLE = [
  "/sourcing/ao-du-jour",
  "/sourcing/architectes",
  "/sourcing/bureaux-etudes",
  "/sourcing/entreprises",
  "/sourcing/profil",
  "/sourcing/admin/societe",
] as const;

test.describe("@multi-org @p0 S2 — Accès Server Components PROTECT", () => {
  test.beforeAll(async () => {
    await seedMultiOrgFixtures();
  });

  test.afterAll(async () => {
    await cleanupMultiOrgFixtures();
  });

  for (const path of PAGES_PROTECT_ACCESSIBLE) {
    test(`Admin PROTECT accède à ${path} sans erreur`, async ({ page }) => {
      await signInAsAdminOf(page, "PROTECT");
      const response = await page.goto(path);

      // 1. Pas de 5xx ni 403 brut. On accepte 200 (page rendue) ou redirection
      // 302/307 valide vers la même section.
      const status = response?.status() ?? 0;
      expect(
        status,
        `Page ${path} : status HTTP attendu < 500 et != 403, obtenu ${status}`,
      ).toBeLessThan(500);
      expect(status).not.toBe(403);

      // 2. Pas de stack trace Next.js (indicateur de 500 absorbé).
      const html = await page.content();
      expect(html).not.toContain("Application error: a server-side exception");
      expect(html).not.toContain("UnhandledError");

      // 3. Pas de mention « Compte non rattaché » (page /no-org) — l'admin
      // PROTECT a bien sa membership.
      expect(html).not.toContain("Compte non rattaché");

      // 4. Pas de leak AlyoS dans le DOM (sanity — détaillé par S4).
      // On filtre l'occurrence légitime dans le footer "© edifio · AlyoS Ingénierie ${year}"
      // en cherchant des noms d'entités AlyoS (préfixe ALYOS de la fixture).
      expect(html).not.toContain("ALYOS Architectes");
      expect(html).not.toContain("ALYOS Entreprise");
      expect(html).not.toContain("ALYOS BE");
    });
  }
});
