ALTER TYPE "public"."audit_action" ADD VALUE 'architect_edit';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'architect_import';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'architect_export';--> statement-breakpoint
ALTER TABLE "architects" ADD COLUMN "rgpd_opposition" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "architects" ADD COLUMN "rgpd_opposition_date" timestamp with time zone;