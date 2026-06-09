-- ============================================================================
-- pgTAP 15_bureaux_etudes_isolation -- edifio Sourcing
-- ----------------------------------------------------------------------------
-- Cross-tenant `bureaux_etudes` : annuaire des bureaux d'etudes techniques
-- partenaires. Verifie l'etat post-Lot 1.7-bis (migration 0052) :
--   - FORCE ROW LEVEL SECURITY (CC-1 Camille)
--   - Naming policies <table>_<action>
--
-- Pattern identique a 13_companies_isolation.sql (meme structure / decisions RLS).
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
  ('00000000-0000-0000-0000-00000000000a', 'OrgA_BE'),
  ('00000000-0000-0000-0000-00000000000b', 'OrgB_BE')
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

-- BE fixtures
INSERT INTO bureaux_etudes (id, organization_id, cabinet, contact_name, email, city) VALUES
  ('aa153333-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   'BE Alpha OrgA', 'Alice BE', 'be@alpha-orga.test', 'Lyon'),
  ('bb153333-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b',
   'BE Beta OrgB', 'Bob BE', 'be@beta-orgb.test', 'Paris')
ON CONFLICT (id) DO NOTHING;

SELECT ok(true, 'Setup OrgA + OrgB + bureaux_etudes cross-tenant pose');

-- ---- Lot 1.7-bis : FORCE RLS + naming ----------------------------------

-- Assertion : FORCE RLS active sur bureaux_etudes (CC-1 Camille)
SELECT is(
  (SELECT relforcerowsecurity FROM pg_class WHERE relname = 'bureaux_etudes'),
  true,
  'bureaux_etudes FORCE RLS (relforcerowsecurity = true)'
);

-- Assertion : policies renommees <table>_<action>
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'bureaux_etudes' AND policyname = 'bureaux_etudes_select'),
  'policy bureaux_etudes_select existe (naming Lot 1.7-bis)'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'bureaux_etudes' AND policyname = 'bureaux_etudes_insert'),
  'policy bureaux_etudes_insert existe (naming Lot 1.7-bis)'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'bureaux_etudes' AND policyname = 'bureaux_etudes_update'),
  'policy bureaux_etudes_update existe (naming Lot 1.7-bis)'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'bureaux_etudes' AND policyname = 'bureaux_etudes_delete'),
  'policy bureaux_etudes_delete existe (naming Lot 1.7-bis)'
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
  (SELECT count(*)::int FROM bureaux_etudes
   WHERE id IN ('aa153333-0000-0000-0000-000000000001'::uuid,
                'bb153333-0000-0000-0000-000000000001'::uuid)),
  1,
  'bureaux_etudes : Alice (OrgA) ne voit que sa ligne, pas OrgB (policy bureaux_etudes_select)'
);

-- Assertion : INSERT dans son org -> OK
SELECT lives_ok(
  $$INSERT INTO bureaux_etudes (id, organization_id, cabinet)
    VALUES ('aa153333-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'BE Gamma OrgA')$$,
  'bureaux_etudes : Alice (admin OrgA) peut INSERT dans sa propre org'
);

-- Assertion : INSERT dans une autre org -> rejet
SELECT throws_ok(
  $$INSERT INTO bureaux_etudes (id, organization_id, cabinet)
    VALUES ('aa153333-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000b', 'BE Cross-Tenant')$$,
  '42501',
  NULL,
  'bureaux_etudes : Alice (OrgA) NE PEUT PAS INSERT une ligne dans OrgB'
);

-- Assertion : viewer ne peut pas INSERT
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-1111111111a1","app_metadata":{"organization_id":"00000000-0000-0000-0000-00000000000a","role":"viewer"}}',
  true
);
SELECT throws_ok(
  $$INSERT INTO bureaux_etudes (id, organization_id, cabinet)
    VALUES ('aa153333-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000a', 'BE Viewer-Block')$$,
  '42501',
  NULL,
  'bureaux_etudes : viewer OrgA NE PEUT PAS INSERT (bureaux_etudes_insert role check)'
);

-- Assertion : UPDATE cross-tenant -> 0 row affected
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-1111111111a1","app_metadata":{"organization_id":"00000000-0000-0000-0000-00000000000a","role":"admin"}}',
  true
);
WITH upd AS (
  UPDATE bureaux_etudes SET city = 'HackedCity'
   WHERE id = 'bb153333-0000-0000-0000-000000000001'::uuid
   RETURNING id
)
SELECT is(
  (SELECT count(*)::int FROM upd),
  0,
  'bureaux_etudes : Alice (OrgA) UPDATE sur ligne OrgB renvoie 0 row (bureaux_etudes_update USING bloque)'
);

SELECT * FROM finish();
ROLLBACK;
