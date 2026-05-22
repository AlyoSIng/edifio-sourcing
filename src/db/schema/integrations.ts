/**
 * Tables intégrations : Odoo, Brevo, Notifications.
 *
 * Source de vérité :
 *   - `specs/schema_v1.sql` §8 (modèle initial)
 *   - `specs/module_solo_engine_v1.md` §3.2-3.3 + module Tandem §3.5 :
 *     **opportunités multi-opp** (1 opp Solo OU N opp Tandem par AO,
 *     1 par architecte partant). Refonte 2026-05-25 (PR `feat/tandem-engine`
 *     étape 1).
 *
 * Refonte `odoo_opportunities` (2026-05-25) :
 *   - DROP UNIQUE(tender_id) — était valide en Solo-only, casse en Tandem.
 *   - ADD `architect_id` (FK nullable → `architects.id`) : NULL = opp Solo,
 *     UUID = opp Tandem dédiée à cet archi.
 *   - ADD `origin` text avec CHECK `('solo'|'tandem')` (pas un enum pour
 *     rester compatible avec d'éventuels canaux futurs sans bump enum).
 *   - ADD `last_error` text NULL : traçabilité dernier échec XML-RPC,
 *     consommé par les retries du connecteur Odoo.
 *   - Index partiels UNIQUE :
 *     * `uniq_opp_solo (tender_id) WHERE architect_id IS NULL`
 *       → garantit 1 seule opp Solo par AO.
 *     * `uniq_opp_tandem (tender_id, architect_id) WHERE architect_id IS NOT NULL`
 *       → garantit 1 seule opp Tandem par couple (AO, archi).
 *
 * - `brevo_messages` : inchangé.
 * - `notifications` : inchangé.
 */

import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { BrevoMessageEvents, NotificationPayload } from "../types/jsonb";
import { architects } from "./architects";
import { brevoRegister } from "./enums";
import { organizations } from "./organizations";
import { tenders } from "./tenders";
import { users } from "./users";

export const odooOpportunities = pgTable(
  "odoo_opportunities",
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
    /**
     * Architecte partant — NULL en Solo (1 opp par AO), UUID en Tandem
     * (1 opp par couple AO/archi accepté). ON DELETE SET NULL pour
     * conserver l'historique d'opp même si l'archi est supprimé.
     */
    architectId: uuid("architect_id").references(() => architects.id, { onDelete: "set null" }),
    /**
     * Origine de l'opportunité — `solo` ou `tandem` (CHECK constraint).
     * Pas un enum Postgres pour rester souple sur d'éventuels canaux futurs
     * (`solo_late`, `direct`, etc.) sans bump enum.
     */
    origin: text("origin").notNull(),
    /** ID interne Odoo de l'opportunité (int natif Odoo). */
    odooId: integer("odoo_id").notNull(),
    odooStage: text("odoo_stage"),
    /**
     * Dernier message d'erreur XML-RPC en cas d'échec de sync (`null` si OK
     * au dernier essai). Consommé par les retries du connecteur Odoo et
     * affiché côté admin (debug ops).
     */
    lastError: text("last_error"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    originCheck: check(
      "odoo_opportunities_origin_check",
      sql`${table.origin} IN ('solo', 'tandem')`,
    ),
    /**
     * Index partiel UNIQUE — 1 opp Solo par AO (architect_id IS NULL).
     * Permet d'autoriser plusieurs opp Tandem (1 par archi) sur le même AO
     * tout en garantissant l'unicité du canal Solo.
     */
    uniqOppSolo: uniqueIndex("uniq_opp_solo")
      .on(table.tenderId)
      .where(sql`${table.architectId} IS NULL`),
    /**
     * Index partiel UNIQUE — 1 opp par couple (AO, archi) en Tandem.
     * Idempotence du `createOdooOpportunity(tenderId, { architectId })`.
     */
    uniqOppTandem: uniqueIndex("uniq_opp_tandem")
      .on(table.tenderId, table.architectId)
      .where(sql`${table.architectId} IS NOT NULL`),
    tenderIdx: index("idx_odoo_opportunities_tender").on(table.tenderId),
  }),
);

export type OdooOpportunity = typeof odooOpportunities.$inferSelect;
export type NewOdooOpportunity = typeof odooOpportunities.$inferInsert;

export const brevoMessages = pgTable(
  "brevo_messages",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    tenderId: uuid("tender_id").references(() => tenders.id, { onDelete: "cascade" }),
    /** SET NULL : on garde l'historique d'envoi même si l'archi est supprimé */
    architectId: uuid("architect_id").references(() => architects.id, { onDelete: "set null" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Nom du template Brevo (ex. 'architect_solicitation_TU') */
    templateName: text("template_name").notNull(),
    register: brevoRegister("register").notNull(),
    /** ID retourné par Brevo lors du send — clef de jointure avec webhooks */
    brevoMessageId: text("brevo_message_id"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    /** Tableau d'événements webhook Brevo (NOT NULL DEFAULT []) */
    events: jsonb("events")
      .$type<BrevoMessageEvents>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenderIdx: index("idx_brevo_messages_tender").on(table.tenderId),
  }),
);

export type BrevoMessage = typeof brevoMessages.$inferSelect;
export type NewBrevoMessage = typeof brevoMessages.$inferInsert;

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Type libre : ao_du_jour, architect_responded, dossier_ready, ... */
    notificationType: text("notification_type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    payload: jsonb("payload").$type<NotificationPayload>(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    /** Index partiel sur notifications non lues (perf inbox utilisateur) */
    userUnreadIdx: index("idx_notifications_user_unread")
      .on(table.userId, table.createdAt.desc())
      .where(sql`${table.readAt} IS NULL`),
  }),
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
