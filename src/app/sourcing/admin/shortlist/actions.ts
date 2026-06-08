"use server";

/**
 * Server Actions — Critères de short-list paramétrables (module Tandem).
 *
 * Source de vérité :
 *  - `src/db/schema/shortlist.ts` (table `shortlist_criteria`)
 *  - `specs/module_tandem_engine_v1.md` §short-list
 *  - Décision Nadia 2026-05-28 : actions CRUD short-list (zone verte)
 *
 * Pattern de sécurité (identique aux autres actions admin) :
 *  1. Auth check Supabase (`getUser()`)
 *  2. Defense-in-depth : domaine `@alyosingenierie.fr` + rôle `admin`
 *  3. Validation Zod côté serveur (jamais trust client)
 *  4. Opération Drizzle (get / upsert)
 *  5. `revalidatePath` sur les routes impactées
 *
 * Codes erreur retournés (mappés UI) :
 *  - `not_authenticated`  : pas de session Supabase
 *  - `forbidden_domain`   : email hors `@alyosingenierie.fr`
 *  - `forbidden_role`     : user authentifié mais non-admin
 *  - `invalid_input`      : payload Zod invalide
 *  - `internal_error`     : erreur inattendue
 */

import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

import { db as defaultDb } from "@/db/client";
import { shortlistCriteria, type ShortlistCriteria } from "@/db/schema/shortlist";
import { isAuthorizedEmail } from "@/lib/auth/domain";
import { isAdmin, toUserProfile } from "@/lib/auth/types";
import { getRequiredOrgId } from "@/lib/auth/get-required-org-id";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// ============================================================================
// Types publics
// ============================================================================

export type ShortlistTarget = "architects" | "cotraitants" | "companies";

export type ShortlistActionResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "not_authenticated"
        | "forbidden_domain"
        | "forbidden_role"
        | "invalid_input"
        | "internal_error";
      detail?: string;
      fieldErrors?: Record<string, string[]>;
    };

export type ShortlistGetResult =
  | { ok: true; criteria: ShortlistCriteria | null }
  | {
      ok: false;
      error: "not_authenticated" | "forbidden_domain" | "forbidden_role" | "internal_error";
    };

// ============================================================================
// Validation Zod
// ============================================================================

/** Regex département FR : 01–95, 2A, 2B, 971–976. */
const FR_DEPT_REGEX = /^(2[AB]|\d{2,3})$/;
const MAX_DEPT_ITEMS = 110;

const shortlistCriteriaSchema = z.object({
  caMiniEur: z.coerce.number().int().min(0).nullable().optional(),
  effectifMini: z.coerce.number().int().min(0).nullable().optional(),
  requiredSpecialties: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
  minSeniorsRequired: z.coerce.number().int().min(0).default(0),
  maxSolicitations: z.coerce.number().int().min(1).nullable().optional(),
  allowedDepartments: z
    .array(z.string().trim().regex(FR_DEPT_REGEX, "Code département invalide"))
    .max(MAX_DEPT_ITEMS)
    .default([]),
  maxResults: z.coerce.number().int().min(1).nullable().optional(),
  aiNotesWeight: z
    .string()
    .regex(/^(0(\.\d)?|1(\.0)?)$/, "Valeur attendue entre 0.0 et 1.0 (pas 0.1)")
    .default("0.5"),
});

// ============================================================================
// Helper auth interne
// ============================================================================

type AdminAuthError = {
  ok: false;
  error: "not_authenticated" | "forbidden_domain" | "forbidden_role";
};

async function requireAlyosAdmin(): Promise<
  { ok: true; userId: string; orgId: string } | AdminAuthError
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const err: AdminAuthError = { ok: false, error: "not_authenticated" };
    return err;
  }

  const profile = toUserProfile(user);
  if (!isAuthorizedEmail(profile.email)) {
    const err: AdminAuthError = { ok: false, error: "forbidden_domain" };
    return err;
  }
  if (!isAdmin(profile)) {
    const err: AdminAuthError = { ok: false, error: "forbidden_role" };
    return err;
  }

  const orgId = await getRequiredOrgId(user.id);
  return { ok: true, userId: user.id, orgId };
}

// ============================================================================
// getShortlistCriteria
// ============================================================================

/**
 * Récupère les critères de short-list pour une cible donnée (organisation AlyoS).
 * Retourne `null` si aucun critère n'a encore été configuré.
 *
 * @param target Cible : 'architects' | 'cotraitants' | 'companies'
 */
export async function getShortlistCriteria(target: ShortlistTarget): Promise<ShortlistGetResult> {
  const authResult = await requireAlyosAdmin();
  if (!authResult.ok) return authResult;
  const { orgId } = authResult;

  try {
    const rows = await defaultDb
      .select()
      .from(shortlistCriteria)
      .where(and(eq(shortlistCriteria.organizationId, orgId), eq(shortlistCriteria.target, target)))
      .limit(1);

    return { ok: true, criteria: rows[0] ?? null };
  } catch (err) {
    console.error(`[shortlist:get:${target}:fail]`, err);
    return { ok: false, error: "internal_error" };
  }
}

// ============================================================================
// upsertShortlistCriteria
// ============================================================================

/**
 * Insère ou met à jour les critères de short-list pour une cible.
 *
 * Utilise un UNIQUE sur (organization_id, target) côté BDD (migration 0027)
 * pour garantir l'idempotence via ON CONFLICT DO UPDATE.
 *
 * @param target Cible : 'architects' | 'cotraitants' | 'companies'
 * @param input  Données brutes du formulaire (validées par Zod côté serveur)
 */
export async function upsertShortlistCriteria(
  target: ShortlistTarget,
  input: unknown,
): Promise<ShortlistActionResult> {
  const authResult = await requireAlyosAdmin();
  if (!authResult.ok) return authResult;
  const { orgId: upsertOrgId } = authResult;

  const parsed = shortlistCriteriaSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "invalid_input",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const { data } = parsed;

  try {
    await defaultDb
      .insert(shortlistCriteria)
      .values({
        organizationId: upsertOrgId,
        target,
        caMiniEur: data.caMiniEur ?? null,
        effectifMini: data.effectifMini ?? null,
        requiredSpecialties: data.requiredSpecialties,
        minSeniorsRequired: data.minSeniorsRequired,
        maxSolicitations: data.maxSolicitations ?? null,
        allowedDepartments: data.allowedDepartments,
        maxResults: data.maxResults ?? null,
        aiNotesWeight: data.aiNotesWeight,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [shortlistCriteria.organizationId, shortlistCriteria.target],
        set: {
          caMiniEur: data.caMiniEur ?? null,
          effectifMini: data.effectifMini ?? null,
          requiredSpecialties: data.requiredSpecialties,
          minSeniorsRequired: data.minSeniorsRequired,
          maxSolicitations: data.maxSolicitations ?? null,
          allowedDepartments: data.allowedDepartments,
          maxResults: data.maxResults ?? null,
          aiNotesWeight: data.aiNotesWeight,
          updatedAt: new Date(),
        },
      });

    revalidatePath("/sourcing/admin/shortlist");
    revalidatePath("/sourcing/architectes");

    return { ok: true };
  } catch (err) {
    console.error(`[shortlist:upsert:${target}:fail]`, err);
    return {
      ok: false,
      error: "internal_error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
