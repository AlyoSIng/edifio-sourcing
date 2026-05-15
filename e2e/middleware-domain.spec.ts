import { expect, test } from "@playwright/test";

import { getCookieFor, signInWith } from "./helpers/auth";

/**
 * Tests E2E du middleware de domaine `@alyosingenierie.fr`.
 *
 * Source : `specs/middleware_domain_gate.md` §4 (7 scénarios bloquants Gate 6).
 *
 * Activés à l'étape 3 (Supabase Auth magic-link branché). Les helpers
 * `signInWith` / `getCookieFor` (cf. `e2e/helpers/auth.ts`) utilisent l'API
 * admin Supabase (`auth.admin.generateLink`) pour se connecter à la volée
 * pour chaque test sans interaction utilisateur.
 *
 * Prérequis local : `.env.local` à la racine avec `NEXT_PUBLIC_SUPABASE_URL`
 * et `SUPABASE_SERVICE_ROLE_KEY`. Le webServer Playwright démarre `pnpm dev`
 * automatiquement (cf. `playwright.config.ts`).
 */

/**
 * Matrice hors-domaine — tests sous test.fixme en attendant
 * le refactor helper signInWith (ticket backlog Phase 2).
 *
 * Bug racine : la séquence form login + middleware signOut +
 * page.goto suivante part anonyme côté Playwright (cookies sb-*
 * effacés par signOut non propagés au redirect → state
 * non-déterministe entre tests selon l'ordre d'exécution).
 *
 * Cf. DECISIONS.md entrée 2026-05-15 (rollback f2c2e59 +
 * propagation cookies + S3 fixme).
 * Cf. specs/middleware_domain_gate.md §2 C4.
 *
 * Le refactor helper (option : admin.generateLink + cookies
 * manuels au lieu de form submit + redirect chaîné) résoudra
 * l'ensemble. Retirer les .fixme à ce moment.
 */
test.describe("Middleware de domaine — matrice spec §2 / scénarios §4", () => {
  test.fixme("C4 — un utilisateur @gmail.com est rejeté sur /sourcing/*", async ({ page }) => {
    await signInWith(page, "bob@gmail.com");
    await page.goto("/sourcing/ao-du-jour");
    await expect(page).toHaveURL(/\/forbidden/);
  });

  test("C3 — un utilisateur @alyosingenierie.fr accède à /sourcing/*", async ({ page }) => {
    await signInWith(page, "alice@alyosingenierie.fr");
    await page.goto("/sourcing/ao-du-jour");
    await expect(page).toHaveURL(/\/sourcing\/ao-du-jour/);
  });

  test("C2 — un utilisateur anonyme est redirigé vers /login", async ({ page }) => {
    await page.goto("/sourcing/ao-du-jour");
    await expect(page).toHaveURL(/\/login\?next=/);
  });

  test("C11 — casse insensitive : ALICE@AlyosIngenierie.FR fonctionne", async ({ page }) => {
    await signInWith(page, "ALICE@AlyosIngenierie.FR");
    await page.goto("/sourcing/ao-du-jour");
    await expect(page).toHaveURL(/\/sourcing\/ao-du-jour/);
  });

  test.fixme("C10 — domaine cousin alyosingenierie.com rejeté", async ({ page }) => {
    await signInWith(page, "alice@alyosingenierie.com");
    await page.goto("/sourcing/ao-du-jour");
    await expect(page).toHaveURL(/\/forbidden/);
  });

  test.fixme("C12 — sous-domaine dev.alyosingenierie.fr rejeté", async ({ page }) => {
    await signInWith(page, "alice@dev.alyosingenierie.fr");
    await page.goto("/sourcing/ao-du-jour");
    await expect(page).toHaveURL(/\/forbidden/);
  });

  test.fixme("C7 — appel API protégée hors domaine renvoie 403 JSON", async ({ request }) => {
    const r = await request.post("/api/protected/tenders/select", {
      data: { tender_id: "xxx" },
      headers: { cookie: await getCookieFor("bob@gmail.com") },
    });
    expect(r.status()).toBe(403);
    expect(await r.json()).toEqual(expect.objectContaining({ error: "forbidden_domain" }));
  });
});
