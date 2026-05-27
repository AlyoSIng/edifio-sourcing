-- ============================================================================
-- MIGRATIONS CONSOLIDÉES 0007 → 0011 — edifio Sourcing
-- À appliquer dans Supabase SQL Editor (Primary Database, rôle postgres)
--
-- ⚠️  IMPORTANT : les ALTER TYPE ... ADD VALUE ne peuvent PAS tourner dans
--     une transaction. Dans le SQL Editor Supabase, désactive l'option
--     "Run as single transaction" si elle est cochée, OU colle d'abord
--     le bloc "ÉTAPE 0" seul, puis le reste en une fois.
--
-- Toutes les instructions sont idempotentes (IF NOT EXISTS / IF EXISTS).
-- ============================================================================


-- ============================================================================
-- ÉTAPE 0 — Nouveaux enum values (HORS TRANSACTION — à coller séparément
--           si le SQL Editor encapsule tout dans BEGIN/COMMIT)
-- ============================================================================

ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'architect_edit';
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'architect_import';
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'architect_export';


-- ============================================================================
-- ÉTAPE 1 — Migration 0007 : colonnes RGPD sur architects
-- ============================================================================

ALTER TABLE "architects"
  ADD COLUMN IF NOT EXISTS "rgpd_opposition"      boolean DEFAULT false NOT NULL;

ALTER TABLE "architects"
  ADD COLUMN IF NOT EXISTS "rgpd_opposition_date"  timestamp with time zone;


-- ============================================================================
-- ÉTAPE 2 — Migration 0008 : tables message_templates + organization_profiles
-- ============================================================================

CREATE TABLE IF NOT EXISTS "message_templates" (
  "id"              uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
  "organization_id" uuid NOT NULL,
  "key"             text NOT NULL,
  "channel"         text NOT NULL,
  "subject"         text NOT NULL,
  "body"            text NOT NULL,
  "updated_by"      uuid,
  "updated_at"      timestamp with time zone DEFAULT now() NOT NULL,
  "version"         integer DEFAULT 1 NOT NULL,
  "created_at"      timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "message_templates_organization_id_key_key" UNIQUE ("organization_id", "key")
);

CREATE TABLE IF NOT EXISTS "organization_profiles" (
  "id"                 uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
  "organization_id"    uuid NOT NULL,
  "presentation_block" text DEFAULT '' NOT NULL,
  "commercial_name"    text DEFAULT '' NOT NULL,
  "email_signature"    text DEFAULT '' NOT NULL,
  "agency_details"     text DEFAULT '' NOT NULL,
  "phone"              text DEFAULT '' NOT NULL,
  "contact_email"      text DEFAULT '' NOT NULL,
  "logo_url"           text,
  "updated_by"         uuid,
  "updated_at"         timestamp with time zone DEFAULT now() NOT NULL,
  "created_at"         timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "organization_profiles_organization_id_unique" UNIQUE ("organization_id")
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'message_templates_organization_id_organizations_id_fk'
  ) THEN
    ALTER TABLE "message_templates"
      ADD CONSTRAINT "message_templates_organization_id_organizations_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'message_templates_updated_by_users_id_fk'
  ) THEN
    ALTER TABLE "message_templates"
      ADD CONSTRAINT "message_templates_updated_by_users_id_fk"
      FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organization_profiles_organization_id_organizations_id_fk'
  ) THEN
    ALTER TABLE "organization_profiles"
      ADD CONSTRAINT "organization_profiles_organization_id_organizations_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organization_profiles_updated_by_users_id_fk'
  ) THEN
    ALTER TABLE "organization_profiles"
      ADD CONSTRAINT "organization_profiles_updated_by_users_id_fk"
      FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_message_templates_org"     ON "message_templates" ("organization_id");
CREATE INDEX IF NOT EXISTS "idx_message_templates_channel" ON "message_templates" ("channel");


-- ============================================================================
-- ÉTAPE 3 — Migration 0009 : RLS message_templates + organization_profiles
-- ============================================================================

ALTER TABLE "message_templates"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "message_templates"    FORCE ROW LEVEL SECURITY;
ALTER TABLE "organization_profiles" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'message_templates' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY "tenant_isolation" ON "message_templates"
      USING (organization_id = current_organization_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'organization_profiles' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY "tenant_isolation" ON "organization_profiles"
      USING (organization_id = current_organization_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'message_templates' AND policyname = 'admin_write') THEN
    CREATE POLICY "admin_write" ON "message_templates" AS RESTRICTIVE
      FOR INSERT WITH CHECK (
        organization_id = current_organization_id()
        AND current_user_role() = 'admin'
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'organization_profiles' AND policyname = 'admin_write') THEN
    CREATE POLICY "admin_write" ON "organization_profiles" AS RESTRICTIVE
      FOR INSERT WITH CHECK (
        organization_id = current_organization_id()
        AND current_user_role() = 'admin'
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'message_templates' AND policyname = 'admin_update') THEN
    CREATE POLICY "admin_update" ON "message_templates" AS RESTRICTIVE
      FOR UPDATE
      USING  (organization_id = current_organization_id() AND current_user_role() = 'admin')
      WITH CHECK (organization_id = current_organization_id() AND current_user_role() = 'admin');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'organization_profiles' AND policyname = 'admin_update') THEN
    CREATE POLICY "admin_update" ON "organization_profiles" AS RESTRICTIVE
      FOR UPDATE
      USING  (organization_id = current_organization_id() AND current_user_role() = 'admin')
      WITH CHECK (organization_id = current_organization_id() AND current_user_role() = 'admin');
  END IF;
