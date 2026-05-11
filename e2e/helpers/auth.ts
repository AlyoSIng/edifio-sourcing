import { chromium, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Helpers d'authentification pour les tests E2E du middleware.
 *
 * Stratégie : on utilise l'API admin Supabase (service_role) pour générer
 * un magic-link à la volée pour chaque email testé, puis on suit le lien
 * dans le navigateur Playwright. Le callback handler `/auth/callback`
 * échange le code et pose les cookies de session — l'utilisateur est alors
 * connecté de manière équivalente à un vrai magic-link cliqué depuis Brevo.
 *
 * Side effects : si l'utilisateur n'existe pas encore dans Supabase Auth,
 * il est créé automatiquement (`email_confirm: true` — pas d'envoi
 * d'email de vérification). Les utilisateurs test persistent dans la table
 * `auth.users` du projet `edifio-sourcing-preview` ; à nettoyer
 * périodiquement.
 *
 * Source : `specs/middleware_domain_gate.md` §4.
 */

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
 * Garantit qu'un utilisateur existe (création silencieuse si besoin) et
 * génère un magic-link admin redirigé vers `<baseURL>/auth/callback`.
 */
async function ensureUserAndGetMagicLink(email: string, baseURL: string): Promise<string> {
  const admin = createTestAdminClient();

  // 1. createUser idempotent — on ignore l'erreur si l'utilisateur existe déjà.
  const { error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (createError && !/already/i.test(createError.message)) {
    throw new Error(`E2E createUser(${email}) a échoué : ${createError.message}`);
  }

  // 2. generateLink type magiclink avec redirect vers notre /auth/callback.
  //
  // Important : on demande explicitement `next=/` (route publique) pour que
  // le post-callback ne déclenche PAS le middleware sur /sourcing/* (qui
  // signerait out un email non Alyos avant même que le test puisse vérifier
  // la matrice de comportement). Le test naviguera explicitement vers
  // /sourcing/ao-du-jour après signInWith pour valider le scénario.
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: {
      redirectTo: `${baseURL}/auth/callback?next=/`,
    },
  });

  const actionLink = data?.properties?.action_link;
  if (error || !actionLink) {
    throw new Error(
      `E2E generateLink(${email}) a échoué : ${error?.message ?? "action_link manquant"}`,
    );
  }
  return actionLink;
}

/**
 * Connecte la page sous l'identité `email`. Après retour, la session
 * Supabase est posée (cookies `sb-*`) et la page se trouve sur la
 * destination par défaut (`/sourcing/ao-du-jour`).
 *
 * Le test peut ensuite naviguer vers la route à valider et faire ses
 * assertions sur l'URL résultante (cf. matrice spec §2).
 */
export async function signInWith(page: Page, email: string): Promise<void> {
  const actionLink = await ensureUserAndGetMagicLink(email, getBaseURL());
  await page.goto(actionLink);
  // Le Client Component dans /auth/callback consomme le fragment d'URL
  // (`#access_token=...`), appelle setSession et redirige via `router.replace`.
  // On attend que la navigation hors /auth/callback soit finie.
  await page.waitForURL((url) => !url.pathname.startsWith("/auth/callback"), {
    waitUntil: "domcontentloaded",
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

function getBaseURL(): string {
  return process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
}
