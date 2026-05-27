/**
 * Helper pour tables FORCE ROW LEVEL SECURITY (message_templates,
 * organization_profiles).
 *
 * Exécute `SET LOCAL app.current_organization_id = $orgId` dans la connexion
 * courante avant de lancer le callback. Requis quand Drizzle utilise un rôle
 * Postgres sans BYPASSRLS (Edge Functions Deno, futures connexions
 * non-service_role).
 *
 * En Next.js serveur (rôle postgres / service_role avec BYPASSRLS), ce helper
 * est défensif : il ne cause pas d'erreur mais ne modifie pas le comportement
 * RLS actuel. Il sera effectif dès que les Edge Functions liront ces tables via
 * un rôle restreint.
 *
 * Réf : ANSWER_260527_CTO_RLS_FORCE_EDGE.md + CLAUDE.md §sécurité.
 *
 * Pourquoi `set_config` avec `true` (is_local = true) ?
 *  - `true`  = LOCAL à la transaction courante (reset au COMMIT/ROLLBACK).
 *  - `false` = SESSION (persiste jusqu'à la fin de la connexion poolée).
 * On choisit `true` pour éviter la fuite de contexte tenant entre requêtes
 * successives sur la même connexion pgBouncer. Si aucune transaction n'est
 * ouverte, `set_config(..., true)` se comporte comme `false` (Postgres doc §9.27).
 * En pratique avec Drizzle + postgres.js le driver ouvre une connection par
 * requête → le risque de fuite est faible, mais on reste défensif.
 */

import { sql } from "drizzle-orm";
import type { db as defaultDb } from "@/db/client";

/** Type structurel du client Drizzle — accepte le client réel ET les mocks de test. */
export type DrizzleClient = typeof defaultDb;

/**
 * Pose `app.current_organization_id` dans la session Postgres courante
 * (LOCAL = transaction-scoped) puis exécute `fn(client)`.
 *
 * @param organizationId  UUID de l'organisation courante (valeur du contexte RLS)
 * @param client          Instance Drizzle — injectée pour testabilité
 * @param fn              Callback qui effectue la(les) requête(s) Drizzle
 *
 * @example
 *   const rows = await withTenantContext(ALYOS_ORG_ID, db, (client) =>
 *     client.select().from(messageTemplates)
 *       .where(eq(messageTemplates.organizationId, ALYOS_ORG_ID))
 *   );
 */
export async function withTenantContext<T>(
  organizationId: string,
  client: DrizzleClient,
  fn: (client: DrizzleClient) => Promise<T>,
): Promise<T> {
  // Pose le contexte org dans la session courante (LOCAL = transaction-scoped)
  await client.execute(
    sql`SELECT set_config('app.current_organization_id', ${organizationId}, true)`,
  );
  return fn(client);
}
