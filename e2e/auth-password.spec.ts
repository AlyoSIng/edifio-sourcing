import { expect, test } from "@playwright/test";

import {
  createDurableUser,
  createProvisionalUser,
  deleteUserIfExists,
  getRecoveryLink,
} from "./helpers/password";

/**
 * Tests E2E — flow auth password (pivot Board 2026-05-11).
 *
 * Couvre les 6 scénarios verbatim de la spec Board :
 *
 *   1. Admin crée un user → email reçu (mock) → user clique → login avec
 *      password provisoire → force redirect /reset-password → user choisit
 *      son mot de passe → /sourcing/ao-du-jour accessible
 *   2. User existant se connecte avec son password → /sourcing/ao-du-jour
 *   3. Email hors-domaine → rejeté par middleware
 *   4. « Mot de passe oublié » → email reçu (mock) → flow reset complet
 *   5. Password trop faible → rejet UI
 *   6. Password provisoire expiré → message clair
 *
 * Stratégie email (justifiée — cf. brief §8 « Recommandation : Playwright
 * route handler ») : on N'envoie PAS de mail Resend. À la place, on utilise
 * `getRecoveryLink` (admin API Supabase) qui renvoie l'URL recovery directement
 * — fonctionnellement équivalent à parser un email reçu, mais offline-friendly
 * et déterministe. Pour le scénario 1, on prépare l'état directement via
 * `createProvisionalUser` qui reproduit ce que fait `POST /api/admin/users`.
 *
 * Prérequis : `.env.local` avec `NEXT_PUBLIC_SUPABASE_URL`,
 * `NEXT_PUBLIC_SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY`. Le webServer
 * Playwright démarre `pnpm dev` automatiquement.
 *
 * NB : les emails de test doivent finir par `@alyosingenierie.fr` pour passer
 * la garde domaine. On utilise `e2e-test+<scenario>@alyosingenierie.fr` pour
 * faciliter le nettoyage périodique.
 */

const TEST_EMAILS = {
  scenario1: "e2e-test+s1-invite@alyosingenierie.fr",
  scenario2: "e2e-test+s2-existing@alyosingenierie.fr",
  scenario3: "e2e-test+s3-outsider@gmail.com",
  scenario4: "e2e-test+s4-reset@alyosingenierie.fr",
  scenario5: "e2e-test+s5-weakpwd@alyosingenierie.fr",
  scenario6: "e2e-test+s6-expired@alyosingenierie.fr",
} as const;

const STRONG_PASSWORD = "Tandem-MVP-2026!";
const WEAK_PASSWORD = "short1!"; // < MIN_LENGTH (16) — déclenche TOO_SHORT

