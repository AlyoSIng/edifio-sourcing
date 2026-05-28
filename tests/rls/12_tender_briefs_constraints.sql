-- ============================================================================
-- pgTAP 12_tender_briefs_constraints — edifio Sourcing
-- ----------------------------------------------------------------------------
-- Contraintes structurelles sur la table tender_briefs.
-- Ne teste PAS la RLS (couverte par 11_shortlist_criteria_tender_briefs.sql).
-- Teste : existence table, NOT NULL clés, FK, index.
--
-- Reference migration : src/db/migrations/0022_tender_briefs.sql
--
-- Assertions (7) :
--   1. La table tender_briefs existe dans le schema public
--   2. tender_briefs.id est NOT NULL (cle primaire)
--   3. tender_briefs.tender_id est NOT NULL (FK)
--   4. tender_briefs.organization_id est NOT NULL (FK)
--   5. FK tender_briefs.tender_id → tenders.id existe (pg_constraint type='f')
--   6. FK tender_briefs.organization_id → organizations.id existe
--   7. Index composite (tender_id, is_active) existe (idx_tender_briefs_tender_active)
-- ============================================================================

BEGIN;
SELECT plan(7);

-- ─── Test 1 : la table existe dans le schema public ──────────────────────────
-- Verifie que la migration 0022 a bien ete appliquee.

SELECT has_table(
  'public',
  'tender_briefs',
  'table tender_briefs existe dans le schema public'
);

-- ─── Test 2 : tender_briefs.id est NOT NULL (cle primaire) ───────────────────
-- UUID PRIMARY KEY — jamais nul par definition, mais on teste explicitement.

SELECT col_not_null(
  'public',
  'tender_briefs',
  'id',
  'tender_briefs.id est NOT NULL (cle primaire)'
);

-- ─── Test 3 : tender_briefs.tender_id est NOT NULL ───────────────────────────
-- Defini NOT NULL dans la migration : pas de brief orphelin de tender.

SELECT col_not_null(
  'public',
  'tender_briefs',
  'tender_id',
  'tender_briefs.tender_id est NOT NULL (FK vers tenders)'
);

-- ─── Test 4 : tender_briefs.organization_id est NOT NULL ─────────────────────
-- Requis pour la policy RLS et l'isolation multi-tenant.

SELECT col_not_null(
  'public',
  'tender_briefs',
  'organization_id',
  'tender_briefs.organization_id est NOT NULL (FK vers organizations)'
);

-- ─── Test 5 : FK tender_briefs.tender_id → tenders.id ────────────────────────
-- Verifie l'existence d'une contrainte de type 'f' (foreign key) dans
-- pg_constraint reliant tender_briefs.tender_id a tenders.id.

SELECT fk_ok(
  'public', 'tender_briefs', ARRAY['tender_id'],
  'public', 'tenders',       ARRAY['id'],
  'tender_briefs.tender_id → tenders.id (FK avec ON DELETE CASCADE)'
);

-- ─── Test 6 : FK tender_briefs.organization_id → organizations.id ─────────────
-- Contrainte FK posee dans la migration 0022 pour garantir l'integrite
-- referentielle du tenant.

SELECT fk_ok(
  'public', 'tender_briefs', ARRAY['organization_id'],
  'public', 'organizations', ARRAY['id'],
  'tender_briefs.organization_id → organizations.id (FK avec ON DELETE CASCADE)'
);

-- ─── Test 7 : index composite (tender_id, is_active) existe ─────────────────
-- La migration 0022 cree idx_tender_briefs_tender_active ON tender_briefs
-- (tender_id, is_active). Cet index est critique pour le LEFT JOIN de
-- getTendersOfTheDay (WHERE tender_id = $1 AND is_active = true).
-- On teste par nom explicite pour distinguer de idx_tender_briefs_org.

SELECT has_index(
  'public',
  'tender_briefs',
  'idx_tender_briefs_tender_active',
  'tender_briefs a un index composite idx_tender_briefs_tender_active (tender_id, is_active)'
);

SELECT * FROM finish();
ROLLBACK;
