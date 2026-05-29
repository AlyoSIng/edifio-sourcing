"use server";

/**
 * Server Actions — module Support profil utilisateur — edifio Sourcing
 *
 * Actions disponibles :
 *   - `createTicketAction` : crée un ticket d'aide dans `support_tickets`
 *
 * Double garde d'authentification sur chaque action :
 *   1. Session Supabase valide
 *   2. Domaine autorisé (`isAuthorizedEmail`)
 *
 * Décision Board 2026-05-27 — module profil utilisateur edifio Sourcing.
 */

import { db } from "@/db/client";
import { supportTickets } from "@/db/schema/superadmin";
import { isAuthorizedEmail } from "@/lib/auth/domain";
import { getRequiredOrgId } from "@/lib/auth/get-required-org-id";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// ─── Guard interne ────────────────────────────────────────────────────────────

async function requireAlyosUser(): Promise<{ userId: string; orgId: string } | { error: string }> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Non authentifié." };
  if (!isAuthorizedEmail(user.email)) return { error: "Domaine non autorisé." };

  const orgId = await getRequiredOrgId(user.id);
  return { userId: user.id, orgId };
}

// ─── createTicketAction ───────────────────────────────────────────────────────

/**
 * Crée un nouveau ticket d'aide pour l'utilisateur connecté.
 *
 * Effets :
 *   - Validation : subject max 200 chars, message max 5000 chars
 *   - INSERT dans `support_tickets` avec status 'open' et org_id résolu via getRequiredOrgId
 */
export async function createTicketAction(
  subject: string,
  message: string,
): Promise<{ ok: boolean; ticketId?: string; error?: string }> {
  const guard = await requireAlyosUser();
  if ("error" in guard) return { ok: false, error: guard.error };
  const { userId, orgId } = guard;

  const trimSubject = subject?.trim() ?? "";
  const trimMessage = message?.trim() ?? "";

  if (!trimSubject) return { ok: false, error: "Le sujet est obligatoire." };
  if (trimSubject.length > 200)
    return { ok: false, error: "Le sujet ne peut pas dépasser 200 caractères." };
  if (!trimMessage) return { ok: false, error: "Le message est obligatoire." };
  if (trimMessage.length > 5000)
    return { ok: false, error: "Le message ne peut pas dépasser 5 000 caractères." };

  try {
    const [ticket] = await db
      .insert(supportTickets)
      .values({
        orgId,
        userId,
        subject: trimSubject,
        message: trimMessage,
        status: "open",
      })
      .returning({ id: supportTickets.id });

    return { ok: true, ticketId: ticket?.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erreur inconnue lors de la création.",
    };
  }
}
