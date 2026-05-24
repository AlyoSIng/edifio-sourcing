/**
 * createOdooOpportunity — connecteur partagé Solo + Tandem.
 *
 * Source de vérité :
 *  - `specs/module_solo_engine_v1.md` §3.2 (contrat partagé)
 *  - `specs/module_tandem_engine_v1.md` §3.5 (1 opp par archi partant)
 *  - `src/db/schema/integrations.ts` (table `odoo_opportunities` refondue
 *    étape 1 Tandem — UNIQUE partiels `uniq_opp_solo` / `uniq_opp_tandem`)
 *
 * Contrat :
 *  - `architectId IS NULL` ⇒ opp Solo, garantie unique par AO
 *    (idempotence via `uniq_opp_solo`).
 *  - `architectId IS NOT NULL` ⇒ opp Tandem, garantie unique par couple
 *    (AO, architecte) via `uniq_opp_tandem`. Permet plusieurs opps par AO
 *    (1 par architecte partant).
 *
 * Stratégie idempotence :
 *  1. Tente l'INSERT BDD avec `ON CONFLICT DO NOTHING` sur l'index partiel
 *     correspondant. Si la ligne existe déjà → retour `alreadyExisted=true`,
 *     pas d'appel XML-RPC (la sync a déjà eu lieu, ou on ne re-déclenche pas).
 *  2. Sinon, on essaie l'appel XML-RPC `crm.lead.create`. En cas d'échec
 *     (sync OFF, network, fault) → on UPDATE la ligne avec `lastError`
 *     mais on garde `odooId=-1` (placeholder). Pas de rollback BDD :
 *     l'opportunité est marquée « en attente de sync », un cron de
 *     reprise (Phase 2) pourra rejouer.
 *  3. L'audit log A8 `odoo_opportunity_create` reste à brancher côté Server
 *     Action (post-commit) — pas dans ce module pour le garder pur.
 *
 * Module pur — toutes les dépendances (db, client Odoo) sont injectables.
 */

import { and, eq, isNull, sql } from "drizzle-orm";

import { db as defaultDb } from "@/db/client";
import { odooOpportunities } from "@/db/schema/integrations";
import { ALYOS_ORG_ID } from "@/lib/constants/organization";

import { getOdooClient, OdooError, type OdooClient } from "./client";
import type { CreateOdooOpportunityOptions, CreateOdooOpportunityResult } from "./types";

/** Dépendances injectables — par défaut singletons prod. */
export interface CreateOdooOpportunityDeps {
  db?: typeof defaultDb;
  odooClient?: OdooClient;
  /** Override organizationId (défaut ALYOS_ORG_ID — MVP single-tenant). */
  organizationId?: string;
}

/**
 * Crée une opportunité Odoo + sa trace en BDD `odoo_opportunities`.
 *
 * Contrat :
 *  - Idempotent : appel multiple sur le même couple (tenderId, architectId)
 *    → 1 seule ligne BDD, retour `alreadyExisted=true` à partir de la 2e fois.
 *  - Robuste à la panne Odoo : si l'appel XML-RPC échoue, la ligne BDD est
 *    quand même créée avec `odooId=-1` et `lastError` rempli. La sync sera
 *    rejouée plus tard (Phase 2 cron de reprise).
 *  - Pas de throw — retourne toujours un `CreateOdooOpportunityResult`.
 *
 * @param tenderId — UUID du tender (FK)
 * @param options — { stage, origin, architectId? }
 * @param deps — DI tests
 */
