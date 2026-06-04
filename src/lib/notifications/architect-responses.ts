/**
 * Helpers de comptage / marquage des nouvelles réponses architectes pour
 * le badge sidebar in-app (chantier H7 — Steve 2026-06-04).
 *
 * Source : `architect_responses` joined `architect_tokens` (pour avoir le
 * timestamp réel de sollicitation et filtrer 90j).
 *
 * Stratégie : on compte les rows dont `responded_at > seenAt` ET status
 * `accepted` ou `declined` ou `info_requested` — pas `pending` car ce ne
 * sont pas des réponses, juste des sollicitations sans retour.
 */

import { and, count, eq, gt, isNotNull, isNull, or, sql } from "drizzle-orm";

import { architectResponses } from "@/db/schema/selections";
import { users } from "@/db/schema/users";
import type { db as defaultDb } from "@/db/client";

type DrizzleClient = typeof defaultDb;

/**
 * Compte les architect_responses « nouveaux » pour l'utilisateur :
 * réponses (accepted|declined|info_requested) avec `responded_at` strictement
 * après le dernier `seenAt` du user. Si `seenAt` est null → toutes les
 * réponses des 90 derniers jours sont marquées nouvelles.
 *
 * Limite supérieure à 99 pour l'UI (badge « 99+ » au-delà).
 */
export async function countNewArchitectResponses(
  db: DrizzleClient,
  organizationId: string,
  userId: string,
): Promise<number> {
  // 1. seenAt depuis users.
  const [u] = await db
    .select({ seenAt: users.architectNotificationsSeenAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const seenAt = u?.seenAt ?? null;

  // 2. Borne basse 90j pour éviter d'agréger toute l'histoire.
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const [row] = await db
    .select({ n: count() })
    .from(architectResponses)
    .where(
      and(
        eq(architectResponses.organizationId, organizationId),
        isNotNull(architectResponses.respondedAt),
        // Status « réponse réelle ». Exclude pending (sollicité, pas répondu).
        or(
          eq(architectResponses.status, "accepted"),
          eq(architectResponses.status, "declined"),
          eq(architectResponses.status, "info_requested"),
        ),
        // seenAt null → toutes les réponses des 90 derniers jours.
        // seenAt set → seulement celles postérieures.
        seenAt
          ? gt(architectResponses.respondedAt, seenAt)
          : sql`${architectResponses.respondedAt} >= ${ninetyDaysAgo.toISOString()}`,
      ),
    );

  const n = Number(row?.n ?? 0);
  return Math.min(n, 99);
}

/**
 * Met à jour `users.architect_notifications_seen_at` = now() pour l'utilisateur.
 * Appelé quand l'admin ouvre la page « Activité Tandem ».
 */
export async function markArchitectNotificationsSeen(
  db: DrizzleClient,
  userId: string,
): Promise<void> {
  await db
    .update(users)
    .set({ architectNotificationsSeenAt: new Date() })
    .where(eq(users.id, userId));
}

// `isNull` not used here but kept for potential future « seen never » filters.
void isNull;
