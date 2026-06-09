import { expect, test } from "@playwright/test";

import {
  cleanupMultiOrgFixtures,
  seedMultiOrgFixtures,
  MULTI_ORG_IDS,
  getAdminClient,
} from "../fixtures/multi-org-seed";
import { countRowsForOrg } from "../helpers/db-checks";

/**
 * S6 — Cron sourcing-run multi-tenant.
 *
 * Source de vérité : `gates/RECETTE_FINALE_PROTECT_BASCULE_JUILLET.md` §2 (S6).
 *
 * Couvre l'invariante **R12 Sébastien** + ADR-014 : le cron sourcing-run
 * doit pouvoir tourner sur la BDD multi-tenant et insérer des tenders dans
 * chaque organization_id correspondant à un profil de recherche actif. Le
 * cron utilise le rôle Postgres BYPASSRLS — il doit donc traverser la
 * FORCE RLS posée par la migration 0052.
 *
 * Stratégie de test :
 *   1. Vérifier que la route `/api/cron/sourcing-run` est gated par
 *      `Authorization: Bearer ${CRON_SECRET}`.
 *   2. Vérifier (côté BDD service_role) que la fixture multi-org a bien créé
 *      des `search_profiles` actifs distincts pour AlyoS ET PROTECT (sinon
 *      le cron ne traiterait qu'une org).
 *   3. Vérifier que la fixture a posé au moins 1 tender `sourced` par org —
 *      preuve d'isolation BDD côté write.
 *
 * Note : on N'exerce PAS le cron lui-même en E2E (il déclenche des appels
 * BOAMP réels + scrapers Fly.io — coûteux et non déterministe). Le smoke
 * post-bascule (cf. recette §S6) est manuel. Ici on garantit la posture
 * d'auth + l'état BDD multi-tenant qui rend possible un cron multi-org.
 *
 * Tags : `@multi-org`, `@p0`.
 */

test.describe("@multi-org @p0 S6 — Cron sourcing-run multi-tenant", () => {
  test.beforeAll(async () => {
    await seedMultiOrgFixtures();
  });

  test.afterAll(async () => {
    await cleanupMultiOrgFixtures();
  });

  test("Route /api/cron/sourcing-run sans bearer → 401", async ({ request }) => {
    const res = await request.get("/api/cron/sourcing-run");
    expect(res.status()).toBe(401);
  });

  test("Route /api/cron/sourcing-run avec bearer incorrect → 401", async ({ request }) => {
    const res = await request.get("/api/cron/sourcing-run", {
      headers: { authorization: "Bearer wrong-cron-secret-1234567890" },
    });
    expect(res.status()).toBe(401);
  });

  test("Au moins 1 search_profile actif par org (AlyoS + PROTECT)", async () => {
    const admin = getAdminClient();
    for (const orgKey of ["ALYOS", "PROTECT"] as const) {
      const { data, error } = await admin
        .from("search_profiles")
        .select("id, active")
        .eq("organization_id", MULTI_ORG_IDS[orgKey])
        .eq("active", true);
      expect(error, `search_profiles SELECT ${orgKey}: ${error?.message}`).toBeNull();
      expect((data ?? []).length, `search_profiles actifs ${orgKey}`).toBeGreaterThanOrEqual(1);
    }
  });

  test("Au moins 1 tender sourced par org (preuve d'isolation côté write)", async () => {
    expect(await countRowsForOrg("tenders", MULTI_ORG_IDS.ALYOS)).toBeGreaterThanOrEqual(1);
    expect(await countRowsForOrg("tenders", MULTI_ORG_IDS.PROTECT)).toBeGreaterThanOrEqual(1);
  });

  test("Spot-check BDD : aucun tender cross-tenant (organization_id mal taggé)", async () => {
    const admin = getAdminClient();
    const { data, error } = await admin
      .from("tenders")
      .select("organization_id, external_ref")
      .like("external_ref", "ALYOS-%");
    expect(error?.message ?? null).toBeNull();
    for (const row of data ?? []) {
      expect(
        row.organization_id,
        `Tender ALYOS-* doit être tagué ALYOS, obtenu ${row.organization_id}`,
      ).toBe(MULTI_ORG_IDS.ALYOS);
    }

    const { data: dataProtect } = await admin
      .from("tenders")
      .select("organization_id, external_ref")
      .like("external_ref", "PROTECT-%");
    for (const row of dataProtect ?? []) {
      expect(
        row.organization_id,
        `Tender PROTECT-* doit être tagué PROTECT, obtenu ${row.organization_id}`,
      ).toBe(MULTI_ORG_IDS.PROTECT);
    }
  });
});
