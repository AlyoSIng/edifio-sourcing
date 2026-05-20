import { chromium, type Page } from "@playwright/test";

import { isAuthorizedEmail } from "../../src/lib/auth/domain";

/**
 * Helpers d'authentification pour les tests E2E du middleware.
 *
 * **Refactor 2026-05-16 (clôture ticket Phase 2)** : on n'utilise plus le
 * chemin « form login + waitForLoadState » pour bootstrap une session E2E.
 * Le helper appelle désormais `POST /api/test/seed-session` (route gated par
 * triple-condition env, cf. `src/app/api/test/seed-session/route.ts`) qui :
 *
 *   1. crée le user côté admin (idempotent) avec un mot de passe connu ;
 *   2. signe la session via `signInWithPassword` côté serveur ;
 *   3. pose les cookies `sb-*` directement sur la réponse — pas de redirect
 *      middleware en route, pas de race avec un `signOut` post-login.
 *
 * Bénéfice : la session n'est plus posée via le flow form login qui passe
 * par le middleware (et donc le `signOut` immédiat sur user out-of-domain
 * mangeait les cookies effacés). On peut donc ré-appliquer le pattern
 * `propagateAuthCookies` (cf. commit f2c2e59) sans casser C4/C7/C10/C12.
 *
 * Préalable opérationnel : la CI et le `.env.local` posent
 * `E2E_TEST_ROUTES_ENABLED=1`. Sans ça la route renvoie 404 — les tests
 * échoueront avec un message explicite.
 *
 * Source : `specs/middleware_domain_gate.md` §0 + §4 + ADR-011.
 */

/** Mot de passe durable utilisé pour tous les helpers E2E middleware. */
const E2E_DURABLE_PASSWORD = "E2E-Middleware-Helper-2026!";

/**
 * Connecte la page sous l'identité `email` via la route seed-session.
 *
 * - Pour un email `@alyosingenierie.fr` : pose une session durable
 *   (`must_change_password=false`).
 * - Pour un email hors-domaine : crée un user out-of-domain temporaire et
 *   signe sa session côté serveur. Au prochain `page.goto('/sourcing/*')`,
 *   le middleware exécutera son `signOut` + redirect /forbidden — c'est
 *   exactement ce qu'on veut tester en C4/C7/C10/C12.
 *
 * Le helper ne fait PAS de `page.goto('/login')`. À l'inverse de l'ancien
 * helper, il ne dépend pas d'une page chargée — seulement d'un contexte
 * Playwright valide capable d'envoyer des requêtes (`page.request.post`).
 */
export async function signInWith(page: Page, email: string): Promise<void> {
  const outOfDomain = !isAuthorizedEmail(email);

  const response = await page.request.post("/api/test/seed-session", {
    data: outOfDomain ? { email, out_of_domain: true } : { email, password: E2E_DURABLE_PASSWORD },
  });

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(
      `E2E seed-session(${email}) a échoué : status=${response.status()} body=${body}. ` +
        "Vérifier que E2E_TEST_ROUTES_ENABLED=1 dans l'env du serveur Next.",
    );
  }
}

/**
 * Renvoie une chaîne `cookie:` exploitable par `request.post(...)` pour les
 * tests API protégés (cas C7). Ouvre un navigateur jetable, appelle la route
 * de seed pour poser la session, extrait les cookies du contexte, ferme le
 * navigateur.
 */
export async function getCookieFor(email: string): Promise<string> {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await signInWith(page, email);
    const cookies = await context.cookies();
    return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  } finally {
    await browser.close();
  }
}
