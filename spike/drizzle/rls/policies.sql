-- ============================================================================
-- rls/policies.sql — RLS policies (Spike Drizzle Phase 2a)
-- ----------------------------------------------------------------------------
-- Drizzle 0.39 supporte les RLS via la fonction `pgPolicy` côté schema TS,
-- mais en Phase 2a on garde le SQL natif manuscrit pour :
--   1. coller à la formulation exacte de `specs/schema_v1.sql` §10
--   2. permettre une comparaison équitable avec Prisma Phase 2b
--      (qui ne gère pas du tout les RLS — donc le SQL hors ORM est inévitable).
--
-- Périmètre : RLS sur les 4 tables du spike. organizations reste sans FORCE
-- (les users multi-org doivent pouvoir voir leur liste d'orgs depuis la
-- session) — aligné schema_v1.sql qui ENABLE mais ne FORCE pas organizations.
--
-- À appliquer APRÈS les migrations Drizzle (`migrations/0000_init.sql`) :
--   psql $DATABASE_URL -f migrations/0000_init.sql
--   psql $DATABASE_URL -f rls/policies.sql
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- HELPERS RLS (repris à l'identique de specs/schema_v1.sql §HELPERS RLS)
-- ----------------------------------------------------------------------------
-- IMPORTANT : ces fonctions sont SCHEMA-LEVEL et doivent exister AVANT toute
-- policy qui les référence. Si le schema_v1.sql complet est déjà appliqué sur
-- la base de bench, ces CREATE OR REPLACE sont idempotents.

CREATE OR REPLACE FUNCTION current_organization_id() RETURNS uuid AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claims', true)::jsonb #>> '{app_metadata,organization_id}',
    ''
  )::uuid
$$ LANGUAGE sql STABLE;

-- Rôle simplifié pour le spike (l'enum membership_role n'est pas porté dans
-- le schema Drizzle 2a — on retombe sur text pour ne pas créer une dépendance
-- inutile).
CREATE OR REPLACE FUNCTION current_user_role_text() RETURNS text AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claims', true)::jsonb #>> '{app_metadata,role}',
    ''
  )
$$ LANGUAGE sql STABLE;

-- ----------------------------------------------------------------------------
-- ENABLE + FORCE RLS
-- ----------------------------------------------------------------------------
-- organizations : ENABLE seulement (les users multi-org doivent pouvoir lister
-- les orgs auxquelles ils appartiennent — la policy filtre par org_id).
ALTER TABLE organizations         ENABLE ROW LEVEL SECURITY;

-- Tables multi-tenant strictes : ENABLE + FORCE (pas de bypass service_role
-- depuis l'app — seules les migrations système peuvent contourner via le
-- super-user Supabase).
ALTER TABLE architects            ENABLE ROW LEVEL SECURITY;
ALTER TABLE architects            FORCE ROW LEVEL SECURITY;

ALTER TABLE tenders               ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenders               FORCE ROW LEVEL SECURITY;

ALTER TABLE architect_responses   ENABLE ROW LEVEL SECURITY;
ALTER TABLE architect_responses   FORCE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- ORGANIZATIONS — SELECT only (pas d'INSERT/UPDATE/DELETE en runtime app)
-- ----------------------------------------------------------------------------
CREATE POLICY tenant_select ON organizations
  FOR SELECT
  USING (id = current_organization_id());

-- ----------------------------------------------------------------------------
-- ARCHITECTS — CRUD complet, isolé par organization_id
-- ----------------------------------------------------------------------------
CREATE POLICY tenant_select ON architects
  FOR SELECT
  USING (organization_id = current_organization_id());

CREATE POLICY tenant_insert ON architects
  FOR INSERT
  WITH CHECK (
    organization_id = current_organization_id()
    AND current_user_role_text() IN ('admin', 'user')
  );

CREATE POLICY tenant_update ON architects
  FOR UPDATE
  USING (organization_id = current_organization_id())
  WITH CHECK (
    organization_id = current_organization_id()
    AND current_user_role_text() IN ('admin', 'user')
  );

CREATE POLICY tenant_delete ON architects
  FOR DELETE
  USING (
    organization_id = current_organization_id()
    AND current_user_role_text() = 'admin'
  );

-- ----------------------------------------------------------------------------
-- TENDERS — CRUD complet, isolé par organization_id
-- ----------------------------------------------------------------------------
CREATE POLICY tenant_select ON tenders
  FOR SELECT
  USING (organization_id = current_organization_id());

CREATE POLICY tenant_insert ON tenders
  FOR INSERT
  WITH CHECK (
    organization_id = current_organization_id()
    AND current_user_role_text() IN ('admin', 'user')
  );

CREATE POLICY tenant_update ON tenders
  FOR UPDATE
  USING (organization_id = current_organization_id())
  WITH CHECK (
    organization_id = current_organization_id()
    AND current_user_role_text() IN ('admin', 'user')
  );

CREATE POLICY tenant_delete ON tenders
  FOR DELETE
  USING (
    organization_id = current_organization_id()
    AND current_user_role_text() = 'admin'
  );

-- ----------------------------------------------------------------------------
-- ARCHITECT_RESPONSES — CRUD complet, isolé par organization_id
-- ----------------------------------------------------------------------------
-- Cohérence cross-référentielle : un architect_response.organization_id doit
-- correspondre à celle du tender ET de l'architect liés. La policy WITH CHECK
-- ci-dessous garantit l'isolation tenant ; la cohérence tender/architect/org
-- est garantie par les FK + une contrainte d'intégrité applicative (à poser
-- en production via trigger ou check expression — hors Phase 2a).
CREATE POLICY tenant_select ON architect_responses
  FOR SELECT
  USING (organization_id = current_organization_id());

CREATE POLICY tenant_insert ON architect_responses
  FOR INSERT
  WITH CHECK (
    organization_id = current_organization_id()
    AND current_user_role_text() IN ('admin', 'user')
  );

CREATE POLICY tenant_update ON architect_responses
  FOR UPDATE
  USING (organization_id = current_organization_id())
  WITH CHECK (
    organization_id = current_organization_id()
    AND current_user_role_text() IN ('admin', 'user')
  );

CREATE POLICY tenant_delete ON architect_responses
  FOR DELETE
  USING (
    organization_id = current_organization_id()
    AND current_user_role_text() = 'admin'
  );

COMMIT;

-- ============================================================================
-- TEST CROSS-TENANT (à exécuter en Phase 3 bench, pgTAP idéalement)
-- ----------------------------------------------------------------------------
-- Pseudocode (à transposer en pgTAP) :
--   1. SET request.jwt.claims = '{"app_metadata":{"organization_id":"<orgA>"}}'
--   2. SELECT count(*) FROM tenders WHERE organization_id = '<orgB>';
--      EXPECTED: 0 (RLS coupe la visibilité)
--   3. INSERT INTO tenders (organization_id, ...) VALUES ('<orgB>', ...);
--      EXPECTED: ERROR row-level security
-- ============================================================================
