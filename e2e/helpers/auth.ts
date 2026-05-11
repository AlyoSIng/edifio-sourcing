import type { Page } from "@playwright/test";

/**
 * Helpers d'authentification pour les tests E2E middleware.
 *
 * **Statut étape 2 Gate 6** : stubs. Les vraies implémentations seront branchées
 * à l'étape 3 quand Supabase Auth magic-link sera opérationnel (Server Action
 * `signInWithOtp` + callback `/auth/callback` qui pose les cookies Supabase
 * `sb-access-token` / `sb-refresh-token` sur la session).
 *
 * Approche prévue étape 3 :
 * - `signInWith(page, email)` : utilise l'API d'admin Supabase
 *   (`auth.admin.generateLink({ type: "magiclink" })` côté CI uniquement) pour
 *   obtenir un magic-link ; le suit dans le navigateur → cookies posés.
 * - `getCookieFor(email)` : récupère les cookies de session via la même API
 *   pour les requêtes Playwright `request` (cas API §C7).
 *
 * Source : `specs/middleware_domain_gate.md` §4.
 */

/**
 * Connecte la page sous l'identité `email` (stub — à brancher étape 3).
 *
 * @throws en étape 2 Gate 6, signale que l'implémentation est différée.
 */
export async function signInWith(_page: Page, _email: string): Promise<void> {
  throw new Error(
    "signInWith: stub étape 2 Gate 6 — à brancher étape 3 (Supabase Auth magic-link). Les tests e2e/middleware-domain.spec.ts sont marqués .skip jusqu'à ce moment.",
  );
}

/**
 * Renvoie la cookie de session Supabase pour un email donné (stub — étape 3).
 */
export async function getCookieFor(_email: string): Promise<string> {
  throw new Error(
    "getCookieFor: stub étape 2 Gate 6 — à brancher étape 3 (Supabase admin API + session cookies).",
  );
}
