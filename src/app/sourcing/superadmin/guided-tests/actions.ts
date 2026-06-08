"use server";

/**
 * Server Actions — module Tests guidés superadmin — edifio Sourcing
 *
 * Actions disponibles :
 *   - `createGuidedTestAction`        : crée un nouveau test (titre + steps vides)
 *   - `updateGuidedTestStepsAction`   : met à jour les étapes d'un test existant
 *   - `toggleGuidedTestAction`        : active / désactive un test
 *   - `deleteGuidedTestAction`        : supprime un test (guard : pas de soumissions)
 *   - `listGuidedTestSubmissionsAction` : liste les soumissions d'un test (max 50)
 *
 * Triple garde d'authentification sur chaque action :
 *   1. Session Supabase valide
 *   2. Domaine autorisé (`isAuthorizedEmail`)
 *   3. Rôle superadmin (`isSuperAdmin`)
 *
 * Tables ciblées : `guided_tests`, `guided_test_submissions` (migration 0019).
 * Tables globales (pas de filtre org_id côté superadmin).
 *
 * Décision Board 2026-05-27 — module superadmin éditeur edifio.
 */

import { revalidatePath } from "next/cache";

import { count, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { type GuidedTestStep, guidedTestSubmissions, guidedTests } from "@/db/schema/superadmin";
import { isAuthorizedEmail } from "@/lib/auth/domain";
import { isSuperAdmin, toUserProfile } from "@/lib/auth/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// ─── Guard interne ────────────────────────────────────────────────────────────

/**
 * Vérifie la triple garde (session + domaine + superadmin).
 * Retourne l'ID du superadmin connecté, ou une erreur.
 */
async function requireSuperadmin(): Promise<{ userId: string } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Non authentifié." };
  if (!isAuthorizedEmail(user.email)) return { error: "Domaine non autorisé." };
  const profile = toUserProfile(user);
  if (!isSuperAdmin(profile)) return { error: "Accès réservé au superadmin." };

  return { userId: user.id };
}

/** Validation UUID basique (36 chars, tirets aux bonnes positions). */
function isValidUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

// ─── createGuidedTestAction ───────────────────────────────────────────────────

/**
 * Crée un nouveau test guidé avec un titre et des étapes vides.
 * Le test est inactif par défaut.
 *
 * Effets :
 *   - INSERT dans `guided_tests` (title, steps: [], is_active: false)
 *   - `revalidatePath('/sourcing/superadmin/guided-tests')`
 */
export async function createGuidedTestAction(
  title: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  // Garde superadmin
  const guard = await requireSuperadmin();
  if ("error" in guard) return { ok: false, error: guard.error };

  // Validation
  const trimTitle = title?.trim() ?? "";
  if (!trimTitle) return { ok: false, error: "Le titre est obligatoire." };
  if (trimTitle.length > 200)
    return { ok: false, error: "Le titre ne peut pas dépasser 200 caractères." };

  try {
    const [inserted] = await db
      .insert(guidedTests)
      .values({
        title: trimTitle,
        steps: [],
        isActive: false,
      })
      .returning({ id: guidedTests.id });

    revalidatePath("/sourcing/superadmin/guided-tests");
    if (!inserted) {
      return { ok: false, error: "Erreur : impossible de récupérer l'identifiant du test créé." };
    }
    return { ok: true, id: inserted.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erreur inconnue lors de la création.",
    };
  }
}

// ─── updateGuidedTestStepsAction ─────────────────────────────────────────────

/**
 * Met à jour les étapes (JSONB) d'un test guidé existant.
 * Limite : 50 étapes maximum.
 *
 * Effets :
 *   - UPDATE `guided_tests` SET steps = $steps WHERE id = $id
 *   - `revalidatePath('/sourcing/superadmin/guided-tests')`
 */
