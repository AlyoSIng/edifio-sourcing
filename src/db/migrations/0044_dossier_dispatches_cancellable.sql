-- Migration 0044 — Annulation soft d'un envoi dossier (chantier H6)
--
-- Décision Steve 2026-06-04 : permettre à l'admin de marquer un envoi
-- comme annulé en cas de fausse manipulation. Le lien signé Supabase
-- reste valide jusqu'à expiration naturelle (7j) — Supabase Storage
-- n'expose pas de révocation immédiate — mais l'audit BDD signale
-- l'annulation et l'UI cache l'envoi des vues récentes.
--
-- Colonnes additives (nullable), pas de backfill nécessaire :
--   - cancelled_at        : timestamptz, NULL = actif
--   - cancelled_by        : uuid, FK users.id ON DELETE SET NULL
--   - cancellation_reason : text, libre (optionnel)
--
-- Migration idempotente (IF NOT EXISTS).

ALTER TABLE "dossier_dispatches"
  ADD COLUMN IF NOT EXISTS "cancelled_at" timestamptz;

ALTER TABLE "dossier_dispatches"
  ADD COLUMN IF NOT EXISTS "cancelled_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "dossier_dispatches"
  ADD COLUMN IF NOT EXISTS "cancellation_reason" text;

-- Index partiel sur les non-annulés (chemin chaud : afficher dans l'UI).
CREATE INDEX IF NOT EXISTS "idx_dossier_dispatches_active"
  ON "dossier_dispatches" ("tender_id", "architect_id", "sent_at" DESC)
  WHERE "cancelled_at" IS NULL;
