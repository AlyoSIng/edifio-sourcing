/**
 * Tables tenders + tender_lots + tender_documents + tender_events.
 *
 * Source de vérité : `specs/schema_v1.sql` §4.
 *
 * `tenders` est la table métier centrale — toutes les autres entités la
 * référencent. Index trigram sur title (recherche fuzzy) + index partiels
 * sur deadline future et sur score (filtre status='sourced').
 */

import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import type { TenderEventData, TenderRawData } from "../types/jsonb";
import { platforms, searchProfiles } from "./config";
import { tenderStatus } from "./enums";
import { organizations } from "./organizations";
import { users } from "./users";

export const tenders = pgTable(
  "tenders",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Référence externe de l'AO sur la plateforme source (ex. idweb BOAMP) */
    externalRef: text("external_ref").notNull(),
    platformId: uuid("platform_id")
      .notNull()
      .references(() => platforms.id),
    title: text("title").notNull(),
    buyer: text("buyer").notNull(),
    /** Codes CPV principaux + secondaires */
    cpv: text("cpv")
      .array()
      .notNull()
      .default(sql`'{}'`),
    amount: numeric("amount", { precision: 14, scale: 2 }),
    deadline: timestamp("deadline", { withTimezone: true }),
    questionsDeadline: timestamp("questions_deadline", { withTimezone: true }),
    visitDate: timestamp("visit_date", { withTimezone: true }),
    dceUrl: text("dce_url"),
    sourceUrl: text("source_url"),
    /** Payload brut de la plateforme pour debug + apprentissage */
    rawData: jsonb("raw_data").$type<TenderRawData>(),
    /** Score 0-100 (CHECK contrainte côté DB) */
    score: numeric("score", { precision: 5, scale: 2 }),
    status: tenderStatus("status").notNull().default("sourced"),
    matchingProfileId: uuid("matching_profile_id").references(() => searchProfiles.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    /** Idempotence : un AO unique par (org, ref externe, plateforme) */
    idempotenceUq: unique("tenders_organization_id_external_ref_platform_id_key").on(
      table.organizationId,
      table.externalRef,
      table.platformId,
    ),
    /** Borne score 0..100 */
    scoreRange: check("tenders_score_check", sql`${table.score} >= 0 AND ${table.score} <= 100`),
    orgStatusIdx: index("idx_tenders_org_status").on(table.organizationId, table.status),
    /**
     * Index full sur deadline. Divergence assumée vs `specs/schema_v1.sql:206`
     * qui posait un index partiel `WHERE deadline > now()` — Postgres refuse
     * (SQLSTATE 42P17 : `now()` est STABLE, pas IMMUTABLE, et les prédicats
     * d'index doivent être déterministes). L'overhead d'indexer aussi les
     * deadlines passées est négligeable sur volume cible (~100-400 K rows),
     * et toutes les queries applicatives filtrent `deadline > now()` dans
     * leur WHERE clause — donc range scan sur l'index full, même perf qu'un
     * partiel. Bug latent côté spec à amender (post-mortem CTO).
     */
    deadlineIdx: index("idx_tenders_deadline").on(table.deadline),
    /** Index GIN trigram pour recherche fuzzy sur title */
    titleTrgmIdx: index("idx_tenders_title_trgm").using("gin", sql`${table.title} gin_trgm_ops`),
    /** Index partiel pour ranking « AO du jour » trié par score */
    scoreIdx: index("idx_tenders_score")
      .on(table.organizationId, table.score.desc())
      .where(sql`${table.status} = 'sourced'`),
  }),
);

export type Tender = typeof tenders.$inferSelect;
export type NewTender = typeof tenders.$inferInsert;

export const tenderLots = pgTable(
  "tender_lots",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    tenderId: uuid("tender_id")
      .notNull()
      .references(() => tenders.id, { onDelete: "cascade" }),
    lotNumber: integer("lot_number").notNull(),
    description: text("description"),
    amount: numeric("amount", { precision: 14, scale: 2 }),
  },
  (table) => ({
    tenderLotUq: unique("tender_lots_tender_id_lot_number_key").on(table.tenderId, table.lotNumber),
  }),
);

export type TenderLot = typeof tenderLots.$inferSelect;
export type NewTenderLot = typeof tenderLots.$inferInsert;

export const tenderDocuments = pgTable(
  "tender_documents",
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
    /** Type de pièce : RC, CCAP, CCTP, BPU, DPGF, plans, etc. */
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    /** Format : pdf, docx, xlsx, dwg, etc. */
    format: text("format"),
    /** Chemin Supabase Storage */
    storagePath: text("storage_path").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    analyzed: boolean("analyzed").notNull().default(false),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenderIdx: index("idx_tender_documents_tender").on(table.tenderId),
  }),
);

export type TenderDocument = typeof tenderDocuments.$inferSelect;
export type NewTenderDocument = typeof tenderDocuments.$inferInsert;

export const tenderEvents = pgTable(
  "tender_events",
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
    /** Type d'événement libre : sourced, selected, architect_solicited, ... */
    eventType: text("event_type").notNull(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    data: jsonb("data").$type<TenderEventData>(),
  },
  (table) => ({
    tenderOccurredIdx: index("idx_tender_events_tender").on(table.tenderId, table.occurredAt),
  }),
);

export type TenderEvent = typeof tenderEvents.$inferSelect;
export type NewTenderEvent = typeof tenderEvents.$inferInsert;
