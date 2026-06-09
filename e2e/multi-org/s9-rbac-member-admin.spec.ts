import { expect, test } from "@playwright/test";

import { cleanupMultiOrgFixtures, seedMultiOrgFixtures } from "../fixtures/multi-org-seed";
import { signInAsAdminOf, signInAsMemberOf } from "../helpers/learning";

/**
 * S9 — Permission member vs admin (RBAC).
 *
 * Source de vérité : `gates/RECETTE_FINALE_PROTECT_BASCULE_JUILLET.md` §2 (S9).
 *
 * Couvre l'invariante RBAC du middleware racine + pages admin :
 *   - Un `member` (rôle `user` dans `memberships.role`) ne doit accéder à
 *     AUCUNE page `/sourcing/admin/*`. Pattern observé dans le code :
 *     `if (!isAdmin(profile)) redirect("/sourcing/ao-du-jour?error=forbidden")`
 *     (cf. `src/app/sourcing/admin/societe/page.tsx` L34 et `users/page.tsx` L58).
 *   - Un `admin` doit pouvoir y accéder (pas de 403/redirect).
 *
 * Pages testées (échantillon représentatif) :
 *   - `/sourcing/admin/societe`   → page admin classique
 *   - `/sourcing/admin/users`     → page admin liste users (la plus sensible)
 *
 * Critère KO : un member atteint /sourcing/admin/* avec un statut 200 et un
 * DOM admin → fuite de privilège, bug RBAC critique.
 *
 * Tags : `@multi-org`, `@p1`.
 */

const ADMIN_PAGES = ["/sourcing/admin/societe", "/sourcing/admin/users"] as const;

test.describe("@multi-org @p1 S9 — RBAC member vs admin", () => {
  test.beforeAll(async () => {
    await seedMultiOrgFixtures();
  });

  test.afterAll(async () => {
    await cleanupMultiOrgFixtures();
  });

  for (const adminPath of ADMIN_PAGES) {
    test(`Member PROTECT → ${adminPath} : redirect vers /sourcing/ao-du-jour?error=forbidden`, async ({
      page,
    }) => {
      await signInAsMemberOf(page, "PROTECT");
      await page.goto(adminPath, { waitUntil: "domcontentloaded" });

      // Le pattern applicatif fait un `redirect("/sourcing/ao-du-jour?error=forbidden")`
      // côté Server Component pour les non-admins. On accepte aussi 403 si
      // une future refacto introduit une page erreur dédiée, ou un retour
      // /no-org si l'user n'a pas de membership (ne devrait pas arriver ici
      // car le member est seedé avec une membership PROTECT).
      const currentUrl = page.url();
      const isRedirected =
        /\/sourcing\/ao-du-jour\?error=forbidden/.test(currentUrl) ||
        /\/forbidden/.test(currentUrl) ||
        /\/no-org/.test(currentUrl);
      expect(
        isRedirected,
        `Member PROTECT sur ${adminPath} doit être redirigé hors de l'admin. URL actuelle=${currentUrl}`,
      ).toBe(true);

      // Anti-leak : le DOM ne doit PAS contenir le titre admin de la page
      // ciblée (sinon le redirect est cosmétique mais le contenu a été rendu).
      const html = await page.content();
      expect(html).not.toMatch(/Administration\s*—\s*Utilisateurs/i);
      expect(html).not.toMatch(/Administration\s*—\s*Présentation société/i);
    });
  }

  for (const adminPath of ADMIN_PAGES) {
    test(`Admin PROTECT → ${adminPath} : accès accordé (200, pas de redirect)`, async ({
      page,
    }) => {
      await signInAsAdminOf(page, "PROTECT");
      const res = await page.goto(adminPath, { waitUntil: "domcontentloaded" });

      // Le status HTTP doit être 2xx (ou 3xx interne Next, mais pas 4xx/5xx).
      const status = res?.status() ?? 0;
      expect(
        status,
        `${adminPath} doit répondre 2xx/3xx pour admin PROTECT, reçu ${status}`,
      ).toBeLessThan(400);

      // L'URL finale doit rester sur la page admin (pas de redirect forbidden).
      const finalUrl = page.url();
      expect(finalUrl, `Admin PROTECT doit rester sur ${adminPath} (URL=${finalUrl})`).toContain(
        adminPath,
      );
      expect(finalUrl).not.toMatch(/\?error=forbidden/);

      // Pas de crash.
      const html = await page.content();
      expect(html).not.toContain("Application error: a server-side exception");
    });
  }

  test("Admin AlyoS → /sourcing/admin/users : page rendue sans crash (baseline)", async ({
    page,
  }) => {
    // Baseline AlyoS pour confirmer que la régression éventuelle n'est pas
    // une coupure globale RBAC mais bien spécifique PROTECT.
    await signInAsAdminOf(page, "ALYOS");
    const res = await page.goto("/sourcing/admin/users", { waitUntil: "domcontentloaded" });
    expect(res?.status() ?? 0).toBeLessThan(400);
    expect(page.url()).toContain("/sourcing/admin/users");
  });
});
