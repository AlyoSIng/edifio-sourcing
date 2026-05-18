/**
 * Tables configuration — profils de recherche + plateformes + credentials.
 *
 * Source de vérité : `specs/schema_v1.sql` §2.
 *
 * `platforms` est une table de référence (4 lignes seedées dans la migration
 * d'init métier — étape 5 du plan Gate 6 via `pnpm db:seed`). À ce stade
 * on pose juste la structure.
 */

import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import type { SearchProfileKeywords } from "../types/jsonb";
import { authType, platformCode } from "./enums";
import { organizations } from "./organizations";

export const searchProfiles = pgTable(
  "search_profiles",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    keywords: jsonb("keywords")
      .$type<SearchProfileKeywords>()
      .notNull()
      .default(sql`'{"positive":[],"negative":[],"exact":[]}'::jsonb`),
    /** Codes CPV ciblés — array Postgres natif */
    cpvCodes: text("cpv_codes")
      .array()
      .notNull()
      .default(sql`'{}'`),
    /** Départements / régions ciblés */
    geoZones: text("geo_zones")
      .array()
      .notNull()
      .default(sql`'{}'`),
    /** Types de marché : travaux, services, MOE, ... */
    marketTypes: text("market_types")
      .array()
      .notNull()
      .default(sql`'{}'`),
    amountMin: numeric("amount_min", { precision: 14, scale: 2 }),
    amountMax: numeric("amount_max", { precision: 14, scale: 2 }),
    active: boolean("active").notNull().default(true),
    /** Heure de déclenchement quotidien du cron (FR Paris) */
    cronTime: time("cron_time").notNull().default("06:30"),
    /** Jours actifs : 1=lundi ... 5=vendredi */
    cronDays: integer("cron_days")
      .array()
      .notNull()
      .default(sql`'{1,2,3,4,5}'`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    /** Index partiel sur les profils actifs uniquement (perf cron quotidien) */
    orgActiveIdx: index("idx_search_profiles_org")
      .on(table.organizationId)
      .where(sql`active`),
  }),
);

export type SearchProfile = typeof searchProfiles.$inferSelect;
export type NewSearchProfile = typeof searchProfiles.$inferInsert;

/**
 * platforms — table de référence (4 lignes seedées).
 * Pas de RLS (pas multi-tenant).
 */
export const platforms = pgTable("platforms", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuid_generate_v4()`),
  code: platformCode("code").notNull().unique(),
  displayName: text("display_name").notNull(),
  authType: authType("auth_type").notNull(),
  baseUrl: text("base_url").notNull(),
  enabled: boolean("enabled").notNull().default(true),
});

export type Platform = typeof platforms.$inferSelect;
export type NewPlatform = typeof platforms.$inferInsert;

export const platformCredentials = pgTable(
  "platform_credentials",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    platformId: uuid("platform_id")
      .notNull()
      .references(() => platforms.id, { onDelete: "cascade" }),
    /** Pointeur Supabase Vault — jamais le secret en clair */
    credentialsVaultRef: text("credentials_vault_ref").notNull(),
    active: boolean("active").notNull().default(true),
    lastValidatedAt: timestamp("last_validated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.organizationId, table.platformId] }),
  }),
);

export type PlatformCredential = typeof platformCredentials.$inferSelect;
export type NewPlatformCredential = typeof platformCredentials.$inferInsert;
