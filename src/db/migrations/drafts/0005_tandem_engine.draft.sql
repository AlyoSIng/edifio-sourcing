-- ============================================================================
-- 0005_tandem_engine -- edifio Sourcing PR `feat/tandem-engine` etape 1
-- ----------------------------------------------------------------------------
-- *** DRAFT NADIA -- A REGENERER VIA `pnpm drizzle-kit generate` PAR YANN ***
--
-- Ce fichier est une INTENTION SQL ecrite manuellement par Nadia pour cadrer
-- la migration que drizzle-kit va produire. Le travail Yann :
--   1. `pnpm drizzle-kit generate --name=tandem_engine`
--   2. Comparer le SQL produit avec ce draft
--   3. Pour les elements que drizzle-kit ne modelise PAS (CHECK constraints,
--      colonne GENERATED, ALTER TYPE non-transactionnel), inserer le SQL
--      custom manuellement dans la migration generee
--   4. Lancer `pnpm db:dry-run -SkipPgTap` pour valider le DDL sur postgres:15
--   5. Apres validation : `pnpm db:dry-run` complet (avec pgTAP suite)
--   6. Supprimer ce draft une fois la migration officielle propre
--
-- Source de verite des changes :
--   - src/db/schema/architects.ts (refonte propre)
--   - src/db/schema/selections.ts (ajout token_id, followup_sent_at, table
--     architect_opposition_tokens)
--   - src/db/schema/integrations.ts (refonte odoo_opportunities multi-opp)
--   - src/db/schema/enums.ts (ajout audit_action 'architect_response' A16)
--
-- Decisions Board 2026-05-22 :
--   (a) Refonte propre architects (drop firstname/lastname/title/siret/...)
--   (b) Code audit A16 architect_response
--   (c) Ajout token_id + followup_sent_at sur architect_responses
--   (d) solicitable = GENERATED ALWAYS AS (email IS NOT NULL) STORED
--
-- *** Cette migration N'EST PAS encore appliquee. Le `_journal.json` reste a
-- mettre a jour APRES drizzle-kit generate (Yann). ***
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ALTER TYPE audit_action -- ajout valeur A16 (non-transactionnel)
-- ----------------------------------------------------------------------------
-- Pas dans un BEGIN/COMMIT car ALTER TYPE ADD VALUE ne peut pas etre consomme
-- dans la meme TX. Cf. migration 0004 (tender_defer/tender_reject).
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'architect_response';--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 2. Refonte propre table architects (decision (a) du 2026-05-22)
-- ----------------------------------------------------------------------------
-- Drop des colonnes heritees (firstname, lastname, title, siret, references,
-- partnership_status). Audit Grep : aucun code applicatif consommateur (juste
-- schema + seed). IF EXISTS pour idempotence.
ALTER TABLE "architects" DROP COLUMN IF EXISTS "firstname";--> statement-breakpoint
ALTER TABLE "architects" DROP COLUMN IF EXISTS "lastname";--> statement-breakpoint
ALTER TABLE "architects" DROP COLUMN IF EXISTS "title";--> statement-breakpoint
ALTER TABLE "architects" DROP COLUMN IF EXISTS "siret";--> statement-breakpoint
ALTER TABLE "architects" DROP COLUMN IF EXISTS "references";--> statement-breakpoint
ALTER TABLE "architects" DROP COLUMN IF EXISTS "partnership_status";--> statement-breakpoint

-- Drop de l'index sur siret (devenu orphelin).
DROP INDEX IF EXISTS "idx_architects_siret";--> statement-breakpoint

-- Add des colonnes Tandem cibles.
ALTER TABLE "architects" ADD COLUMN "cabinet" text NOT NULL DEFAULT 'CABINET_TBD';--> statement-breakpoint
-- NB : DEFAULT temporaire 'CABINET_TBD' pour pouvoir poser NOT NULL sur table
-- existante. En prod sur AlyoS (org unique au MVP), la table sera reseede
-- proprement via le seed + fixtures Tandem. On enleve le DEFAULT apres
-- backfill pour eviter qu'un INSERT futur sans cabinet ne passe en silence.
ALTER TABLE "architects" ALTER COLUMN "cabinet" DROP DEFAULT;--> statement-breakpoint

