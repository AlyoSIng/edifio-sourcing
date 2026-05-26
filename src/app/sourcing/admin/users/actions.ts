"use server";

import { revalidatePath } from "next/cache";

import { isAdmin, toUserProfile } from "@/lib/auth/types";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Regex UUID v4 — validation stricte de l'identifiant cible avant tout appel admin.
 * Protège contre les injections de valeurs arbitraires dans l'API Supabase Admin.
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Promotion / rétrogradation du rôle d'un utilisateur.
 *
 * Guards de sécurité (défense en profondeur — le middleware et la page ont déjà
 * fait leur part, mais on ne fait jamais confiance uniquement au client) :
 *   1. L'acteur doit être authentifié avec une session valide côté serveur.
 *   2. L'acteur doit être admin (lu depuis `user_metadata` Supabase, pas depuis
 *      le cookie client qui pourrait être falsifié).
 *   3. `targetUserId` doit être un UUID v4 valide.
 *   4. Un admin ne peut pas se rétrograder lui-même (prévention de lockout).
 *
 * @param targetUserId - UUID Supabase de l'utilisateur dont on modifie le rôle.
 * @param newRole      - Nouveau rôle cible ("admin" | "user").
 */
export async function updateUserRoleAction(
  targetUserId: string,
  newRole: "admin" | "user",
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Guard 1 — vérification de la session de l'acteur
  const supabase = createSupabaseServerClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();

  if (!actor) {
    return { ok: false, error: "unauthenticated" };
  }

  // Guard 2 — l'acteur doit être admin
  const actorProfile = toUserProfile(actor);
  if (!isAdmin(actorProfile)) {
    return { ok: false, error: "forbidden" };
  }

  // Guard 3 — UUID v4 valide
  if (!UUID_REGEX.test(targetUserId)) {
    return { ok: false, error: "invalid_user_id" };
  }

  // Guard 4 — l'acteur ne peut pas se rétrograder lui-même
  if (actor.id === targetUserId && newRole !== "admin") {
    return { ok: false, error: "self_demotion" };
  }

  // Mise à jour via client admin (service_role — bypass RLS)
  const adminClient = createSupabaseAdminClient();
  const { error } = await adminClient.auth.admin.updateUserById(targetUserId, {
    user_metadata: { role: newRole },
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  // Invalide le cache de la page admin pour que le refresh affiche le nouveau rôle
  revalidatePath("/sourcing/admin/users");

  return { ok: true };
}
