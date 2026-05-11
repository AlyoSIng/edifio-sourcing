import { expect, test } from "@playwright/test";

import { getCookieFor, signInWith } from "./helpers/auth";

/**
 * Tests E2E du middleware de domaine `@alyosingenierie.fr`.
 *
 * Source : `specs/middleware_domain_gate.md` §4 (7 scénarios bloquants Gate 6).
 *
 * **Statut étape 2 Gate 6** : tous les tests sont marqués `.skip` car ils
 * dépendent de Supabase Auth magic-link (étape 3 — branchement réel).
 * Les helpers `signInWith` / `getCookieFor` lèvent une erreur explicite tant
 * que l'étape 3 n'est pas finalisée (cf. `e2e/helpers/auth.ts`).
 *
 * TODO étape 3 — Retirer les `.skip` une fois Supabase Auth opérationnel.
 * Aucun autre changement à ce fichier ne sera nécessaire (signatures identiques).
 */

test.describe("Middleware de domaine — matrice spec §2 / scénarios §4", () => {
  test.skip("C4 — un utilisateur @gmail.com est rejeté sur /sourcing/*", async ({ page }) => {
    await signInWith(page, "bob@gmail.com");
    await page.goto("/sourcing/ao-du-jour");
    await expect(page).toHaveURL(/\/forbidden/);
  });

  test.skip("C3 — un utilisateur @alyosingenierie.fr accède à /sourcing/*", async ({ page }) => {
    await signInWith(page, "alice@alyosingenierie.fr");
    await page.goto("/sourcing/ao-du-jour");
    await expect(page).toHaveURL(/\/sourcing\/ao-du-jour/);
  });

  test.skip("C2 — un utilisateur anonyme est redirigé vers /login", async ({ page }) => {
    await page.goto("/sourcing/ao-du-jour");
    await expect(page).toHaveURL(/\/login\?next=/);
  });

  test.skip("C11 — casse insensitive : ALICE@AlyosIngenierie.FR fonctionne", async ({ page }) => {
    await signInWith(page, "ALICE@AlyosIngenierie.FR");
    await page.goto("/sourcing/ao-du-jour");
    await expect(page).toHaveURL(/\/sourcing\/ao-du-jour/);
  });

  test.skip("C10 — domaine cousin alyosingenierie.com rejeté", async ({ page }) => {
    await signInWith(page, "alice@alyosingenierie.com");
    await page.goto("/sourcing/ao-du-jour");
    await expect(page).toHaveURL(/\/forbidden/);
  });

  test.skip("C12 — sous-domaine dev.alyosingenierie.fr rejeté", async ({ page }) => {
    await signInWith(page, "alice@dev.alyosingenierie.fr");
    await page.goto("/sourcing/ao-du-jour");
    await expect(page).toHaveURL(/\/forbidden/);
  });

  test.skip("C7 — appel API protégée hors domaine renvoie 403 JSON", async ({ request }) => {
    const r = await request.post("/api/protected/tenders/select", {
      data: { tender_id: "xxx" },
      headers: { cookie: await getCookieFor("bob@gmail.com") },
    });
    expect(r.status()).toBe(403);
    expect(await r.json()).toEqual(expect.objectContaining({ error: "forbidden_domain" }));
  });
});
