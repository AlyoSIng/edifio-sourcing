"use server";

/**
 * Server Actions — CRUD multi-profils de recherche (Tâche #29, 2026-05-27).
 *
 * Source de vérité :
 *  - `src/lib/profile/search-profiles-queries.ts` (helpers Drizzle)
 *  - `specs/audit_log_v1.md` §A3 (`search_profile_change`)
 *  - Tâche #29 Board 2026-05-27 : multi-profils nommés par organisation
 *
 * Pattern de sécurité (identique à `actions.ts` du même dossier) :
 *  1. Auth check Supabase (`getUser()`)
 *  2. Defense-in-depth : domaine `@alyosingenierie.fr` + rôle `admin`
 *  3. Validation Zod côté serveur (jamais trust client)
 *  4. Opération Drizzle (list / create / update / delete / setDefault)
 *  5. Audit A3 `search_profile_change` best-effort
 *  6. `revalidatePath` sur les routes impactées
 *
 * Codes erreur retournés (mappés UI) :
 *  - `not_authenticated`    : pas de session Supabase
 *  - `forbidden_domain`     : email hors `@alyosingenierie.fr`
 *  - `forbidden_role`       : user authentifié mais non-admin
 *  - `invalid_input`        : payload Zod invalide
 *  - `profile_not_found`    : profil inexistant ou autre org
 *  - `last_active_profile`  : tentative de suppression du dernier profil actif
 *  - `internal_error`       : erreur inattendue
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db as defaultDb } from "@/db/client";
import { audit } from "@/lib/audit";
import { isAuthorizedEmail } from "@/lib/auth/domain";
import { isAdmin, toUserProfile } from "@/lib/auth/types";
import { getRequiredOrgId } from "@/lib/auth/get-required-org-id";
import {
  createSearchProfile,
  deleteSearchProfile,
  getSearchProfileById,
  listSearchProfiles,
  setDefaultSearchProfile,
  updateSearchProfileMulti,
  type DrizzleClient,
} from "@/lib/profile/search-profiles-queries";
import { MARKET_TYPES } from "@/lib/profile/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// ============================================================================
// Types publics
// ============================================================================

/** Type minimal du client Supabase server (auth uniquement). Mock-friendly. */
export interface AuthClientLike {
  auth: {
    getUser: () => Promise<{ data: { user: import("@supabase/supabase-js").User | null } }>;
  };
}

/** Résultat générique d'une action CRUD profil. */
export type ProfileActionResult =
  | { ok: true; profileId?: string }
  | { ok: false; error: "not_authenticated" | "forbidden_domain" | "forbidden_role" }
  | {
      ok: false;
      error: "invalid_input";
      fieldErrors: Record<string, string[]>;
      formErrors: string[];
    }
  | {
      ok: false;
      error: "profile_not_found" | "last_active_profile" | "internal_error";
    };

/** Profil pour l'affichage liste — projection narrow + tableaux complets pour édition inline. */
export interface SearchProfileListItem {
  id: string;
  name: string;
  isDefault: boolean;
  displayOrder: number;
  active: boolean;
  keywordsPositiveCount: number;
  keywordsNegativeCount: number;
  cpvCodesCount: number;
  geoZonesCount: number;
  // Tableaux complets pour pré-remplissage du formulaire d'édition
  keywords: { positive: string[]; negative: string[]; exact: string[] };
  cpvCodes: string[];
  geoZones: string[];
  marketTypes: string[];
  createdAt: Date;
  updatedAt: Date;
}

/** Dépendances injectables pour les tests (DI minimale). */
interface ActionDeps {
  db?: DrizzleClient;
  authClient?: AuthClientLike;
}

// ============================================================================
// Validation Zod
// ============================================================================

const MAX_ARRAY_ITEMS = 100;
const MAX_STRING_LENGTH = 100;
const FR_DEPT_REGEX = /^(2[AB]|\d{2,3})$/;
const CPV_REGEX = /^\d{2,8}$/;

function dedupedStringArray(opts?: { regex?: RegExp; regexMsg?: string; lowercase?: boolean }) {
  let item = z.string().trim().min(1).max(MAX_STRING_LENGTH);
  if (opts?.regex) {
    const re = opts.regex;
    const msg = opts.regexMsg ?? "format invalide";
    item = item.regex(re, msg);
  }
  return z
    .array(item)
    .max(MAX_ARRAY_ITEMS)
    .transform((arr) => {
      const normalized = opts?.lowercase ? arr.map((s) => s.toLowerCase()) : arr;
      const seen = new Set<string>();
      const out: string[] = [];
      for (const v of normalized) {
        if (!seen.has(v)) {
          seen.add(v);
          out.push(v);
        }
      }
      return out;
    });
}