export async function createOdooOpportunity(
  tenderId: string,
  options: CreateOdooOpportunityOptions,
  deps: CreateOdooOpportunityDeps = {},
): Promise<CreateOdooOpportunityResult> {
  const db = deps.db ?? defaultDb;
  const orgId = deps.organizationId ?? ALYOS_ORG_ID;

  // 1. Validation des invariants
  if (options.origin === "tandem" && !options.architectId) {
    return { ok: false, error: "missing_architect_id" };
  }
  if (options.origin !== "solo" && options.origin !== "tandem") {
    return { ok: false, error: "invalid_origin" };
  }

  const architectId = options.origin === "tandem" ? (options.architectId as string) : null;

  // 2. SELECT-then-INSERT en transaction.
  //    Les index UNIQUE partiels (uniq_opp_solo / uniq_opp_tandem) gèrent la
  //    sécurité concurrentielle au niveau BDD (toute course gagne un seul
  //    INSERT). On préfère SELECT-then-INSERT à `onConflictDoNothing` car ce
  //    dernier nécessite de référencer un index Postgres précis avec
  //    `WHERE architect_id IS NULL` — pas exposé proprement par l'API Drizzle
  //    `target/targetWhere` (cf. drizzle-orm 0.39 issue #2461). Le SELECT
  //    optimiste suffit pour l'idempotence applicative ; en cas de course
  //    perdue (rarissime — 2 callers concurrents sur le même couple), la
  //    contrainte BDD lèvera une erreur 23505 captée en `db_insert_failed`,
  //    le caller peut retry — la seconde tentative trouvera la ligne via le
  //    SELECT et retournera `alreadyExisted=true`.
  //
  //    Filtre WHERE compatible index partiel : on inclut explicitement
  //    `architect_id IS NULL` / `= UUID` pour que Postgres choisisse le bon
  //    index partiel.
  const whereExisting =
    architectId === null
      ? and(eq(odooOpportunities.tenderId, tenderId), isNull(odooOpportunities.architectId))
      : and(
          eq(odooOpportunities.tenderId, tenderId),
          eq(odooOpportunities.architectId, architectId),
        );

  const existing = await db
    .select({
      id: odooOpportunities.id,
      odooId: odooOpportunities.odooId,
      lastError: odooOpportunities.lastError,
    })
    .from(odooOpportunities)
    .where(whereExisting)
    .limit(1);

  if (existing[0]) {
    const row = existing[0];
    return {
      ok: true,
      id: row.id,
      odooId: row.odooId,
      alreadyExisted: true,
      lastError: row.lastError,
    };
  }

  let insertedRow: { id: string; odooId: number; lastError: string | null } | undefined;
  try {
    const rows = await db
      .insert(odooOpportunities)
      .values({
        tenderId,
        organizationId: orgId,
        architectId,
        origin: options.origin,
        odooId: -1, // placeholder, à update après XML-RPC
        odooStage: options.stage,
        lastError: null,
      })
      .returning({
        id: odooOpportunities.id,
        odooId: odooOpportunities.odooId,
        lastError: odooOpportunities.lastError,
      });
    insertedRow = rows[0];
  } catch (err) {
    // Conflit BDD (23505) si course perdue — on relit pour idempotence.
    const reread = await db
      .select({
        id: odooOpportunities.id,
        odooId: odooOpportunities.odooId,
        lastError: odooOpportunities.lastError,
      })
      .from(odooOpportunities)
      .where(whereExisting)
      .limit(1);
    if (reread[0]) {
      const row = reread[0];
      return {
        ok: true,
        id: row.id,
        odooId: row.odooId,
        alreadyExisted: true,
        lastError: row.lastError,
      };
    }
    return {
      ok: false,
      error: "db_insert_failed",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  if (!insertedRow) {
    return { ok: false, error: "db_insert_failed", detail: "no_row_returned" };
  }

  // 4. Tente l'appel XML-RPC `crm.lead.create`.
  const odooClient = deps.odooClient ?? getOdooClient();
  let odooId = -1;
  let lastError: string | null = null;
  try {
    const created = await odooClient.executeKw<number>(
      "crm.lead",
      "create",
      [
        {
          name: `edifio Sourcing — AO ${tenderId.slice(0, 8)}`,
          type: "opportunity",
          x_edifio_tender_id: tenderId,
          x_edifio_origin: options.origin,
          ...(architectId ? { x_edifio_architect_id: architectId } : {}),
        },
      ],
      {},
    );
    if (typeof created === "number" && created > 0) {
      odooId = created;
    } else {
      lastError = `Réponse Odoo inattendue : ${JSON.stringify(created)}`;
    }
  } catch (err) {
    if (err instanceof OdooError) {
      lastError = `${err.code}: ${err.message}${err.detail ? ` — ${err.detail}` : ""}`;
    } else {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  // 5. Update la ligne BDD avec l'odooId réel (ou -1 + lastError si échec).
  try {
    await db
      .update(odooOpportunities)
      .set({ odooId, lastError, lastSyncedAt: sql`now()` })
      .where(eq(odooOpportunities.id, insertedRow.id));
  } catch (err) {
    // L'INSERT a réussi mais l'UPDATE échoue — on retourne quand même
    // ok=true avec lastError set pour traçabilité (la ligne existe en BDD).
    lastError = `${lastError ?? ""}; update_failed: ${
      err instanceof Error ? err.message : String(err)
    }`;
  }

  return {
    ok: true,
    id: insertedRow.id,
    odooId,
    alreadyExisted: false,
    lastError,
  };
}
