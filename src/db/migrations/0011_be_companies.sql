-- ============================================================================
-- 0011_be_companies -- Nouvelles tables bureaux_etudes et companies
--
-- Ajout de deux tables pour les contacts professionnels edifio Sourcing :
--
--   bureaux_etudes : annuaire des bureaux d'etudes techniques (BET) partenaires.
--     Meme structure que architects : tenant, email clé de solicitabilite,
--     specialtyCodes (BE_SPECIALTY_CODES), geoZones, RGPD, tutoiement, budget.
--     Contrainte UNIQUE (organization_id, email). Colonne derivee solicitable.
--
--   companies : annuaire des entreprises du batiment (CR / TCE / majors BTP).
--     Pas de tutoiement ni concoursOnly. SIREN = cle de deduplication (index
--     partiel). Pas de solicitable derivee (email non obligatoire, pas de flux
--     Tandem prevu au MVP).
--
-- RLS : les deux tables suivent le meme pattern que architects (a appliquer
-- dans une migration RLS separee si necessaire — meme politique organization_id).
-- ============================================================================

CREATE TABLE "bureaux_etudes" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"organization_id" uuid NOT NULL,
	"cabinet" text NOT NULL,
	"contact_name" text,
	"email" text,
	"phone" text,
	"website" text,
	"siren" text,
	"zip" text,
	"city" text,
	"headcount" integer,
	"company_size" text,
	"odoo_external_id" text,
	"specialty_codes" text[] DEFAULT '{}' NOT NULL,
	"geo_zones" text[] DEFAULT '{}' NOT NULL,
	"budget_min" integer,
	"budget_max" integer,
	"concours_only" boolean DEFAULT false NOT NULL,
	"tutoiement" boolean DEFAULT false NOT NULL,
	"preferred" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"solicitable" boolean GENERATED ALWAYS AS (email IS NOT NULL) STORED,
	"past_collabs_count" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rgpd_opposition" boolean DEFAULT false NOT NULL,
	"rgpd_opposition_date" timestamp with time zone,
	CONSTRAINT "bureaux_etudes_organization_id_email_key" UNIQUE("organization_id","email"),
	CONSTRAINT "bureaux_etudes_odoo_external_id_unique" UNIQUE("odoo_external_id")
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"contact_name" text,
	"email" text,
	"phone" text,
	"website" text,
	"siren" text,
	"zip" text,
	"city" text,
	"headcount" integer,
	"company_size" text,
	"specialty_codes" text[] DEFAULT '{}' NOT NULL,
	"geo_zones" text[] DEFAULT '{}' NOT NULL,
	"budget_min" integer,
	"budget_max" integer,
	"preferred" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rgpd_opposition" boolean DEFAULT false NOT NULL,
	"rgpd_opposition_date" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "bureaux_etudes" ADD CONSTRAINT "bureaux_etudes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_be_org" ON "bureaux_etudes" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_be_siren" ON "bureaux_etudes" USING btree ("siren") WHERE "siren" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_be_specialties" ON "bureaux_etudes" USING gin ("specialty_codes");--> statement-breakpoint
CREATE INDEX "idx_be_geo_zones" ON "bureaux_etudes" USING gin ("geo_zones");--> statement-breakpoint
CREATE INDEX "idx_be_solicitable_active" ON "bureaux_etudes" USING btree ("organization_id") WHERE "solicitable" = TRUE AND "active" = TRUE;--> statement-breakpoint
CREATE INDEX "idx_companies_org" ON "companies" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_companies_siren" ON "companies" USING btree ("siren") WHERE "siren" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_companies_specialties" ON "companies" USING gin ("specialty_codes");--> statement-breakpoint
CREATE INDEX "idx_companies_geo_zones" ON "companies" USING gin ("geo_zones");--> statement-breakpoint
CREATE INDEX "idx_companies_active_org" ON "companies" USING btree ("organization_id") WHERE "active" = TRUE;
