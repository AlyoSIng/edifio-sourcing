-- Migration 0022 — Table tender_briefs (briefs IA à la demande)
--
-- Objectif : stocker les briefs IA générés via le bouton « Générer le brief »
-- sur les cartes AO du jour. 1 brief actif par AO (is_active = true),
-- historique conservé (is_active = false pour les versions précédentes).
--
-- Source de vérité :
--   - SPEC_ADDENDUM_260524_AO_DU_JOUR_REPORT_ET_BRIEF.md §Exigence 2
--   - src/db/schema/ai.ts → tenderBriefs
--
-- RLS : ENABLE + FORCE posés ici (même pattern que les autres tables métier).
-- Policy "tenant strict" : l'utilisateur ne voit que les briefs de son org.
--
-- Décision technique Nadia (dev_tandem) 2026-05-27 :
--   Migration écrite manuellement (drizzle-kit inaccessible sur arm64 en CI).
--   Schéma aligné sur src/db/schema/ai.ts.

CREATE TABLE IF NOT EXISTS "tender_briefs" (
  "id"              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  "tender_id"       UUID        NOT NULL REFERENCES "tenders"("id") ON DELETE CASCADE,
  "organization_id" UUID        NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "ai_run_id"       UUID        REFERENCES "ai_runs"("id") ON DELETE SET NULL,
  "content"         TEXT        NOT NULL,
  "is_active"       BOOLEAN     NOT NULL DEFAULT true,
  "generated_at"    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "idx_tender_briefs_tender_active"
  ON "tender_briefs" ("tender_id", "is_active");

CREATE INDEX "idx_tender_briefs_org"
  ON "tender_briefs" ("organization_id");

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE "tender_briefs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tender_briefs" FORCE ROW LEVEL SECURITY;

-- Policy : accès uniquement aux briefs de sa propre organisation
CREATE POLICY "tender_briefs_org_isolation"
  ON "tender_briefs"
  FOR ALL
  USING (
    "organization_id" IN (
      SELECT organization_id FROM memberships WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    "organization_id" IN (
      SELECT organization_id FROM memberships WHERE user_id = auth.uid()
    )
  );
