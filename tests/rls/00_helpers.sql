-- ============================================================================
-- pgTAP 00_helpers -- edifio Sourcing
-- ----------------------------------------------------------------------------
-- Verifie que les helpers RLS poses par 0002_rls.sql existent et ont la bonne
-- signature (types de retour).
--
-- Reference : specs/schema_v1.sql l.49-58, migration 0002_rls section 1.
-- Lance en CI uniquement via pg_prove (GHA workflow db-rls.yml).
-- ============================================================================

BEGIN;
SELECT plan(4);

-- 1. current_organization_id existe
SELECT has_function(
  'public',
  'current_organization_id',
  'function current_organization_id() doit exister'
);

-- 2. current_organization_id retourne uuid
SELECT function_returns(
  'public',
  'current_organization_id',
  'uuid',
  'current_organization_id() doit retourner uuid'
);

-- 3. current_user_role existe
SELECT has_function(
  'public',
  'current_user_role',
  'function current_user_role() doit exister'
);

-- 4. current_user_role retourne membership_role
SELECT function_returns(
  'public',
  'current_user_role',
  'membership_role',
  'current_user_role() doit retourner membership_role'
);

SELECT * FROM finish();
ROLLBACK;