test.describe("Auth password — 6 scénarios verbatim spec Board", () => {
  test.afterAll(async () => {
    // Nettoyage best-effort — n'échoue pas la suite si la suppression rate.
    for (const email of Object.values(TEST_EMAILS)) {
      try {
        await deleteUserIfExists(email);
      } catch {
        /* ignore */
      }
    }
  });

  test("S1 — Admin crée un user → login provisoire → force reset → accède à l'app", async ({
    page,
  }) => {
    const email = TEST_EMAILS.scenario1;
    // Étape admin (équivalent fonctionnel à `POST /api/admin/users`).
    const { provisionalPassword } = await createProvisionalUser({ email });

    // Login avec le provisoire.
    await page.goto("/login");
    await page.fill("input#email", email);
    await page.fill("input#password", provisionalPassword);
    await page.click("button[type=submit]");

    // Le middleware doit détecter must_change_password=true et rediriger
    // vers /reset-password (mode first_login — pas de code en URL).
    await page.waitForURL(/\/reset-password/, { timeout: 10_000 });

    // Choix du mot de passe durable.
    await page.fill("input#password", STRONG_PASSWORD);
    await page.fill("input#confirm", STRONG_PASSWORD);
    await page.click("button[type=submit]");

    // Après succès en mode first_login : redirect direct vers l'app.
    await page.waitForURL(/\/sourcing\/ao-du-jour/, { timeout: 10_000 });
  });

  test("S2 — User existant se connecte avec son password", async ({ page }) => {
    const email = TEST_EMAILS.scenario2;
    await createDurableUser({ email, password: STRONG_PASSWORD });

    await page.goto("/login");
    await page.fill("input#email", email);
    await page.fill("input#password", STRONG_PASSWORD);
    await page.click("button[type=submit]");

    await page.waitForURL(/\/sourcing\/ao-du-jour/, { timeout: 10_000 });
  });

  test("S3 — Email hors-domaine est rejeté par le middleware", async ({ page }) => {
    // Pas de création — le middleware doit refuser même un visiteur anonyme,
    // mais ici on teste le cas « session existante avec email hors-domaine »
    // qui est plus strict. On crée un user gmail directement.
    const email = TEST_EMAILS.scenario3;
    // createDurableUser passe par auth.admin.createUser qui n'impose pas le
    // domaine côté Supabase — la garde est applicative.
    await createDurableUser({ email, password: STRONG_PASSWORD });

    await page.goto("/login");
    await page.fill("input#email", email);
    await page.fill("input#password", STRONG_PASSWORD);
    await page.click("button[type=submit]");

    // La Server Action signInWithPasswordAction refuse en pré-validation
    // (garde domaine côté action) — message d'erreur sous le form, pas
    // de redirect.
    await expect(page.getByRole("alert")).toContainText(/alyosingenierie\.fr/i);
  });

  test("S4 — Mot de passe oublié → flow reset complet via lien recovery", async ({ page }) => {
    const email = TEST_EMAILS.scenario4;
    await createDurableUser({ email, password: STRONG_PASSWORD });

    // Soumission du form forgot-password (le serveur appelle Resend, mais
    // on bypass le mail en récupérant le lien directement via admin API).
    await page.goto("/forgot-password");
    await page.fill("input#email", email);
    await page.click("button[type=submit]");
    await expect(page.getByRole("status")).toContainText(/Demande prise en compte/i);

    // Récupération du lien recovery (équivalent au lien qu'aurait reçu
    // l'utilisateur par email).
    const baseURL = page.url().split("/forgot-password")[0] ?? "http://localhost:3000";
    const recoveryUrl = await getRecoveryLink(email, `${baseURL}/reset-password`);

    // Suivi du lien — Supabase ajoute un `code` en query string lors du
    // redirect vers /reset-password.
    await page.goto(recoveryUrl);
    await page.waitForURL(/\/reset-password/, { timeout: 10_000 });

    // Nouveau mot de passe.
    const newPwd = "Reset-MVP-2026!!";
    await page.fill("input#password", newPwd);
    await page.fill("input#confirm", newPwd);
    await page.click("button[type=submit]");

    // Mode recovery → signOut côté serveur + redirect /login?notice=password_updated.
    await page.waitForURL(/\/login\?notice=password_updated/, { timeout: 10_000 });
    await expect(page.getByRole("status")).toContainText(/Mot de passe mis à jour/i);
  });

  test("S5 — Password trop faible est rejeté", async ({ page }) => {
    const email = TEST_EMAILS.scenario5;
    const { provisionalPassword } = await createProvisionalUser({ email });

    // Login provisoire → redirect /reset-password.
    await page.goto("/login");
    await page.fill("input#email", email);
    await page.fill("input#password", provisionalPassword);
    await page.click("button[type=submit]");
    await page.waitForURL(/\/reset-password/, { timeout: 10_000 });

    // Essai d'un password trop court / sans symbole.
    await page.fill("input#password", WEAK_PASSWORD);
    await page.fill("input#confirm", WEAK_PASSWORD);
    await page.click("button[type=submit]");

    // L'erreur doit s'afficher côté UI (validation serveur) sans changer
    // l'URL (on reste sur /reset-password).
    await expect(page).toHaveURL(/\/reset-password/);
    await expect(page.getByRole("alert")).toBeVisible();
  });

  test("S6 — Password provisoire expiré refuse la connexion avec message clair", async ({
    page,
  }) => {
    const email = TEST_EMAILS.scenario6;
    // TTL négatif → expiration dans le passé.
    const { provisionalPassword } = await createProvisionalUser({ email, ttlHoursFromNow: -1 });

    await page.goto("/login");
    await page.fill("input#email", email);
    await page.fill("input#password", provisionalPassword);
    await page.click("button[type=submit]");

    // signInWithPasswordAction détecte l'expiration et signOut. L'utilisateur
    // reste sur /login avec un message explicite.
    await expect(page.getByRole("alert")).toContainText(/expir/i);
    await expect(page.getByRole("alert")).toContainText(/administrateur/i);
  });
});