const searchProfileBaseSchema = z.object({
  name: z.string().trim().min(1, "Le nom est requis").max(100, "Nom trop long (max 100 chars)"),
  displayOrder: z.number().int().min(0).optional(),
  keywords: z
    .object({
      positive: dedupedStringArray({ lowercase: true }),
      negative: dedupedStringArray({ lowercase: true }),
      exact: dedupedStringArray({ lowercase: true }),
    })
    .optional(),
  cpv_codes: dedupedStringArray({
    regex: CPV_REGEX,
    regexMsg: "Code CPV invalide (2 à 8 chiffres attendus)",
  }).optional(),
  geo_zones: dedupedStringArray({
    regex: FR_DEPT_REGEX,
    regexMsg: "Zone géographique invalide (département FR : 01-95, 2A/2B, 971-976)",
  }).optional(),
  market_types: z.array(z.enum(MARKET_TYPES)).max(MAX_ARRAY_ITEMS).optional(),
  amount_min: z.number().min(0).nullable().optional(),
  amount_max: z.number().min(0).nullable().optional(),
});

const createProfileSchema = searchProfileBaseSchema;

const updateProfileSchema = searchProfileBaseSchema.partial().extend({
  name: z.string().trim().min(1).max(100).optional(),
});

// ============================================================================
// Helper auth interne
// ============================================================================

async function requireAlyosAdmin(
  authClient: AuthClientLike,
): Promise<
  | { ok: true; userId: string; orgId: string }
  | Extract<
      ProfileActionResult,
      { ok: false; error: "not_authenticated" | "forbidden_domain" | "forbidden_role" }
    >
> {
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return { ok: false, error: "not_authenticated" };

  const profile = toUserProfile(user);
  if (!isAuthorizedEmail(profile.email)) return { ok: false, error: "forbidden_domain" };
  if (!isAdmin(profile)) return { ok: false, error: "forbidden_role" };

  const orgId = await getRequiredOrgId(user.id);
  return { ok: true, userId: user.id, orgId };
}

function toNumericString(value: number | null | undefined): string | null {
  if (value == null) return null;
  return value.toFixed(2);
}

// ============================================================================
// listSearchProfilesAction
// ============================================================================

/**
 * Liste tous les profils actifs (et inactifs si `includeInactive = true`)
 * de l'organisation AlyoS.
 *
 * @param includeInactive Si true, inclut les profils avec active = false
 * @param deps Dépendances injectables pour les tests
 */
export async function listSearchProfilesAction(
  includeInactive = false,
  deps: ActionDeps = {},
): Promise<
  { ok: true; profiles: SearchProfileListItem[] } | Extract<ProfileActionResult, { ok: false }>
> {
  const dbInstance = deps.db ?? defaultDb;
  const authClient = deps.authClient ?? createSupabaseServerClient();

  const authResult = await requireAlyosAdmin(authClient);
  if (!authResult.ok) return authResult;
  const { orgId } = authResult;

  try {
    const rows = await listSearchProfiles(orgId, dbInstance, includeInactive);
    const profiles: SearchProfileListItem[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      isDefault: r.isDefault,
      displayOrder: r.displayOrder,
      active: r.active,
      keywordsPositiveCount: r.keywords.positive.length,
      keywordsNegativeCount: r.keywords.negative.length,
      cpvCodesCount: r.cpvCodes.length,
      geoZonesCount: r.geoZones.length,
      keywords: r.keywords as { positive: string[]; negative: string[]; exact: string[] },
      cpvCodes: r.cpvCodes,
      geoZones: r.geoZones,
      marketTypes: r.marketTypes,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
    return { ok: true, profiles };
  } catch (err) {
    console.error("[search-profiles:list:fail]", err);
    return { ok: false, error: "internal_error" };
  }
}

// ============================================================================
// createSearchProfileAction
// ============================================================================

/**
 * Crée un nouveau profil de recherche pour l'organisation AlyoS.
 *
 * @param input Données brutes du formulaire (validées par Zod côté serveur)
 * @param deps  Dépendances injectables pour les tests
 */
export async function createSearchProfileAction(
  input: unknown,
  deps: ActionDeps = {},
): Promise<ProfileActionResult> {
  const dbInstance = deps.db ?? defaultDb;
  const authClient = deps.authClient ?? createSupabaseServerClient();

  const authResult = await requireAlyosAdmin(authClient);
  if (!authResult.ok) return authResult;
  const { orgId: createOrgId } = authResult;

  const parsed = createProfileSchema.safeParse(input);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    return {
      ok: false,
      error: "invalid_input",
      fieldErrors: Object.fromEntries(
        Object.entries(flat.fieldErrors)
          .filter(([, v]) => Array.isArray(v) && v.length > 0)
          .map(([k, v]) => [k, v as string[]]),
      ),
      formErrors: flat.formErrors,
    };
  }

  const { data } = parsed;

  try {
    const profile = await createSearchProfile(
      createOrgId,
      {
        name: data.name,
        displayOrder: data.displayOrder,
        keywords: data.keywords,
        cpvCodes: data.cpv_codes,
        geoZones: data.geo_zones,
        marketTypes: data.market_types,
        amountMin: toNumericString(data.amount_min),
        amountMax: toNumericString(data.amount_max),
      },
      dbInstance,
    );

    await audit({
      action: "search_profile_change",
      subjectType: "search_profile",
      subjectId: profile.id,
      data: {
        profile_id: profile.id,
        profile_name: profile.name,
        operation: "create",
        diff: {},
      },
    }).catch((e) => console.error("[search-profiles:audit:fail]", e));

    revalidatePath("/sourcing/admin/profil");
    revalidatePath("/sourcing/admin/search-profiles");
    revalidatePath("/sourcing/ao-du-jour");

    return { ok: true, profileId: profile.id };
  } catch (err) {
    console.error("[search-profiles:create:fail]", err);
    return { ok: false, error: "internal_error" };
  }
}

