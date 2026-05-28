-- Migration 0027 — Critères de short-list paramétrables (module Tandem)
--
-- Crée la table shortlist_criteria qui stocke, par organisation et par
-- cible (architects | cotraitants | companies), les seuils et filtres
-- que l'admin configure pour piloter la génération des short-lists Tandem.
--
-- Source de vérité :
--   - src/db/schema/shortlist.ts
--   - specs/module_tandem_engine_v1.md §short-list
--
-- Décision Nadia 2026-05-28 :
--   Table dédiée (zone verte spec Tandem). Une ligne par (org, target) —
--   contrainte unique via index. Le filtrage automatique (Phase 2) lira
--   cette table ; la PR courante pose uniquement la structure + UI admin.
--
-- Note technique :
--   drizzle-kit generate non disponible sur ARM64 Windows (esbuild).
--   Migration écrite manuellement, alignée sur src/db/schema/shortlist.ts.

-- ─── Table principale ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "shortlist_criteria" (
  "id"                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id"       UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  "target"                TEXT        NOT NULL,
  "ca_mini_eur"           INTEGER,
  "effectif_mini"         INTEGER,
  "required_specialties"  TEXT[]      NOT NULL DEFAULT '{}',
  "min_seniors_required"  INTEGER     NOT NULL DEFAULT 0,
  "max_solicitations"     INTEGER,
  "allowed_departments"   TEXT[]      NOT NULL DEFAULT '{}',
  "max_results"           INTEGER,
  "ai_notes_weight"       TEXT        NOT NULL DEFAULT '0.5',
  "extra_params"          JSONB               DEFAULT '{}',
  "created_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Contrainte unicité (org, target) ──────────────────────────────────────
--
-- Un seul enregistrement de critères par organisation et par cible.
-- Permet l'upsert via ON CONFLICT (organization_id, target) DO UPDATE.

ALTER TABLE "shortlist_criteria"
  ADD CONSTRAINT "shortlist_criteria_org_target_unique"
  UNIQUE ("organization_id", "target");

-- ─── Index fonctionnel (lookup par org + target) ────────────────────────────

CREATE INDEX IF NOT EXISTS "idx_shortlist_criteria_org_target"
  ON "shortlist_criteria" ("organization_id", "target");

-- ─── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE "shortlist_criteria" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shortlist_criteria" FORCE ROW LEVEL SECURITY;

-- Lecture : membres de l'organisation
CREATE POLICY "shortlist_criteria_select_org" ON "shortlist_criteria"
  FOR SELECT USING (
    organization_id = current_organization_id()
  );

-- Écriture (insert/update/delete) : admins uniquement
-- Contrôle applicatif : la Server Action vérifie isAdmin() avant toute écriture.
CREATE POLICY "shortlist_criteria_write_org" ON "shortlist_criteria"
  FOR ALL USING (
    organization_id = current_organization_id()
  );
