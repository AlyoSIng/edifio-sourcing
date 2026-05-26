-- Migration 0015 — bibliothèque cotraitants
-- (cotraitants + tender_cotraitants + cotraitant_documents)
--
-- Trois tables :
--   - cotraitants          : annuaire global réutilisable d'un AO à l'autre
--   - tender_cotraitants   : association AO ↔ cotraitant (1 cotraitant par AO MVP)
--   - cotraitant_documents : pièces liées à un cotraitant, optionnellement à un AO
--
-- IMPORTANT (ops) : avant la 1re utilisation, créer le bucket Storage
-- "cotraitant-docs" (private) dans le dashboard Supabase :
--   Storage → New Bucket → Nom : "cotraitant-docs" → Private.

CREATE TABLE "cotraitants" (
  "id"               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "organization_id"  uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "cabinet"          text NOT NULL,
  "contact_name"     text,
  "email"            text,
  "phone"            text,
  "siret"            text,
  "zip"              text,
  "city"             text,
  "notes"            text,
  "active"           boolean NOT NULL DEFAULT true,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"       timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "idx_cotraitants_org" ON "cotraitants" ("organization_id");
--> statement-breakpoint
-- Contrainte unique partielle : email unique par organisation, seulement si email IS NOT NULL
CREATE UNIQUE INDEX "uq_cotraitants_org_email" ON "cotraitants" ("organization_id", "email") WHERE "email" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE "tender_cotraitants" (
  "id"               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "tender_id"        uuid NOT NULL REFERENCES "tenders"("id") ON DELETE CASCADE,
  "cotraitant_id"    uuid NOT NULL REFERENCES "cotraitants"("id") ON DELETE CASCADE,
  "organization_id"  uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "uq_tender_cotraitants_tender" UNIQUE ("tender_id")
);
--> statement-breakpoint
CREATE INDEX "idx_tender_cotraitants_tender"     ON "tender_cotraitants" ("tender_id");
--> statement-breakpoint
CREATE INDEX "idx_tender_cotraitants_cotraitant" ON "tender_cotraitants" ("cotraitant_id");
--> statement-breakpoint
CREATE TABLE "cotraitant_documents" (
  "id"               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "cotraitant_id"    uuid NOT NULL REFERENCES "cotraitants"("id") ON DELETE CASCADE,
  "tender_id"        uuid REFERENCES "tenders"("id") ON DELETE SET NULL,
  "organization_id"  uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "kind"             text NOT NULL,
  "label"            text NOT NULL,
  "storage_path"     text NOT NULL,
  "filename"         text NOT NULL,
  "uploaded_by"      uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "uploaded_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at"       timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "idx_cotraitant_docs_cotraitant" ON "cotraitant_documents" ("cotraitant_id");
--> statement-breakpoint
CREATE INDEX "idx_cotraitant_docs_tender" ON "cotraitant_documents" ("tender_id") WHERE "tender_id" IS NOT NULL;
