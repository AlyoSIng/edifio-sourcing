-- Migration 0037 — Lien tender ↔ BE cotraitants (mode Cotraitance BE)
--
-- Contexte : Phase 1 Lot B — Mode Cotraitance BE. AlyoS est mandataire d'un
-- groupement avec 1 ou plusieurs BE cotraitants. Steve sélectionne les BE
-- depuis sa bibliothèque (table `bureaux_etudes`) pour un AO donné. Chaque BE
-- sélectionné devra produire son propre DC2 — d'où la nécessité d'un lien
-- explicite tender ↔ BE.
--
-- Tables touchées :
--   1. `tender_be_cotraitants` (nouvelle) : N-N entre `tenders` et
--      `bureaux_etudes`. 1 tender peut avoir 0..N BE cotraitants ; 1 BE peut
--      être cotraitant sur 0..N tenders. Contrainte UNIQUE (tender_id, be_id)
--      pour l'idempotence de l'ajout (`ON CONFLICT DO NOTHING`).
--   2. `response_files.be_id` (nullable) : permet d'attacher un DC2 à un BE
--      cotraitant spécifique. NULL = DC2 = AlyoS (mode standard) ou DC1
--      (Tandem/Solo). Index partiel sur les lignes non NULL (chemin chaud).
--
-- Cascade : ON DELETE CASCADE sur tender_id / be_id / organization_id pour
-- garder la cohérence référentielle. Le response_file ne supprime pas le BE
-- (ON DELETE SET NULL côté `response_files.be_id`) pour conserver les
-- historiques (RGPD art. 17 — purge BE ≠ purge fichiers).
--
-- Migration idempotente (IF NOT EXISTS) — safe à rejouer.

CREATE TABLE IF NOT EXISTS "tender_be_cotraitants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tender_id" uuid NOT NULL REFERENCES "tenders"("id") ON DELETE CASCADE,
  "be_id" uuid NOT NULL REFERENCES "bureaux_etudes"("id") ON DELETE CASCADE,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "added_at" timestamptz NOT NULL DEFAULT now(),
  "added_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "tender_be_cotraitants_unique" UNIQUE ("tender_id", "be_id")
);

CREATE INDEX IF NOT EXISTS "idx_tender_be_cotraitants_tender" ON "tender_be_cotraitants" ("tender_id");
CREATE INDEX IF NOT EXISTS "idx_tender_be_cotraitants_org" ON "tender_be_cotraitants" ("organization_id");

-- Lien response_files → BE (nullable) pour les DC2 spécifiques BE.
-- NULL si DC2 = AlyoS (mode standard) ou DC1 (mode Tandem/Solo).
ALTER TABLE "response_files" ADD COLUMN IF NOT EXISTS "be_id" uuid REFERENCES "bureaux_etudes"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "idx_response_files_be" ON "response_files" ("be_id") WHERE "be_id" IS NOT NULL;
