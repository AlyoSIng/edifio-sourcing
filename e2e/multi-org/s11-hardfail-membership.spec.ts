import { expect, test } from "@playwright/test";

import { cleanupMultiOrgFixtures, seedMultiOrgFixtures } from "../fixtures/multi-org-seed";
import { getCookieFor } from "../helpers/auth";
import { findAuthUserId, findMembershipsForUser } from "../helpers/db-checks";

/**
 * S11 — Hardfail insert membership : rollback auth.users.
 *
 * Source de vérité : `gates/RECETTE_FINALE_PROTECT_BASCULE_JUILLET.md` §2 (S11)
 * + `src/app/api/admin/users/route.ts` L117-177 (le try/catch hardfail).
 *
 * Couvre le coupe-circuit CC-3 (recette §1) : quand l'insert dans `memberships`
 * échoue (organization_id invalide, contrainte FK, BDD down…), la route
 * **rollback la création auth** via `admin.auth.admin.deleteUser(created.user.id)`.
 *
 * Sans ce rollback : un user fantôme reste dans `auth.users` SANS row dans
 * `memberships` → après suppression du fallback ALYOS_ORG_ID, ce user atterrit
 * sur `/no-org` au login (OK)… mais reste actif côté Supabase Auth, prêt à
 * exploser si quelqu'un réintroduit le fallback par erreur (ou si on remet
 * accidentellement la garde domaine + multi-org).
 *
 * Stratégie de simulation du hardfail :
 *   - **Méthode A** (préférée) : forcer l'`organization_id` du caller à un UUID
 *     invalide. Ne peut pas se faire côté caller (le code lit `caller.id` et
 *     appelle `getRequiredOrgId(caller.id)` côté serveur). Donc on ne peut pas
 *     déclencher A sans modifier le code.
 *   - **Méthode B** (utilisée ici) : préparer un caller superadmin SANS
 *     membership (orphelin) → quand la route appelle `getRequiredOrgId(caller.id)`
 *     dans le bloc try/catch L129, ça throw `NoOrganizationMembershipError` →
 *     bloc catch → rollback `deleteUser(created.user.id)` → 500.
 *
 * **Attention** : la Méthode B requiert que le caller soit `isAdmin()` au
 * niveau du metadata user. Pour ça on prépare un user temporaire :
 *   - role=admin dans user_metadata → `isAdmin(profile)` true
 *   - aucune row dans memberships → `getRequiredOrgId` throws
 *   - la route entre dans le bloc catch L149-177 → assertion S11.
 *
 * Critère KO bloquant (CC-3) :
 *   - status != 500 → la route ne signale pas l'erreur
 *   - OU `auth.users` contient encore le user créé après le 500 → rollback raté
 *
 * Tags : `@multi-org`, `@p0`.
 */

const ADMIN_USERS_PATH = "/api/admin/users";
const HARDFAIL_CALLER_EMAIL = "e2e-test+s11-orphan-admin@external.com";
const HARDFAIL_TARGET_EMAIL = `e2e-test+s11-target-${Date.now()}@external.com`;

