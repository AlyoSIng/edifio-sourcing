"use server";

/**
 * Server Actions — apprentissage par écartement (Salve U, Steve 2026-06-08).
 *
 * Deux actions admin-only :
 *  - `applyProfileSuggestionAction` : applique au profil par défaut le
 *    changement validé par l'admin (retrait geoZones / set amountMin / push
 *    keywords.negative), puis marque les `learning_events` correspondants
 *    `applied_at = now()` (ils ne re-suggéreront plus). Audit A3.
 *  - `dismissSuggestionAction` : marque les `learning_events` du motif
 *    `dismissed_at = now()` (suggestion ignorée, ne re-suggère plus).
 *
 * Human-in-the-loop : aucune modification de profil n'a lieu sans clic admin.
 *
 * Pattern de sécurité (identique à `search-profiles-actions.ts`) :
 *  1. Auth Supabase (`getUser()`)
 *  2. Defense-in-depth : domaine `@alyosingenierie.fr` + rôle `admin`
 *  3. Validation (UUID profil + reasonCode actionnable + change cohérent)
 *  4. Opération Drizzle (UPDATE profil + UPDATE learning_events)
 *  5. Audit A3 `search_profile_change` best-effort
 *  6. revalidatePath sur les routes impactées
 */

import { revalidatePath } from "next/cache";
import { and, eq, gt, isNull, sql } from "drizzle-orm";

import { db as defaultDb } from "@/db/client";
import { learningEvents } from "@/db/schema/audit";
import { searchProfiles } from "@/db/schema/config";
import { audit } from "@/lib/audit";
import { isAuthorizedEmail } from "@/lib/auth/domain";
import { isAdmin, toUserProfile } from "@/lib/auth/types";
import { getRequiredOrgId } from "@/lib/auth/get-required-org-id";
import {
  isActionableReason,
  isRejectionReasonCode,
  rejectionReasonLabel,
  type RejectionReasonCode,
} from "@/lib/sourcing/learning/rejection-reasons";
import { SUGGESTION_WINDOW_DAYS } from "@/lib/sourcing/learning/suggest-profile-adjustment";
import type { SuggestedChange } from "@/lib/sourcing/learning/suggest-profile-adjustment";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// ============================================================================
// Types publics
// ============================================================================

export type DrizzleClient = typeof defaultDb;

/** Type minimal du client Supabase server (auth uniquement). Mock-friendly. */
export interface AuthClientLike {
  auth: {
    getUser: () => Promise<{ data: { user: import("@supabase/supabase-js").User | null } }>;
  };
}

export type LearningActionResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "not_authenticated"
        | "forbidden_domain"
        | "forbidden_role"
        | "invalid_input"
        | "profile_not_found"
        | "internal_error";
    };

interface ActionDeps {
  db?: DrizzleClient;
  authClient?: AuthClientLike;
}

const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const FR_DEPT_REGEX = /^(2[AB]|\d{2,3})$/;
const MAX_NEGATIVE_KEYWORD_LENGTH = 100;

// ============================================================================
// Helper auth interne
// ============================================================================

type AuthFailure = {
  ok: false;
  error: "not_authenticated" | "forbidden_domain" | "forbidden_role";
};

