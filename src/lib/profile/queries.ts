/**
 * Helpers Drizzle profil de recherche — édition admin AlyoS (P2 Gate 6).
 *
 * Source de vérité :
 *  - `specs/module_sourcing_engine_v1.md` §3.5 (matchesProfile — colonnes lues
 *    par le filter : `keywords`, `cpv_codes`, `geo_zones`, `market_types`,
 *    `amount_min/max`). Pas de modif schéma — `searchProfiles` contient déjà
 *    toutes les colonnes éditables.
 *  - `src/db/schema/config.ts` (`searchProfiles`)
 *  - 5 recos Board 22/05 (cf. `DECISIONS.md`) :
 *      Q2 — 1 profil unique éditable par organization en V1 (pas de CRUD multi)
 *      Q3 — `exact_keywords` case-insensitive (cohérent normalisation matcher)
 *      Q4 — `market_types` enum fermé travaux/services/fournitures/moe
 *      Q5 — `geo_zones` codes département FR V1 (pas mix dept/région)
 *
 * Convention multi-tenant (cf. `src/lib/constants/organization.ts` JSDoc) :
 *  - Filtre `organization_id = $1` **toujours explicite** dans le WHERE (ligne
 *    de défense applicative, RLS = defense in depth pour le rôle `postgres`).
 *  - Pas de lookup `memberships` — V1 mono-tenant `ALYOS_ORG_ID`.
 *
 * Pattern DI client Drizzle : `client: DrizzleClient` pour mock-friendly tests
 * Vitest (cf. `src/lib/sourcing/queries.ts` qui inspire ce module). Le call-site
 * applicatif (Server Action `updateProfileAction`) injecte le `db` réel ; les
 * tests injectent un fake builder.
 */

import { and, asc, eq } from "drizzle-orm";

import type { db as defaultDb } from "@/db/client";
import type { SearchProfile } from "@/db/schema/config";
import { searchProfiles } from "@/db/schema/config";

/** Type minimal du client Drizzle exposé (mock-friendly côté tests). */
export type DrizzleClient = typeof defaultDb;

// ============================================================================
// 1. Champs éditables — restriction explicite
// ============================================================================

/**
 * Sous-ensemble des champs `searchProfiles` éditables par l'admin via la page
 * `/sourcing/admin/profil`. Volontairement restreint :
 *  - PAS de `name` (V1 mono-profil AlyoS, nom figé par seed prod)
 *  - PAS de `active` (V1 le profil seedé reste actif — Q2 Board 22/05)
 *  - PAS de `cron_time` / `cron_days` (PR ultérieure dédiée si besoin)
 *  - PAS de `organization_id` / `id` / timestamps (auto)
 *
 * `keywords` : objet JSONB structuré conforme `SearchProfileKeywords`.
 * `cpvCodes`, `geoZones`, `marketTypes` : arrays text[] Postgres.
 * `amountMin` / `amountMax` : numeric Postgres → `string | null` côté Drizzle
 * (la conversion `number` → `string` est faite côté Server Action avant
 * passage ici — voir `actions.ts`).
 */
export interface SearchProfilePatch {
  keywords: { positive: string[]; negative: string[]; exact: string[] };
  cpvCodes: string[];
  geoZones: string[];
  marketTypes: string[];
  /** `null` = pas de borne min. Sinon string numeric (precision 14, scale 2). */
  amountMin: string | null;
  /** `null` = pas de borne max. Sinon string numeric (precision 14, scale 2). */
  amountMax: string | null;
}

// ============================================================================
// 2. getActiveSearchProfile — lecture du profil actif de l'org
// ============================================================================

/**
 * Retourne le profil de recherche actif de l'organisation passée, ou `null`
 * si aucun profil actif. V1 mono-profil AlyoS : on prend le plus ancien
 * (stabilité d'affichage, aligné `getActiveSearchProfileName` côté
 * `src/lib/sourcing/queries.ts`).
 *
 * Filtres :
 *  - `organization_id = $1` (multi-tenant explicite — defense applicative)
 *  - `active = TRUE` (l'index partiel `idx_search_profiles_org WHERE active`
 *    sera utilisé par le planner Postgres)
 *
 * Ordre + limite : `ORDER BY created_at ASC LIMIT 1`. Spec Q2 22/05 garantit
 * qu'il n'y a qu'un seul row actif côté seed prod, mais on défense le cas où
 * plusieurs profils coexisteraient (Phase 2) en gardant le plus ancien.
 *
 * @param organizationId — UUID du tenant (ex. `ALYOS_ORG_ID`)
 * @param client         — instance Drizzle (default: `db` lazy ; mock-friendly)
 */
export async function getActiveSearchProfile(
  organizationId: string,
  client: DrizzleClient,
): Promise<SearchProfile | null> {
  const rows = await client
    .select()
    .from(searchProfiles)
    .where(and(eq(searchProfiles.organizationId, organizationId), eq(searchProfiles.active, true)))
    .orderBy(asc(searchProfiles.createdAt))
    .limit(1);

  return rows[0] ?? null;
}

// ============================================================================
// 3. updateSearchProfile — mise à jour des champs éditables
// ============================================================================

/**
 * Met à jour les champs éditables d'un profil de recherche pour une
 * organisation donnée. Retourne le row complet *après* update via `RETURNING *`
 * (utile pour calculer le `diff` audit log côté Server Action, et pour le
 * revalidate côté UI sans seconde requête).
 *
 * Garde multi-tenant : le WHERE filtre **simultanément** sur `id` ET
 * `organization_id`. Conséquence : si un attaquant arrive à pousser un
 * `profileId` d'une autre org via la Server Action, le `UPDATE` n'affecte
 * AUCUNE ligne et `rows[0]` est `undefined` → `Error('profile_not_found')`.
 *
 * `updatedAt` est explicitement repassé à `now()` pour respecter le contrat
 * (DEFAULT n'est appliqué qu'à l'INSERT côté Drizzle 0.39 — pas au UPDATE).
 *
 * @param organizationId — UUID du tenant courant
 * @param profileId      — UUID du profil à mettre à jour
 * @param patch          — champs éditables (cf. `SearchProfilePatch`)
 * @param client         — instance Drizzle (default: `db` lazy ; mock-friendly)
 * @throws Error('profile_not_found') si aucun row affecté (id+org HS)
 */
export async function updateSearchProfile(
  organizationId: string,
  profileId: string,
  patch: SearchProfilePatch,
  client: DrizzleClient,
): Promise<SearchProfile> {
  const rows = await client
    .update(searchProfiles)
    .set({
      keywords: patch.keywords,
      cpvCodes: patch.cpvCodes,
      geoZones: patch.geoZones,
      marketTypes: patch.marketTypes,
      amountMin: patch.amountMin,
      amountMax: patch.amountMax,
      // `updatedAt` n'est PAS auto-touché par Drizzle 0.39 sur UPDATE — explicite.
      updatedAt: new Date(),
    })
    .where(and(eq(searchProfiles.id, profileId), eq(searchProfiles.organizationId, organizationId)))
    .returning();

  const updated = rows[0];
  if (!updated) {
    // Volontairement opaque côté caller — la Server Action mappera vers
    // `profile_not_found` (defense in depth contre cross-tenant + race
    // `delete-then-update`).
    throw new Error("profile_not_found");
  }

  return updated;
}
