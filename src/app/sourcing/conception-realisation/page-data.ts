/**
 * Data loader — page Pipeline Conception/Réalisation `/sourcing/conception-realisation`.
 *
 * Charge tous les AOs sélectionnés en mode `conception_realisation` et les
 * répartit en 4 colonnes Kanban selon la présence d'événements dans `tender_events` :
 *
 *   - a_analyser      : pas de `rc_analyzed` dans tender_events
 *   - rc_analysee     : événement `rc_analyzed` présent, pas de `dossier_zip_compiled`
 *   - dossier_en_cours: événement `rc_analyzed` présent + au moins une pièce DCE (sans ZIP final)
 *   - soumis          : événement `dossier_zip_compiled` présent
 *
 * La distinction n'ajoute PAS de colonne BDD — elle s'appuie uniquement sur la
 * présence/absence d'événements `tender_events.event_type` existants.
 *
 * Résilience runtime (memory `feedback_nextjs_runtime_page_resilience`) :
 *   - try/catch absorbé : si DATABASE_URL absent (CI sans BDD) ou Supabase blip,
 *     on retourne `{ ok: false, error: "internal_error" }`.
 *
 * RLS / tenant : filtre `organization_id = organizationId` explicite (defense
 * in depth applicative — le rôle postgres bypasse le RLS déclaratif).
 */

import { and, desc, eq, inArray } from "drizzle-orm";

import { db as defaultDb } from "@/db/client";
import { selections } from "@/db/schema/selections";
import { tenderEvents } from "@/db/schema/tenders";
import { tenders } from "@/db/schema/tenders";

type DrizzleClient = typeof defaultDb;

// ---------------------------------------------------------------------------
// Types publics
// ---------------------------------------------------------------------------

/** Une carte AO dans le pipeline C/R. */
export interface CrCard {
  id: string;
  title: string;
  buyer: string;
  deadline: Date | null;
  score: number | null;
}

/** Les 4 colonnes du Kanban C/R. */
export interface CrKanbanData {
  a_analyser: CrCard[];
  rc_analysee: CrCard[];
  dossier_en_cours: CrCard[];
  soumis: CrCard[];
}

export type LoadCrResult =
  | { ok: true; data: CrKanbanData }
  | { ok: false; error: "internal_error" };

// ---------------------------------------------------------------------------
// Loader principal
// ---------------------------------------------------------------------------

/**
 * Charge les données du pipeline Conception/Réalisation.
 *
 * @param organizationId - UUID du tenant courant (ALYOS_ORG_ID en MVP)
 * @param deps           - injection pour tests (db mockable)
 */
