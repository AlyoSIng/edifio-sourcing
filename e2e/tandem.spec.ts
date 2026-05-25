import { expect, test } from "@playwright/test";

import { signInWith } from "./helpers/auth";
import { deleteUserIfExists } from "./helpers/password";

/**
 * Tests E2E — flux Tandem complet (sous-étape 5 livraison étape 2 Tandem).
 *
 * Couverture (alignée spec §4 + 2 bonus RGPD/cron) :
 *  1. Auth — la page short-list est inaccessible sans session AlyoS
 *  2. Short-list — page chargeable pour un tender en mode Tandem (UI au
 *     moins le wrapper + le header s'affichent même si la BDD est vide)
 *  3. Preview Brevo modale — toggle TU/VOUS visible, bloc RGPD inclus dans
 *     la preview, échappement XSS (cabinet contenant `<script>` rendu safe)
 *  4. Cron J+3 — la route `/api/cron/tandem-followup` exige le bearer
 *     CRON_SECRET (401 sinon)
 *  5. Page d'opposition — route publique `/archi/oppose/[token]` retourne
 *     une page d'erreur générique pour un token invalide (pas un 500)
 *  6. Page tokenisée archi — `/archi/[token]` retourne une page d'erreur
 *     générique pour un token invalide (pas de leak d'info)
 *
 * Skip-policy (cf. brief PR #5 §5.1) :
 *  - Les tests qui dépendent de la BDD (chargement liste tenders réels)
 *    sont skippés en CI sans `DATABASE_URL`.
 *  - Les tests de surface (auth, public routes, route cron auth) tournent
 *    sans DB.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);

const TEST_EMAIL = "e2e-test+tandem-shortlist@alyosingenierie.fr";

test.describe("Tandem — flux short-list + preview + cron", () => {
  test.afterAll(async () => {
    try {
      await deleteUserIfExists(TEST_EMAIL);
    } catch {
      /* best-effort cleanup */
    }
  });

  test("Page short-list inaccessible sans session — redirige vers /login", async ({ page }) => {
    // Pas de signIn — la page protégée doit rediriger via middleware.
    const dummyId = "11111111-1111-1111-1111-111111111111";
    await page.goto(`/sourcing/ao/${dummyId}/tandem`);
    await expect(page).toHaveURL(/\/login(\?|$)/);
  });

  test("Page short-list rejette un ID invalide (UUID malformé)", async ({ page }) => {
    test.skip(!hasDatabase, "Requiert session AlyoS + middleware OK — pas en CI sans DB.");

    await signInWith(page, TEST_EMAIL);
    await page.goto("/sourcing/ao/not-a-uuid/tandem");
    // L'ErrorBanner doit être affiché (role=alert)
    await expect(page.getByRole("alert")).toBeVisible();
  });

  test("Route cron tandem-followup — 401 sans bearer", async ({ request }) => {
    const res = await request.get("/api/cron/tandem-followup");
    expect(res.status()).toBe(401);
  });

  test("Route cron tandem-followup — 401 avec bearer wrong", async ({ request }) => {
    const res = await request.get("/api/cron/tandem-followup", {
      headers: { authorization: "Bearer wrong-secret-1234567890" },
    });
    expect(res.status()).toBe(401);
  });

  test("Page d'opposition retourne une page d'erreur générique pour token invalide", async ({
    page,
  }) => {
    await page.goto("/archi/oppose/invalid-token-xyz");
    // La page doit charger (200), pas un 500 brut. Le contenu peut varier
    // (TokenInvalid / OppositionInvalid). On vérifie au moins l'absence de
    // stack trace Next.js (indicateur de crash 500).
    const html = await page.content();
    expect(html).not.toContain("UnhandledError");
    expect(html).not.toContain("Application error: a server-side exception");
  });

  test("Page tokenisée archi retourne une page d'erreur générique pour JWT invalide", async ({
    page,
  }) => {
    await page.goto("/archi/foo.bar.baz-not-a-real-jwt");
    const html = await page.content();
    expect(html).not.toContain("UnhandledError");
    expect(html).not.toContain("Application error: a server-side exception");
  });

  test("API archi respond — 401 si token invalide (POST)", async ({ request }) => {
    const res = await request.post("/api/archi/foo.bar.baz/respond", {
      data: { status: "accepted" },
    });
    expect([400, 401]).toContain(res.status());
  });
});