export async function updateGuidedTestStepsAction(
  id: string,
  steps: GuidedTestStep[],
): Promise<{ ok: boolean; error?: string }> {
  // Garde superadmin
  const guard = await requireSuperadmin();
  if ("error" in guard) return { ok: false, error: guard.error };

  // Validation UUID
  if (!isValidUuid(id)) return { ok: false, error: "Identifiant de test invalide." };

  // Validation steps
  if (!Array.isArray(steps)) return { ok: false, error: "Les étapes doivent être un tableau." };
  if (steps.length > 50) return { ok: false, error: "Le test ne peut pas dépasser 50 étapes." };

  try {
    await db
      .update(guidedTests)
      .set({ steps, updatedAt: new Date() })
      .where(eq(guidedTests.id, id));

    revalidatePath("/sourcing/superadmin/guided-tests");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erreur inconnue lors de la mise à jour.",
    };
  }
}

// ─── toggleGuidedTestAction ───────────────────────────────────────────────────

/**
 * Active ou désactive un test guidé.
 *
 * Effets :
 *   - UPDATE `guided_tests` SET is_active = $isActive WHERE id = $id
 *   - `revalidatePath('/sourcing/superadmin/guided-tests')`
 */
export async function toggleGuidedTestAction(
  id: string,
  isActive: boolean,
): Promise<{ ok: boolean; error?: string }> {
  // Garde superadmin
  const guard = await requireSuperadmin();
  if ("error" in guard) return { ok: false, error: guard.error };

  // Validation UUID
  if (!isValidUuid(id)) return { ok: false, error: "Identifiant de test invalide." };

  try {
    await db
      .update(guidedTests)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(guidedTests.id, id));

    revalidatePath("/sourcing/superadmin/guided-tests");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erreur inconnue lors de la mise à jour.",
    };
  }
}

// ─── deleteGuidedTestAction ───────────────────────────────────────────────────

/**
 * Supprime définitivement un test guidé.
 * Guard : impossible si des soumissions existent pour ce test.
 *
 * Effets :
 *   - Vérifie COUNT soumissions → erreur si > 0
 *   - DELETE FROM `guided_tests` WHERE id = $id
 *   - `revalidatePath('/sourcing/superadmin/guided-tests')`
 */
export async function deleteGuidedTestAction(id: string): Promise<{ ok: boolean; error?: string }> {
  // Garde superadmin
  const guard = await requireSuperadmin();
  if ("error" in guard) return { ok: false, error: guard.error };

  // Validation UUID
  if (!isValidUuid(id)) return { ok: false, error: "Identifiant de test invalide." };

  try {
    // Guard : vérifier qu'il n'y a pas de soumissions
    const countResult = await db
      .select({ value: count() })
      .from(guidedTestSubmissions)
      .where(eq(guidedTestSubmissions.testId, id));

    const submissionsCount = countResult[0]?.value ?? 0;

    if (submissionsCount > 0) {
      return {
        ok: false,
        error: "has_submissions",
      };
    }

    await db.delete(guidedTests).where(eq(guidedTests.id, id));

    revalidatePath("/sourcing/superadmin/guided-tests");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erreur inconnue lors de la suppression.",
    };
  }
}

// ─── listGuidedTestSubmissionsAction ─────────────────────────────────────────

/**
 * Retourne les 50 dernières soumissions d'un test guidé.
 *
 * Effets :
 *   - SELECT id, user_id, score, submitted_at FROM `guided_test_submissions`
 *     WHERE test_id = $testId ORDER BY submitted_at DESC LIMIT 50
 */
export async function listGuidedTestSubmissionsAction(testId: string): Promise<{
  ok: boolean;
  submissions?: Array<{
    id: string;
    userId: string;
    score: number | null;
    submittedAt: Date;
  }>;
  error?: string;
}> {
  // Garde superadmin
  const guard = await requireSuperadmin();
  if ("error" in guard) return { ok: false, error: guard.error };

  // Validation UUID
  if (!isValidUuid(testId)) return { ok: false, error: "Identifiant de test invalide." };

  try {
    const rows = await db
      .select({
        id: guidedTestSubmissions.id,
        userId: guidedTestSubmissions.userId,
        score: guidedTestSubmissions.score,
        submittedAt: guidedTestSubmissions.submittedAt,
      })
      .from(guidedTestSubmissions)
      .where(eq(guidedTestSubmissions.testId, testId))
      .orderBy(desc(guidedTestSubmissions.submittedAt))
      .limit(50);

    return { ok: true, submissions: rows };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erreur inconnue lors du chargement.",
    };
  }
}
