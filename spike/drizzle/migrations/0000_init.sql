CREATE TYPE "public"."architect_response_status" AS ENUM('pending', 'accepted', 'declined', 'info_requested');--> statement-breakpoint
CREATE TYPE "public"."subscription_tier" AS ENUM('Sourcing', 'Cotraitance', 'Studio IA');--> statement-breakpoint
CREATE TYPE "public"."tender_status" AS ENUM('sourced', 'selected_solo', 'selected_tandem', 'awaiting_architect', 'architect_accepted', 'architect_declined', 'dropped');--> statement-breakpoint
CREATE TABLE "architect_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"tender_id" uuid NOT NULL,
	"architect_id" uuid NOT NULL,
	"score" numeric(5, 2) NOT NULL,
	"rationale" text,
	"response_data" jsonb,
	"status" "architect_response_status" DEFAULT 'pending' NOT NULL,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "architects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"firstname" text NOT NULL,
	"lastname" text NOT NULL,
	"contact_info" jsonb NOT NULL,
	"specialty_codes" text[] DEFAULT '{}'::text[] NOT NULL,
	"geo_zones" text[] DEFAULT '{}'::text[] NOT NULL,
	"tutoiement" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"siren" text,
	"tier" "subscription_tier" DEFAULT 'Sourcing' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_siren_unique" UNIQUE("siren")
);
--> statement-breakpoint
CREATE TABLE "tenders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"external_ref" text NOT NULL,
	"title" text NOT NULL,
	"buyer" text NOT NULL,
	"cpv" text[] DEFAULT '{}'::text[] NOT NULL,
	"geo_zone" text,
	"amount" numeric(14, 2),
	"deadline" timestamp with time zone,
	"raw_data" jsonb,
	"score" numeric(5, 2),
	"status" "tender_status" DEFAULT 'sourced' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "architect_responses" ADD CONSTRAINT "architect_responses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "architect_responses" ADD CONSTRAINT "architect_responses_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "architect_responses" ADD CONSTRAINT "architect_responses_architect_id_architects_id_fk" FOREIGN KEY ("architect_id") REFERENCES "public"."architects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "architects" ADD CONSTRAINT "architects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_architect_responses_status_spike" ON "architect_responses" USING btree ("status","tender_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_architect_responses_tender_arch_spike" ON "architect_responses" USING btree ("tender_id","architect_id");--> statement-breakpoint
CREATE INDEX "idx_architects_org_spike" ON "architects" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_tenders_org_status_spike" ON "tenders" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_tenders_ext_ref_spike" ON "tenders" USING btree ("organization_id","external_ref");