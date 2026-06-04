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
    /**
     * Adresse postale de l'acheteur (rue + code postal + ville libre).
     * Steve 2026-06-04. Utilisée pour les courriers de réponse et le
     * pré-remplissage des CERFA. Nullable : extraite progressivement du
     * raw_data BOAMP ou saisie manuellement.
     */
    buyerAddress: text("buyer_address"),
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
    /**
     * Différé utilisateur (PR n°5 — Arbitrage Board B 2026-05-21).
     *
     * Quand l'utilisateur clique « Différer » sur la `TenderCard`, on pose
     * `deferred_until = now() + N hours` (V1 fixe à 24h, extensible Phase 2).
     * Le statut tender reste `sourced` — c'est `getTendersOfTheDay` qui
     * filtre `(deferred_until IS NULL OR deferred_until < now())` pour
     * exclure l'AO du digest du jour. À expiration de `deferred_until`,
     * l'AO réapparait automatiquement.
     *
     * Nullable par défaut : un AO neuf n'est jamais différé.
     */
    deferredUntil: timestamp("deferred_until", { withTimezone: true }),
    /**
     * Exclusion réversible de l'AO par l'utilisateur (migration 0013).
     *
     * Quand l'utilisateur clique « Exclure » sur la `TenderCard`, on pose
     * `excluded_at = now()`. L'AO disparaît du digest « AO du jour » via le
     * filtre `excluded_at IS NULL` dans `getTendersOfTheDay`. L'utilisateur
     * peut annuler en cliquant « Inclure » (remet à NULL). Le statut tender
     * reste `sourced` — l'exclusion est orthogonale au workflow de traitement.
     *
     * Nullable par défaut : un AO neuf n'est jamais exclu.
     */
    excludedAt: timestamp("excluded_at", { withTimezone: true }),
    /**
     * Code postal du lieu d'exécution (à défaut CP MOA, à défaut null).
     * Dérivé au scraping/ingest via derivePostalCodeAndDepartment().
     * Backfillé pour les lignes existantes via scripts/backfill-departments.ts.
     */
    postalCode: text("postal_code"),
    /**
     * Département (2 à 3 chars : "75", "2A", "971").
     * Dérivé du CP retenu ou de rawData.record.departement (BOAMP).
     * Index idx_tenders_department pour les filtres fréquents.
     */
    department: text("department"),
    /**
     * Type d'avis tel que fourni par la plateforme source.
     * BOAMP Opendatasoft v2.1 : champ `nature` (ex. "Avis de marché",
     * "Avis d'attribution de marché", "Avis de préinformation"…).
     * Nullable : les plateformes scraper (PLACE, etc.) ne fournissent pas ce champ.
     * Les avis d'attribution sont exclus du filtre getTendersOfTheDay côté app.
     */
    noticeType: text("notice_type"),
    /**
     * AO avec clause d'exclusivité (ex. sollicitation directe d'un MOA
     * à AlyoS uniquement, marché réservé, négociation exclusive).
     * Posé manuellement par un admin ou détecté à l'import.
     * Default false.
     */
    isExclusive: boolean("is_exclusive").notNull().default(false),
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
     * Index partiel sur `deferred_until` — n'indexe que les lignes différées
     * (généralement une minorité). Utilisé pour requêtes futures de type
     * « lister les AO différés », et accélère le filtre négatif côté
     * `getTendersOfTheDay` même si Postgres peut aussi traiter NULL hors
     * index. Prédicat `IS NOT NULL` strictement IMMUTABLE — pas de souci
     * SQLSTATE 42P17 contrairement à `WHERE deadline > now()` (cf. JSDoc
     * `deadlineIdx`).
     */
    deferredUntilIdx: index("idx_tenders_deferred_until")
      .on(table.deferredUntil)
      .where(sql`${table.deferredUntil} IS NOT NULL`),
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
    /**
     * Index partiel sur `excluded_at` — n'indexe que les lignes exclues
     * (minorité). Utilisé pour la vue future « AO exclus » + accélère le
     * filtre négatif `excluded_at IS NULL` côté `getTendersOfTheDay`.
     * Prédicat `IS NOT NULL` IMMUTABLE — sans risque SQLSTATE 42P17.
     */
    excludedAtIdx: index("idx_tenders_excluded_at")
      .on(table.excludedAt)
      .where(sql`${table.excludedAt} IS NOT NULL`),
    /**
     * Index sur department — utilisé pour les filtres fréquents « AO du jour »
     * (filtre multi-select département) et pour le tri `department ASC`.
     * Non partiel : les lignes NULL (CP non renseigné) restent indexées pour
     * accélérer le tri `NULLS LAST`.
     */
    departmentIdx: index("idx_tenders_department").on(table.department),
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
