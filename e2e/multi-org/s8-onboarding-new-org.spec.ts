import { expect, test } from "@playwright/test";

import {
  cleanupMultiOrgFixtures,
  seedMultiOrgFixtures,
  MULTI_ORG_USERS,
  getAdminClient,
} from "../fixtures/multi-org-seed";
import { signInWith } from "../helpers/auth";
import { findAuthUserId, findMembershipsForUser } from "../helpers/db-checks";

/**
 * S8 — Onboarding d'une nouvelle organisation externe (par le superadmin).
 *
 * Source de vérité : `gates/RECETTE_FINALE_PROTECT_BASCULE_JUILLET.md` §2 (S8).
 *
 * Couvre le flow complet d'arrivée d'un nouveau tenant (au-delà d'AlyoS et
 * PROTECT) : le superadmin `sebastien@edifio.fr` (rôle `superadmin`) doit
 * pouvoir :
 *   1. Voir la liste des organisations.
 *   2. Créer une nouvelle organisation + son admin initial.
 *   3. (Symétrique) Le nouvel admin reçoit son provisoire, peut se connecter,
 *      n'a pas de vue AlyoS.
 *
 * Stratégie pragmatique : étant donné que la création passe par une Server
 * Action (`createOrgAction`) qui envoie un email Resend, on se concentre sur :
 *   - la couverture **read** de la liste superadmin (étape 1)
 *   - la couverture **write side-effect** : si on simule l'onboarding (création
 *     directe BDD via service_role), un user de cette nouvelle org peut se
 *     connecter et n'a pas de leak AlyoS.
 *
 * Cette approche reste fidèle au critère KO `pas d'erreur forbidden_domain,
 * pas de vue AlyoS` tout en évitant de dépendre de Resend en CI.
 *
 * Tags : `@multi-org`, `@p0`.
 */

test.describe("@multi-org @p0 S8 — Onboarding nouvelle organisation", () => {
  test.beforeAll(async () => {
    await seedMultiOrgFixtures();
  });

  test.afterAll(async () => {
    await cleanupMultiOrgFixtures();
    // Cleanup spécifique S8 : la nouvelle org créée (best-effort).
    try {
      const admin = getAdminClient();
      await admin.from("organizations").delete().eq("name", "S8 New Org");
      const newAdminEmail = `e2e-test+s8-newadmin@new-org.fr`;
      const id = await findAuthUserId(newAdminEmail);
      if (id) await admin.auth.admin.deleteUser(id);
    } catch {
      /* best-effort */
    }
  });

  test("Superadmin voit la liste des organisations multi-tenant", async ({ page }) => {
    await signInWith(page, MULTI_ORG_USERS.SUPERADMIN);

    const response = await page.goto("/sourcing/superadmin/organizations");
    expect(response?.status() ?? 0).toBeLessThan(500);

    // Le superadmin doit voir au moins AlyoS Ingénierie et PROTECT Marseille
    // dans la liste (fixture multi-org).
    const html = await page.content();
    expect(html).toContain("AlyoS Ingénierie");
    expect(html).toContain("PROTECT Marseille");
  });

  test("Nouvelle org créée via service_role + admin créé → login OK, pas de leak AlyoS", async ({
    page,
  }) => {
    // Étape 1 — simulation onboarding côté BDD (sans Resend).
    const admin = getAdminClient();
    const newOrgId = "00000000-0000-0000-0000-000000000d01";
    await admin.from("organizations").upsert(
      {
        id: newOrgId,
        name: "S8 New Org",
        subscription_tier: "sourcing",
        subscription_status: "active",
      },
      { onConflict: "id" },
    );

    const newAdminEmail = `e2e-test+s8-newadmin@new-org.fr`;
    // Idempotence : supprimer si déjà créé par un run précédent.
    const existing = await findAuthUserId(newAdminEmail);
    if (existing) await admin.auth.admin.deleteUser(existing);

    const { data: createData, error: createErr } = await admin.auth.admin.createUser({
      email: newAdminEmail,
      password: "MultiOrg-E2E-2026!",
      email_confirm: true,
      user_metadata: {
        role: "admin",
        must_change_password: false,
        provisional_password_expires_at: null,
        first_name: "S8",
        last_name: "Admin",
      },
    });
    expect(createErr?.message ?? null).toBeNull();
    const newAdminId = createData!.user!.id;

    await admin
      .from("users")
      .upsert(
        { id: newAdminId, email: newAdminEmail, firstname: "S8", lastname: "Admin" },
        { onConflict: "id" },
      );
    await admin
      .from("memberships")
      .upsert(
        { organization_id: newOrgId, user_id: newAdminId, role: "admin" },
        { onConflict: "organization_id,user_id" },
      );

    // Étape 2 — login en tant que ce nouvel admin.
    await signInWith(page, newAdminEmail);
    await page.goto("/sourcing/ao-du-jour");
    await expect(page).toHaveURL(/\/sourcing\/ao-du-jour/, { timeout: 15_000 });

    const html = await page.content();
    // Critère KO : pas de "forbidden_domain", pas de vue AlyoS.
    expect(html).not.toContain("forbidden_domain");
    expect(html).not.toContain("ALYOS Architectes");
    expect(html).not.toContain("ALYOS Entreprise");
    expect(html).not.toContain("Compte non rattaché");

    // Sanity BDD : le user a bien sa membership scopée à la nouvelle org, et
    // PAS de membership AlyoS sneaky.
    const memberships = await findMembershipsForUser(newAdminId);
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.organization_id).toBe(newOrgId);
  });
});
