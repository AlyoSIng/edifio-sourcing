-- Migration 0046 — Journal des exécutions cron (chantier I3)
--
-- Steve 2026-06-04. Permet de tracer chaque exécution Vercel Cron :
-- sourcing-run, tandem-followup, library-expiry-digest, dossier-zip-cleanup
-- (et toute future tâche planifiée). Chaque run insère une row au début
-- (status='running') puis l'UPDATE à la fin avec finished_at + status final.
--
-- Lectures : exclusives superadmin (page /sourcing/admin/crons). Les crons
-- sont org-agnostiques (ils itèrent sur toutes les organisations), donc on
-- ne stocke pas d'organization_id ici.
--
-- Politique : RLS activée mais aucune policy authenticated — seul le
-- service_role (= cron handler + page admin via service_role) peut lire/
-- écrire. La page admin passe par createSupabaseAdminClient pour les
-- lectures.
--
-- Migration idempotente.

CREATE TABLE IF NOT EXISTS "cron_run_log" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "cron_name"      text NOT NULL,
  "started_at"     timestamptz NOT NULL DEFAULT now(),
  "finished_at"    timestamptz,
  "duration_ms"    integer,
  "status"         text NOT NULL DEFAULT 'running'
                   CHECK ("status" IN ('running', 'ok', 'error')),
  "payload"        jsonb,
  "error_message"  text,
  "error_stack"    text
);

CREATE INDEX IF NOT EXISTS "idx_cron_run_log_started_at"
  ON "cron_run_log" ("started_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_cron_run_log_name_started"
  ON "cron_run_log" ("cron_name", "started_at" DESC);

ALTER TABLE "cron_run_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cron_run_log" FORCE ROW LEVEL SECURITY;
-- Aucune policy : service_role only (bypass RLS natif Supabase).
