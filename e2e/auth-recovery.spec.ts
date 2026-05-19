import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Tests E2E du flow « mot de passe oublié » — INC-2026-05-18-02.
 *
 * Source : `DECISIONS.md` 2026-05-19 (entrée Alex hotfix recovery).
 *
 * Stratégie : on génère un VRAI lien recovery via l'API admin Supabase
 * (`auth.admin.generateLink({ type: 'recovery' })`). L'`action_link` retourné
 * est une URL `/auth/v1/verify?token=...&type=recovery&redirect_to=...` :
 * c'est l'URL qui serait embarquée dans l'email envoyé à l'utilisateur.
 *
 * Le fragment recovery (`#access_token=...&type=recovery&refresh_token=...`)
 * n'apparaît qu'APRÈS visite de cet `action_link` : Supabase fait le verify
 * côté serveur (consomme le token OTP), pose les tokens d'auth dans un
 * fragment, puis redirige vers `redirect_to` (notre baseURL Playwright).
 *
 * On laisse donc Playwright naviguer sur l'`action_link` complet et on
 * observe `page.url()` après le redirect : c'est là que se trouve le
 * fragment que notre `RecoveryHashHandler` doit consommer pour rediriger
 * vers `/auth/update-password`.
 *
 * Cas négatif : on fabrique manuellement un fragment recovery aux tokens
 * invalides — Supabase rejette `setSession`, le handler tombe sur le branch
 * erreur et redirige vers `/login?error=recovery_invalid`. Pas besoin de
 * Supabase live pour ce scénario (justement : c'est le risque
 * « lien tronqué / token expiré » qu'on couvre).
 *
 * Cas neutre : visite normale de `/` sans fragment → la landing publique
 * s'affiche normalement (aucun redirect parasite, aucun overlay).
 *
 * Prérequis local : `.env.local` avec `NEXT_PUBLIC_SUPABASE_URL` et
 * `SUPABASE_SERVICE_ROLE_KEY` (mêmes vars que `e2e/middleware-domain.spec.ts`).
 */

function createTestAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    throw new Error(
      "Tests E2E auth-recovery : NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant.",
    );
  }
  return createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Idempotent : crée l'utilisateur s'il n'existe pas, puis génère un lien
 * recovery et retourne l'`action_link` Supabase brut.
 *
 * Cet `action_link` est de la forme :
 *   https://<supabase-host>/auth/v1/verify?token=...&type=recovery&redirect_to=...
 *
 * Playwright doit naviguer dessus pour déclencher le verify côté Supabase :
 * le serveur consomme le token OTP, pose les tokens dans un fragment, puis
 * redirige le navigateur vers `redirect_to` (notre baseURL).
 */
async function generateRecoveryActionLink(email: string): Promise<string> {
  const admin = createTestAdminClient();

  const { error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password: "TemporaryRecoveryTest42!_ABC", // mot de passe initial random — sera écrasé par le test
  });
  if (createError && !/already/i.test(createError.message)) {
    throw new Error(`E2E createUser(${email}) a échoué : ${createError.message}`);
  }

  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
  });

  const actionLink = data?.properties?.action_link;
  if (error || !actionLink) {
    throw new Error(
      `E2E generateLink recovery(${email}) a échoué : ${error?.message ?? "action_link manquant"}`,
    );
  }

  return actionLink;
}

test.describe("Flow recovery password — INC-2026-05-18-02", () => {
  test("R1 — happy path : action_link recovery → verify Supabase → /auth/update-password → /sourcing/ao-du-jour", async ({
    page,
  }) => {
    const email = `recovery-happy-${Date.now()}@alyosingenierie.fr`;
    const actionLink = await generateRecoveryActionLink(email);

    // Playwright suit l'action_link : Supabase exécute le verify côté serveur,
    // pose les tokens dans un fragment, puis redirige vers `redirect_to`
    // (notre baseURL). Une fois sur `/`, le RecoveryHashHandler embarqué
    // consomme le fragment et redirige vers /auth/update-password.
    await page.goto(actionLink);

    await page.waitForURL(/\/auth\/update-password/, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/auth\/update-password/);

    // Soumission du formulaire avec un mot de passe valide (≥16 car, maj/min/chiffre/symbole).
    const newPassword = "MontagneBleueSourire7!";
    await page.getByLabel("Nouveau mot de passe").fill(newPassword);
    await page.getByLabel("Confirmation").fill(newPassword);
    await page.getByRole("button", { name: /Définir le mot de passe/i }).click();

    // updateUser → router.replace("/sourcing/ao-du-jour"). Le middleware
    // laisse passer puisque l'email est `@alyosingenierie.fr` et la session
    // est valide.
    await page.waitForURL(/\/sourcing\/ao-du-jour/, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/sourcing\/ao-du-jour/);
  });

  test("R2 — fragment recovery invalide → /login?error=recovery_invalid", async ({ page }) => {
    // Tokens factices : Supabase rejette le setSession, le handler tombe sur
    // le branch erreur et redirige.
    const fragment =
      "#access_token=invalid_token_for_e2e&type=recovery&refresh_token=invalid_refresh";
    await page.goto(`/${fragment}`);

    await page.waitForURL(/\/login\?error=recovery_invalid/, {
      waitUntil: "domcontentloaded",
    });
    await expect(page).toHaveURL(/\/login\?error=recovery_invalid/);
  });

  test("R3 — visite normale de `/` sans fragment : landing affichée, pas de redirect", async ({
    page,
  }) => {
    await page.goto("/");

    // La landing reste sur `/` — aucun redirect parasite déclenché par le handler.
    await expect(page).toHaveURL(/\/$/);

    // Le CTA principal doit être visible (preuve que la page a rendu).
    await expect(page.getByRole("link", { name: /Accéder à edifio Sourcing/i })).toBeVisible();

    // L'overlay de redirect ne doit pas être affiché (status "idle" → null).
    await expect(page.getByText(/Redirection en cours/i)).toHaveCount(0);
  });
});
