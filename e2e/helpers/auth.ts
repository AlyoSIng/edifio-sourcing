import { chromium, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
 * Après retour : la session Supabase est posée (cookies `sb-*`) et la page
 * est hors de `/login`. Le test peut ensuite naviguer vers la route à
 * valider et faire ses assertions sur l'URL résultante (cf. matrice spec §2).
 *
 * Le helper accepte des emails hors-domaine (par ex. `bob@gmail.com`) pour
 * tester la matrice : le user est créé côté Supabase (admin API n'impose pas
 * le domaine), le login Server Action `signInWithPasswordAction` refuse en
 * pré-validation et reste sur `/login` avec un message d'erreur. Les tests
 * qui exercent ce cas regardent ce message ou tentent de naviguer vers
 * `/sourcing/*` qui les renverra sur `/forbidden` ou `/login`.
 */
export async function signInWith(page: Page, email: string): Promise<void> {
  await ensureUserWithKnownPassword(email);

  await page.goto("/login");
  await page.fill("input#email", email);
  await page.fill("input#password", E2E_DURABLE_PASSWORD);
  await page.click("button[type=submit]");

  // Deux issues possibles selon le domaine :
  //   - email Alyos → redirect vers /sourcing/ao-du-jour (succès) ;
  //   - email hors-domaine → pré-validation Server Action refuse, on reste
  //     sur /login avec message d'erreur (data-testid="auth-error").
  // Dans les deux cas la nav quitte (ou maintient) /login après ~quelques
  // ms — on attend que ce soit stable.
  await page
    .waitForURL((url) => !url.pathname.startsWith("/auth/callback"), {
      waitUntil: "domcontentloaded",
      timeout: 10_000,
    })
    .catch(() => {
      // Pas de navigation — c'est le cas hors-domaine. Le test caller va
      // observer l'état (message d'erreur ou tentative /sourcing/*).
    });
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
