-- Migration 0045 — Notifications in-app : compteur d'événements non vus
--
-- Décision Steve 2026-06-04 (chantier H7). On ajoute une colonne nullable
-- `architect_notifications_seen_at` sur `users` qui stocke le moment où
-- l'admin a vu la dernière fois la page « Activité Tandem ». Les
-- architect_responses dont `responded_at > architect_notifications_seen_at`
-- sont considérées « nouvelles » et déclenchent l'affichage d'un badge
-- numérique dans la sidebar.
--
-- Colonne additive nullable, pas de backfill nécessaire. NULL = aucun
-- événement déjà vu → toutes les réponses pending|accepted|declined
-- depuis 90j sont marquées « nouvelles » au premier login.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "architect_notifications_seen_at" timestamptz;
