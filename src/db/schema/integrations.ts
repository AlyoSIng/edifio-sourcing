/**
 * Tables intégrations : Odoo, Brevo, Notifications.
 *
 * Source de vérité : `specs/schema_v1.sql` §8.
 *
 * - `odoo_opportunities` : miroir local d'une opportunité Odoo CRM (1:1 tender)
 * - `brevo_messages` : historique des envois Brevo + webhooks d'événements
 * - `notifications` : notifications utilisateur in-app (sans email — Resend)
 */

import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import type { BrevoMessageEvents, NotificationPayload } from "../types/jsonb";
import { architects } from "./architects";
import { brevoRegister } from "./enums";
import { organizations } from "./organizations";
import { tenders } from "./tenders";
import { users } from "./users";

export const odooOpportunities = pgTable("odoo_opportunities", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuid_generate_v4()`),
  /** UNIQUE : 1 opportunité Odoo par AO (Mode Solo ou Tandem accepté) */
  tenderId: uuid("tender_id")
    .notNull()
    .unique()
    .references(() => tenders.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  /** ID interne Odoo de l'opportunité (int natif Odoo) */
  odooId: integer("odoo_id").notNull(),
  odooStage: text("odoo_stage"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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
