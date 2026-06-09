-- Migration 0050 — Apprentissage par écartement (Salve U, Steve 2026-06-08)
--
-- Branche : feat/learning-ecartement
--
-- Objectif : enrichir `learning_events` pour alimenter les suggestions
-- d'ajustement du profil de recherche quand l'utilisateur écarte des AO avec
-- un motif structuré récurrent (human-in-the-loop : suggestion validée par
-- l'admin, jamais d'auto-modification opaque).
--
-- Distinction sémantique (NE PAS confondre) :
--   - « Écarter » (rejectTenderAction, AVEC motif) → ALIMENTE l'apprentissage.
--   - « Exclure » (excludeTenderAction)            → NEUTRE, zéro effet algo.
--
-- Colonnes ajoutées (toutes nullables, additives, pas de backfill) :
--   - `payload`     jsonb : snapshot du tender au moment du rejet
--                           (buyer, cpv_codes, geo_zone/departement, amount).
--                           Permet d'agréger les suggestions sans re-fetch.
--   - `reason_code` text  : motif structuré normalisé (6 motifs de la Salve U).
--                           Distinct de `motif_category` qui était prévu pour
--                           la catégorisation IA P9 — on garde motif_category
--                           pour rétrocompat, on utilise reason_code pour les
--                           6 motifs structurés.
--   - `applied_at`  timestamptz : non-null = la suggestion issue de cet event
--                           a été APPLIQUÉE au profil par un admin.
--   - `dismissed_at` timestamptz : non-null = la suggestion a été IGNORÉE par
--                           un admin (ni l'une ni l'autre = event encore
--                           « actionnable » pour le calcul de suggestions).
--
-- Index partiel : accélère le regroupement par motif actionnable sur 30 j
-- glissants côté computeSuggestions (filtre reason_code IS NOT NULL).
--
-- Idempotent (ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS).

ALTER TABLE "learning_events"
  ADD COLUMN IF NOT EXISTS "payload" jsonb;

ALTER TABLE "learning_events"
  ADD COLUMN IF NOT EXISTS "reason_code" text;

ALTER TABLE "learning_events"
  ADD COLUMN IF NOT EXISTS "applied_at" timestamptz;

ALTER TABLE "learning_events"
  ADD COLUMN IF NOT EXISTS "dismissed_at" timestamptz;

CREATE INDEX IF NOT EXISTS "idx_learning_events_org_reason"
  ON "learning_events" ("organization_id", "reason_code", "occurred_at" DESC)
  WHERE "reason_code" IS NOT NULL;
