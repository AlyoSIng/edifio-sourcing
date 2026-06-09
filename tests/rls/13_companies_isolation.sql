-- ============================================================================
-- pgTAP 13_companies_isolation -- edifio Sourcing
-- ----------------------------------------------------------------------------
-- Cross-tenant `companies` : annuaire entreprises BTP/majors. Verifie l'etat
-- post-Lot 1.7-bis (migration 0052) :
--   - FORCE ROW LEVEL SECURITY (CC-1 Camille)
--   - Naming policies <table>_<action> (Sebastien suivi_act_reviewer Q2 monorepo)
--   - Comportement tenant_isolation prefe Lot 1.7 maintenu (semantique identique)
--
-- Reference : 0051_rls_fix_companies_cotraitant_shares_be.sql,
-- 0052_rls_lot17_bis_force_helper_naming.sql.
--
-- Plan : 1 setup + 1 force_rls + 4 policy_naming + 1 current_org + 1 select
--        + 1 insert ok + 1 insert cross-tenant + 1 viewer block + 1 update
--        cross-tenant = 12 assertions.
-- ============================================================================

BEGIN;
SELECT plan(12);

-- ---- Setup --------------------------------------------------------------

SET LOCAL row_security = off;

INSERT INTO organizations (id, name) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'OrgA_Companies'),
  ('00000000-0000-0000-0000-00000000000b', 'OrgB_Companies')
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-1111111111a1', 'alice@orga.test'),
  ('22222222-2222-2222-2222-2222222222b2', 'bob@orgb.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, email) VALUES
  ('11111111-1111-1111-1111-1111111111a1', 'alice@orga.test'),
  ('22222222-2222-2222-2222-2222222222b2', 'bob@orgb.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO memberships (organization_id, user_id, role) VALUES
  ('00000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-1111111111a1', 'admin'),
  ('00000000-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-2222222222b2', 'admin')
ON CONFLICT DO NOTHING;

-- Companies fixtures
INSERT INTO companies (id, organization_id, name, contact_name, email, city) VALUES
  ('aac13333-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   'Entreprise Alpha OrgA', 'Alice Alpha', 'contact@alpha-orga.test', 'Lyon'),
  ('bbc13333-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b',
   'Entreprise Beta OrgB', 'Bob Beta', 'contact@beta-orgb.test', 'Paris')
ON CONFLICT (id) DO NOTHING;

SELECT ok(true, 'Setup OrgA + OrgB + companies cross-tenant pose');

-- ---- Lot 1.7-bis : FORCE RLS + naming ----------------------------------

-- Assertion : FORCE RLS active sur companies (CC-1 Camille)
SELECT is(
  (SELECT relforcerowsecurity FROM pg_class WHERE relname = 'companies'),
  true,
  'companies FORCE RLS (relforcerowsecurity = true -- bypass service_role bloque)'
);

-- Assertion : policies renommees <table>_<action> presentes (Sebastien Q2)
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'companies' AND policyname = 'companies_select'),
  'policy companies_select existe (naming Lot 1.7-bis)'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'companies' AND policyname = 'companies_insert'),
  'policy companies_insert existe (naming Lot 1.7-bis)'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'companies' AND policyname = 'companies_update'),
  'policy companies_update existe (naming Lot 1.7-bis)'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'companies' AND policyname = 'companies_delete'),
  'policy companies_delete existe (naming Lot 1.7-bis)'
);

-- ---- Bascule sur role applicatif + JWT OrgA admin -----------------------

SET LOCAL ROLE test_authenticated;
SET LOCAL row_security = on;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-1111111111a1","app_metadata":{"organization_id":"00000000-0000-0000-0000-00000000000a","role":"admin"}}',
  true
);

-- Assertion : current_organization_id() = OrgA
SELECT is(
  current_organization_id(),
  '00000000-0000-0000-0000-00000000000a'::uuid,
  'current_organization_id() retourne OrgA depuis le JWT'
);

-- Assertion : SELECT cross-tenant -> 1 seule ligne visible (OrgA)
SELECT is(
  (SELECT count(*)::int FROM companies
   WHERE id IN ('aac13333-0000-0000-0000-000000000001'::uuid,
                'bbc13333-0000-0000-0000-000000000001'::uuid)),
  1,
  'companies : Alice (OrgA) ne voit que sa ligne, pas OrgB (policy companies_select)'
);

-- Assertion : INSERT dans son org -> OK
SELECT lives_ok(
  $$INSERT INTO companies (id, organization_id, name)
    VALUES ('aac13333-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'Entreprise Gamma OrgA')$$,
  'companies : Alice (admin OrgA) peut INSERT dans sa propre org (policy companies_insert)'
);

-- Assertion : INSERT dans une autre org -> rejet
SELECT throws_ok(
  $$INSERT INTO companies (id, organization_id, name)
    VALUES ('aac13333-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000b', 'Entreprise Cross-Tenant')$$,
  '42501',
  NULL,
  'companies : Alice (OrgA) NE PEUT PAS INSERT une ligne dans OrgB (companies_insert org check)'
);

-- Assertion : viewer ne peut pas INSERT
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-1111111111a1","app_metadata":{"organization_id":"00000000-0000-0000-0000-00000000000a","role":"viewer"}}',
  true
);
SELECT throws_ok(
  $$INSERT INTO companies (id, organization_id, name)
    VALUES ('aac13333-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000a', 'Entreprise Viewer-Block')$$,
  '42501',
  NULL,
  'companies : viewer OrgA NE PEUT PAS INSERT (companies_insert role check)'
);

-- Assertion : UPDATE cross-tenant -> 0 row affected
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-1111111111a1","app_metadata":{"organization_id":"00000000-0000-0000-0000-00000000000a","role":"admin"}}',
  true
);
WITH upd AS (
  UPDATE companies SET city = 'HackedCity'
   WHERE id = 'bbc13333-0000-0000-0000-000000000001'::uuid
   RETURNING id
)
SELECT is(
  (SELECT count(*)::int FROM upd),
  0,
  'companies : Alice (OrgA) UPDATE sur ligne OrgB renvoie 0 row (companies_update USING bloque)'
);

SELECT * FROM finish();
ROLLBACK;
