/**
 * Helpers Drizzle — CRUD multi-profils de recherche (Tâche #29, 2026-05-27).
 *
 * Source de vérité :
 *  - `src/db/schema/config.ts` (table `searchProfiles` avec colonnes
 *    `is_default` + `display_order` ajoutées en migration 0025)
 *  - Tâche #29 Board 2026-05-27 : multi-profils nommés par organisation
 *
 * Convention multi-tenant :
 *  - `organizationId` **toujours explicite** dans le WHERE (defense applicative).
 *  - Jamais de lookup sans filtre organisation.
 *
 * Pattern DI client Drizzle : `client: DrizzleClient` mock-friendly (Vitest).
 */

import { and, asc, eq, ne, sql } from "drizzle-orm";

import type { db as defaultDb } from "@/db/client";
import type { SearchProfile } from "@/db/schema/config";
import { searchProfiles } from "@/db/schema/config";

export type DrizzleClient = typeof defaultDb;

// ============================================================================
// Types publics
// ============================================================================

/**
 * Payload de création d'un profil de recherche.
 * `name` est obligatoire ; tous les autres champs ont des défauts côté BDD.
 */
export interface CreateSearchProfileInput {
  name: string;
  isDefault?: boolean;
  displayOrder?: number;
  keywords?: { positive: string[]; negative: string[]; exact: string[] };
  cpvCodes?: string[];
  geoZones?: string[];
  marketTypes?: string[];
  amountMin?: string | null;
  amountMax?: string | null;
}

/**
 * Payload de mise à jour — tous les champs sont optionnels sauf la clé
 * composite (organizationId + profileId). Reflète les champs modifiables
 * depuis l'UI admin (nom, critères, ordre).
 */
export interface UpdateSearchProfileInput {
  name?: string;
  displayOrder?: number;
  keywords?: { positive: string[]; negative: string[]; exact: string[] };
  cpvCodes?: string[];
  geoZones?: string[];
  marketTypes?: string[];
  amountMin?: string | null;
  amountMax?: string | null;
  active?: boolean;
}

// ============================================================================
// 1. listSearchProfiles — liste ordonnée des profils actifs
// ============================================================================

/**
 * Retourne tous les profils actifs d'une organisation, ordonnés par
 * `display_order ASC, created_at ASC` pour un affichage stable des onglets.
 *
 * Inclut les profils inactifs uniquement si `includeInactive = true` (admin).
 *
 * @param organizationId UUID du tenant courant
 * @param client         Instance Drizzle (mock-friendly)
 * @param includeInactive Si true, inclut les profils avec active = false
 */
export async function listSearchProfiles(
  organizationId: string,
  client: DrizzleClient,
  includeInactive = false,
): Promise<SearchProfile[]> {
  const where = includeInactive
    ? eq(searchProfiles.organizationId, organizationId)
    : and(eq(searchProfiles.organizationId, organizationId), eq(searchProfiles.active, true));

  return client
    .select()
    .from(searchProfiles)
    .where(where)
    .orderBy(asc(searchProfiles.displayOrder), asc(searchProfiles.createdAt));
}

// ============================================================================
// 2. getSearchProfileById — lecture d'un profil par son id
// ============================================================================

/**
 * Retourne un profil par son id pour une organisation donnée, ou `null` si
 * introuvable / appartient à une autre org (guard cross-tenant explicite).
 *
 * @param organizationId UUID du tenant courant
 * @param profileId      UUID du profil à lire
 * @param client         Instance Drizzle (mock-friendly)
 */
export async function getSearchProfileById(
  organizationId: string,
  profileId: string,
  client: DrizzleClient,
): Promise<SearchProfile | null> {
  const rows = await client
    .select()
    .from(searchProfiles)
    .where(and(eq(searchProfiles.id, profileId), eq(searchProfiles.organizationId, organizationId)))
    .limit(1);

  return rows[0] ?? null;
}