async function requireAlyosAdmin(
  authClient: AuthClientLike,
): Promise<{ ok: true; userId: string; orgId: string } | AuthFailure> {
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

/** Marque les learning_events actionnables du motif comme traités (applied/dismissed). */
async function markLearningEventsHandled(
  dbInstance: DrizzleClient,
  orgId: string,
  reasonCode: RejectionReasonCode,
  field: "appliedAt" | "dismissedAt",
): Promise<void> {
  const windowStart = new Date(Date.now() - SUGGESTION_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  await dbInstance
    .update(learningEvents)
    .set({ [field]: sql`now()` })
    .where(
      and(
        eq(learningEvents.organizationId, orgId),
        eq(learningEvents.eventType, "rejected"),
        eq(learningEvents.reasonCode, reasonCode),
        gt(learningEvents.occurredAt, windowStart),
        isNull(learningEvents.appliedAt),
        isNull(learningEvents.dismissedAt),
      ),
    );
}

/**
 * Valide la cohérence du `change` reçu du client vs le `reasonCode`.
 * On ne fait JAMAIS confiance au payload client : on revalide le type de
 * changement, le format des départements, et les bornes des montants/keywords.
 */
function validateChange(
  reasonCode: RejectionReasonCode,
  change: SuggestedChange,
): SuggestedChange | null {
  if (change.kind === "remove_geo_zones" && reasonCode === "out_of_area") {
    const values = change.values.filter((v) => FR_DEPT_REGEX.test(v));
    if (values.length === 0) return null;
    return { kind: "remove_geo_zones", values };
  }
  if (change.kind === "set_amount_min" && reasonCode === "budget_too_low") {
    if (typeof change.value !== "number" || !Number.isFinite(change.value) || change.value <= 0) {
      return null;
    }
    return { kind: "set_amount_min", value: Math.round(change.value) };
  }
  if (change.kind === "add_negative_keywords" && reasonCode === "out_of_scope") {
    const values = change.values
      .map((v) => v.trim().toLowerCase())
      .filter((v) => v.length > 0 && v.length <= MAX_NEGATIVE_KEYWORD_LENGTH);
    if (values.length === 0) return null;
    return { kind: "add_negative_keywords", values };
  }
  return null;
}

// ============================================================================
// applyProfileSuggestionAction
// ============================================================================

/**
 * Applique une suggestion validée par l'admin au profil par défaut de l'org.
 *
 * @param profileId UUID du profil cible (le profil par défaut affiché)
 * @param reasonCode Motif structuré actionnable (out_of_area / budget_too_low / out_of_scope)
 * @param change    Changement à appliquer (revalidé côté serveur)
 * @param deps      Dépendances injectables (tests)
 */
export async function applyProfileSuggestionAction(
  profileId: string,
  reasonCode: RejectionReasonCode,
  change: SuggestedChange,
  deps: ActionDeps = {},
): Promise<LearningActionResult> {
  const dbInstance = deps.db ?? defaultDb;
  const authClient = deps.authClient ?? (await createSupabaseServerClient());

  const authResult = await requireAlyosAdmin(authClient);
  if (!authResult.ok) return authResult;
  const { orgId } = authResult;

  // Validation input
  if (!UUID_SHAPE.test(profileId)) return { ok: false, error: "invalid_input" };
  if (!isRejectionReasonCode(reasonCode) || !isActionableReason(reasonCode)) {
    return { ok: false, error: "invalid_input" };
  }
  const safeChange = validateChange(reasonCode, change);
  if (!safeChange) return { ok: false, error: "invalid_input" };

  try {
    // 1. Charge le profil (guard cross-tenant : id + org).
    const [profile] = await dbInstance
      .select({
        id: searchProfiles.id,
        name: searchProfiles.name,
        geoZones: searchProfiles.geoZones,
        amountMin: searchProfiles.amountMin,
        keywords: searchProfiles.keywords,
      })
      .from(searchProfiles)
      .where(and(eq(searchProfiles.id, profileId), eq(searchProfiles.organizationId, orgId)))
      .limit(1);

    if (!profile) return { ok: false, error: "profile_not_found" };

    // 2. Construit le patch selon le type de changement.
    const patch: Partial<typeof searchProfiles.$inferInsert> = { updatedAt: new Date() };

    if (safeChange.kind === "remove_geo_zones") {
      const toRemove = new Set(safeChange.values);
      patch.geoZones = profile.geoZones.filter((z) => !toRemove.has(z));
    } else if (safeChange.kind === "set_amount_min") {
      patch.amountMin = safeChange.value.toFixed(2);
    } else if (safeChange.kind === "add_negative_keywords") {
      const current = profile.keywords ?? { positive: [], negative: [], exact: [] };
      const existing = new Set(current.negative.map((k) => k.toLowerCase()));
      const merged = [...current.negative];
      for (const term of safeChange.values) {
        if (!existing.has(term)) {
          merged.push(term);
          existing.add(term);
        }
      }
      patch.keywords = { ...current, negative: merged };
    }

    // 3. Applique le patch profil.
    await dbInstance
      .update(searchProfiles)
      .set(patch)
      .where(and(eq(searchProfiles.id, profileId), eq(searchProfiles.organizationId, orgId)));

    // 4. Marque les learning_events du motif comme appliqués (best-effort).
    try {
      await markLearningEventsHandled(dbInstance, orgId, reasonCode, "appliedAt");
    } catch (e) {
      console.error("[learning:apply:mark:fail]", e);
    }

    // 5. Audit A3 best-effort.
    await audit({
      action: "search_profile_change",
      subjectType: "search_profile",
      subjectId: profileId,
      data: {
        profile_id: profileId,
        profile_name: profile.name,
        operation: "update",
        diff: { learning_suggestion: [reasonCode, safeChange.kind] },
      },
    }).catch((e) => console.error("[learning:apply:audit:fail]", e));

    revalidatePath("/sourcing/admin/search-profiles");
    revalidatePath("/sourcing/admin/profil");
    revalidatePath("/sourcing/ao-du-jour");

    return { ok: true };
  } catch (err) {
    console.error("[learning:apply:fail]", err);
    return { ok: false, error: "internal_error" };
  }
}

// ============================================================================
// dismissSuggestionAction
// ============================================================================

/**
 * Ignore une suggestion : marque les learning_events du motif `dismissed_at`.
 * Ils ne re-suggéreront plus (tant qu'aucun nouvel écartement ne repasse le
 * seuil sur de nouveaux events).
 *
 * @param reasonCode Motif structuré (validé serveur)
 * @param deps       Dépendances injectables (tests)
 */
export async function dismissSuggestionAction(
  reasonCode: RejectionReasonCode,
  deps: ActionDeps = {},
): Promise<LearningActionResult> {
  const dbInstance = deps.db ?? defaultDb;
  const authClient = deps.authClient ?? (await createSupabaseServerClient());

  const authResult = await requireAlyosAdmin(authClient);
  if (!authResult.ok) return authResult;
  const { orgId } = authResult;

  if (!isRejectionReasonCode(reasonCode) || !isActionableReason(reasonCode)) {
    return { ok: false, error: "invalid_input" };
  }

  try {
    await markLearningEventsHandled(dbInstance, orgId, reasonCode, "dismissedAt");

    await audit({
      action: "search_profile_change",
      subjectType: "search_profile",
      subjectId: orgId,
      data: {
        profile_id: orgId,
        profile_name: `suggestion ignorée (${rejectionReasonLabel(reasonCode)})`,
        operation: "update",
        diff: { learning_suggestion_dismissed: [reasonCode, true] },
      },
    }).catch((e) => console.error("[learning:dismiss:audit:fail]", e));

    revalidatePath("/sourcing/admin/search-profiles");

    return { ok: true };
  } catch (err) {
    console.error("[learning:dismiss:fail]", err);
    return { ok: false, error: "internal_error" };
  }
}
