/**
 * Tables ai_prompts + ai_runs + tender_briefs — IA Claude (Sonnet + Haiku).
 *
 * Source de vérité : `specs/schema_v1.sql` §7 + `specs/ai_prompts_v1.md`.
 *
 * Gate 5 directive : prompts versionnés en BDD, JAMAIS en dur dans le code.
 * Tout `ai_run` référence la version exacte du prompt utilisée pour
 * traçabilité (notamment lorsque le prompt est dépublié — la version reste).
 *
 * `tender_briefs` : briefs IA générés à la demande pour les AO (bouton
 * « Générer le brief »). 1 brief actif par AO (isActive = true), historique
 * conservé. Réf : SPEC_ADDENDUM_260524_AO_DU_JOUR_REPORT_ET_BRIEF.md §Exigence 2.
 * Migration : src/db/migrations/0022_tender_briefs.sql.
 */

import { sql } from "drizzle-orm";
import {
  boolean,
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

import type { AiRunOutput } from "../types/jsonb";
import { aiModel } from "./enums";
import { organizations } from "./organizations";
import { tenders } from "./tenders";

// ─── ai_prompts ───────────────────────────────────────────────────────────────

export const aiPrompts = pgTable(
  "ai_prompts",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    /** Nom canonique du prompt (ex. 'rc_analysis_full') — cf. ai_prompts_v1.md */
    name: text("name").notNull(),
    /** Version incrémentale — toute modification = bump */
    version: integer("version").notNull(),
    model: aiModel("model").notNull(),
    systemPrompt: text("system_prompt").notNull(),
    userPromptTemplate: text("user_prompt_template").notNull(),
    /** Expression Zod sérialisée pour validation côté app — peut être NULL pour prompts texte libre */
    outputSchemaZod: text("output_schema_zod"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    nameVersionUq: unique("ai_prompts_name_version_key").on(table.name, table.version),
    /** Index partiel sur la version active (1 par name) — accès très chaud */
    activeIdx: index("idx_ai_prompts_active")
      .on(table.name)
      .where(sql`active`),
  }),
);

export type AiPrompt = typeof aiPrompts.$inferSelect;
export type NewAiPrompt = typeof aiPrompts.$inferInsert;

// ─── ai_runs ──────────────────────────────────────────────────────────────────

export const aiRuns = pgTable(
  "ai_runs",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** FK vers la version EXACTE du prompt (pas de cascade — traçabilité) */
    promptId: uuid("prompt_id")
      .notNull()
      .references(() => aiPrompts.id),
    tenderId: uuid("tender_id").references(() => tenders.id, { onDelete: "set null" }),
    /** Hash SHA-256 de l'input pour idempotence / cache */
    inputHash: text("input_hash").notNull(),
    /** Output JSON validé Zod côté app */
    output: jsonb("output").$type<AiRunOutput>(),
    costUsd: numeric("cost_usd", { precision: 8, scale: 4 }),
    latencyMs: integer("latency_ms"),
    model: aiModel("model").notNull(),
    succeeded: boolean("succeeded").notNull().default(true),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgDateIdx: index("idx_ai_runs_org_date").on(table.organizationId, table.createdAt.desc()),
    /** Index partiel : runs associés à un AO (les autres sont des batchs hors AO) */
    tenderIdx: index("idx_ai_runs_tender")
      .on(table.tenderId)
      .where(sql`${table.tenderId} IS NOT NULL`),
  }),
);

export type AiRun = typeof aiRuns.$inferSelect;
export type NewAiRun = typeof aiRuns.$inferInsert;

// ─── tender_briefs ────────────────────────────────────────────────────────────

/**
 * Briefs IA générés à la demande pour les AO (bouton « Générer le brief »).
 * 1 brief actif par AO (isActive = true), historique conservé.
 * Réf : SPEC_ADDENDUM_260524_AO_DU_JOUR_REPORT_ET_BRIEF.md §Exigence 2.
 */
export const tenderBriefs = pgTable(
  "tender_briefs",
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
    aiRunId: uuid("ai_run_id").references(() => aiRuns.id, { onDelete: "set null" }),
    /** Texte du brief — 3-4 lignes, factuel, provenance rawData. */
    content: text("content").notNull(),
    /** false = version archivée. Seul 1 brief par tender peut avoir isActive = true. */
    isActive: boolean("is_active").notNull().default(true),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenderActiveIdx: index("idx_tender_briefs_tender_active").on(table.tenderId, table.isActive),
    orgIdx: index("idx_tender_briefs_org").on(table.organizationId),
  }),
);

export type TenderBrief = typeof tenderBriefs.$inferSelect;
export type NewTenderBrief = typeof tenderBriefs.$inferInsert;