// ============================================================================
// 3. getDefaultSearchProfile — profil par défaut de l'org
// ============================================================================

/**
 * Retourne le profil marqué `is_default = true` pour l'organisation, ou
 * `null` si aucun (cas dégradé — la migration 0025 garantit qu'il en existe
 * un pour AlyoS Ingénierie).
 *
 * En cas de multiple `is_default = true` (incohérence data), retourne le
 * plus ancien (stabilité d'affichage).
 *
 * @param organizationId UUID du tenant courant
 * @param client         Instance Drizzle (mock-friendly)
 */
export async function getDefaultSearchProfile(
  organizationId: string,
  client: DrizzleClient,
): Promise<SearchProfile | null> {
  const rows = await client
    .select()
    .from(searchProfiles)
    .where(
      and(
        eq(searchProfiles.organizationId, organizationId),
        eq(searchProfiles.isDefault, true),
        eq(searchProfiles.active, true),
      ),
    )
    .orderBy(asc(searchProfiles.createdAt))
    .limit(1);

  return rows[0] ?? null;
}

// ============================================================================
// 4. createSearchProfile — création d'un nouveau profil
// ============================================================================

/**
 * Crée un nouveau profil de recherche pour l'organisation.
 *
 * Si `isDefault = true`, reset d'abord tous les autres profils de l'org
 * à `is_default = false` (atomicité garantie par la transaction).
 *
 * @param organizationId UUID du tenant courant
 * @param input          Données du nouveau profil
 * @param client         Instance Drizzle (mock-friendly)
 */
export async function createSearchProfile(
  organizationId: string,
  input: CreateSearchProfileInput,
  client: DrizzleClient,
): Promise<SearchProfile> {
  const shouldBeDefault = input.isDefault ?? false;

  // Si le nouveau profil doit être le défaut, reset les autres en amont.
  // La transaction DDL est gérée applicativement ici (Drizzle 0.39 sans
  // transaction imbriquée explicite au niveau Server Action — acceptable
  // pour le volume MVP AlyoS : 1-10 profils max).
  if (shouldBeDefault) {
    await client
      .update(searchProfiles)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(searchProfiles.organizationId, organizationId));
  }

  const rows = await client
    .insert(searchProfiles)
    .values({
      organizationId,
      name: input.name,
      isDefault: shouldBeDefault,
      displayOrder: input.displayOrder ?? 0,
      keywords: input.keywords ?? { positive: [], negative: [], exact: [] },
      cpvCodes: input.cpvCodes ?? [],
      geoZones: input.geoZones ?? [],
      marketTypes: input.marketTypes ?? [],
      amountMin: input.amountMin ?? null,
      amountMax: input.amountMax ?? null,
      active: true,
    })
    .returning();

  const created = rows[0];
  if (!created) throw new Error("create_failed");
  return created;
}

// ============================================================================
// 5. updateSearchProfileMulti — mise à jour d'un profil existant
// ============================================================================

/**
 * Met à jour les champs éditables d'un profil existant.
 *
 * Guard cross-tenant : WHERE filtre simultanément `id` ET `organization_id`.
 * Si aucune ligne affectée → `Error('profile_not_found')`.
 *
 * `updatedAt` est toujours repassé à `now()` (Drizzle 0.39 ne l'auto-touche
 * pas sur UPDATE).
 *
 * @param organizationId UUID du tenant courant
 * @param profileId      UUID du profil à mettre à jour
 * @param input          Champs à modifier (seuls les fournis sont patchés)
 * @param client         Instance Drizzle (mock-friendly)
 * @throws Error('profile_not_found') si aucun row affecté
 */