END $$;

DROP TRIGGER IF EXISTS "touch_message_templates"    ON "message_templates";
CREATE TRIGGER "touch_message_templates"
  BEFORE UPDATE ON "message_templates"
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS "touch_organization_profiles" ON "organization_profiles";
CREATE TRIGGER "touch_organization_profiles"
  BEFORE UPDATE ON "organization_profiles"
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();


-- ============================================================================
-- ÉTAPE 4 — Migration 0010 : budget_min / budget_max / concours_only (architects)
-- ← DÉBLOQUE LA SHORTLIST ARCHITECTES
-- ============================================================================

ALTER TABLE "architects" ADD COLUMN IF NOT EXISTS "budget_min"     integer;
ALTER TABLE "architects" ADD COLUMN IF NOT EXISTS "budget_max"     integer;
ALTER TABLE "architects" ADD COLUMN IF NOT EXISTS "concours_only"  boolean DEFAULT false NOT NULL;


-- ============================================================================
-- ÉTAPE 5 — Migration 0011 : tables bureaux_etudes + companies
-- ============================================================================

CREATE TABLE IF NOT EXISTS "bureaux_etudes" (
  "id"               uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
  "organization_id"  uuid NOT NULL,
  "cabinet"          text NOT NULL,
  "contact_name"     text,
  "email"            text,
  "phone"            text,
  "website"          text,
  "siren"            text,
  "zip"              text,
  "city"             text,
  "headcount"        integer,
  "company_size"     text,
  "odoo_external_id" text,
  "specialty_codes"  text[] DEFAULT '{}' NOT NULL,
  "geo_zones"        text[] DEFAULT '{}' NOT NULL,
  "budget_min"       integer,
  "budget_max"       integer,
  "concours_only"    boolean DEFAULT false NOT NULL,
  "tutoiement"       boolean DEFAULT false NOT NULL,
  "preferred"        boolean DEFAULT false NOT NULL,
  "active"           boolean DEFAULT true NOT NULL,
  "solicitable"      boolean GENERATED ALWAYS AS (email IS NOT NULL) STORED,
  "past_collabs_count" integer DEFAULT 0 NOT NULL,
  "notes"            text,
  "created_at"       timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"       timestamp with time zone DEFAULT now() NOT NULL,
  "rgpd_opposition"       boolean DEFAULT false NOT NULL,
  "rgpd_opposition_date"  timestamp with time zone,
  CONSTRAINT "bureaux_etudes_organization_id_email_key" UNIQUE ("organization_id", "email"),
  CONSTRAINT "bureaux_etudes_odoo_external_id_unique"   UNIQUE ("odoo_external_id")
);

CREATE TABLE IF NOT EXISTS "companies" (
  "id"              uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
  "organization_id" uuid NOT NULL,
  "name"            text NOT NULL,
  "contact_name"    text,
  "email"           text,
  "phone"           text,
  "website"         text,
  "siren"           text,
  "zip"             text,
  "city"            text,
  "headcount"       integer,
  "company_size"    text,
  "specialty_codes" text[] DEFAULT '{}' NOT NULL,
  "geo_zones"       text[] DEFAULT '{}' NOT NULL,
  "budget_min"      integer,
  "budget_max"      integer,
  "preferred"       boolean DEFAULT false NOT NULL,
  "active"          boolean DEFAULT true NOT NULL,
  "notes"           text,
  "created_at"      timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"      timestamp with time zone DEFAULT now() NOT NULL,
  "rgpd_opposition"       boolean DEFAULT false NOT NULL,
  "rgpd_opposition_date"  timestamp with time zone
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bureaux_etudes_organization_id_fkey') THEN
    ALTER TABLE "bureaux_etudes"
      ADD CONSTRAINT "bureaux_etudes_organization_id_fkey"
      FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_organization_id_fkey') THEN
    ALTER TABLE "companies"
      ADD CONSTRAINT "companies_organization_id_fkey"
      FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_be_org"              ON "bureaux_etudes" ("organization_id");
CREATE INDEX IF NOT EXISTS "idx_be_siren"            ON "bureaux_etudes" ("siren") WHERE "siren" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_be_specialties"      ON "bureaux_etudes" USING gin ("specialty_codes");
CREATE INDEX IF NOT EXISTS "idx_be_geo_zones"        ON "bureaux_etudes" USING gin ("geo_zones");
CREATE INDEX IF NOT EXISTS "idx_be_solicitable_active" ON "bureaux_etudes" ("organization_id")
  WHERE "solicitable" = TRUE AND "active" = TRUE;

CREATE INDEX IF NOT EXISTS "idx_companies_org"         ON "companies" ("organization_id");
CREATE INDEX IF NOT EXISTS "idx_companies_siren"       ON "companies" ("siren") WHERE "siren" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_companies_specialties" ON "companies" USING gin ("specialty_codes");
CREATE INDEX IF NOT EXISTS "idx_companies_geo_zones"   ON "companies" USING gin ("geo_zones");
CREATE INDEX IF NOT EXISTS "idx_companies_active_org"  ON "companies" ("organization_id") WHERE "active" = TRUE;


-- ============================================================================
-- FIN — si tout passe sans erreur, la shortlist architectes est débloquée.
-- ============================================================================
