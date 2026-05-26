-- Migration 0016 — documents administratifs des bureaux d'études (be_documents)
--
-- Table be_documents : pièces administratives attachées à une fiche BET.
-- 12 types de documents gérés applicativement (BeDocumentKind).
-- Fichiers physiques dans le bucket Supabase Storage "be-docs" (private).
--
-- IMPORTANT (ops) : avant la 1re utilisation, créer le bucket Storage
-- "be-docs" (private) dans le dashboard Supabase :
--   Storage → New Bucket → Nom : "be-docs" → Private.

CREATE TABLE "be_documents" (
  "id"               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "be_id"            uuid NOT NULL REFERENCES "bureaux_etudes"("id") ON DELETE CASCADE,
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
CREATE INDEX "idx_be_docs_be" ON "be_documents" ("be_id");
--> statement-breakpoint
CREATE INDEX "idx_be_docs_org" ON "be_documents" ("organization_id");
