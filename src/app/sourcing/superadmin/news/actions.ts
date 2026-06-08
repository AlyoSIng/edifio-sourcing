"use server";

/**
 * Server Actions — module Actualités produit superadmin — edifio Sourcing
 *
 * Actions disponibles :
 *   - `createNewsAction`      : crée un article (brouillon) dans `news_items`
 *   - `togglePublishAction`   : bascule isPublished + publishedAt
 *   - `deleteNewsAction`      : supprime un article
 *
 * Double garde d'authentification (ADR-014 retire la garde domaine) :
 *   1. Session Supabase valide
 *   2. Rôle superadmin (`isSuperAdmin`)
 *
 * Décision Board 2026-05-27 — module superadmin éditeur edifio.
 */

import { revalidatePath } from "next/cache";

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { newsItems } from "@/db/schema/superadmin";
import { isSuperAdmin, toUserProfile } from "@/lib/auth/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// ─── Guard interne ────────────────────────────────────────────────────────────

/**
 * Vérifie la double garde (session + superadmin).
 * ADR-014 (2026-06-05) : garde domaine retirée — ouverture multi-tenant.
 * Retourne l'ID du superadmin connecté, ou une erreur.
 */
async function requireSuperadmin(): Promise<{ userId: string } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Non authentifié." };
  const profile = toUserProfile(user);
  if (!isSuperAdmin(profile)) return { error: "Accès réservé au superadmin." };

  return { userId: user.id };
}

// ─── createNewsAction ─────────────────────────────────────────────────────────

/**
 * Crée un nouvel article d'actualité produit en brouillon.
 *
 * Effets :
 *   - INSERT dans `news_items` avec `isPublished = false`
 *   - `revalidatePath('/sourcing/superadmin/news')`
 */
export async function createNewsAction(
  title: string,
  content: string,
): Promise<{ ok: boolean; error?: string }> {
  // Garde superadmin
  const guard = await requireSuperadmin();
  if ("error" in guard) return { ok: false, error: guard.error };
  const { userId } = guard;

  // Validation manuelle
  const trimTitle = title?.trim() ?? "";
  const trimContent = content?.trim() ?? "";

  if (!trimTitle) return { ok: false, error: "Le titre est obligatoire." };
  if (trimTitle.length > 200)
    return { ok: false, error: "Le titre ne peut pas dépasser 200 caractères." };
  if (!trimContent) return { ok: false, error: "Le contenu est obligatoire." };
  if (trimContent.length > 10000)
    return { ok: false, error: "Le contenu ne peut pas dépasser 10 000 caractères." };

  try {
    await db.insert(newsItems).values({
      title: trimTitle,
      content: trimContent,
      isPublished: false,
      authorId: userId,
    });

    revalidatePath("/sourcing/superadmin/news");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erreur inconnue lors de la création.",
    };
  }
}

// ─── togglePublishAction ──────────────────────────────────────────────────────

/**
 * Bascule l'état publié/brouillon d'un article.
 *
 * Effets :
 *   - `isPublished` → valeur inversée
 *   - Si publication : `publishedAt = now()`
 *   - Si dépublication : `publishedAt = null`
 *   - `revalidatePath('/sourcing/superadmin/news')`
 */
export async function togglePublishAction(
  id: string,
  currentPublished: boolean,
): Promise<{ ok: boolean; error?: string }> {
  // Garde superadmin
  const guard = await requireSuperadmin();
  if ("error" in guard) return { ok: false, error: guard.error };

  // Validation UUID basique
  if (!id || typeof id !== "string" || id.length < 10) {
    return { ok: false, error: "Identifiant d'article invalide." };
  }

  const nowPublished = !currentPublished;

  try {
    await db
      .update(newsItems)
      .set({
        isPublished: nowPublished,
        publishedAt: nowPublished ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(newsItems.id, id));

    revalidatePath("/sourcing/superadmin/news");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erreur inconnue lors de la mise à jour.",
    };
  }
}

// ─── deleteNewsAction ─────────────────────────────────────────────────────────

/**
 * Supprime définitivement un article d'actualité.
 *
 * Effets :
 *   - DELETE dans `news_items` WHERE id
 *   - `revalidatePath('/sourcing/superadmin/news')`
 */
export async function deleteNewsAction(id: string): Promise<{ ok: boolean; error?: string }> {
  // Garde superadmin
  const guard = await requireSuperadmin();
  if ("error" in guard) return { ok: false, error: guard.error };

  // Validation UUID basique
  if (!id || typeof id !== "string" || id.length < 10) {
    return { ok: false, error: "Identifiant d'article invalide." };
  }

  try {
    await db.delete(newsItems).where(eq(newsItems.id, id));

    revalidatePath("/sourcing/superadmin/news");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erreur inconnue lors de la suppression.",
    };
  }
}
