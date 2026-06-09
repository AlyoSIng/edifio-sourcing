"use server";

/**
 * Server Actions — module Tests guidés profil utilisateur — edifio Sourcing
 *
 * Actions disponibles :
 *   - `submitGuidedTestAction` : soumet les réponses d'un test guidé
 *     (INSERT ou UPDATE si déjà soumis) et calcule le score QCM.
 *
 * Garde d'authentification sur chaque action (ADR-014 retire la garde domaine) :
 *   1. Session Supabase valide
 *
 * Décision Board 2026-05-27 — module profil utilisateur edifio Sourcing.
 */

import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { type GuidedTestAnswers, guidedTestSubmissions, guidedTests } from "@/db/schema/superadmin";
import { getRequiredOrgId } from "@/lib/auth/get-required-org-id";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// ─── Guard interne ────────────────────────────────────────────────────────────

async function requireAlyosUser(): Promise<{ userId: string; orgId: string } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Non authentifié." };
  // ADR-014 (2026-06-05) — garde domaine retirée : ouverture multi-tenant.
  // Le tenant est strictement scopé par `getRequiredOrgId` + RLS BDD ci-dessous.

  const orgId = await getRequiredOrgId(user.id);
  return { userId: user.id, orgId };
}

// ─── submitGuidedTestAction ───────────────────────────────────────────────────

/**
 * Soumet (ou re-soumet) les réponses d'un test guidé.
 *
 * Calcul du score :
 *   - Compte les étapes de type 'qcm' dont `correctIndex` est défini.
 *   - Compare la réponse de l'utilisateur (index 0-based) à `correctIndex`.
 *   - Score = (bonnes réponses / total étapes QCM) * 100, arrondi entier.
 *   - Si aucune étape QCM : score = null.
 *
 * Effets :
 *   - INSERT guided_test_submissions ; si conflit (user_id + test_id) : UPDATE score + answers.
 */
export async function submitGuidedTestAction(
  testId: string,
  answers: GuidedTestAnswers,
  remarks?: string,
): Promise<{ ok: boolean; score: number | null; error?: string }> {
  const guard = await requireAlyosUser();
  if ("error" in guard) return { ok: false, score: null, error: guard.error };
  const { userId, orgId } = guard;

  // Validation UUID basique
  if (!testId || typeof testId !== "string" || testId.length < 10) {
    return { ok: false, score: null, error: "Identifiant de test invalide." };
  }

  try {
    // Charger le test pour calculer le score
    const [test] = await db.select().from(guidedTests).where(eq(guidedTests.id, testId)).limit(1);

    if (!test) {
      return { ok: false, score: null, error: "Test introuvable." };
    }

    const steps = test.steps ?? [];
    const qcmSteps = steps.filter((s) => s.type === "qcm" && typeof s.correctIndex === "number");

    let score: number | null = null;

    if (qcmSteps.length > 0) {
      let correct = 0;
      for (const step of qcmSteps) {
        const userAnswer = answers[step.id];
        if (userAnswer !== undefined && Number(userAnswer) === step.correctIndex) {
          correct++;
        }
      }
      score = Math.round((correct / qcmSteps.length) * 100);
    }

    // Vérifier si une soumission existe déjà
    const existing = await db
      .select({ id: guidedTestSubmissions.id })
      .from(guidedTestSubmissions)
      .where(
        and(eq(guidedTestSubmissions.userId, userId), eq(guidedTestSubmissions.testId, testId)),
      )
      .limit(1);

    if (existing.length > 0 && existing[0]) {
      // UPDATE si déjà soumis
      await db
        .update(guidedTestSubmissions)
        .set({
          answers,
          remarks: remarks ?? null,
          score,
          submittedAt: new Date(),
        })
        .where(eq(guidedTestSubmissions.id, existing[0].id));
    } else {
      // INSERT première soumission
      await db.insert(guidedTestSubmissions).values({
        testId,
        userId,
        orgId,
        answers,
        remarks: remarks ?? null,
        score,
      });
    }

    return { ok: true, score };
  } catch (err) {
    return {
      ok: false,
      score: null,
      error: err instanceof Error ? err.message : "Erreur inconnue lors de la soumission.",
    };
  }
}
