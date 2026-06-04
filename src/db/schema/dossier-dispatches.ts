/**
 * Table dossier_dispatches — envoi du dossier ZIP à l'architecte mandataire.
 *
 * Cf. migration 0038_dossier_dispatches.sql pour la décision Steve 2026-06-03.
 *
 * Une ligne = un envoi (mail Brevo + signed URL Supabase Storage 7j).
 * Le ZIP source reste référencé par `zip_storage_path` (bucket `response_files`).
 *
 * `architect_id` / `tender_id` : ON DELETE SET NULL pour conserver les
 * historiques d'envoi même si une fiche archi est purgée (RGPD art. 17).
 */

import { sql } from "drizzle-orm";
import { bigint, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { architects } from "./architects";
import { organizations } from "./organizations";
import { tenders } from "./tenders";
import { users } from "./users";

export const dossierDispatches = pgTable(
  "dossier_dispatches",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenderId: uuid("tender_id").references(() => tenders.id, { onDelete: "set null" }),
    architectId: uuid("architect_id").references(() => architects.id, { onDelete: "set null" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Chemin du ZIP dans le bucket `response_files`. */
    zipStoragePath: text("zip_storage_path").notNull(),
    /** Nom affiché côté Storage (`dossier_<ref>_<context>.zip`). */
    zipDisplayName: text("zip_display_name").notNull(),
    zipSizeBytes: bigint("zip_size_bytes", { mode: "number" }),
    /** Date d'expiration du signed URL (sent_at + 7j). */
    signedUrlExpiresAt: timestamp("signed_url_expires_at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    sentBy: uuid("sent_by").references(() => users.id, { onDelete: "set null" }),
    recipientEmail: text("recipient_email").notNull(),
    recipientName: text("recipient_name"),
    brevoMessageId: text("brevo_message_id"),
    /** Registre Brevo utilisé pour le mail ('tu' | 'vous') — audit. */
    brevoTemplateRegister: text("brevo_template_register"),
    /**
     * Soft cancel (chantier H6 — Steve 2026-06-04). NULL = envoi actif.
     * Le lien signé reste valide jusqu'à expiration naturelle (7j) —
     * Supabase ne révoque pas — mais l'UI ne montre plus l'envoi comme
     * « dernier dispatch » sur la page Pièces.
     */
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: uuid("cancelled_by").references(() => users.id, { onDelete: "set null" }),
    cancellationReason: text("cancellation_reason"),
  },
  (table) => ({
    tenderArchiIdx: index("idx_dossier_dispatches_tender_archi").on(
      table.tenderId,
      table.architectId,
      table.sentAt,
    ),
    orgIdx: index("idx_dossier_dispatches_org").on(table.organizationId, table.sentAt),
  }),
);

export type DossierDispatch = typeof dossierDispatches.$inferSelect;
export type NewDossierDispatch = typeof dossierDispatches.$inferInsert;