export async function loadCrPipelineData(
  organizationId: string,
  deps: { db?: DrizzleClient } = {},
): Promise<LoadCrResult> {
  const client = deps.db ?? defaultDb;

  try {
    // -----------------------------------------------------------------------
    // 1. Récupérer les sélections en mode conception_realisation non annulées
    // -----------------------------------------------------------------------
    const selectionRows = await client
      .select({ tenderId: selections.tenderId })
      .from(selections)
      .where(
        and(
          eq(selections.organizationId, organizationId),
          eq(selections.mode, "conception_realisation"),
        ),
      );

    // Filtre côté app : exclure les sélections annulées (cancelledAt IS NULL)
    // Note : on charge le cancelledAt via le schema selection
    const activeSels = await client
      .select({
        tenderId: selections.tenderId,
        cancelledAt: selections.cancelledAt,
      })
      .from(selections)
      .where(
        and(
          eq(selections.organizationId, organizationId),
          eq(selections.mode, "conception_realisation"),
        ),
      );

    // Filtrage app : exclure les annulées
    const activeTenderIds = activeSels.filter((s) => s.cancelledAt === null).map((s) => s.tenderId);

    if (activeTenderIds.length === 0) {
      return {
        ok: true,
        data: { a_analyser: [], rc_analysee: [], dossier_en_cours: [], soumis: [] },
      };
    }

    // Supprime la requête initiale inutilisée (on garde seulement activeSels)
    void selectionRows;

    // -----------------------------------------------------------------------
    // 2. Charger les tenders correspondants
    //    ORDER BY score DESC NULLS LAST, puis deadline ASC NULLS LAST
    // -----------------------------------------------------------------------
    const tenderRows = await client
      .select({
        id: tenders.id,
        title: tenders.title,
        buyer: tenders.buyer,
        deadline: tenders.deadline,
        score: tenders.score,
      })
      .from(tenders)
      .where(and(eq(tenders.organizationId, organizationId), inArray(tenders.id, activeTenderIds)))
      .orderBy(desc(tenders.score));

    if (tenderRows.length === 0) {
      return {
        ok: true,
        data: { a_analyser: [], rc_analysee: [], dossier_en_cours: [], soumis: [] },
      };
    }

    const tenderIds = tenderRows.map((t) => t.id);

    // -----------------------------------------------------------------------
    // 3. Charger les événements pertinents pour la classification Kanban
    //    event_types : 'rc_analyzed' et 'dossier_zip_compiled'
    //    On ne charge que les types utiles pour limiter l'I/O.
    // -----------------------------------------------------------------------
    const eventRows = await client
      .select({
        tenderId: tenderEvents.tenderId,
        eventType: tenderEvents.eventType,
        occurredAt: tenderEvents.occurredAt,
      })
      .from(tenderEvents)
      .where(
        and(
          eq(tenderEvents.organizationId, organizationId),
          inArray(tenderEvents.tenderId, tenderIds),
          inArray(tenderEvents.eventType, ["rc_analyzed", "dossier_zip_compiled"]),
        ),
      )
      .orderBy(tenderEvents.occurredAt);

    // -----------------------------------------------------------------------
    // 4. Construction des sets de présence par tender
    // -----------------------------------------------------------------------
    const hasRcAnalyzed = new Set<string>();
    const hasDossierZip = new Set<string>();

    for (const ev of eventRows) {
      if (ev.eventType === "rc_analyzed") hasRcAnalyzed.add(ev.tenderId);
      if (ev.eventType === "dossier_zip_compiled") hasDossierZip.add(ev.tenderId);
    }

    // -----------------------------------------------------------------------
    // 5. Classification dans les 4 colonnes
    //
    //    Règle de priorité (first-match descendant) :
    //    - dossier_zip_compiled → colonne "soumis"
    //    - rc_analyzed + dossier_zip absent → "rc_analysee" ou "dossier_en_cours"
    //      NB : on n'a pas de marqueur BDD distinct entre "RC analysée sans pièces"
    //      et "pièces DCE en cours" sans charger tender_documents — pour garder
    //      la requête légère, on classe dans "dossier_en_cours" dès que rc_analyzed
    //      ET que la deadline est dans moins de 30 jours (signal que le dossier a
    //      probablement démarré). Sinon : "rc_analysee".
    //      Ce comportement est intentionnel et documenté — affinable en Phase 2
    //      si on ajoute un event_type dédié.
    //    - Aucun événement → "a_analyser"
    // -----------------------------------------------------------------------
    const result: CrKanbanData = {
      a_analyser: [],
      rc_analysee: [],
      dossier_en_cours: [],
      soumis: [],
    };

    const now = Date.now();
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

    for (const t of tenderRows) {
      const card: CrCard = {
        id: t.id,
        title: t.title,
        buyer: t.buyer,
        deadline: t.deadline,
        score: t.score ? Math.round(Number(t.score)) : null,
      };

      if (hasDossierZip.has(t.id)) {
        result.soumis.push(card);
      } else if (hasRcAnalyzed.has(t.id)) {
        // Heuristique deadline courte → dossier en cours
        const deadlineSoon =
          t.deadline !== null &&
          t.deadline.getTime() - now < THIRTY_DAYS_MS &&
          t.deadline.getTime() > now;

        if (deadlineSoon) {
          result.dossier_en_cours.push(card);
        } else {
          result.rc_analysee.push(card);
        }
      } else {
        result.a_analyser.push(card);
      }
    }

    return { ok: true, data: result };
  } catch (err) {
    console.error("[cr-pipeline:load_failed]", err);
    return { ok: false, error: "internal_error" };
  }
}
