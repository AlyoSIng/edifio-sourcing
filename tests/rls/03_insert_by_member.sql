-- ============================================================================
-- pgTAP 03_insert_by_member -- edifio Sourcing
-- ----------------------------------------------------------------------------
-- Verifie la policy `insert_by_member` sur architects :
--   - role admin -> INSERT autorise
--   - role user  -> INSERT autorise
--   - role viewer -> INSERT REFUSE (RLS violation)
--   - cross-tenant (organization_id different du JWT) -> INSERT REFUSE
--
-- Reference : specs/schema_v1.sql l.551-552, migration 0002_rls section 5.
-- ============================================================================

BEGIN;
SELECT plan(4);

-- Setup minimal : 1 organisation
SET LOCAL row_security = off;
INSERT INTO organizations (id, name) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'OrgA-insert-test');
-- Stub auth.users (Supabase Auth absent en CI/dry-run, cf. workflow + script).
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-1111111111a1', 'alice-admin@orga.test'),
  ('11111111-1111-1111-1111-1111111111a2', 'bob-user@orga.test'),
  ('11111111-1111-1111-1111-1111111111a3', 'carol-viewer@orga.test');
INSERT INTO users (id, email) VALUES
  ('11111111-1111-1111-1111-1111111111a1', 'alice-admin@orga.test'),
  ('11111111-1111-1111-1111-1111111111a2', 'bob-user@orga.test'),
  ('11111111-1111-1111-1111-1111111111a3', 'carol-viewer@orga.test');
INSERT INTO memberships (organization_id, user_id, role) VALUES
  ('00000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-1111111111a1', 'admin'),
  ('00000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-1111111111a2', 'user'),
  ('00000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-1111111111a3', 'viewer');
SET LOCAL row_security = on;

-- 1. Admin : INSERT autorise
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-1111111111a1","app_metadata":{"organization_id":"00000000-0000-0000-0000-00000000000a","role":"admin"}}',
  true
);
SELECT lives_ok(
  $$INSERT INTO architects (organization_id, firstname, lastname, email)
    VALUES ('00000000-0000-0000-0000-00000000000a', 'A1', 'Admin', 'a1@test')$$,
  'admin doit pouvoir INSERT architects'
);

-- 2. User : INSERT autorise
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-1111111111a2","app_metadata":{"organization_id":"00000000-0000-0000-0000-00000000000a","role":"user"}}',
  true
);
SELECT lives_ok(
  $$INSERT INTO architects (organization_id, firstname, lastname, email)
    VALUES ('00000000-0000-0000-0000-00000000000a', 'A2', 'User', 'a2@test')$$,
  'user doit pouvoir INSERT architects'
);

-- 3. Viewer : INSERT refuse (RLS violation -> code 42501)
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-1111111111a3","app_metadata":{"organization_id":"00000000-0000-0000-0000-00000000000a","role":"viewer"}}',
  true
);
SELECT throws_ok(
  $$INSERT INTO architects (organization_id, firstname, lastname, email)
    VALUES ('00000000-0000-0000-0000-00000000000a', 'A3', 'Viewer', 'a3@test')$$,
  '42501',
  NULL,
  'viewer NE DOIT PAS pouvoir INSERT architects (RLS violation 42501)'
);

-- 4. Admin OrgA tente d'inserer pour OrgB (cross-tenant) -> refuse
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-1111111111a1","app_metadata":{"organization_id":"00000000-0000-0000-0000-00000000000a","role":"admin"}}',
  true
);
SELECT throws_ok(
  $$INSERT INTO architects (organization_id, firstname, lastname, email)
    VALUES ('00000000-0000-0000-0000-00000000000b', 'A4', 'CrossTenant', 'a4@test')$$,
  '42501',
  NULL,
  'admin OrgA NE DOIT PAS pouvoir INSERT pour OrgB (cross-tenant 42501)'
);

SELECT * FROM finish();
ROLLBACK;
