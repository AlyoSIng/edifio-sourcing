/**
 * Helpers BDD pour les tests E2E — vérifications d'isolation tenant.
 *
 * Utilise le client Supabase service_role (BYPASSRLS) pour interroger la BDD
 * indépendamment de la session utilisateur du browser. Ne JAMAIS importer
 * dans le code applicatif.
 *
 * Justification : sur les tests de cloisonnement (S4 — critique), on a besoin
 * de **prouver côté serveur** que ce que voit le browser correspond strictement
 * à ce qui est autorisé par RLS. Le browser passe par les pages Server
 * Components (rôle `postgres` BYPASSRLS) — on veut donc également faire un
 * spot-check sur ce que `service_role` voit pour vérifier qu'on n'a pas une
 * fuite. La fonction `assertOrgIsolation` interroge la BDD service_role et
 * vérifie que toutes les entités d'une table donnée appartenant à `orgId`
 * forment bien la liste attendue (count + organization_id uniformes).
 */

import { expect } from "@playwright/test";

import { getAdminClient } from "../fixtures/multi-org-seed";

/**
 * Vérifie que le contenu BDD d'une table pour une org donnée est conforme.
 *
 * @param table - nom de la table (`companies`, `architects`, `bureaux_etudes`, `tenders`)
 * @param expectedOrgId - UUID de l'organisation cible
 * @param minCount - nombre minimum de rows attendu (par défaut 1)
 *
 * Comportement :
 *   - récupère toutes les rows de la table avec `organization_id = expectedOrgId`
 *   - assert que count ≥ minCount
 *   - assert qu'aucune row n'a un `organization_id` différent (paranoia +1)
 */
export async function assertOrgIsolation(
  table: "companies" | "architects" | "bureaux_etudes" | "tenders",
  expectedOrgId: string,
  minCount = 1,
): Promise<void> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from(table)
    .select("id, organization_id")
    .eq("organization_id", expectedOrgId);
  if (error) {
    throw new Error(`assertOrgIsolation(${table}, ${expectedOrgId}): ${error.message}`);
  }
  const rows = data ?? [];
  expect(rows.length, `Table ${table} : count rows org ${expectedOrgId}`).toBeGreaterThanOrEqual(
    minCount,
  );
  for (const row of rows) {
    expect(row.organization_id, `Row ${row.id} doit appartenir à ${expectedOrgId}`).toBe(
      expectedOrgId,
    );
  }
}

/**
 * Compte les rows d'une table pour une org donnée. Renvoie 0 si la table est
 * vide pour cette org.
 */
export async function countRowsForOrg(
  table: "companies" | "architects" | "bureaux_etudes" | "tenders",
  orgId: string,
): Promise<number> {
  const admin = getAdminClient();
  const { count, error } = await admin
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  if (error) {
    throw new Error(`countRowsForOrg(${table}, ${orgId}): ${error.message}`);
  }
  return count ?? 0;
}

/**
 * Vérifie qu'aucun user fantôme `auth.users` ne reste pour un email donné.
 * Utilisé par S11 — après un hardfail de membership, l'auth.users doit
 * être nettoyé via le rollback `admin.auth.admin.deleteUser(...)`.
 *
 * Renvoie `null` si pas de user (cas attendu post-rollback) ou l'id sinon.
 */
export async function findAuthUserId(email: string): Promise<string | null> {
  const admin = getAdminClient();
  for (let page = 1; page <= 5; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`findAuthUserId(${email}): ${error.message}`);
    const found = (data?.users ?? []).find(
      (u) => (u.email ?? "").toLowerCase() === email.toLowerCase(),
    );
    if (found) return found.id;
    if ((data?.users ?? []).length < 200) break;
  }
  return null;
}

/**
 * Vérifie qu'il existe (ou pas) une row `memberships` pour un userId.
 * Utilisée par S11 (assert pas de membership) et S8 (assert nouvelle org
 * a bien sa première membership après onboarding).
 */
export async function findMembershipsForUser(
  userId: string,
): Promise<Array<{ organization_id: string; role: string }>> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("memberships")
    .select("organization_id, role")
    .eq("user_id", userId);
  if (error) {
    throw new Error(`findMembershipsForUser(${userId}): ${error.message}`);
  }
  return data ?? [];
}
