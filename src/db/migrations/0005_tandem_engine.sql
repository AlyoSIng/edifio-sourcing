ALTER TYPE "public"."audit_action" ADD VALUE 'architect_response';--> statement-breakpoint
CREATE TABLE "architect_opposition_tokens" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"architect_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"jti" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	CONSTRAINT "architect_opposition_tokens_jti_unique" UNIQUE("jti")
);
--> statement-breakpoint
ALTER TABLE "odoo_opportunities" DROP CONSTRAINT "odoo_opportunities_tender_id_unique";--> statement-breakpoint
DROP INDEX "idx_architects_siret";--> statement-breakpoint
ALTER TABLE "architects" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "architects" ADD COLUMN "cabinet" text NOT NULL;--> statement-breakpoint
ALTER TABLE "architects" ADD COLUMN "contact_name" text;--> statement-breakpoint
ALTER TABLE "architects" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "architects" ADD COLUMN "siren" text;--> statement-breakpoint
ALTER TABLE "architects" ADD COLUMN "zip" text;--> statement-breakpoint
ALTER TABLE "architects" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "architects" ADD COLUMN "headcount" integer;--> statement-breakpoint
ALTER TABLE "architects" ADD COLUMN "company_size" text;--> statement-breakpoint
ALTER TABLE "architects" ADD COLUMN "company_created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "architects" ADD COLUMN "odoo_external_id" text;--> statement-breakpoint
ALTER TABLE "architects" ADD COLUMN "preferred" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "architects" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "architects" ADD COLUMN "solicitable" boolean GENERATED ALWAYS AS ((email IS NOT NULL)) STORED;--> statement-breakpoint
ALTER TABLE "architects" ADD COLUMN "past_collabs_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "architect_responses" ADD COLUMN "token_id" uuid;--> statement-breakpoint
ALTER TABLE "architect_responses" ADD COLUMN "followup_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "odoo_opportunities" ADD COLUMN "architect_id" uuid;--> statement-breakpoint
ALTER TABLE "odoo_opportunities" ADD COLUMN "origin" text NOT NULL;--> statement-breakpoint
ALTER TABLE "odoo_opportunities" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "architect_opposition_tokens" ADD CONSTRAINT "architect_opposition_tokens_architect_id_architects_id_fk" FOREIGN KEY ("architect_id") REFERENCES "public"."architects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "architect_opposition_tokens" ADD CONSTRAINT "architect_opposition_tokens_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_architect_opposition_tokens_architect" ON "architect_opposition_tokens" USING btree ("architect_id");--> statement-breakpoint
CREATE INDEX "idx_architect_opposition_tokens_active" ON "architect_opposition_tokens" USING btree ("jti") WHERE "architect_opposition_tokens"."used_at" IS NULL;--> statement-breakpoint
ALTER TABLE "architect_responses" ADD CONSTRAINT "architect_responses_token_id_architect_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."architect_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "odoo_opportunities" ADD CONSTRAINT "odoo_opportunities_architect_id_architects_id_fk" FOREIGN KEY ("architect_id") REFERENCES "public"."architects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_architects_siren" ON "architects" USING btree ("siren") WHERE "architects"."siren" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_architects_geo_zones" ON "architects" USING gin ("geo_zones");--> statement-breakpoint
CREATE INDEX "idx_architects_solicitable_active" ON "architects" USING btree ("organization_id") WHERE "architects"."solicitable" = TRUE AND "architects"."active" = TRUE;--> statement-breakpoint
CREATE INDEX "idx_architect_responses_pending_no_followup" ON "architect_responses" USING btree ("tender_id") WHERE "architect_responses"."status" = 'pending' AND "architect_responses"."followup_sent_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_opp_solo" ON "odoo_opportunities" USING btree ("tender_id") WHERE "odoo_opportunities"."architect_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_opp_tandem" ON "odoo_opportunities" USING btree ("tender_id","architect_id") WHERE "odoo_opportunities"."architect_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_odoo_opportunities_tender" ON "odoo_opportunities" USING btree ("tender_id");--> statement-breakpoint
ALTER TABLE "architects" DROP COLUMN "firstname";--> statement-breakpoint
ALTER TABLE "architects" DROP COLUMN "lastname";--> statement-breakpoint
ALTER TABLE "architects" DROP COLUMN "title";--> statement-breakpoint
ALTER TABLE "architects" DROP COLUMN "siret";--> statement-breakpoint
ALTER TABLE "architects" DROP COLUMN "references";--> statement-breakpoint
ALTER TABLE "architects" DROP COLUMN "partnership_status";--> statement-breakpoint
ALTER TABLE "architects" ADD CONSTRAINT "architects_odoo_external_id_unique" UNIQUE("odoo_external_id");--> statement-breakpoint
ALTER TABLE "odoo_opportunities" ADD CONSTRAINT "odoo_opportunities_origin_check" CHECK ("odoo_opportunities"."origin" IN ('solo', 'tandem'));