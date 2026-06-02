/**
 * Tables response_files + presentation_library.
 *
 * Source de vérité : `specs/schema_v1.sql` §6.
 *
 * - `response_files` : pièces de réponse générées/validées (DC1, DC2, DC4,
 *   ATTRI1, mémoire, annexes) par AO.
 * - `presentation_library` : bibliothèque entreprise réutilisable
 *   (présentations, attestations, références, CV) avec dates d'expiration.
 */

import { sql } from "drizzle-orm";
import { bigint, boolean, date, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { architects } from "./architects";
import { bureauEtudes } from "./bureaux-etudes";
import { organizations } from "./organizations";
import { tenders } from "./tenders";
import { users } from "./users";

export const responseFiles = pgTable(
  "response_files",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    tenderId: uuid("tender_id")
      .notNull()
      .references(() => tenders.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Type : DC1, DC2, DC4, ATTRI1, memo, annexe, ... */
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    storagePath: text("storage_path").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    /**
     * Phase 2 DC1/DC2 multi-archi (Tandem) — lien optionnel vers l'architecte
     * accepté concerné. NULL pour Solo / Cotraitance BE (un seul dossier).
     * NOT NULL pour DC1 (mandataire = archi) et Pouvoir (AlyoS → archi) en
     * Tandem multi-archi. ON DELETE SET NULL pour conserver les historiques.
     */
    architectId: uuid("architect_id").references(() => architects.id, { onDelete: "set null" }),
    /**
     * Lot B Cotraitance BE — lien optionnel vers le BE cotraitant concerné.
     * NULL pour DC1 (mandataire = AlyoS ou archi), DC2 AlyoS (mode standard),
     * Tandem/Solo. NOT NULL pour les DC2 spécifiques d'un BE cotraitant.
     * ON DELETE SET NULL pour conserver les historiques même si la fiche BE
     * est purgée (RGPD art. 17).
     */
    beId: uuid("be_id").references(() => bureauEtudes.id, { onDelete: "set null" }),
    validated: boolean("validated").notNull().default(false),
    validatedBy: uuid("validated_by").references(() => users.id, { onDelete: "set null" }),
    validatedAt: timestamp("validated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenderIdx: index("idx_response_files_tender").on(table.tenderId),
    /** Index partiel — chemin chaud du multi-archi (filtre WHERE architect_id IS NOT NULL). */
    architectIdx: index("idx_response_files_architect")
      .on(table.architectId)
      .where(sql`${table.architectId} IS NOT NULL`),
    /** Index partiel — chemin chaud du DC2 par BE cotraitant (WHERE be_id IS NOT NULL). */
    beIdx: index("idx_response_files_be")
      .on(table.beId)
      .where(sql`${table.beId} IS NOT NULL`),
  }),
);

export type ResponseFile = typeof responseFiles.$inferSelect;
export type NewResponseFile = typeof responseFiles.$inferInsert;

export const presentationLibrary = pgTable(
  "presentation_library",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Type : presentation, attestation, reference, cv */
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    storagePath: text("storage_path").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    /** Date d'expiration (attestations URSSAF, etc.) — pilote alertes J-30/J-7/J-1 */
    validUntil: date("valid_until"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgKindIdx: index("idx_presentation_library_org_kind").on(table.organizationId, table.kind),
    /** Index partiel sur expiry pour le job d'alerte quotidien */
    expiryIdx: index("idx_presentation_library_expiry")
      .on(table.validUntil)
      .where(sql`${table.validUntil} IS NOT NULL`),
  }),
);

export type PresentationLibraryItem = typeof presentationLibrary.$inferSelect;
export type NewPresentationLibraryItem = typeof presentationLibrary.$inferInsert;
