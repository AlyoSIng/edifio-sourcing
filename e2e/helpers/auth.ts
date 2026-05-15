import { chromium, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { isAuthorizedEmail } from "../../src/lib/auth/domain";
import type { UserMetadata } from "../../src/lib/auth/types";

/**
 * Helpers d'authentification pour les tests E2E du middleware.
 *
 * **ADR-011 (2026-05-14)** : on n'utilise plus de magic-link admin pour
 * bootstrap une session — les flows tokenisés ont été abandonnés (scanner
 * email d'entreprise AlyoS qui consume les tokens). À la place :
 *
 *   1. créer l'utilisateur avec un mot de passe durable via l'API admin
 *      (`auth.admin.createUser`, `email_confirm: true`, metadata standard
 *      role=user + must_change_password=false) ;
 *   2. ouvrir `/login` dans la page Playwright et soumettre le formulaire ;
 *   3. attendre la redirection hors de `/login`.
 *
 * Side effects : si l'utilisateur existe déjà, on le supprime puis on le
 * recrée pour garantir un mot de passe connu. Les utilisateurs test
 * persistent dans la table `auth.users` du projet `edifio-sourcing-preview`
 * — à nettoyer périodiquement.
 *
 * Source : `specs/middleware_domain_gate.md` §4 + ADR-011.
 */

/** Mot de passe durable utilisé pour tous les helpers E2E middleware. */
const E2E_DURABLE_PASSWORD = "E2E-Middleware-Helper-2026!";

function createTestAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    throw new Error(
      "Tests E2E : NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant. Vérifier .env.local.",
    );
  }
  return createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Garantit qu'un utilisateur existe avec le mot de passe durable connu.
 * Idempotent : supprime + recrée si nécessaire pour aligner le mot de passe.
 */
async function ensureUserWithKnownPassword(email: string): Promise<void> {
  const admin = createTestAdminClient();

  // Cherche un éventuel user existant pour le supprimer (les helpers E2E
  // ne doivent pas dépendre d'un état précédent — déterminisme).
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const found = (data?.users ?? []).find(
    (u) => (u.email ?? "").toLowerCase() === email.toLowerCase(),
  );
  if (found) {
    await admin.auth.admin.deleteUser(found.id);
  }

  const metadata: UserMetadata = {
    role: "user",
    must_change_password: false,
    provisional_password_expires_at: null,
    first_name: "E2E",
    last_name: "Middleware",
  };

  const { error } = await admin.auth.admin.createUser({
    email,
    password: E2E_DURABLE_PASSWORD,
    email_confirm: true,
    user_metadata: metadata as Record<string, unknown>,
  });
  if (error) {
    throw new Error(`E2E ensureUserWithKnownPassword(${email}) a échoué : ${error.message}`);
  }
}

/**
 * Connecte la page sous l'identité `email` via le formulaire `/login`.
 * Crée l'utilisateur en amont si nécessaire (mot de passe durable connu).
 *
 * Comportement déterministe — détection automatique du flow via le suffixe
 * de domaine (cf. `isAuthorizedEmail`) :
 *
 *   - **In-domain** (`@alyosingenierie.fr` strict) : la Server Action
 *     `signInWithPasswordAction` pose les cookies `sb-*` et redirige vers
 *     `/sourcing/ao-du-jour`. On attend explicitement cette navigation.
 *     Pas de catch silencieux — si la nav échoue (timeout), le test fail
 *     proprement avec sa pile.
 *
 *   - **Out-of-domain** : la Server Action refuse en pré-validation
 *     (anti-fuite), aucun cookie de session n'est posé. La page reste sur
 *     `/login` avec un message d'erreur (data-testid="auth-error"). On
 *     attend uniquement la stabilisation réseau — c'est aux specs caller
 *     de vérifier le message d'erreur ou la suite du parcours.
 *
 * Source : `specs/middleware_domain_gate.md` §4 + ADR-011.
 */
export async function signInWith(page: Page, email: string): Promise<void> {
  await ensureUserWithKnownPassword(email);

  await page.goto("/login");
  await page.fill("input#email", email);
  await page.fill("input#password", E2E_DURABLE_PASSWORD);
  await page.click("button[type=submit]");

  if (isAuthorizedEmail(email)) {
    // Flow succès : la Server Action a posé les cookies et émis un
    // `redirect("/sourcing/ao-du-jour")` (cf. `signInWithPasswordAction`).
    // On attend la nav effective avant de rendre la main — c'est ce qui
    // garantit aux specs caller que les cookies `sb-*` sont posés au
    // moment où elles enchaînent leurs `page.goto("/sourcing/*")`.
    await page.waitForURL("**/sourcing/**", { timeout: 15_000 });
  } else {
    // Flow refus : la Server Action retourne un state d'erreur, la page
    // reste sur /login. On attend juste la stabilisation réseau (la
    // Server Action a terminé son round-trip RSC).
    await page.waitForLoadState("networkidle");
  }
}

/**
 * Renvoie une chaîne `cookie:` exploitable par `request.post(...)` pour les
 * tests API protégés (cas C7). Ouvre un navigateur jetable, se connecte,
 * extrait les cookies de la session, ferme le navigateur.
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