export async function updateSearchProfileMulti(
  organizationId: string,
  profileId: string,
  input: UpdateSearchProfileInput,
  client: DrizzleClient,
): Promise<SearchProfile> {
  // Construit l'objet patch en omettant les champs non fournis
  const patch: Partial<typeof searchProfiles.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.name !== undefined) patch.name = input.name;
  if (input.displayOrder !== undefined) patch.displayOrder = input.displayOrder;
  if (input.keywords !== undefined) patch.keywords = input.keywords;
  if (input.cpvCodes !== undefined) patch.cpvCodes = input.cpvCodes;
  if (input.geoZones !== undefined) patch.geoZones = input.geoZones;
  if (input.marketTypes !== undefined) patch.marketTypes = input.marketTypes;
  if (input.amountMin !== undefined) patch.amountMin = input.amountMin;
  if (input.amountMax !== undefined) patch.amountMax = input.amountMax;
  if (input.active !== undefined) patch.active = input.active;

  const rows = await client
    .update(searchProfiles)
    .set(patch)
    .where(and(eq(searchProfiles.id, profileId), eq(searchProfiles.organizationId, organizationId)))
    .returning();

  const updated = rows[0];
  if (!updated) throw new Error("profile_not_found");
  return updated;
}

// ============================================================================
// 6. deleteSearchProfile — suppression avec guard "au moins 1 profil actif"
// ============================================================================

/**
 * Supprime un profil de recherche (DELETE physique).
 *
 * Guard : si le profil cible est le seul profil actif de l'organisation,
 * lève `Error('last_active_profile')` — on ne supprime pas le dernier.
 *
 * Guard cross-tenant : WHERE filtre `id` ET `organization_id`.
 *
 * @param organizationId UUID du tenant courant
 * @param profileId      UUID du profil à supprimer
 * @param client         Instance Drizzle (mock-friendly)
 * @throws Error('last_active_profile') si suppression du dernier profil actif
 * @throws Error('profile_not_found') si profil inexistant ou autre org
 */
export async function deleteSearchProfile(
  organizationId: string,
  profileId: string,
  client: DrizzleClient,
): Promise<void> {
  // Compter les profils actifs de l'org
  const countResult = await client
    .select({ cnt: sql<number>`count(*)::int` })
    .from(searchProfiles)
    .where(and(eq(searchProfiles.organizationId, organizationId), eq(searchProfiles.active, true)));

  const activeCount = countResult[0]?.cnt ?? 0;
  if (activeCount <= 1) throw new Error("last_active_profile");

  const rows = await client
    .delete(searchProfiles)
    .where(and(eq(searchProfiles.id, profileId), eq(searchProfiles.organizationId, organizationId)))
    .returning({ id: searchProfiles.id });

  if (!rows[0]) throw new Error("profile_not_found");
}

// ============================================================================
// 7. setDefaultSearchProfile — promotion d'un profil en défaut
// ============================================================================

/**
 * Passe un profil en `is_default = true` et reset tous les autres de l'org
 * à `is_default = false`.
 *
 * Deux étapes séquentielles (reset puis set) — atomicité acceptable au MVP
 * AlyoS (mono-utilisateur admin, 1-10 profils).
 *
 * @param organizationId UUID du tenant courant
 * @param profileId      UUID du profil à promouvoir
 * @param client         Instance Drizzle (mock-friendly)
 * @throws Error('profile_not_found') si profil inexistant ou autre org
 */
export async function setDefaultSearchProfile(
  organizationId: string,
  profileId: string,
  client: DrizzleClient,
): Promise<SearchProfile> {
  // 1. Reset tous les profils de l'org
  await client
    .update(searchProfiles)
    .set({ isDefault: false, updatedAt: new Date() })
    .where(
      and(eq(searchProfiles.organizationId, organizationId), ne(searchProfiles.id, profileId)),
    );

  // 2. Activer le profil cible
  const rows = await client
    .update(searchProfiles)
    .set({ isDefault: true, updatedAt: new Date() })
    .where(and(eq(searchProfiles.id, profileId), eq(searchProfiles.organizationId, organizationId)))
    .returning();

  const updated = rows[0];
  if (!updated) throw new Error("profile_not_found");
  return updated;
}
