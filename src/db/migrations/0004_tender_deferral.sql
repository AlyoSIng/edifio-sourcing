-- ============================================================================
-- 0004_tender_deferral -- edifio Sourcing PR n°5 (feat/tender-actions)
-- ----------------------------------------------------------------------------
-- Source de verite :
--   - src/db/schema/tenders.ts (colonne `deferredUntil` + `deferredUntilIdx`)
--   - src/db/schema/enums.ts (enum `auditAction` etendu 13 -> 15)
--   - specs/audit_log_v1.md §A14 + §A15
--
-- Arbitrages Board 2026-05-21 (Steve TEISSIER) :
--   A) Codes audit A14 `tender_defer` + A15 `tender_reject` separes
--   B) Mecanique « Differer » : colonne `deferred_until timestamptz NULL`
--      + index partiel `WHERE deferred_until IS NOT NULL`
--   C) Motif rejet stocke dans `audit_logs.data.reason` (pas de colonne dediee)
--
-- NB transaction PG : `ALTER TYPE ... ADD VALUE` est non-transactionnel cote
-- *reutilisation* (on ne peut pas SELECT/INSERT la nouvelle valeur dans la
-- meme TX que l'ADD VALUE). En revanche l'ADD VALUE lui-meme tient dans une
-- transaction sur Postgres 12+. Cette migration NE consomme PAS les nouvelles
-- valeurs (pas d'INSERT audit_logs), donc le wrap TX par defaut Drizzle
-- migrate est OK sur Supabase (PG 15).
--
-- `IF NOT EXISTS` ajoute pour idempotence (re-jouabilite si migration
-- partielle ou prod deja patche manuellement).
-- ============================================================================

ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'tender_defer';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'tender_reject';--> statement-breakpoint
ALTER TABLE "tenders" ADD COLUMN "deferred_until" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_tenders_deferred_until" ON "tenders" USING btree ("deferred_until") WHERE "tenders"."deferred_until" IS NOT NULL;