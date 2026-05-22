import { expect, test } from "@playwright/test";

import { signInWith } from "./helpers/auth";
import { deleteUserIfExists } from "./helpers/password";

/**
 * Tests E2E — édition admin du profil de recherche (P2 Gate 6).
 *
 * Couvre 5 scénarios principaux :
 *  C1 — Non-admin (`user`) : redirect `/sourcing/ao-du-jour?error=forbidden`
 *  C2 — Admin : page chargée + form pré-rempli avec valeurs du profil AlyoS
 *  C3 — Édition keywords + submit : toast de succès + revalidation
 *  C4 — Validation Zod côté serveur : payload HS → erreurs inline sans submit
 *  C5 — Audit log A3 inséré après update (assertion BDD via service_role)
 *
 * Camille (qa) étoffera les assertions fines (intercepteurs réseau,
 * inspection cookies, snapshots a11y). Pour l'instant, scaffold avec
 * `test.fixme` + JSDoc + sélecteurs préliminaires.
 *
 * ----------------------------------------------------------------------------
 * Skip-policy
 * ----------------------------------------------------------------------------
 * Le job CI `ci-e2e` ne fournit PAS `DATABASE_URL` au webServer Playwright
 * (cf. tender-actions.spec.ts pour le rationale). La page admin profil
 * basculera sur l'ErrorBanner si le fetch BDD échoue → les sélecteurs CSS
 * du form ne trouveront pas de cible. On skip si `!DATABASE_URL`.
 *
 * Pour faire tourner ces tests en local :
 *   1. .env.local avec DATABASE_URL pointant sur Postgres local
 *   2. pnpm db:seed:prod (pour avoir le profil AlyoS actif)
 *   3. pnpm test:e2e e2e/admin-profil.spec.ts
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);

const ADMIN_EMAIL = "e2e-test+admin-profil@alyosingenierie.fr";
const USER_EMAIL = "e2e-test+user-profil@alyosingenierie.fr";

test.describe("Admin profil de recherche — P2 Gate 6", () => {
  test.afterAll(async () => {
    try {
      await deleteUserIfExists(ADMIN_EMAIL);
      await deleteUserIfExists(USER_EMAIL);
    } catch {
      /* best-effort cleanup */
    }
  });

  test.beforeEach(async () => {
    test.skip(!hasDatabase, "skipped — no DATABASE_URL in CI environment (cf. JSDoc en-tête)");
  });

  // ==========================================================================
  // C1 — Non-admin : redirect forbidden
  // ==========================================================================
  test.fixme("C1 — un user (non-admin) est redirigé vers /sourcing/ao-du-jour?error=forbidden", async ({
    page,
  }) => {
    // TODO Camille :
    //   1. signInWith(page, USER_EMAIL) en role 'user' (créer un helper
    //      `signInWithRole(page, email, role)` si besoin)
    //   2. page.goto('/sourcing/admin/profil')
    //   3. expect(page).toHaveURL(/\/sourcing\/ao-du-jour\?error=forbidden/)
    //   4. expect(page.getByRole('heading', { name: /AO du jour/i })).toBeVisible()
    await signInWith(page, USER_EMAIL);
    await page.goto("/sourcing/admin/profil");
    await expect(page).toHaveURL(/error=forbidden/);
  });

  // ==========================================================================
  // C2 — Admin : form pré-rempli
  // ==========================================================================
  test.fixme("C2 — admin charge la page → form pré-rempli avec profil actif AlyoS", async ({
    page,
  }) => {
    // TODO Camille :
    //   1. signInWith(page, ADMIN_EMAIL) en role 'admin'
    //   2. page.goto('/sourcing/admin/profil')
    //   3. expect(page.getByRole('heading', { name: /Profil de recherche/i })).toBeVisible()
    //   4. Vérifier que les ChipInput sont peuplés depuis le seed prod :
    //      - keywords.positive contient au moins "btp"
    //      - cpv_codes contient "45000000"
    //      - geo_zones contient "33"
    //   Snapshot a11y via page.accessibility.snapshot() recommandé.
    await signInWith(page, ADMIN_EMAIL);
    await page.goto("/sourcing/admin/profil");
    await expect(page.getByRole("heading", { name: /Profil de recherche/i })).toBeVisible();
    await expect(page.getByText(/btp/i).first()).toBeVisible();
  });

  // ==========================================================================
  // C3 — Édition + submit + revalidation
  // ==========================================================================
  test.fixme("C3 — édition keywords + submit → success toast + revalidation", async ({ page }) => {
    // TODO Camille :
    //   1. signInWith admin + goto /sourcing/admin/profil
    //   2. Ajouter un keyword "extension" dans la section "Mots-clés positifs"
    //      (taper dans l'input + presser Enter — pattern ChipInput)
    //   3. Cliquer "Enregistrer"
    //   4. Attendre le toast role="status" avec "Profil ... enregistré avec succès"
    //   5. Reload page → vérifier que "extension" est toujours présent (persistance)
    //   6. Goto /sourcing/ao-du-jour → vérifier que la liste a été revalidée
    //      (le header indique le profil édité)
    await signInWith(page, ADMIN_EMAIL);
    await page.goto("/sourcing/admin/profil");
    await page.getByLabel("keywords.positive").fill("extension");
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: /Enregistrer/i }).click();
    await expect(page.getByRole("status")).toContainText(/enregistré avec succès/i);
  });

  // ==========================================================================
  // C4 — Validation Zod serveur
  // ==========================================================================
  test.fixme("C4 — payload invalide (CPV non-digit) → erreurs inline sans submit", async ({
    page,
  }) => {
    // TODO Camille :
    //   1. signInWith admin + goto /sourcing/admin/profil
    //   2. Saisir "45abc" dans la section "Codes CPV"
    //   3. Vérifier que le ChipInput affiche l'erreur locale
    //      "Code CPV invalide (2 à 8 chiffres)" (validation client UX)
    //   4. Si l'utilisateur force le submit (bypass UI), Zod côté serveur
    //      doit aussi rejeter — assertion sur role="alert" "Un ou plusieurs
    //      champs sont invalides". Test depend de l'implem ChipInput :
    //      si validate empêche d'ajouter la chip, le payload n'arrive même
    //      pas au serveur. Camille peut choisir le scenario.
    await signInWith(page, ADMIN_EMAIL);
    await page.goto("/sourcing/admin/profil");
    await page.getByLabel("cpv_codes").fill("45abc");
    await page.keyboard.press("Enter");
    await expect(page.getByText(/Code CPV invalide/i)).toBeVisible();
  });

  // ==========================================================================
  // C5 — Audit log A3 inséré
  // ==========================================================================
  test.fixme("C5 — après update, une ligne audit_logs A3 search_profile_change est insérée", async () => {
    // TODO Camille :
    //   1. Snapshot count audit_logs avant via Supabase service_role
    //   2. signInWith admin + edit + submit (scenario C3)
    //   3. Snapshot count audit_logs après
    //   4. Vérifier diff = +1
    //   5. Vérifier le row inséré :
    //      - action = 'search_profile_change'
    //      - data.operation = 'update'
    //      - data.diff contient les champs modifiés
    //      - actor_id = admin user
    //   Helper recommandé : créer e2e/helpers/audit.ts avec
    //   `getRecentAuditLogs(action, sinceMs)`.
    expect(true).toBe(true);
  });
});
