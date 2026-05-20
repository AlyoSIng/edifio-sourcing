/**
 * Tables ai_prompts + ai_runs — IA Claude (Sonnet + Haiku).
 *
 * Source de vérité : `specs/schema_v1.sql` §7 + `specs/ai_prompts_v1.md`.
 *
 * Gate 5 directive : prompts versionnés en BDD, JAMAIS en dur dans le code.
 * Tout `ai_run` référence la version exacte du prompt utilisée pour
 * traçabilité (notamment lorsque le prompt est dépublié — la version reste).
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
