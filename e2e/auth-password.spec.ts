import { expect, test } from "@playwright/test";

import { signInWith } from "./helpers/auth";
import {
  createDurableUser,
  createProvisionalUser,
  deleteUserIfExists,
  regenerateProvisionalPasswordFor,
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
 * route handler ») : on N'envoie PAS de mail Resend. À la place, on prépare
 * l'état utilisateur directement via les helpers `createProvisionalUser` /
 * `regenerateProvisionalPasswordFor` qui reproduisent côté admin API ce que
 * font respectivement `POST /api/admin/users` et `requestPasswordResetAction`
 * (ADR-011). Offline-friendly et déterministe.
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

  /**
   * S3 — Email hors-domaine : le middleware rejette l'accès à /sourcing.
   *
   * **Refactor 2026-05-20 (clôture oubli ticket Phase 2)** : on aligne S3 sur
   * le pattern seed-session déjà adopté par C4/C7/C10/C12 le 2026-05-16
   * (cf. commit `81958dd` + décision CTO Sophie). Avant ce refactor, S3
   * exerçait le chemin `form submit → Server Action signInWithPasswordAction
   * → redirect → middleware`, qui souffrait d'une race entre la pose des
   * cookies par la Server Action et leur effacement immédiat par le
   * middleware sur user out-of-domain. Le flakiness était irréductible côté
   * test, même après le ré-application de `propagateAuthCookies` (commit
   * `695ce41`).
   *
   * **Tradeoff assumé** (validé Steve 2026-05-19) : on perd la couverture
   * `form login` pour le cas out-of-domain. Compensation : S1/S2/S4/S5/S6
   * couvrent toujours le chemin `form login` pour les emails in-domain, et
   * la chaîne UI → Server Action → middleware reste exercée de bout en bout
   * pour le happy path.
   *
   * **Invariant préservé** : « un email hors-domaine ne peut pas accéder à
   * `/sourcing/*` ». La session est posée serveur via la route gated
   * `/api/test/seed-session` (déterministe, pas de race cookies), puis le
   * `page.goto('/sourcing/ao-du-jour')` déclenche le middleware qui voit
   * l'email hors-domaine, `signOut` + propage les cookies effacés, et
   * redirige vers /forbidden — exactement comme en chemin form-login mais
   * sans la race que Playwright peinait à observer.
   */
  test("S3 — Email hors-domaine : le middleware rejette l'accès à /sourcing", async ({ page }) => {
    const email = TEST_EMAILS.scenario3;
    await signInWith(page, email);
    await page.goto("/sourcing/ao-du-jour");
    await expect(page).toHaveURL(/\/forbidden/);
  });

  test("S4 — Mot de passe oublié (ADR-011) → nouveau provisoire → login → force reset → app", async ({
    page,
  }) => {
    const email = TEST_EMAILS.scenario4;
    await createDurableUser({ email, password: STRONG_PASSWORD });

    // 1. Soumission du form forgot-password — déclenche côté serveur la
    //    regénération du provisoire via admin.updateUserById + envoi Resend
    //    (mocké en preview). On valide la confirmation UX anti-énumération.
    await page.goto("/forgot-password");
    await page.fill("input#email", email);
    await page.click("button[type=submit]");
    await expect(page.getByRole("status")).toContainText(/Demande prise en compte/i);

    // 2. Bypass mail : on regénère un provisoire connu via l'admin API
    //    (équivalent fonctionnel à ce qu'a fait le serveur — l'invariante
    //    sécurité interdit de lire le provisoire posé par l'action). Le test
    //    valide la chaîne login → force-redirect /reset-password → app.
    const { provisionalPassword } = await regenerateProvisionalPasswordFor(email);

    // 3. Login avec le provisoire.
    await page.goto("/login");
    await page.fill("input#email", email);
    await page.fill("input#password", provisionalPassword);
    await page.click("button[type=submit]");

    // 4. Le middleware force-redirige sur /reset-password (must_change_password=true).
    await page.waitForURL(/\/reset-password/, { timeout: 10_000 });

    // 5. Choix du mot de passe définitif.
    const newPwd = "Reset-MVP-2026!!";
    await page.fill("input#password", newPwd);
    await page.fill("input#confirm", newPwd);
    await page.click("button[type=submit]");

    // 6. ADR-011 : le user a déjà sa session valide → redirect direct sur l'app.
    await page.waitForURL(/\/sourcing\/ao-du-jour/, { timeout: 10_000 });
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
    await expect(page.getByTestId("auth-error")).toBeVisible();
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
    await expect(page.getByTestId("auth-error")).toContainText(/expir/i);
    await expect(page.getByTestId("auth-error")).toContainText(/administrateur/i);
  });
});
