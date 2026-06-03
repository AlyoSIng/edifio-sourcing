/**
 * Table library_item_index — indexation IA des items presentation_library.
 *
 * Décision Steve 2026-06-03 (chantier E). Cf. migration 0041.
 *
 * Une ligne 1:1 avec un item biblio. UNIQUE sur library_item_id côté SQL.
 * Drizzle ne supporte pas UNIQUE inline propre via `.unique()` ici car le
 * nom est utilisé déjà — on déclare l'index unique côté `(t) => ({...})`.
 */

import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { aiRuns } from "./ai";
import { organizations } from "./organizations";
import { presentationLibrary } from "./library";
import { users } from "./users";

export const libraryItemIndex = pgTable(
  "library_item_index",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    libraryItemId: uuid("library_item_id")
      .notNull()
      .references(() => presentationLibrary.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Titre intelligent extrait par Claude (souvent meilleur que `name` saisi par l'admin). */
    extractedTitle: text("extracted_title"),
    /** Mots-clés extraits — utilisés pour le matching pieces RC ↔ biblio en V2. */
    keywords: text("keywords")
      .array()
      .notNull()
      .default(sql`'{}'`),
    /** Résumé court (≤200 char) — UX admin pour comprendre rapidement le contenu. */
    summary: text("summary"),
    /**
     * Type canonique détecté (cf. catégories biblio + types CERFA — voir
     * `LIBRARY_KINDS`). Permet la normalisation cross-organisations.
     */
    docType: text("doc_type"),
    /**
     * Entités structurées extraites du doc selon son type :
     *   - attestation → { siret, raison_sociale, date_emission, date_validite }
     *   - reference   → { client, montant_eur, annee, role }
     *   - kbis        → { siret, denomination, date_immat, capital_eur }
     * Toujours JSON ; vide `{}` si non renseigné.
     */
    extractedEntities: jsonb("extracted_entities")
      .notNull()
      .default(sql`'{}'`),
    indexedAt: timestamp("indexed_at", { withTimezone: true }).notNull().defaultNow(),
    indexedBy: uuid("indexed_by").references(() => users.id, { onDelete: "set null" }),
    aiRunId: uuid("ai_run_id").references(() => aiRuns.id, { onDelete: "set null" }),
    /** Identifiant du modèle Claude utilisé (ex. "haiku-4-5"). */
    modelVersion: text("model_version"),
    /**
     * SHA-256 du fichier au moment de l'indexation. Permet de détecter qu'un
     * item a été ré-uploadé sans ré-indexation (l'UI peut signaler « obsolète »
     * et proposer un re-run).
     */
    sourceHash: text("source_hash"),
  },
  (table) => ({
    libraryItemUnique: uniqueIndex("library_item_index_library_item_id_unique").on(
      table.libraryItemId,
    ),
    orgIdx: index("idx_library_item_index_org").on(table.organizationId, table.indexedAt),
  }),
);

export type LibraryItemIndex = typeof libraryItemIndex.$inferSelect;
export type NewLibraryItemIndex = typeof libraryItemIndex.$inferInsert;
