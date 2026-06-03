-- Migration 0038 — Envoi du dossier compilé à l'architecte mandataire
--
-- Contexte : Steve 2026-06-03. Une fois le dossier ZIP compilé sur la page
-- Pièces (DC1 + DC2 + Pouvoir + RC + pièces biblio), AlyoS doit pouvoir
-- l'envoyer à l'architecte sélectionné via un mail Brevo. L'archi clique sur
-- un lien signé Supabase 7j, télécharge le ZIP, complète sa partie
-- (DC1 signature mandataire + ses propres attestations) et dépose sur la
-- plateforme officielle.
--
-- Table `dossier_dispatches` :
--   - Garde une trace de chaque envoi (qui, quand, vers quel archi, quel ZIP)
--   - Stocke le storage_path du ZIP + l'expiration de l'URL signée (pour
--     pouvoir re-générer une nouvelle URL si l'archi a perdu le mail)
--   - Lien Brevo `brevo_message_id` pour corrélation avec les webhooks
--   - PAS de cascade DELETE sur architects/tenders pour garder la trace audit
--     même si l'archi est purgé RGPD (on conserve la métadonnée d'envoi sans
--     lien BDD direct — `ON DELETE SET NULL` sur architect_id + tender_id).
--
-- RLS : tenant isolation stricte via `organization_id` + FORCE pour bypass
-- service-role accidentel. Lecture/écriture limitées aux membres de l'org.
--
-- Migration idempotente (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS "dossier_dispatches" (
  "id"                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "tender_id"               uuid                 REFERENCES "tenders"("id") ON DELETE SET NULL,
  "architect_id"            uuid                 REFERENCES "architects"("id") ON DELETE SET NULL,
  "organization_id"         uuid        NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "zip_storage_path"        text        NOT NULL,
  "zip_display_name"        text        NOT NULL,
  "zip_size_bytes"          bigint,
  "signed_url_expires_at"   timestamptz NOT NULL,
  "sent_at"                 timestamptz NOT NULL DEFAULT now(),
  "sent_by"                 uuid                 REFERENCES "users"("id") ON DELETE SET NULL,
  "recipient_email"         text        NOT NULL,
  "recipient_name"          text,
  "brevo_message_id"        text,
  "brevo_template_register" text                 -- 'tu' | 'vous' — pour audit
);

-- Index — chemin chaud : « tous les envois pour cet AO + cet archi, dernier d'abord ».
CREATE INDEX IF NOT EXISTS "idx_dossier_dispatches_tender_archi"
  ON "dossier_dispatches" ("tender_id", "architect_id", "sent_at" DESC);

-- Index tenant pour les listings org-scopés.
CREATE INDEX IF NOT EXISTS "idx_dossier_dispatches_org"
  ON "dossier_dispatches" ("organization_id", "sent_at" DESC);

-- ─── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE "dossier_dispatches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dossier_dispatches" FORCE ROW LEVEL SECURITY;

-- Lecture : membres de l'organisation
CREATE POLICY "dossier_dispatches_select_org" ON "dossier_dispatches"
  FOR SELECT USING (
    organization_id = current_organization_id()
  );

-- Écriture (insert/update/delete) : membres de l'organisation
-- Contrôle applicatif : Server Action vérifie auth + ownership tender + archi.
CREATE POLICY "dossier_dispatches_write_org" ON "dossier_dispatches"
  FOR ALL USING (
    organization_id = current_organization_id()
  );
