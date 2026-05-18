CREATE TYPE "public"."ai_model" AS ENUM('sonnet-4-6', 'haiku-4-5');--> statement-breakpoint
CREATE TYPE "public"."architect_response_status" AS ENUM('pending', 'accepted', 'declined', 'info_requested');--> statement-breakpoint
CREATE TYPE "public"."audit_action" AS ENUM('login', 'membership_change', 'search_profile_change', 'tender_select', 'architect_solicit', 'dossier_diffuse', 'ai_run', 'odoo_opportunity_create', 'architect_change', 'rgpd_export', 'token_revoke', 'data_delete', 'access_attempt');--> statement-breakpoint
CREATE TYPE "public"."auth_type" AS ENUM('api_key', 'oauth', 'login_password', 'none');--> statement-breakpoint
CREATE TYPE "public"."brevo_register" AS ENUM('tu', 'vous', 'neutre');--> statement-breakpoint
CREATE TYPE "public"."learning_event_type" AS ENUM('selected', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM('admin', 'user', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."partnership_status" AS ENUM('actif', 'inactif', 'prospect');--> statement-breakpoint
CREATE TYPE "public"."platform_code" AS ENUM('boamp', 'place', 'francmarches', 'mp_info');--> statement-breakpoint
CREATE TYPE "public"."selection_mode" AS ENUM('solo', 'tandem');--> statement-breakpoint
CREATE TYPE "public"."tender_status" AS ENUM('sourced', 'selected_solo', 'selected_tandem', 'awaiting_architect', 'architect_accepted', 'architect_declined', 'architect_info_requested', 'dossier_review_required', 'dossier_ready', 'dossier_diffused', 'submitted', 'won', 'lost', 'dropped');--> statement-breakpoint
CREATE TABLE "ai_prompts" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"name" text NOT NULL,
	"version" integer NOT NULL,
	"model" "ai_model" NOT NULL,
	"system_prompt" text NOT NULL,
	"user_prompt_template" text NOT NULL,
	"output_schema_zod" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_prompts_name_version_key" UNIQUE("name","version")
);
--> statement-breakpoint
CREATE TABLE "ai_runs" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"organization_id" uuid NOT NULL,
	"prompt_id" uuid NOT NULL,
	"tender_id" uuid,
	"input_hash" text NOT NULL,
	"output" jsonb,
	"cost_usd" numeric(8, 4),
	"latency_ms" integer,
	"model" "ai_model" NOT NULL,
	"succeeded" boolean DEFAULT true NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "architect_specialties" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"code" text NOT NULL,
	"label_fr" text NOT NULL,
	CONSTRAINT "architect_specialties_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "architects" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"organization_id" uuid NOT NULL,
	"firstname" text NOT NULL,
	"lastname" text NOT NULL,
	"title" text,
	"email" text NOT NULL,
	"phone" text,
	"siret" text,
	"specialty_codes" text[] DEFAULT '{}' NOT NULL,
	"geo_zones" text[] DEFAULT '{}' NOT NULL,
	"references" text,
	"partnership_status" "partnership_status" DEFAULT 'prospect' NOT NULL,
	"notes" text,
	"tutoiement" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "architects_organization_id_email_key" UNIQUE("organization_id","email")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"organization_id" uuid,
	"actor_id" uuid,
	"actor_email" text,
	"actor_role" "membership_role",
	"action" "audit_action" NOT NULL,
	"subject_type" text,
	"subject_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" "inet",
	"user_agent" text,
	"data" jsonb
);
--> statement-breakpoint
CREATE TABLE "learning_events" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"tender_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid,
	"event_type" "learning_event_type" NOT NULL,
	"motif_category" text,
	"verbatim" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_credentials" (
	"organization_id" uuid NOT NULL,
	"platform_id" uuid NOT NULL,
	"credentials_vault_ref" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_validated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_credentials_organization_id_platform_id_pk" PRIMARY KEY("organization_id","platform_id")
);
--> statement-breakpoint
CREATE TABLE "platforms" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"code" "platform_code" NOT NULL,
	"display_name" text NOT NULL,
	"auth_type" "auth_type" NOT NULL,
	"base_url" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "platforms_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "search_profiles" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"keywords" jsonb DEFAULT '{"positive":[],"negative":[],"exact":[]}'::jsonb NOT NULL,
	"cpv_codes" text[] DEFAULT '{}' NOT NULL,
	"geo_zones" text[] DEFAULT '{}' NOT NULL,
	"market_types" text[] DEFAULT '{}' NOT NULL,
	"amount_min" numeric(14, 2),
	"amount_max" numeric(14, 2),
	"active" boolean DEFAULT true NOT NULL,
	"cron_time" time DEFAULT '06:30' NOT NULL,
	"cron_days" integer[] DEFAULT '{1,2,3,4,5}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"name" text NOT NULL,
	"siren" text,
	"odoo_config" jsonb,
	"subscription_tier" "subscription_tier" DEFAULT 'studio' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_siren_unique" UNIQUE("siren")
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "membership_role" DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_organization_id_user_id_pk" PRIMARY KEY("organization_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"firstname" text,
	"lastname" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "tender_documents" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"tender_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"format" text,
	"storage_path" text NOT NULL,
	"size_bytes" bigint,
	"analyzed" boolean DEFAULT false NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tender_events" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"tender_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"actor_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data" jsonb
);
--> statement-breakpoint
CREATE TABLE "tender_lots" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"tender_id" uuid NOT NULL,
	"lot_number" integer NOT NULL,
	"description" text,
	"amount" numeric(14, 2),
	CONSTRAINT "tender_lots_tender_id_lot_number_key" UNIQUE("tender_id","lot_number")
);
--> statement-breakpoint
CREATE TABLE "tenders" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"organization_id" uuid NOT NULL,
	"external_ref" text NOT NULL,
	"platform_id" uuid NOT NULL,
	"title" text NOT NULL,
	"buyer" text NOT NULL,
	"cpv" text[] DEFAULT '{}' NOT NULL,
	"amount" numeric(14, 2),
	"deadline" timestamp with time zone,
	"questions_deadline" timestamp with time zone,
	"visit_date" timestamp with time zone,
	"dce_url" text,
	"source_url" text,
	"raw_data" jsonb,
	"score" numeric(5, 2),
	"status" "tender_status" DEFAULT 'sourced' NOT NULL,
	"matching_profile_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenders_organization_id_external_ref_platform_id_key" UNIQUE("organization_id","external_ref","platform_id"),
	CONSTRAINT "tenders_score_check" CHECK ("tenders"."score" >= 0 AND "tenders"."score" <= 100)
);
--> statement-breakpoint
CREATE TABLE "architect_responses" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"tender_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"architect_id" uuid NOT NULL,
	"status" "architect_response_status" DEFAULT 'pending' NOT NULL,
	"responded_at" timestamp with time zone,
	"info_request_text" text,
	CONSTRAINT "architect_responses_tender_id_architect_id_key" UNIQUE("tender_id","architect_id")
);
--> statement-breakpoint
CREATE TABLE "architect_tokens" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"tender_id" uuid NOT NULL,
	"architect_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"jwt_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "architect_tokens_jwt_id_unique" UNIQUE("jwt_id")
);
--> statement-breakpoint
CREATE TABLE "match_proposals" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"tender_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"architect_id" uuid NOT NULL,
	"score" numeric(5, 2) NOT NULL,
	"rank" integer NOT NULL,
	"rationale" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_proposals_tender_id_architect_id_key" UNIQUE("tender_id","architect_id")
);
--> statement-breakpoint
CREATE TABLE "selections" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"tender_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"mode" "selection_mode" NOT NULL,
	"selected_by" uuid NOT NULL,
	"selected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "selections_tender_id_unique" UNIQUE("tender_id")
);
--> statement-breakpoint
CREATE TABLE "presentation_library" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"storage_path" text NOT NULL,
	"size_bytes" bigint,
	"valid_until" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "response_files" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"tender_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"storage_path" text NOT NULL,
	"size_bytes" bigint,
	"validated" boolean DEFAULT false NOT NULL,
	"validated_by" uuid,
	"validated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brevo_messages" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"tender_id" uuid,
	"architect_id" uuid,
	"organization_id" uuid NOT NULL,
	"template_name" text NOT NULL,
	"register" "brevo_register" NOT NULL,
	"brevo_message_id" text,
	"sent_at" timestamp with time zone,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"notification_type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"payload" jsonb,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "odoo_opportunities" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"tender_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"odoo_id" integer NOT NULL,
	"odoo_stage" text,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "odoo_opportunities_tender_id_unique" UNIQUE("tender_id")
);
--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_prompt_id_ai_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."ai_prompts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "architects" ADD CONSTRAINT "architects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_events" ADD CONSTRAINT "learning_events_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_events" ADD CONSTRAINT "learning_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_events" ADD CONSTRAINT "learning_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_credentials" ADD CONSTRAINT "platform_credentials_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_credentials" ADD CONSTRAINT "platform_credentials_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."platforms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_profiles" ADD CONSTRAINT "search_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_documents" ADD CONSTRAINT "tender_documents_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_documents" ADD CONSTRAINT "tender_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_events" ADD CONSTRAINT "tender_events_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_events" ADD CONSTRAINT "tender_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_events" ADD CONSTRAINT "tender_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_lots" ADD CONSTRAINT "tender_lots_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."platforms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_matching_profile_id_search_profiles_id_fk" FOREIGN KEY ("matching_profile_id") REFERENCES "public"."search_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "architect_responses" ADD CONSTRAINT "architect_responses_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "architect_responses" ADD CONSTRAINT "architect_responses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "architect_responses" ADD CONSTRAINT "architect_responses_architect_id_architects_id_fk" FOREIGN KEY ("architect_id") REFERENCES "public"."architects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "architect_tokens" ADD CONSTRAINT "architect_tokens_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "architect_tokens" ADD CONSTRAINT "architect_tokens_architect_id_architects_id_fk" FOREIGN KEY ("architect_id") REFERENCES "public"."architects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "architect_tokens" ADD CONSTRAINT "architect_tokens_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "architect_tokens" ADD CONSTRAINT "architect_tokens_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_proposals" ADD CONSTRAINT "match_proposals_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_proposals" ADD CONSTRAINT "match_proposals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_proposals" ADD CONSTRAINT "match_proposals_architect_id_architects_id_fk" FOREIGN KEY ("architect_id") REFERENCES "public"."architects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "selections" ADD CONSTRAINT "selections_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "selections" ADD CONSTRAINT "selections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "selections" ADD CONSTRAINT "selections_selected_by_users_id_fk" FOREIGN KEY ("selected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentation_library" ADD CONSTRAINT "presentation_library_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_files" ADD CONSTRAINT "response_files_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_files" ADD CONSTRAINT "response_files_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_files" ADD CONSTRAINT "response_files_validated_by_users_id_fk" FOREIGN KEY ("validated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brevo_messages" ADD CONSTRAINT "brevo_messages_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brevo_messages" ADD CONSTRAINT "brevo_messages_architect_id_architects_id_fk" FOREIGN KEY ("architect_id") REFERENCES "public"."architects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brevo_messages" ADD CONSTRAINT "brevo_messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "odoo_opportunities" ADD CONSTRAINT "odoo_opportunities_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "odoo_opportunities" ADD CONSTRAINT "odoo_opportunities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ai_prompts_active" ON "ai_prompts" USING btree ("name") WHERE active;--> statement-breakpoint
CREATE INDEX "idx_ai_runs_org_date" ON "ai_runs" USING btree ("organization_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_ai_runs_tender" ON "ai_runs" USING btree ("tender_id") WHERE "ai_runs"."tender_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_architects_org" ON "architects" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_architects_siret" ON "architects" USING btree ("siret") WHERE "architects"."siret" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_architects_specialties" ON "architects" USING gin ("specialty_codes");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_org_date" ON "audit_logs" USING btree ("organization_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_audit_logs_actor" ON "audit_logs" USING btree ("actor_id") WHERE "audit_logs"."actor_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_audit_logs_action" ON "audit_logs" USING btree ("action","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_learning_events_org_date" ON "learning_events" USING btree ("organization_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_search_profiles_org" ON "search_profiles" USING btree ("organization_id") WHERE active;--> statement-breakpoint
CREATE INDEX "idx_organizations_tier" ON "organizations" USING btree ("subscription_tier");--> statement-breakpoint
CREATE INDEX "idx_memberships_user" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_tender_documents_tender" ON "tender_documents" USING btree ("tender_id");--> statement-breakpoint
CREATE INDEX "idx_tender_events_tender" ON "tender_events" USING btree ("tender_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_tenders_org_status" ON "tenders" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "idx_tenders_deadline" ON "tenders" USING btree ("deadline") WHERE "tenders"."deadline" > now();--> statement-breakpoint
CREATE INDEX "idx_tenders_title_trgm" ON "tenders" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_tenders_score" ON "tenders" USING btree ("organization_id","score" DESC NULLS LAST) WHERE "tenders"."status" = 'sourced';--> statement-breakpoint
CREATE INDEX "idx_architect_responses_status" ON "architect_responses" USING btree ("status","tender_id");--> statement-breakpoint
CREATE INDEX "idx_architect_tokens_active" ON "architect_tokens" USING btree ("jwt_id") WHERE "architect_tokens"."revoked" = FALSE;--> statement-breakpoint
CREATE INDEX "idx_match_proposals_tender" ON "match_proposals" USING btree ("tender_id","rank");--> statement-breakpoint
CREATE INDEX "idx_presentation_library_org_kind" ON "presentation_library" USING btree ("organization_id","kind");--> statement-breakpoint
CREATE INDEX "idx_presentation_library_expiry" ON "presentation_library" USING btree ("valid_until") WHERE "presentation_library"."valid_until" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_response_files_tender" ON "response_files" USING btree ("tender_id");--> statement-breakpoint
CREATE INDEX "idx_brevo_messages_tender" ON "brevo_messages" USING btree ("tender_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_user_unread" ON "notifications" USING btree ("user_id","created_at" DESC NULLS LAST) WHERE "notifications"."read_at" IS NULL;