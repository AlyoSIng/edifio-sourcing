"use server";

/**
 * Server Actions — module Formations superadmin — edifio Sourcing
 *
 * Actions disponibles :
 *   - `createFormationAction`   : crée une formation dans `formations`
 *   - `updateFormationAction`   : met à jour les champs d'une formation
 *   - `deleteFormationAction`   : supprime une formation
 *   - `reorderFormationsAction` : met à jour `displayOrder` en batch
 *
 * Triple garde d'authentification sur chaque action :
 *   1. Session Supabase valide
 *   2. Domaine autorisé (`isAuthorizedEmail`)
 *   3. Rôle superadmin (`isSuperAdmin`)
 *
 * Source de vérité : `src/db/schema/superadmin.ts` table `formations`.
 */

import { revalidatePath } from "next/cache";

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { formations } from "@/db/schema/superadmin";
import { isAuthorizedEmail } from "@/lib/auth/domain";
import { isSuperAdmin, toUserProfile } from "@/lib/auth/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// ─── Guard interne ────────────────────────────────────────────────────────────

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

// ─── Types ────────────────────────────────────────────────────────────────────

type FormationType = "video" | "doc" | "external";

interface CreateFormationData {
  title: string;
  description?: string;
  url: string;
  type: FormationType;
  durationMin?: number;
  displayOrder: number;
}

interface UpdateFormationData {
  title?: string;
  description?: string;
  url?: string;
  type?: FormationType;
  durationMin?: number;
  isActive?: boolean;
  displayOrder?: number;
}

// ─── createFormationAction ────────────────────────────────────────────────────

/**
 * Crée une nouvelle formation.
 */
export async function createFormationAction(
  data: CreateFormationData,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireSuperadmin();
  if ("error" in guard) return { ok: false, error: guard.error };

  const trimTitle = data.title?.trim() ?? "";
  const trimUrl = data.url?.trim() ?? "";

  if (!trimTitle) return { ok: false, error: "Le titre est obligatoire." };
  if (trimTitle.length > 300)
    return { ok: false, error: "Le titre ne peut pas dépasser 300 caractères." };
  if (!trimUrl) return { ok: false, error: "L'URL est obligatoire." };
  if (!["video", "doc", "external"].includes(data.type))
    return { ok: false, error: "Type de formation invalide." };

  try {
    await db.insert(formations).values({
      title: trimTitle,
      description: data.description?.trim() || null,
      url: trimUrl,
      type: data.type,
      durationMin: data.durationMin ?? null,
      displayOrder: data.displayOrder,
      isActive: true,
    });

    revalidatePath("/sourcing/superadmin/formations");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erreur inconnue lors de la création.",
    };
  }
}

// ─── updateFormationAction ────────────────────────────────────────────────────

/**
 * Met à jour une formation existante (champs partiels).
 */
export async function updateFormationAction(
  id: string,
  data: UpdateFormationData,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireSuperadmin();
  if ("error" in guard) return { ok: false, error: guard.error };

  if (!id || typeof id !== "string" || id.length < 10) {
    return { ok: false, error: "Identifiant de formation invalide." };
  }

  const updateSet: Partial<typeof formations.$inferInsert> & { updatedAt?: Date } = {
    updatedAt: new Date(),
  };

  if (data.title !== undefined) {
    const t = data.title.trim();
    if (!t) return { ok: false, error: "Le titre ne peut pas être vide." };
    updateSet.title = t;
  }
  if (data.description !== undefined) updateSet.description = data.description.trim() || null;
  if (data.url !== undefined) {
    const u = data.url.trim();
    if (!u) return { ok: false, error: "L'URL ne peut pas être vide." };
    updateSet.url = u;
  }
  if (data.type !== undefined) {
    if (!["video", "doc", "external"].includes(data.type))
      return { ok: false, error: "Type de formation invalide." };
    updateSet.type = data.type;
  }
  if (data.durationMin !== undefined) updateSet.durationMin = data.durationMin;
  if (data.isActive !== undefined) updateSet.isActive = data.isActive;
  if (data.displayOrder !== undefined) updateSet.displayOrder = data.displayOrder;

  try {
    await db.update(formations).set(updateSet).where(eq(formations.id, id));

    revalidatePath("/sourcing/superadmin/formations");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erreur inconnue lors de la mise à jour.",
    };
  }
}

// ─── deleteFormationAction ────────────────────────────────────────────────────

/**
 * Supprime définitivement une formation.
 */
export async function deleteFormationAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireSuperadmin();
  if ("error" in guard) return { ok: false, error: guard.error };

  if (!id || typeof id !== "string" || id.length < 10) {
    return { ok: false, error: "Identifiant de formation invalide." };
  }

  try {
    await db.delete(formations).where(eq(formations.id, id));

    revalidatePath("/sourcing/superadmin/formations");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erreur inconnue lors de la suppression.",
    };
  }
}

// ─── reorderFormationsAction ──────────────────────────────────────────────────

/**
 * Met à jour `displayOrder` en batch selon l'ordre fourni.
 * `orderedIds[i]` reçoit `displayOrder = i + 1`.
 */
export async function reorderFormationsAction(
  orderedIds: string[],
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireSuperadmin();
  if ("error" in guard) return { ok: false, error: guard.error };

  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { ok: false, error: "Liste d'identifiants vide ou invalide." };
  }

  try {
    // Mise à jour en série (volume faible — max ~50 formations)
    for (let i = 0; i < orderedIds.length; i++) {
      const fid = orderedIds[i];
      if (!fid) continue;
      await db
        .update(formations)
        .set({ displayOrder: i + 1, updatedAt: new Date() })
        .where(eq(formations.id, fid));
    }

    revalidatePath("/sourcing/superadmin/formations");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erreur inconnue lors du réordonnancement.",
    };
  }
}
