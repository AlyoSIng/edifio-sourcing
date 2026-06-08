/**
 * Server Actions — module Support superadmin — edifio Sourcing
 *
 * Actions disponibles :
 *   - `replyToTicketAction`  : enregistre la réponse du superadmin à un ticket
 *     + met le statut à 'in_progress' + crée une notification in-app pour l'auteur.
 *   - `closeTicketAction`    : passe le statut d'un ticket à 'closed'.
 *
 * Triple garde d'authentification sur chaque action :
 *   1. Session Supabase valide
 *   2. Domaine autorisé (`isAuthorizedEmail`)
 *   3. Rôle superadmin (`isSuperAdmin`)
 *
 * Décision Board 2026-05-27 — module superadmin éditeur edifio.
 */
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { supportTickets, userNotifications } from "@/db/schema/superadmin";
import { isAuthorizedEmail } from "@/lib/auth/domain";
import { isSuperAdmin, toUserProfile } from "@/lib/auth/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// ─── Schémas de validation ────────────────────────────────────────────────────

const UuidSchema = z.string().uuid();

const ReplySchema = z.object({
  ticketId: z.string().uuid(),
  response: z.string().min(1).max(2000),
});

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

// ─── replyToTicketAction ──────────────────────────────────────────────────────

/**
 * Enregistre la réponse du superadmin à un ticket de support.
 *
 * Effets :
 *   - `support_tickets.status` → 'in_progress'
 *   - `support_tickets.response` + `responded_at` + `responded_by` renseignés
 *   - Crée une `user_notification` de type 'support_reply' pour l'auteur du ticket
 *   - `revalidatePath('/sourcing/superadmin/support')`
 */
export async function replyToTicketAction(
  ticketId: string,
  response: string,
): Promise<{ ok: boolean; error?: string }> {
  // Garde superadmin
  const guard = await requireSuperadmin();
  if ("error" in guard) return { ok: false, error: guard.error };
  const { userId: superadminId } = guard;

  // Validation des entrées
  const parsed = ReplySchema.safeParse({ ticketId, response });
  if (!parsed.success) {
    return { ok: false, error: "Données invalides : " + parsed.error.issues[0]?.message };
  }

  try {
    // Récupérer le ticket pour obtenir l'userId de l'auteur
    const [ticket] = await db
      .select({ userId: supportTickets.userId, subject: supportTickets.subject })
      .from(supportTickets)
      .where(eq(supportTickets.id, ticketId))
      .limit(1);

    if (!ticket) return { ok: false, error: "Ticket introuvable." };

    // Mettre à jour le ticket
    await db
      .update(supportTickets)
      .set({
        response,
        status: "in_progress",
        respondedAt: new Date(),
        respondedBy: superadminId,
        updatedAt: new Date(),
      })
      .where(eq(supportTickets.id, ticketId));

    // Créer une notification in-app pour l'auteur du ticket (non bloquant)
    try {
      await db.insert(userNotifications).values({
        userId: ticket.userId,
        type: "support_reply",
        title: "Réponse à votre demande de support",
        body: `Votre ticket « ${ticket.subject.slice(0, 80)} » a reçu une réponse.`,
        payload: { ticketId },
      });
    } catch {
      // Notification non bloquante — on n'empêche pas la réponse d'être enregistrée
    }

    revalidatePath("/sourcing/superadmin/support");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erreur inconnue lors de la mise à jour.",
    };
  }
}

// ─── closeTicketAction ────────────────────────────────────────────────────────

/**
 * Ferme un ticket de support (status → 'closed').
 */
export async function closeTicketAction(
  ticketId: string,
): Promise<{ ok: boolean; error?: string }> {
  // Garde superadmin
  const guard = await requireSuperadmin();
  if ("error" in guard) return { ok: false, error: guard.error };

  // Validation UUID
  const parsed = UuidSchema.safeParse(ticketId);
  if (!parsed.success) return { ok: false, error: "Identifiant de ticket invalide." };

  try {
    await db
      .update(supportTickets)
      .set({ status: "closed", updatedAt: new Date() })
      .where(eq(supportTickets.id, ticketId));

    revalidatePath("/sourcing/superadmin/support");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erreur inconnue lors de la fermeture.",
    };
  }
}