ALTER TABLE "architects" ADD COLUMN "contact_name" text;--> statement-breakpoint
-- email devient nullable (etait NOT NULL avant). Allow NULL pour les fiches
-- import Odoo sans email (~50 % de la base reelle, cf. spec architects §4).
ALTER TABLE "architects" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "architects" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "architects" ADD COLUMN "siren" text;--> statement-breakpoint
ALTER TABLE "architects" ADD COLUMN "zip" text;--> statement-breakpoint
ALTER TABLE "architects" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "architects" ADD COLUMN "headcount" integer;--> statement-breakpoint
ALTER TABLE "architects" ADD COLUMN "company_size" text;--> statement-breakpoint
ALTER TABLE "architects" ADD COLUMN "company_created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "architects" ADD COLUMN "odoo_external_id" text;--> statement-breakpoint
ALTER TABLE "architects" ADD CONSTRAINT "architects_odoo_external_id_unique" UNIQUE ("odoo_external_id");--> statement-breakpoint
ALTER TABLE "architects" ADD COLUMN "preferred" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "architects" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- DECISION Q4 (2026-05-22) : colonne GENERATED ALWAYS AS STORED.
-- Postgres 12+ requis (Supabase = 15+, OK).
ALTER TABLE "architects" ADD COLUMN "solicitable" boolean GENERATED ALWAYS AS (email IS NOT NULL) STORED;--> statement-breakpoint
ALTER TABLE "architects" ADD COLUMN "past_collabs_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint

-- Index Tandem
CREATE INDEX IF NOT EXISTS "idx_architects_siren" ON "architects" USING btree ("siren") WHERE "siren" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_architects_geo_zones" ON "architects" USING gin ("geo_zones");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_architects_solicitable_active" ON "architects" USING btree ("organization_id") WHERE "solicitable" = TRUE AND "active" = TRUE;--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 3. architect_responses : ajout token_id + followup_sent_at (decision (c))
-- ----------------------------------------------------------------------------
ALTER TABLE "architect_responses" ADD COLUMN "token_id" uuid;--> statement-breakpoint
ALTER TABLE "architect_responses" ADD CONSTRAINT "architect_responses_token_id_architect_tokens_id_fk"
  FOREIGN KEY ("token_id") REFERENCES "public"."architect_tokens"("id") ON DELETE SET NULL ON UPDATE NO ACTION;--> statement-breakpoint
ALTER TABLE "architect_responses" ADD COLUMN "followup_sent_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_architect_responses_pending_no_followup"
  ON "architect_responses" USING btree ("tender_id")
  WHERE "status" = 'pending' AND "followup_sent_at" IS NULL;--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 4. odoo_opportunities : refonte multi-opp Solo/Tandem
-- ----------------------------------------------------------------------------
-- Drop UNIQUE(tender_id) -- etait valide Solo-only, casse en Tandem.
ALTER TABLE "odoo_opportunities" DROP CONSTRAINT IF EXISTS "odoo_opportunities_tender_id_unique";--> statement-breakpoint
-- Add architect_id (nullable, FK SET NULL)
ALTER TABLE "odoo_opportunities" ADD COLUMN "architect_id" uuid;--> statement-breakpoint
ALTER TABLE "odoo_opportunities" ADD CONSTRAINT "odoo_opportunities_architect_id_architects_id_fk"
  FOREIGN KEY ("architect_id") REFERENCES "public"."architects"("id") ON DELETE SET NULL ON UPDATE NO ACTION;--> statement-breakpoint
-- Add origin avec CHECK constraint
ALTER TABLE "odoo_opportunities" ADD COLUMN "origin" text NOT NULL DEFAULT 'solo';--> statement-breakpoint
ALTER TABLE "odoo_opportunities" ALTER COLUMN "origin" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "odoo_opportunities" ADD CONSTRAINT "odoo_opportunities_origin_check"
  CHECK ("origin" IN ('solo', 'tandem'));--> statement-breakpoint
-- Add last_error
ALTER TABLE "odoo_opportunities" ADD COLUMN "last_error" text;--> statement-breakpoint
-- Index partiels UNIQUE
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_opp_solo"
  ON "odoo_opportunities" USING btree ("tender_id")
  WHERE "architect_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_opp_tandem"
  ON "odoo_opportunities" USING btree ("tender_id", "architect_id")
  WHERE "architect_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_odoo_opportunities_tender" ON "odoo_opportunities" USING btree ("tender_id");--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 5. NEW table architect_opposition_tokens
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "architect_opposition_tokens" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
  "architect_id" uuid NOT NULL,
  "organization_id" uuid NOT NULL,
  "jti" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  CONSTRAINT "architect_opposition_tokens_jti_unique" UNIQUE("jti")
);--> statement-breakpoint
ALTER TABLE "architect_opposition_tokens"
  ADD CONSTRAINT "architect_opposition_tokens_architect_id_architects_id_fk"
  FOREIGN KEY ("architect_id") REFERENCES "public"."architects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;--> statement-breakpoint
ALTER TABLE "architect_opposition_tokens"
  ADD CONSTRAINT "architect_opposition_tokens_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_architect_opposition_tokens_architect"
  ON "architect_opposition_tokens" USING btree ("architect_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_architect_opposition_tokens_active"
  ON "architect_opposition_tokens" USING btree ("jti")
  WHERE "used_at" IS NULL;--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- FIN DRAFT 0005_tandem_engine
-- ----------------------------------------------------------------------------
-- La RLS de la nouvelle table architect_opposition_tokens est posee dans la
-- migration custom suivante : 0006_tandem_rls.draft.sql (separation propre
-- DDL / RLS comme pour 0001/0002).
