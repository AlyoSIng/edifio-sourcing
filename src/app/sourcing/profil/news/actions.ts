"use server";

/**
 * Server Actions — module Actualités profil utilisateur — edifio Sourcing
 *
 * Actions disponibles :
 *   - `markNewsReadAction` : marque un article comme lu (UPSERT user_news_reads)
 *
 * Double garde d'authentification sur chaque action :
 *   1. Session Supabase valide
 *   2. Domaine autorisé (`isAuthorizedEmail`)
 *
 * Décision Board 2026-05-27 — module profil utilisateur edifio Sourcing.
 */

import { db } from "@/db/client";
import { userNewsReads } from "@/db/schema/superadmin";
import { isAuthorizedEmail } from "@/lib/auth/domain";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// ─── Guard interne ────────────────────────────────────────────────────────────

/**
 * Vérifie la double garde (session + domaine) pour les utilisateurs AlyoS standard.
 * Retourne l'ID de l'utilisateur connecté, ou une erreur.
 */
async function requireAlyosUser(): Promise<{ userId: string } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Non authentifié." };
  if (!isAuthorizedEmail(user.email)) return { error: "Domaine non autorisé." };

  return { userId: user.id };
}

// ─── markNewsReadAction ───────────────────────────────────────────────────────

/**
 * Marque un article comme lu pour l'utilisateur connecté.
 *
 * Effets :
 *   - UPSERT dans `user_news_reads` (user_id, news_id) ON CONFLICT DO NOTHING
 */
export async function markNewsReadAction(newsId: string): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireAlyosUser();
  if ("error" in guard) return { ok: false, error: guard.error };
  const { userId } = guard;

  if (!newsId || typeof newsId !== "string" || newsId.length < 10) {
    return { ok: false, error: "Identifiant d'article invalide." };
  }

  try {
    await db.insert(userNewsReads).values({ userId, newsId }).onConflictDoNothing();

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erreur inconnue lors du marquage.",
    };
  }
}