// ============================================================================
// updateSearchProfileAction
// ============================================================================

/**
 * Met à jour un profil de recherche existant.
 *
 * @param profileId UUID du profil à mettre à jour
 * @param input     Données brutes du formulaire (validées par Zod côté serveur)
 * @param deps      Dépendances injectables pour les tests
 */
export async function updateSearchProfileAction(
  profileId: string,
  input: unknown,
  deps: ActionDeps = {},
): Promise<ProfileActionResult> {
  const dbInstance = deps.db ?? defaultDb;
  const authClient = deps.authClient ?? createSupabaseServerClient();

  const authResult = await requireAlyosAdmin(authClient);
  if (!authResult.ok) return authResult;
  const { orgId: updateOrgId } = authResult;

  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    return {
      ok: false,
      error: "invalid_input",
      fieldErrors: Object.fromEntries(
        Object.entries(flat.fieldErrors)
          .filter(([, v]) => Array.isArray(v) && v.length > 0)
          .map(([k, v]) => [k, v as string[]]),
      ),
      formErrors: flat.formErrors,
    };
  }

  const { data } = parsed;

  try {
    const updated = await updateSearchProfileMulti(
      updateOrgId,
      profileId,
      {
        name: data.name,
        displayOrder: data.displayOrder,
        keywords: data.keywords,
        cpvCodes: data.cpv_codes,
        geoZones: data.geo_zones,
        marketTypes: data.market_types,
        amountMin: data.amount_min !== undefined ? toNumericString(data.amount_min) : undefined,
        amountMax: data.amount_max !== undefined ? toNumericString(data.amount_max) : undefined,
      },
      dbInstance,
    );

    await audit({
      action: "search_profile_change",
      subjectType: "search_profile",
      subjectId: updated.id,
      data: {
        profile_id: updated.id,
        profile_name: updated.name,
        operation: "update",
        diff: {},
      },
    }).catch((e) => console.error("[search-profiles:audit:fail]", e));

    revalidatePath("/sourcing/admin/profil");
    revalidatePath("/sourcing/admin/search-profiles");
    revalidatePath("/sourcing/ao-du-jour");

    return { ok: true, profileId: updated.id };
  } catch (err) {
    if (err instanceof Error && err.message === "profile_not_found") {
      return { ok: false, error: "profile_not_found" };
    }
    console.error("[search-profiles:update:fail]", err);
    return { ok: false, error: "internal_error" };
  }
}

// ============================================================================
// deleteSearchProfileAction
// ============================================================================

/**
 * Supprime un profil de recherche.
 * Guard : impossible de supprimer le dernier profil actif de l'organisation.
 *
 * @param profileId UUID du profil à supprimer
 * @param deps      Dépendances injectables pour les tests
 */
