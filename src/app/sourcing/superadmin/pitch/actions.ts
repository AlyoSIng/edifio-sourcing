"use server";

/**
 * Server Actions — module Plaquette commerciale superadmin — edifio Sourcing
 *
 * Actions disponibles :
 *   - `savePitchUrlAction` : UPSERT de l'URL dans `app_content`
 *     avec la clé 'pitch_pdf_url'.
 *
 * Triple garde d'authentification :
 *   1. Session Supabase valide
 *   2. Domaine autorisé (`isAuthorizedEmail`)
 *   3. Rôle superadmin (`isSuperAdmin`)
 *
 * Décision Board 2026-05-27 — module superadmin éditeur edifio.
 */

import { revalidatePath } from "next/cache";

import { db } from "@/db/client";
import { appContent } from "@/db/schema/superadmin";
import { isAuthorizedEmail } from "@/lib/auth/domain";
import { isSuperAdmin, toUserProfile } from "@/lib/auth/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Clé BDD pour l'URL de la plaquette commerciale dans `app_content`. */
const PITCH_PDF_KEY = "pitch_pdf_url" as const;

// ─── Guard interne ────────────────────────────────────────────────────────────

/**
 * Vérifie la triple garde (session + domaine + superadmin).
 * Retourne l'ID du superadmin connecté, ou une erreur.
 */
async function requireSuperadmin(): Promise<{ userId: string } | { error: string }> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Non authentifié." };
  if (!isAuthorizedEmail(user.email)) return { error: "Domaine non autorisé." };
  const profile = toUserProfile(user);
  if (!isSuperAdmin(profile)) return { error: "Accès réservé au superadmin." };

  return { userId: user.id };
}

// ─── savePitchUrlAction ───────────────────────────────────────────────────────

/**
 * Enregistre ou met à jour l'URL de la plaquette commerciale dans `app_content`.
 *
 * Utilise un UPSERT Postgres (ON CONFLICT key DO UPDATE) pour
 * gérer la première configuration (INSERT) et les modifications (UPDATE).
 *
 * Effets :
 *   - UPSERT dans `app_content` WHERE key = 'pitch_pdf_url'
 *   - `revalidatePath('/sourcing/superadmin/pitch')`
 */
export async function savePitchUrlAction(url: string): Promise<{ ok: boolean; error?: string }> {
  // Garde superadmin
  const guard = await requireSuperadmin();
  if ("error" in guard) return { ok: false, error: guard.error };
  const { userId } = guard;

  // Validation manuelle de l'URL
  const trimUrl = url?.trim() ?? "";
  if (!trimUrl) return { ok: false, error: "L'URL est obligatoire." };
  if (trimUrl.length > 2000)
    return { ok: false, error: "L'URL ne peut pas dépasser 2 000 caractères." };

  // Vérification du protocole (http ou https uniquement)
  if (!trimUrl.startsWith("http://") && !trimUrl.startsWith("https://")) {
    return { ok: false, error: "L'URL doit commencer par http:// ou https://." };
  }

  try {
    // UPSERT : insert ou update si la clé existe déjà
    await db
      .insert(appContent)
      .values({
        key: PITCH_PDF_KEY,
        contentUrl: trimUrl,
        updatedAt: new Date(),
        updatedBy: userId,
      })
      .onConflictDoUpdate({
        target: appContent.key,
        set: {
          contentUrl: trimUrl,
          updatedAt: new Date(),
          updatedBy: userId,
        },
      });

    revalidatePath("/sourcing/superadmin/pitch");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erreur inconnue lors de la sauvegarde.",
    };
  }
}
