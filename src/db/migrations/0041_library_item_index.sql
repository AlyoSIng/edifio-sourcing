-- Migration 0041 — Indexation IA de la bibliothèque entreprise
--
-- Contexte Steve 2026-06-03 (chantier E) : ajouter un bouton « Indexer avec
-- IA » dans la biblio qui fait analyser chaque doc par Claude pour en
-- extraire titre intelligent, mots-clés, type, résumé. Les métadonnées
-- alimentent (en V2) le matching pieces RC ↔ biblio.
--
-- Table 1:1 avec presentation_library :
--   - 1 ligne d'index par item biblio
--   - UNIQUE (library_item_id) garantit l'unicité — l'admin peut ré-indexer
--     un item (DELETE + INSERT ou UPSERT) si le doc a changé
--   - source_hash (sha256 du fichier au moment de l'indexation) permet de
--     détecter qu'un item doit être ré-indexé après ré-upload
--   - extracted_entities en JSONB pour les données structurées (SIRET,
--     dates de validité, montants…) extraites par Claude selon le type
--
-- RLS strict tenant : organization_id obligatoire + policies SELECT/ALL.
--
-- Migration idempotente (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS "library_item_index" (
  "id"                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "library_item_id"     uuid        NOT NULL UNIQUE REFERENCES "presentation_library"("id") ON DELETE CASCADE,
  "organization_id"     uuid        NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "extracted_title"     text,
  "keywords"            text[]      NOT NULL DEFAULT '{}',
  "summary"             text,
  "doc_type"            text,
  "extracted_entities"  jsonb       NOT NULL DEFAULT '{}',
  "indexed_at"          timestamptz NOT NULL DEFAULT now(),
  "indexed_by"          uuid                 REFERENCES "users"("id") ON DELETE SET NULL,
  "ai_run_id"           uuid                 REFERENCES "ai_runs"("id") ON DELETE SET NULL,
  "model_version"       text,
  "source_hash"         text
);

CREATE INDEX IF NOT EXISTS "idx_library_item_index_org"
  ON "library_item_index" ("organization_id", "indexed_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_library_item_index_doc_type"
  ON "library_item_index" ("doc_type")
  WHERE "doc_type" IS NOT NULL;

-- ─── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE "library_item_index" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "library_item_index" FORCE ROW LEVEL SECURITY;

CREATE POLICY "library_item_index_select_org" ON "library_item_index"
  FOR SELECT USING (
    organization_id = current_organization_id()
  );

CREATE POLICY "library_item_index_write_org" ON "library_item_index"
  FOR ALL USING (
    organization_id = current_organization_id()
  );
