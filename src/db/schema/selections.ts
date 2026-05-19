/**
 * Tables sélections + matching architectes + tokens accès tokenisé.
 *
 * Source de vérité : `specs/schema_v1.sql` §5.
 *
 * - `selections` : 1 ligne par AO sélectionné (unique tender_id)
 * - `match_proposals` : top N architectes proposés pour un AO Tandem
 * - `architect_responses` : réponse de l'archi (pending/accepted/declined/info)
 * - `architect_tokens` : JWT révocables pour la page tokenisée (jti UNIQUE)
 */

import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { architects } from "./architects";
import { architectResponseStatus, selectionMode } from "./enums";
import { organizations } from "./organizations";
import { tenders } from "./tenders";
import { users } from "./users";

export const selections = pgTable("selections", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuid_generate_v4()`),
  /** UNIQUE : un AO ne peut être sélectionné qu'une fois (annulation = cancelled_at set) */
  tenderId: uuid("tender_id")
    .notNull()
    .unique()
    .references(() => tenders.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  mode: selectionMode("mode").notNull(),
  selectedBy: uuid("selected_by")
    .notNull()
    .references(() => users.id),
  selectedAt: timestamp("selected_at", { withTimezone: true }).notNull().defaultNow(),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
});

export type Selection = typeof selections.$inferSelect;
export type NewSelection = typeof selections.$inferInsert;

export const matchProposals = pgTable(
  "match_proposals",
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
    architectId: uuid("architect_id")
      .notNull()
      .references(() => architects.id, { onDelete: "cascade" }),
    score: numeric("score", { precision: 5, scale: 2 }).notNull(),
    rank: integer("rank").notNull(),
    /** Texte IA « Pourquoi cet archi » (cf. prompt P5) */
    rationale: text("rationale"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenderArchiUq: unique("match_proposals_tender_id_architect_id_key").on(
      table.tenderId,
      table.architectId,
    ),
    tenderRankIdx: index("idx_match_proposals_tender").on(table.tenderId, table.rank),
  }),
);

export type MatchProposal = typeof matchProposals.$inferSelect;
export type NewMatchProposal = typeof matchProposals.$inferInsert;

export const architectResponses = pgTable(
  "architect_responses",
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
    architectId: uuid("architect_id")
      .notNull()
      .references(() => architects.id, { onDelete: "cascade" }),
    status: architectResponseStatus("status").notNull().default("pending"),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    infoRequestText: text("info_request_text"),
  },
  (table) => ({
    tenderArchiUq: unique("architect_responses_tender_id_architect_id_key").on(
      table.tenderId,
      table.architectId,
    ),
    statusIdx: index("idx_architect_responses_status").on(table.status, table.tenderId),
  }),
);

export type ArchitectResponse = typeof architectResponses.$inferSelect;
export type NewArchitectResponse = typeof architectResponses.$inferInsert;

export const architectTokens = pgTable(
  "architect_tokens",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    tenderId: uuid("tender_id")
      .notNull()
      .references(() => tenders.id, { onDelete: "cascade" }),
    architectId: uuid("architect_id")
      .notNull()
      .references(() => architects.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Claim `jti` du JWT — UNIQUE pour révocation cible */
    jwtId: text("jwt_id").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revoked: boolean("revoked").notNull().default(false),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: uuid("revoked_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    /** Index partiel sur tokens actifs uniquement (perf check révocation) */
    activeIdx: index("idx_architect_tokens_active")
      .on(table.jwtId)
      .where(sql`${table.revoked} = FALSE`),
  }),
);

export type ArchitectToken = typeof architectTokens.$inferSelect;
export type NewArchitectToken = typeof architectTokens.$inferInsert;