test.describe("@multi-org @p0 S11 — Hardfail insert membership + rollback auth", () => {
  test.beforeAll(async () => {
    await seedMultiOrgFixtures();

    // Prépare un caller "admin sans membership" : role=admin côté metadata
    // pour passer `isAdmin()`, mais ZÉRO row memberships → getRequiredOrgId
    // throws dans le try/catch L129 de la route.
    const { getAdminClient } = await import("../fixtures/multi-org-seed");
    const admin = getAdminClient();

    // Idempotence : supprimer si existait.
    const existing = await findAuthUserId(HARDFAIL_CALLER_EMAIL);
    if (existing) await admin.auth.admin.deleteUser(existing);

    const { data: createData, error: createErr } = await admin.auth.admin.createUser({
      email: HARDFAIL_CALLER_EMAIL,
      password: "MultiOrg-E2E-2026!",
      email_confirm: true,
      user_metadata: {
        role: "admin", // suffit à `isAdmin(profile)` qui lit le metadata
        must_change_password: false,
        provisional_password_expires_at: null,
        first_name: "S11",
        last_name: "Orphan",
      },
    });
    if (createErr) throw new Error(`S11 setup caller: ${createErr.message}`);
    if (!createData?.user) throw new Error(`S11 setup caller: no user returned`);
    // Volontairement PAS de row `memberships` pour ce caller — c'est ce qui
    // déclenche le hardfail dans la route.
  });

  test.afterAll(async () => {
    // Nettoyage caller + cible (si la cible aurait survécu — bug à détecter).
    const { getAdminClient } = await import("../fixtures/multi-org-seed");
    const admin = getAdminClient();
    for (const email of [HARDFAIL_CALLER_EMAIL, HARDFAIL_TARGET_EMAIL]) {
      try {
        const id = await findAuthUserId(email);
        if (id) await admin.auth.admin.deleteUser(id);
      } catch {
        /* best-effort */
      }
    }
    await cleanupMultiOrgFixtures();
  });

  test("POST /api/admin/users avec caller orphelin → 500 + auth.users rollback", async () => {
    // Capture cookies du caller orphelin via seed-session.
    const cookieHeader = await getCookieFor(HARDFAIL_CALLER_EMAIL);

    const { chromium } = await import("@playwright/test");
    const browser = await chromium.launch();
    try {
      const context = await browser.newContext();
      const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
      const url = new URL(baseURL);
      const cookies = cookieHeader
        .split("; ")
        .map((c) => {
          const idx = c.indexOf("=");
          if (idx < 0) return null;
          return {
            name: c.slice(0, idx),
            value: c.slice(idx + 1),
            domain: url.hostname,
            path: "/",
            httpOnly: true,
            secure: url.protocol === "https:",
          };
        })
        .filter((c): c is NonNullable<typeof c> => c !== null);
      await context.addCookies(cookies);

      const res = await context.request.post(ADMIN_USERS_PATH, {
        multipart: {
          email: HARDFAIL_TARGET_EMAIL,
          first_name: "S11",
          last_name: "Target",
          role: "user",
        },
      });

      // Critère bloquant 1 : status 500 (cf. route.ts L173-176 "Création BDD
      // impossible (memberships)..."). On accepte 500 strict, pas 200/201.
      expect(
        res.status(),
        `Hardfail attendu : status 500. Obtenu ${res.status()} body=${await res.text()}`,
      ).toBe(500);

      // Critère bloquant 2 : rollback effectif → la cible n'est PAS dans auth.users.
      const targetAuthId = await findAuthUserId(HARDFAIL_TARGET_EMAIL);
      expect(
        targetAuthId,
        `auth.users doit avoir été rollback pour ${HARDFAIL_TARGET_EMAIL} (CC-3)`,
      ).toBeNull();

      // Critère bloquant 3 : si malgré tout un user fantôme existait, vérifier
      // qu'il n'a pas de memberships (cohérence du hardfail).
      if (targetAuthId) {
        const memberships = await findMembershipsForUser(targetAuthId);
        expect(memberships, "user fantôme ne doit jamais avoir de memberships").toHaveLength(0);
      }
    } finally {
      await browser.close();
    }
  });

  test("Sanity check : le caller orphelin lui-même n'a toujours pas de memberships", async () => {
    // Garde-fou anti-régression : la spec ne doit pas avoir, par effet de bord,
    // créé une membership pour le caller orphelin.
    const callerId = await findAuthUserId(HARDFAIL_CALLER_EMAIL);
    expect(callerId).not.toBeNull();
    if (callerId) {
      const memberships = await findMembershipsForUser(callerId);
      expect(memberships, "caller orphelin doit rester sans memberships").toHaveLength(0);
    }
  });
});
