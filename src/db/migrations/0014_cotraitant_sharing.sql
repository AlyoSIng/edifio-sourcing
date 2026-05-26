-- Migration 0012 — tables partage cotraitant
-- (cotraitant_shares + cotraitant_share_items)
--
-- Flux : AlyoS génère un token de partage pour un cotraitant (BE ou archi).
-- Le cotraitant accède à /cotraitant/[token], télécharge les pièces
-- sélectionnées depuis la bibliothèque, les signe et les redépose.
--
-- IMPORTANT (ops) : avant la 1re utilisation, créer le bucket Storage
-- "cotraitant_signed" (private) dans le dashboard Supabase :
--   Storage → New Bucket → Nom : "cotraitant_signed" → Private.

CREATE TABLE "cotraitant_shares" (
  "id"               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "tender_id"        uuid NOT NULL REFERENCES "tenders"("id") ON DELETE CASCADE,
  "organization_id"  uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "architect_id"     uuid REFERENCES "architects"("id") ON DELETE SET NULL,
  "contact_name"     text NOT NULL,
  "contact_email"    text NOT NULL,
  "token"            uuid NOT NULL UNIQUE DEFAULT uuid_generate_v4(),
  "expires_at"       timestamp with time zone NOT NULL,
  "revoked_at"       timestamp with time zone,
  "created_by"       uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "idx_cotraitant_shares_tender" ON "cotraitant_shares" ("tender_id");
CREATE INDEX "idx_cotraitant_shares_token"  ON "cotraitant_shares" ("token");

CREATE TABLE "cotraitant_share_items" (
  "id"                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "share_id"              uuid NOT NULL REFERENCES "cotraitant_shares"("id") ON DELETE CASCADE,
  "library_item_id"       uuid REFERENCES "presentation_library"("id") ON DELETE SET NULL,
  "name"                  text NOT NULL,
  "kind"                  text NOT NULL,
  "original_storage_path" text NOT NULL,
  "signed_storage_path"   text,
  "signed_at"             timestamp with time zone,
  "signer_name"           text,
  "signed_filename"       text
);

CREATE INDEX "idx_cotraitant_share_items_share" ON "cotraitant_share_items" ("share_id");
