-- Migration 0017 + sync journal Drizzle
-- Genere le 2026-05-26
-- A appliquer dans Supabase SQL Editor APRES les migrations 0015 et 0016
--
-- Etape 1 : migration DDL (colonne annual_revenue sur la table architects)
-- Idempotente : IF NOT EXISTS evite une erreur si deja appliquee manuellement

ALTER TABLE "architects" ADD COLUMN IF NOT EXISTS "annual_revenue" integer;

-- Etape 2 : sync __drizzle_migrations (migrations appliquees manuellement hors drizzle-kit)
-- ON CONFLICT DO NOTHING : idempotent si relance

INSERT INTO "__drizzle_migrations" (hash, created_at)
VALUES
  ('0015_cotraitant_library',          1748995500000),
  ('0016_be_documents',                1748995560000),
  ('0017_architect_annual_revenue',    1748995620000)
ON CONFLICT (hash) DO NOTHING;