export async function deleteSearchProfileAction(
  profileId: string,
  deps: ActionDeps = {},
): Promise<ProfileActionResult> {
  const dbInstance = deps.db ?? defaultDb;
  const authClient = deps.authClient ?? createSupabaseServerClient();

  const authResult = await requireAlyosAdmin(authClient);
  if (!authResult.ok) return authResult;
  const { orgId: deleteOrgId } = authResult;

  try {
    await deleteSearchProfile(deleteOrgId, profileId, dbInstance);

    await audit({
      action: "search_profile_change",
      subjectType: "search_profile",
      subjectId: profileId,
      data: {
        profile_id: profileId,
        profile_name: "",
        operation: "delete",
        diff: {},
      },
    }).catch((e) => console.error("[search-profiles:audit:fail]", e));

    revalidatePath("/sourcing/admin/profil");
    revalidatePath("/sourcing/admin/search-profiles");
    revalidatePath("/sourcing/ao-du-jour");

    return { ok: true };
  } catch (err) {
    if (err instanceof Error && err.message === "last_active_profile") {
      return { ok: false, error: "last_active_profile" };
    }
    if (err instanceof Error && err.message === "profile_not_found") {
      return { ok: false, error: "profile_not_found" };
    }
    console.error("[search-profiles:delete:fail]", err);
    return { ok: false, error: "internal_error" };
  }
}

// ============================================================================
// setDefaultProfileAction
// ============================================================================

/**
 * Passe un profil en défaut (is_default = true) et reset les autres de l'org.
 *
 * @param profileId UUID du profil à promouvoir en défaut
 * @param deps      Dépendances injectables pour les tests
 */
export async function setDefaultProfileAction(
  profileId: string,
  deps: ActionDeps = {},
): Promise<ProfileActionResult> {
  const dbInstance = deps.db ?? defaultDb;
  const authClient = deps.authClient ?? createSupabaseServerClient();

  const authResult = await requireAlyosAdmin(authClient);
  if (!authResult.ok) return authResult;
  const { orgId: defaultOrgId } = authResult;

  try {
    const updated = await setDefaultSearchProfile(defaultOrgId, profileId, dbInstance);

    await audit({
      action: "search_profile_change",
      subjectType: "search_profile",
      subjectId: updated.id,
      data: {
        profile_id: updated.id,
        profile_name: updated.name,
        operation: "set_default",
        diff: {},
      },
    }).catch((e) => console.error("[search-profiles:audit:fail]", e));

    revalidatePath("/sourcing/admin/profil");
    revalidatePath("/sourcing/admin/search-profiles");
    revalidatePath("/sourcing/ao-du-jour");

    return { ok: true, profileId: updated.id };
  } catch (err) {
    if (err instanceof Error && err.message === "profile_not_found") {
      return { ok: false, error: "profile_not_found" };
    }
    console.error("[search-profiles:set-default:fail]", err);
    return { ok: false, error: "internal_error" };
  }
}

// ============================================================================
// duplicateSearchProfileAction
// ============================================================================

/**
 * Duplique un profil de recherche (crée une copie avec le suffixe « (copie) »).
 * Le nouveau profil n'est jamais le défaut.
 *
 * @param profileId UUID du profil source
 * @param deps      Dépendances injectables pour les tests
 */
export async function duplicateSearchProfileAction(
  profileId: string,
  deps: ActionDeps = {},
): Promise<ProfileActionResult> {
  const dbInstance = deps.db ?? defaultDb;
  const authClient = deps.authClient ?? createSupabaseServerClient();

  const authResult = await requireAlyosAdmin(authClient);
  if (!authResult.ok) return authResult;
  const { orgId: dupOrgId } = authResult;

  try {
    const source = await getSearchProfileById(dupOrgId, profileId, dbInstance);
    if (!source) return { ok: false, error: "profile_not_found" };

    const copy = await createSearchProfile(
      dupOrgId,
      {
        name: `${source.name} (copie)`,
        isDefault: false,
        displayOrder: source.displayOrder,
        keywords: source.keywords as { positive: string[]; negative: string[]; exact: string[] },
        cpvCodes: source.cpvCodes,
        geoZones: source.geoZones,
        marketTypes: source.marketTypes,
        amountMin: source.amountMin,
        amountMax: source.amountMax,
      },
      dbInstance,
    );

    await audit({
      action: "search_profile_change",
      subjectType: "search_profile",
      subjectId: copy.id,
      data: {
        profile_id: copy.id,
        profile_name: copy.name,
        // "create" : valeur la plus proche dans l'union audit (pas de "duplicate")
        operation: "create",
        // diff vide — la traçabilité source est dans profile_name "(copie)"
        diff: {},
      },
    }).catch((e) => console.error("[search-profiles:duplicate:fail]", e));

    revalidatePath("/sourcing/admin/profil");
    revalidatePath("/sourcing/admin/search-profiles");
    revalidatePath("/sourcing/ao-du-jour");

    return { ok: true, profileId: copy.id };
  } catch (err) {
    console.error("[search-profiles:duplicate:fail]", err);
    return { ok: false, error: "internal_error" };
  }
}
