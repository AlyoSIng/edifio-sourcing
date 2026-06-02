/**
 * Table tender_be_cotraitants — lien N-N tender ↔ BE pour le mode Cotraitance BE.
 *
 * Source de vérité : brief Board Lot B 2026-06-02 + migration 0037.
 *
 * Contexte métier : en mode Cotraitance BE, AlyoS est mandataire d'un
 * groupement avec 1 ou plusieurs bureaux d'études cotraitants. Steve choisit
 * les BE depuis la bibliothèque (`bureaux_etudes`) directement sur la page
 * dossier de l'AO. Chaque BE sélectionné devra produire son propre DC2.
 *
 * Particularités :
 *   - Contrainte UNIQUE `(tender_id, be_id)` → INSERT idempotent via
 *     `onConflictDoNothing()` (un BE déjà ajouté ne génère pas d'erreur).
 *   - Pas de RLS FORCE à ce stade (Phase 1 mono-tenant AlyoS) — un
 *     `organization_id` est cependant stocké pour préparer Phase 2.
 *
 * Créée dans Lot B (Alex, 2026-06-02).
 */

import { sql } from "drizzle-orm";
import { index, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { bureauEtudes } from "./bureaux-etudes";
import { organizations } from "./organizations";
import { tenders } from "./tenders";
import { users } from "./users";

export const tenderBeCotraitants = pgTable(
  "tender_be_cotraitants",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenderId: uuid("tender_id")
      .notNull()
      .references(() => tenders.id, { onDelete: "cascade" }),
    beId: uuid("be_id")
      .notNull()
      .references(() => bureauEtudes.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
    /** Utilisateur ayant ajouté ce BE comme cotraitant. SET NULL si user purgé. */
    addedBy: uuid("added_by").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => ({
    /** Idempotence d'ajout : INSERT ON CONFLICT DO NOTHING. */
    uniqTenderBe: unique("tender_be_cotraitants_unique").on(table.tenderId, table.beId),
    tenderIdx: index("idx_tender_be_cotraitants_tender").on(table.tenderId),
    orgIdx: index("idx_tender_be_cotraitants_org").on(table.organizationId),
  }),
);

export type TenderBeCotraitant = typeof tenderBeCotraitants.$inferSelect;
export type NewTenderBeCotraitant = typeof tenderBeCotraitants.$inferInsert;
