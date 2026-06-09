"use server";

/**
 * Server Actions — module FAQ superadmin — edifio Sourcing
 *
 * Actions disponibles :
 *   - `createFaqItemAction`  : crée un item FAQ dans `faq_items`
 *   - `updateFaqItemAction`  : met à jour les champs d'un item FAQ
 *   - `deleteFaqItemAction`  : supprime un item FAQ
 *
 * Double garde d'authentification (ADR-014 retire la garde domaine) :
 *   1. Session Supabase valide
 *   2. Rôle superadmin (`isSuperAdmin`)
 *
 * Source de vérité : `src/db/schema/superadmin.ts` table `faq_items`.
 */

import { revalidatePath } from "next/cache";

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { faqItems } from "@/db/schema/superadmin";
import { isSuperAdmin, toUserProfile } from "@/lib/auth/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// ─── Guard interne ────────────────────────────────────────────────────────────

async function requireSuperadmin(): Promise<{ userId: string } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Non authentifié." };
  // ADR-014 (2026-06-05) — garde domaine retirée : ouverture multi-tenant.
  const profile = toUserProfile(user);
  if (!isSuperAdmin(profile)) return { error: "Accès réservé au superadmin." };

  return { userId: user.id };
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface CreateFaqItemData {
  question: string;
  answer: string;
  category: string;
  displayOrder?: number;
}

interface UpdateFaqItemData {
  question?: string;
  answer?: string;
  category?: string;
  displayOrder?: number;
  isActive?: boolean;
}

// ─── createFaqItemAction ──────────────────────────────────────────────────────

/**
 * Crée un nouvel item FAQ.
 */
export async function createFaqItemAction(
  data: CreateFaqItemData,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireSuperadmin();
  if ("error" in guard) return { ok: false, error: guard.error };

  const trimQuestion = data.question?.trim() ?? "";
  const trimAnswer = data.answer?.trim() ?? "";
  const trimCategory = data.category?.trim() || "general";

  if (!trimQuestion) return { ok: false, error: "La question est obligatoire." };
  if (trimQuestion.length > 500)
    return { ok: false, error: "La question ne peut pas dépasser 500 caractères." };
  if (!trimAnswer) return { ok: false, error: "La réponse est obligatoire." };
  if (trimAnswer.length > 10000)
    return { ok: false, error: "La réponse ne peut pas dépasser 10 000 caractères." };

  try {
    await db.insert(faqItems).values({
      question: trimQuestion,
      answer: trimAnswer,
      category: trimCategory,
      displayOrder: data.displayOrder ?? 0,
      isActive: true,
    });

    revalidatePath("/sourcing/superadmin/faq");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erreur inconnue lors de la création.",
    };
  }
}

// ─── updateFaqItemAction ──────────────────────────────────────────────────────

/**
 * Met à jour un item FAQ existant (champs partiels).
 */
export async function updateFaqItemAction(
  id: string,
  data: UpdateFaqItemData,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireSuperadmin();
  if ("error" in guard) return { ok: false, error: guard.error };

  if (!id || typeof id !== "string" || id.length < 10) {
    return { ok: false, error: "Identifiant de FAQ invalide." };
  }

  const updateSet: Partial<typeof faqItems.$inferInsert> = {};

  if (data.question !== undefined) {
    const q = data.question.trim();
    if (!q) return { ok: false, error: "La question ne peut pas être vide." };
    updateSet.question = q;
  }
  if (data.answer !== undefined) {
    const a = data.answer.trim();
    if (!a) return { ok: false, error: "La réponse ne peut pas être vide." };
    updateSet.answer = a;
  }
  if (data.category !== undefined) updateSet.category = data.category.trim() || "general";
  if (data.displayOrder !== undefined) updateSet.displayOrder = data.displayOrder;
  if (data.isActive !== undefined) updateSet.isActive = data.isActive;

  try {
    await db.update(faqItems).set(updateSet).where(eq(faqItems.id, id));

    revalidatePath("/sourcing/superadmin/faq");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erreur inconnue lors de la mise à jour.",
    };
  }
}

// ─── deleteFaqItemAction ──────────────────────────────────────────────────────

/**
 * Supprime définitivement un item FAQ.
 */
export async function deleteFaqItemAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireSuperadmin();
  if ("error" in guard) return { ok: false, error: guard.error };

  if (!id || typeof id !== "string" || id.length < 10) {
    return { ok: false, error: "Identifiant de FAQ invalide." };
  }

  try {
    await db.delete(faqItems).where(eq(faqItems.id, id));

    revalidatePath("/sourcing/superadmin/faq");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erreur inconnue lors de la suppression.",
    };
  }
}
