/**
 * Insertion idempotente d'un `NormalizedTender` en BDD — edifio Sourcing.
 *
 * Étape 4/7 de la PR #2 module sourcing engine
 * (cf. `notes-de-suivi/DRAFT_PR2_BOAMP_CONNECTOR.md` §Étape 4/7).
 *
 * Source de vérité :
 *  - `specs/module_sourcing_engine_v1.md` §3.7 (insertTender)
 *  - `src/db/schema/tenders.ts` (contrainte UNIQUE `(organization_id,
 *    external_ref, platform_id)` pour l'idempotence)
 *
 * ----------------------------------------------------------------------------
 * Choix structurant — POLITIQUE de re-source
 * ----------------------------------------------------------------------------
 * Lors d'un re-source (BOAMP renvoie le même `idweb` 2 fois — typiquement
 * suite à une mise à jour d'avis), on met à jour UNIQUEMENT :
 *   - `raw_data` (le payload BOAMP a pu évoluer : amende, prolongation
 *     deadline, etc. — on garde la dernière capture)
 *   - `updated_at` (timestamp Postgres `now()`)
 *
 * On NE TOUCHE PAS à :
 *   - `score` (calculé par l'orchestrateur, peut représenter un travail IA
 *     déjà payé)
 *   - `status` (cycle de vie métier — un AO `selected_tandem` ne doit pas
 *     être remis en `sourced` par un re-source)
 *   - `matching_profile_id` (le profil ayant matché en premier reste celui
 *     enregistré)
 *   - `title`, `buyer`, `cpv`, `amount`, `deadline`, `dce_url`, `source_url`
 *     (snapshots métier au moment du premier sourcing — toute évolution
 *     reste lisible via `raw_data` mais ne pollue pas les colonnes
 *     applicatives, ce qui simplifie l'audit et le suivi).
 *
 * **Point à valider en revue CTO** (cf. brouillon DRAFT_PR2_BOAMP_CONNECTOR.md
 * §Risques 3) : ce choix est conservateur. Une alternative serait de mettre
 * à jour aussi `deadline` (si elle a été prolongée côté BOAMP) — mais cela
 * crée des effets de bord sur le tri « AO du jour ». Voir handoff Cowork
 * si désaccord.
 * ----------------------------------------------------------------------------
 *
 * Idempotence garantie par la contrainte UNIQUE
 * `tenders_organization_id_external_ref_platform_id_key`. Le `isNew` est
 * dérivé de la comparaison `created_at === updated_at` : à l'INSERT initial
 * Postgres pose la même valeur `now()` sur les deux colonnes ; au UPDATE,
 * `updated_at = now()` est strictement postérieur à `created_at` préservé.
 */

import { eq, sql } from "drizzle-orm";

import type { db as defaultDb } from "@/db/client";
import { platforms } from "@/db/schema/config";
import { tenders } from "@/db/schema/tenders";

import type { NormalizedTender } from "./types";

/**
 * Type minimal du client Drizzle exposé : on utilise `Db` (cf. `db/client.ts`)
 * pour l'API publique, mais on accepte un narrower (mock) dans les tests via
 * un duck-typing sur les méthodes utilisées.
 */
export type DrizzleClient = typeof defaultDb;

/**
 * Options de l'insertion : `organizationId` (tenant), `profileId` éventuel
 * (matching profile au moment du sourcing), `score` calculé (0 par défaut
 * tant que la PR scoring n'est pas livrée).
 */
export interface InsertTenderOptions {
  organizationId: string;
  /**
   * `null` si l'AO a été sourcé sans matching profile (ex. backfill manuel).
   * Sinon UUID du `search_profiles.id`.
   */
  profileId: string | null;
  /** Score 0-100 (contrainte CHECK côté DB). */
  score: number;
}

export interface InsertTenderResult {
  id: string;
  /** `true` si la ligne vient d'être créée, `false` si UPDATE idempotent. */
  isNew: boolean;
}

/**
 * Résout l'UUID `platforms.id` correspondant à un code lisible
 * (`boamp` | `place` | ...). Effectue un SELECT discret avec LIMIT 1.
 *
 * Émet une erreur claire si le code n'a pas été seedé (ce qui ne devrait
 * jamais arriver en prod : la table `platforms` est seedée par la migration
 * initiale + `pnpm db:seed`).
 */
async function resolvePlatformId(
  client: DrizzleClient,
  platformCode: NormalizedTender["platformCode"],
): Promise<string> {
  const rows = await client
    .select({ id: platforms.id })
    .from(platforms)
    .where(eq(platforms.code, platformCode))
    .limit(1);

  const head = rows[0];
  if (!head) {
    throw new Error(
      `insertTender: platforms.code='${platformCode}' introuvable — table platforms non seedée ?`,
    );
  }
  return head.id;
}

/**
 * Insère ou met à jour un AO en BDD de façon idempotente.
 *
 * @param tender — AO normalisé (cf. `normalize.ts`)
 * @param opts   — contexte d'insertion (tenant, profil, score)
 * @param client — instance Drizzle (injection pour tests via mock)
 * @returns      `{ id, isNew }` — UUID du tender + flag création vs update
 */
export async function insertTender(
  tender: NormalizedTender,
  opts: InsertTenderOptions,
  client: DrizzleClient,
): Promise<InsertTenderResult> {
  const platformId = await resolvePlatformId(client, tender.platformCode);

  // Statut initial à la création : 'sourced' (cf. enum tender_status).
  // À l'UPDATE on ne touche pas à status — c'est l'intérêt du onConflictDoUpdate
  // ciblé sur (raw_data, updated_at) uniquement.
  const result = await client
    .insert(tenders)
    .values({
      organizationId: opts.organizationId,
      externalRef: tender.externalRef,
      platformId,
      title: tender.title,
      buyer: tender.buyer,
      cpv: tender.cpvCodes,
      amount: tender.amount !== null ? tender.amount.toString() : null,
      deadline: tender.deadline,
      questionsDeadline: tender.questionsDeadline,
      visitDate: tender.visitDate,
      dceUrl: tender.dceUrl,
      sourceUrl: tender.sourceUrl,
      rawData: tender.rawData,
      score: opts.score.toString(),
      status: "sourced",
      matchingProfileId: opts.profileId,
    })
    .onConflictDoUpdate({
      target: [tenders.organizationId, tenders.externalRef, tenders.platformId],
      // IMPORTANT : on ne met à jour QUE raw_data + updated_at. Voir JSDoc
      // ci-dessus + handoff Cowork si désaccord.
      set: {
        rawData: sql.raw("EXCLUDED.raw_data"),
        updatedAt: sql`now()`,
      },
    })
    .returning({
      id: tenders.id,
      createdAt: tenders.createdAt,
      updatedAt: tenders.updatedAt,
    });

  const row = result[0];
  if (!row) {
    // Ne devrait jamais arriver : ON CONFLICT DO UPDATE garantit toujours
    // au moins une ligne returning. Garde-fou défensif.
    throw new Error(
      `insertTender: aucun row retourné pour externalRef=${tender.externalRef} (org=${opts.organizationId})`,
    );
  }

  // Heuristique `isNew` : à l'INSERT initial, Postgres pose la même valeur
  // pour `created_at` et `updated_at` (DEFAULT now() identique dans la même
  // expression SQL). À l'UPDATE, `updated_at = now()` produit une valeur
  // strictement supérieure à `created_at` préservé.
  const isNew = row.createdAt.getTime() === row.updatedAt.getTime();

  return { id: row.id, isNew };
}
