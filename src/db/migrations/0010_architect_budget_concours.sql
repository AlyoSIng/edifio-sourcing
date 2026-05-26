-- ============================================================================
-- 0010_architect_budget_concours -- Nouvelles colonnes table architects
--
-- Ajout de trois colonnes pour le profil architecte v2 :
--   - budget_min  : budget minimum d'operation (€ HT), INTEGER nullable
--   - budget_max  : budget maximum d'operation (€ HT), INTEGER nullable
--   - concours_only : si TRUE, repond uniquement aux concours, BOOLEAN NOT NULL
--
-- Ces colonnes sont utilisees dans le matching Tandem pour filtrer les
-- architectes selon les contraintes budgetaires et les types de procedure.
-- Pas de RLS supplementaire necessaire (table architects deja couverte par
-- 0002_rls.sql + 0006_tandem_rls.sql).
-- ============================================================================

ALTER TABLE "architects" ADD COLUMN "budget_min" integer;--> statement-breakpoint
ALTER TABLE "architects" ADD COLUMN "budget_max" integer;--> statement-breakpoint
ALTER TABLE "architects" ADD COLUMN "concours_only" boolean DEFAULT false NOT NULL;
