import { expect, test } from "@playwright/test";

import { getCookieFor, signInWith } from "./helpers/auth";

/**
 * Tests E2E du middleware de domaine `@alyosingenierie.fr`.
 *
 * Source : `specs/middleware_domain_gate.md` §4 (7 scénarios bloquants Gate 6).
 *
 * **Refactor 2026-05-16 (clôture ticket backlog Phase 2)** : les helpers
 * `signInWith` / `getCookieFor` passent désormais par la route gated
 * `POST /api/test/seed-session` (cf. `e2e/helpers/auth.ts`). La pose de
 * session est dé-couplée du chemin form-login + middleware, ce qui permet
 * de :
 *   - retirer les `test.fixme` qui couvraient C4/C7/C10/C12 ;
 *   - ré-appliquer le pattern `propagateAuthCookies` dans le middleware
 *     (commit f2c2e59 revert le 2026-05-15 par f14b0eb-ish) ;
 *   - ajouter un test défensif `cookies-invalidation` qui constate
 *     l'invariant spec §2 C4 « session invalidée immédiatement ».
 *
 * Prérequis local : `.env.local` à la racine avec `NEXT_PUBLIC_SUPABASE_URL`,
 * `SUPABASE_SERVICE_ROLE_KEY` ET `E2E_TEST_ROUTES_ENABLED=1`. Le webServer
 * Playwright démarre `pnpm dev` automatiquement (cf. `playwright.config.ts`).
 */
test.describe("Middleware de domaine — matrice spec §2 / scénarios §4", () => {
  test("C4 — un utilisateur @gmail.com est rejeté sur /sourcing/*", async ({ page }) => {
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

  test("C10 — domaine cousin alyosingenierie.com rejeté", async ({ page }) => {
    await signInWith(page, "alice@alyosingenierie.com");
    await page.goto("/sourcing/ao-du-jour");
    await expect(page).toHaveURL(/\/forbidden/);
  });

  test("C12 — sous-domaine dev.alyosingenierie.fr rejeté", async ({ page }) => {
    await signInWith(page, "alice@dev.alyosingenierie.fr");
    await page.goto("/sourcing/ao-du-jour");
    await expect(page).toHaveURL(/\/forbidden/);
  });

  test("C7 — appel API protégée hors domaine renvoie 403 JSON", async ({ request }) => {
    const r = await request.post("/api/protected/tenders/select", {
      data: { tender_id: "xxx" },
      headers: { cookie: await getCookieFor("bob@gmail.com") },
    });
    expect(r.status()).toBe(403);
    expect(await r.json()).toEqual(expect.objectContaining({ error: "forbidden_domain" }));
  });

  /**
   * Test défensif (nouveau 2026-05-16) — clôture la sous-action 2 du ticket
   * backlog Phase 2 : « ajouter test E2E défensif `expect(context.cookies())
   * .toHaveLength(0)` après rejet `/forbidden` ».
   *
   * Constat de l'invariant spec §2 C4 « session invalidée immédiatement » :
   * après que le middleware ait redirigé un user out-of-domain vers /forbidden
   * (et donc appelé `signOut` + propagé les cookies effacés), le contexte
   * browser ne doit plus porter aucun cookie de session Supabase.
   *
   * On accepte que le contexte puisse porter des cookies non-session (par
   * exemple un cookie tracking analytique futur) — on filtre strictement les
   * cookies dont le nom commence par `sb-` (préfixe Supabase Auth).
   */
  test("cookies-invalidation — après /forbidden, aucun cookie sb-* ne subsiste", async ({
    page,
    context,
  }) => {
    await signInWith(page, "bob@gmail.com");
    await page.goto("/sourcing/ao-du-jour");
    await expect(page).toHaveURL(/\/forbidden/);

    const supabaseCookies = (await context.cookies()).filter((c) => c.name.startsWith("sb-"));
    expect(supabaseCookies).toHaveLength(0);
  });
});
