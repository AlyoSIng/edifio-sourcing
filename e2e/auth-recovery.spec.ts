import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Tests E2E du flow « mot de passe oublié » — INC-2026-05-18-02.
 *
 * Source : `DECISIONS.md` 2026-05-19 (entrée Alex hotfix recovery).
 *
 * Stratégie : on génère un VRAI lien recovery via l'API admin Supabase
 * (`auth.admin.generateLink({ type: 'recovery' })`), on extrait le fragment
 * `#access_token=...&type=recovery&...`, et on navigue Playwright vers
 * `/<fragment>` directement. Le composant `RecoveryHashHandler` embarqué
 * sur `/` consomme alors le fragment et redirige vers `/auth/update-password`.
 *
 * Cas négatif : on navigue avec un fragment recovery aux tokens invalides
 * — Supabase rejette `setSession`, le handler tombe sur le branch erreur
 * et redirige vers `/login?error=recovery_invalid`.
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
 * recovery et retourne le fragment d'URL (`access_token=...&type=recovery`).
 *
 * On extrait le fragment plutôt que de naviguer sur l'action_link complet
 * pour deux raisons : (1) l'action_link pointe sur la Site URL Supabase
 * (paramétrée côté projet, peut diverger de notre baseURL Playwright),
 * (2) on veut tester explicitement que `/` (notre landing) gère le fragment,
 * pas que la redirection Supabase fonctionne.
 */
async function generateRecoveryFragment(email: string): Promise<string> {
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

  // L'action_link Supabase a la forme :
  //   https://<site-url>/<path>#access_token=...&type=recovery&refresh_token=...
  // On extrait juste le fragment pour pouvoir le coller derrière notre baseURL.
  const hashIndex = actionLink.indexOf("#");
  if (hashIndex < 0) {
    throw new Error(`Aucun fragment dans l'action_link recovery : ${actionLink}`);
  }
  return actionLink.slice(hashIndex); // inclut le `#`
}

test.describe("Flow recovery password — INC-2026-05-18-02", () => {
  test("R1 — happy path : fragment recovery valide → /auth/update-password → /sourcing/ao-du-jour", async ({
    page,
  }) => {
    const email = `recovery-happy-${Date.now()}@alyosingenierie.fr`;
    const fragment = await generateRecoveryFragment(email);

    await page.goto(`/${fragment}`);

    // Le RecoveryHashHandler doit consommer le fragment et rediriger.
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
