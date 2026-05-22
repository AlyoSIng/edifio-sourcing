import { expect, test } from "@playwright/test";

import { signInWith } from "./helpers/auth";

/**
 * Tests E2E P3 (2026-05-22) — session expirée sur `/api/admin/*`.
 *
 * Avant le patch P3, le middleware renvoyait un 307 vers `/login` sur les
 * routes API quand la session était absente. Le fetch côté UI suivait le
 * redirect par défaut, recevait la page HTML du login et plantait à
 * `await resp.json()` avec `Unexpected token <`.
 *
 * Après patch : le middleware renvoie un JSON 401 sur `/api/admin/*` et
 * `/api/protected/*` quand pas de session. Le caller UI (`InviteUserDialog`,
 * `RegeneratePasswordButton`) détecte le 401 et redirige manuellement vers
 * `/login?next=/sourcing/admin/users`.
 *
 * Scaffolding pour Camille (qa) — couvre :
 *   - C1 : appel API admin sans session → JSON 401 (pas HTML, pas redirect).
 *   - C2 : UI consommateur après expiration session → message + redirect.
 *   - C3 : appel API protégé (non-admin) sans session → JSON 401.
 *
 * Camille pourra compléter avec des cas de bordure (ex. cookies sb-* malformés,
 * token JWT expiré côté Supabase) en fonction des scénarios qu'elle juge utiles.
 *
 * Prérequis : `.env.local` avec `E2E_TEST_ROUTES_ENABLED=1` + Supabase configuré
 * (idem `e2e/middleware-domain.spec.ts`).
 */
test.describe("P3 — Session expirée sur /api/admin/* renvoie JSON 401 (pas HTML)", () => {
  test("C1 — POST /api/admin/users sans cookie renvoie JSON 401", async ({ request }) => {
    const r = await request.post("/api/admin/users", {
      data: { email: "test@alyosingenierie.fr", first_name: "T", last_name: "T", role: "user" },
    });

    // Avant patch P3 : 307 redirect vers /login (text/html, signal du bug).
    // Après patch : 401 JSON propre.
    expect(r.status()).toBe(401);

    const contentType = r.headers()["content-type"] ?? "";
    expect(contentType).toContain("application/json");

    const body = await r.json();
    expect(body).toEqual(
      expect.objectContaining({
        ok: false,
        error: "unauthorized",
      }),
    );
  });

  test("C2 — POST /api/admin/users/:id/regenerate-password sans cookie renvoie JSON 401", async ({
    request,
  }) => {
    const r = await request.post(
      "/api/admin/users/00000000-0000-0000-0000-000000000000/regenerate-password",
    );

    expect(r.status()).toBe(401);
    const contentType = r.headers()["content-type"] ?? "";
    expect(contentType).toContain("application/json");

    const body = await r.json();
    expect(body).toEqual(
      expect.objectContaining({
        ok: false,
        error: "unauthorized",
      }),
    );
  });

  /**
   * 🟠 TODO Camille (qa) — réactiver quand le helper E2E admin sera posé.
   *
   * Bloqueur : le helper `signInWith` actuel crée un user via la route de
   * test E2E mais ne lui attribue PAS le rôle admin. Le user atterrit donc
   * sur `/sourcing/ao-du-jour?error=forbidden` au lieu de
   * `/sourcing/admin/users` (cf. middleware role check).
   *
   * À poser pour réactiver ce test (Camille) :
   * (a) étendre la route `POST /api/test/e2e/seed-session` avec un paramètre
   *     `role: "admin" | "user"` (default "user") qui met à jour
   *     `app_metadata.role` Supabase du user créé, OU
   * (b) créer un nouveau helper `signInAsAdminWith(page, email)` qui chaîne
   *     seed-session standard + appel à une route dédiée
   *     `POST /api/test/e2e/promote-admin` (gatée `E2E_TEST_ROUTES_ENABLED=1`).
   *
   * Tracé Task #16 (clarification écart tests Vitest avec Camille).
   * À compléter dans le brief E2E Camille pour Tandem étape 2.
   */
  test.fixme("C3 — UI : InviteUserDialog après session purgée redirige vers /login?next=...", async ({
    page,
    context,
  }) => {
    // 1. Connexion admin valide (helper E2E gated).
    await signInWith(page, "e2e-test+admin-c3@alyosingenierie.fr");
    await page.goto("/sourcing/admin/users");
    await expect(page).toHaveURL(/\/sourcing\/admin\/users/);

    // 2. Purge des cookies sb-* pour simuler une session expirée. Le user
    //    reste sur la page (déjà rendue SSR) — le bug se déclenche quand
    //    il interagit (submit du form).
    const cookies = await context.cookies();
    const sbCookies = cookies.filter((c) => c.name.startsWith("sb-"));
    for (const c of sbCookies) {
      await context.clearCookies({ name: c.name });
    }

    // 3. Ouvre la modale d'invitation et soumet — on s'attend à un
    //    redirect propre vers /login, PAS à un crash JSON.parse.
    await page.getByRole("button", { name: /inviter un collaborateur/i }).click();
    await page.getByLabel(/email alyos/i).fill("nouveau@alyosingenierie.fr");
    await page.getByLabel(/^prénom$/i).fill("Test");
    await page.getByLabel(/^nom$/i).fill("Bug P3");
    await page.getByRole("button", { name: /créer et envoyer/i }).click();

    // 4. Attendre le redirect manuel posé par le composant patch P3.
    await page.waitForURL(/\/login\?next=/, { timeout: 5000 });
    const url = new URL(page.url());
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("next")).toBe("/sourcing/admin/users");
  });

  test("C4 — POST /api/protected/* sans cookie renvoie JSON 401 (extension défensive)", async ({
    request,
  }) => {
    const r = await request.post("/api/protected/tenders/select", {
      data: { tender_id: "xxx" },
    });

    expect(r.status()).toBe(401);
    const contentType = r.headers()["content-type"] ?? "";
    expect(contentType).toContain("application/json");

    const body = await r.json();
    expect(body).toEqual(
      expect.objectContaining({
        ok: false,
        error: "unauthorized",
      }),
    );
  });
});
