// ============================================================================
// schema.ts — Drizzle schema (Spike Phase 2a)
// ----------------------------------------------------------------------------
// Sous-ensemble minimal du schéma figé Gate 5 (`specs/schema_v1.sql`) suffisant
// pour le bench scoring 100 AO :
//   - subscription_tier (enum) + organizations.tier
//   - tender_status (enum, restreint aux statuts utilisés par le bench)
//   - architect_response_status (enum)
//   - organizations / architects / tenders / architect_responses
//
// HORS PÉRIMÈTRE 2a (à ne pas porter dans le spike, dette assumée) :
//   - users / memberships (l'auth Supabase n'est pas dans le périmètre bench)
//   - search_profiles / platforms / platform_credentials
//   - tender_lots / tender_documents / tender_events / selections /
//     match_proposals / architect_tokens / response_files /
//     presentation_library / ai_prompts / ai_runs / odoo_opportunities /
//     brevo_messages / notifications / audit_logs / learning_events
//
// Justification : le spike mesure le cold start et la perf scoring. Toute table
// hors flux scoring ajoute du bruit (LoC schema.ts dans le critère DX) sans
// améliorer la qualité du bench. Le spike est jetable — la migration officielle
// post-décision ORM reprendra le schéma complet.
// ============================================================================

import {
  boolean,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// 1. ENUMS
// ---------------------------------------------------------------------------

// Aligné sur spike/schema_subscription_tier.sql (libellés Gate 1, ANSWER
// Cowork oral 2026-05-15 confirmé Gate 1).
// Si réalignement libellés en Phase 2b ou Phase 4 → migration séparée.
export const subscriptionTier = pgEnum("subscription_tier", [
  "Sourcing",
  "Cotraitance",
  "Studio IA",
]);

// Sous-ensemble de tender_status (schema_v1.sql §TYPES ENUM) — uniquement
// les états traversés par le flux scoring du bench.
export const tenderStatus = pgEnum("tender_status", [
  "sourced",
  "selected_solo",
  "selected_tandem",
  "awaiting_architect",
  "architect_accepted",
  "architect_declined",
  "dropped",
]);

export const architectResponseStatus = pgEnum("architect_response_status", [
  "pending",
  "accepted",
  "declined",
  "info_requested",
]);

// ---------------------------------------------------------------------------
// 2. ORGANIZATIONS
// ---------------------------------------------------------------------------
// Note : la colonne `tier` est ajoutée par la migration de référence
// `spike/schema_subscription_tier.sql`. On la déclare ici directement pour que
// `drizzle-kit generate` produise un DDL cohérent (ALTER inutile si init from
// scratch).
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  siren: text("siren").unique(),
  tier: subscriptionTier("tier").notNull().default("Sourcing"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// 3. ARCHITECTS
// ---------------------------------------------------------------------------
// Profil simplifié pour le bench. Colonnes critiques scoring :
//   - specialty_codes (text[])    → matching tender CPV
//   - geo_zones (text[])          → matching tender zone
//   - tutoiement (boolean)        → directive Gate 4 vouvoiement par défaut
// Les autres colonnes (firstname, lastname, email, etc.) sont conservées
// pour réalisme du payload — sans contraintes UNIQUE complexes ici car le
// seed génère des données mock contrôlées.
//
// $type<...>() sur `contactInfo` jsonb : DEMO du critère DX « types TS sur
// jsonb » (25 % Gate 5). À mettre en regard du Prisma `JsonValue` Phase 2b.
export type ArchitectContactInfo = {
  email: string;
  phone?: string;
  title?: "M." | "Mme" | "Dr" | "autre";
};

export const architects = pgTable(
  "architects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    firstname: text("firstname").notNull(),
    lastname: text("lastname").notNull(),
    contactInfo: jsonb("contact_info").$type<ArchitectContactInfo>().notNull(),
    specialtyCodes: text("specialty_codes")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    geoZones: text("geo_zones")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    tutoiement: boolean("tutoiement").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("idx_architects_org_spike").on(t.organizationId),
  }),
);

// ---------------------------------------------------------------------------
// 4. TENDERS
// ---------------------------------------------------------------------------
// Champs critiques pour le scoring :
//   - cpv (text[])             → matching architecte.specialty_codes
//   - amount (numeric)         → bracket de tier
//   - raw_data (jsonb)         → 10-50 KB par AO (verdict Q1 Cowork)
//   - status (enum)            → filtre 'sourced' uniquement
//
// Le payload `rawData` est typé `unknown` côté Drizzle ; en pratique le seed
// y pose un blob réaliste (titre marché public, description, lots simulés).
export const tenders = pgTable(
  "tenders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    externalRef: text("external_ref").notNull(),
    title: text("title").notNull(),
    buyer: text("buyer").notNull(),
    cpv: text("cpv")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    geoZone: text("geo_zone"),
    amount: numeric("amount", { precision: 14, scale: 2 }),
    deadline: timestamp("deadline", { withTimezone: true }),
    rawData: jsonb("raw_data"),
    score: numeric("score", { precision: 5, scale: 2 }),
    status: tenderStatus("status").notNull().default("sourced"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgStatusIdx: index("idx_tenders_org_status_spike").on(t.organizationId, t.status),
    extRefUnique: uniqueIndex("uq_tenders_ext_ref_spike").on(t.organizationId, t.externalRef),
  }),
);

// ---------------------------------------------------------------------------
// 5. ARCHITECT_RESPONSES
// ---------------------------------------------------------------------------
// Table cible des upserts du scoring. Une ligne par (tender, architect) avec
// un score numérique calculé. La contrainte UNIQUE (tender_id, architect_id)
// permet l'idempotence ON CONFLICT du bench.
export const architectResponses = pgTable(
  "architect_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    tenderId: uuid("tender_id")
      .notNull()
      .references(() => tenders.id, { onDelete: "cascade" }),
    architectId: uuid("architect_id")
      .notNull()
      .references(() => architects.id, { onDelete: "cascade" }),
    score: numeric("score", { precision: 5, scale: 2 }).notNull(),
    rationale: text("rationale"),
    responseData: jsonb("response_data"),
    status: architectResponseStatus("status").notNull().default("pending"),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index("idx_architect_responses_status_spike").on(t.status, t.tenderId),
    tenderArchUnique: uniqueIndex("uq_architect_responses_tender_arch_spike").on(
      t.tenderId,
      t.architectId,
    ),
  }),
);

// ---------------------------------------------------------------------------
// 6. EXPORTS UTILITAIRES
// ---------------------------------------------------------------------------
export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;

export type Architect = typeof architects.$inferSelect;
export type NewArchitect = typeof architects.$inferInsert;

export type Tender = typeof tenders.$inferSelect;
export type NewTender = typeof tenders.$inferInsert;

export type ArchitectResponse = typeof architectResponses.$inferSelect;
export type NewArchitectResponse = typeof architectResponses.$inferInsert;
