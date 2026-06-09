/**
 * Helpers Drizzle — lecture des `learning_events` pour le calcul de suggestions
 * (Salve U, apprentissage par écartement).
 *
 * Convention multi-tenant : `organizationId` toujours explicite dans le WHERE.
 * Fonction de lecture pure côté DB (pas de mutation) ; le calcul de suggestion
 * lui-même est dans `computeSuggestions` (pur, hors I/O).
 */

import { and, desc, eq, gt } from "drizzle-orm";

import type { db as defaultDb } from "@/db/client";
import { learningEvents } from "@/db/schema/audit";
import type { LearningEventLite } from "./suggest-profile-adjustment";
import { SUGGESTION_WINDOW_DAYS } from "./suggest-profile-adjustment";

export type DrizzleClient = typeof defaultDb;

/**
 * Retourne les `learning_events` `rejected` AVEC un motif structuré de l'org,
 * sur la fenêtre glissante de suggestion (30 j), non encore traités. Projection
 * minimale alignée sur `LearningEventLite`.
 *
 * On charge un peu large (rejected + reason_code non nul) ; le filtrage fin
 * (actionnable, fenêtre exacte, non traité) est refait dans `computeSuggestions`
 * pour garder une seule source de vérité de la règle métier.
 *
 * @param organizationId UUID du tenant courant
 * @param client         Instance Drizzle (mock-friendly)
 * @param now            Horloge de référence (défaut: maintenant)
 */
export async function listLearningEventsForSuggestions(
  organizationId: string,
  client: DrizzleClient,
  now: Date = new Date(),
): Promise<LearningEventLite[]> {
  const windowStart = new Date(now.getTime() - SUGGESTION_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const rows = await client
    .select({
      eventType: learningEvents.eventType,
      reasonCode: learningEvents.reasonCode,
      verbatim: learningEvents.verbatim,
      occurredAt: learningEvents.occurredAt,
      appliedAt: learningEvents.appliedAt,
      dismissedAt: learningEvents.dismissedAt,
      payload: learningEvents.payload,
    })
    .from(learningEvents)
    .where(
      and(
        eq(learningEvents.organizationId, organizationId),
        eq(learningEvents.eventType, "rejected"),
        gt(learningEvents.occurredAt, windowStart),
      ),
    )
    .orderBy(desc(learningEvents.occurredAt));

  return rows.map((r) => ({
    eventType: r.eventType,
    reasonCode: r.reasonCode,
    verbatim: r.verbatim,
    occurredAt: r.occurredAt,
    appliedAt: r.appliedAt,
    dismissedAt: r.dismissedAt,
    payload: r.payload,
  }));
}
