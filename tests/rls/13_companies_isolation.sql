-- ============================================================================
-- pgTAP 13_companies_isolation -- edifio Sourcing
-- ----------------------------------------------------------------------------
-- Cross-tenant `companies` : annuaire entreprises BTP/majors. Verifie le fix
-- de la dette securite pre-existante (migration 0051, flag Hugo PR #121,
-- audit gates/AUDIT_SECU_FINAL_MAIN_260608.md).
--
-- Methode :
--   1. Setup 2 orgs OrgA + OrgB + memberships (bypass RLS superuser)
--   2. Insertion de 1 entreprise par org en bypass RLS
--   3. Bascule sur role test_authenticated + JWT claims OrgA admin
--   4. Verifie que SELECT * FROM companies ne ramene QUE OrgA
--   5. Verifie qu'un admin peut INSERT dans sa propre org
--   6. Verifie qu'un admin NE PEUT PAS INSERT dans une autre org
--      (block admin_write RESTRICTIVE + tenant_isolation)
--   7. Verifie qu'un viewer NE PEUT PAS INSERT (block admin_write role check)
--   8. Cross-tenant UPDATE : Alice (OrgA) tente UPDATE sur ligne OrgB -> 0 row
--
-- Reference : 0051_rls_fix_companies_cotraitant_shares_be.sql,
-- pattern aligne 09_tandem_tables.sql.
--
-- Plan : 1 setup + 1 current_org + 1 select + 1 insert ok + 1 insert cross-tenant
--        + 1 insert viewer + 1 update cross-tenant = 7 assertions.
-- ============================================================================

BEGIN;
SELECT plan(7);

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

-- ---- Bascule sur role applicatif + JWT OrgA admin -----------------------

SET LOCAL ROLE test_authenticated;
SET LOCAL row_security = on;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-1111111111a1","app_metadata":{"organization_id":"00000000-0000-0000-0000-00000000000a","role":"admin"}}',
  true
);

-- Assertion 1 : current_organization_id() = OrgA
SELECT is(
  current_organization_id(),
  '00000000-0000-0000-0000-00000000000a'::uuid,
  'current_organization_id() retourne OrgA depuis le JWT'
);

-- Assertion 2 : SELECT cross-tenant -> 1 seule ligne visible (OrgA)
SELECT is(
  (SELECT count(*)::int FROM companies
   WHERE id IN ('aac13333-0000-0000-0000-000000000001'::uuid,
                'bbc13333-0000-0000-0000-000000000001'::uuid)),
  1,
  'companies : Alice (OrgA) ne voit que sa ligne, pas OrgB'
);

-- Assertion 3 : INSERT dans son org -> OK
SELECT lives_ok(
  $$INSERT INTO companies (id, organization_id, name)
    VALUES ('aac13333-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'Entreprise Gamma OrgA')$$,
  'companies : Alice (admin OrgA) peut INSERT dans sa propre org'
);

-- Assertion 4 : INSERT dans une autre org -> rejet
-- La policy tenant_isolation est PERMISSIVE FOR ALL (incluant INSERT en
-- visibilite via WITH CHECK). En l'absence de WITH CHECK explicit, tenant_isolation
-- impose le tenant courant. La policy admin_write RESTRICTIVE ANDe le check
-- organization_id = current_organization_id() -> rejet net.
SELECT throws_ok(
  $$INSERT INTO companies (id, organization_id, name)
    VALUES ('aac13333-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000b', 'Entreprise Cross-Tenant')$$,
  '42501',
  NULL,
  'companies : Alice (OrgA) NE PEUT PAS INSERT une ligne dans OrgB'
);

-- Assertion 5 : viewer ne peut pas INSERT
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
  'companies : viewer OrgA NE PEUT PAS INSERT (admin_write RESTRICTIVE role check)'
);

-- Assertion 6 : UPDATE cross-tenant -> 0 row affected (RLS filtre en silencieux)
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-1111111111a1","app_metadata":{"organization_id":"00000000-0000-0000-0000-00000000000a","role":"admin"}}',
  true
);
-- UPDATE renvoie 0 row sans erreur : tenant_isolation USING bloque la
-- visibilite de la ligne OrgB. C'est le comportement RLS standard PostgreSQL.
WITH upd AS (
  UPDATE companies SET city = 'HackedCity'
   WHERE id = 'bbc13333-0000-0000-0000-000000000001'::uuid
   RETURNING id
)
SELECT is(
  (SELECT count(*)::int FROM upd),
  0,
  'companies : Alice (OrgA) UPDATE sur ligne OrgB renvoie 0 row (RLS USING bloque)'
);

SELECT * FROM finish();
ROLLBACK;
