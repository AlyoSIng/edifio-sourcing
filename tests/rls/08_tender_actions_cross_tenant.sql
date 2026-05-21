-- ============================================================================
-- pgTAP 08_tender_actions_cross_tenant -- edifio Sourcing PR n°5
-- ----------------------------------------------------------------------------
-- Verifie la RLS FORCE sur les ecritures declenchees par les server actions
-- introduites par la PR n°5 (`selectTenderAction`, `deferTenderAction`,
-- `rejectTenderAction`).
--
-- Scenarios couverts :
--   1. UPDATE tenders cross-tenant (admin OrgA tente d'update un tender OrgB)
--      -> doit etre rejete par RLS 42501 (specs/schema_v1.sql tenant_isolation)
--   2. INSERT tender_events cross-tenant (admin OrgA tente d'inserer un event
--      sur un tender OrgB) -> doit etre rejete RLS 42501
--   3. UPDATE in-tenant legit (admin OrgA update son propre tender) -> OK
--   4. INSERT tender_events in-tenant legit -> OK
--   5. UPDATE deferred_until OrgB visible depuis OrgA -> 0 ligne affectee
--      (RLS filtre invisiblement le tender cross-tenant)
--
-- Reference : specs/schema_v1.sql §RLS + 0002_rls.sql §tender_events +
-- src/app/sourcing/ao-du-jour/actions.ts (3 server actions).
-- ============================================================================

BEGIN;
SELECT plan(8);

-- ---- Setup : 2 orgs + admins + tenders + platform --------------------------

SET LOCAL row_security = off;

INSERT INTO organizations (id, name) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'OrgA-tact'),
  ('00000000-0000-0000-0000-00000000000b', 'OrgB-tact');

INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-1111111111a1', 'alice-tact@orga.test'),
  ('22222222-2222-2222-2222-2222222222b2', 'bob-tact@orgb.test');

INSERT INTO users (id, email) VALUES
  ('11111111-1111-1111-1111-1111111111a1', 'alice-tact@orga.test'),
  ('22222222-2222-2222-2222-2222222222b2', 'bob-tact@orgb.test');

INSERT INTO memberships (organization_id, user_id, role) VALUES
  ('00000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-1111111111a1', 'admin'),
  ('00000000-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-2222222222b2', 'admin');

INSERT INTO platforms (id, code, display_name, auth_type, base_url) VALUES
  ('cccc0000-0000-0000-0000-000000000001', 'boamp', 'BOAMP', 'api_key', 'https://data.boamp.fr')
ON CONFLICT (code) DO NOTHING;

-- Tenders OrgA et OrgB en status 'sourced'
INSERT INTO tenders (id, organization_id, external_ref, platform_id, title, buyer, status) VALUES
  ('aaaa3333-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   'EXT-A-TACT', (SELECT id FROM platforms WHERE code = 'boamp'), 'AO OrgA tact', 'Mairie A', 'sourced'),
  ('bbbb3333-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b',
   'EXT-B-TACT', (SELECT id FROM platforms WHERE code = 'boamp'), 'AO OrgB tact', 'Mairie B', 'sourced');

SELECT ok(true, 'setup OrgA + OrgB + admins + tenders sourced seedes');

-- Bascule sur role non-superuser : RLS s'applique reellement.
SET LOCAL ROLE test_authenticated;
SET LOCAL row_security = on;

-- JWT Alice (admin OrgA)
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-1111111111a1","app_metadata":{"organization_id":"00000000-0000-0000-0000-00000000000a","role":"admin"}}',
  true
);

-- ---- 1. UPDATE tenders cross-tenant -> 0 ligne affectee --------------------
-- RLS FORCE filtre invisiblement : la ligne OrgB est INVISIBLE pour Alice,
-- l'UPDATE n'echoue PAS mais touche 0 ligne (semantique RLS de Postgres).
-- C'est exactement ce qu'on veut : impossible de "voir" ni "muter" cross-tenant.

DO $$
DECLARE
  affected int;
BEGIN
  UPDATE tenders SET status = 'dropped'
  WHERE id = 'bbbb3333-0000-0000-0000-000000000001';
  GET DIAGNOSTICS affected = ROW_COUNT;
  CREATE TEMP TABLE _upd_xtenant (n int);
  INSERT INTO _upd_xtenant VALUES (affected);
END $$;

SELECT is(
  (SELECT n FROM _upd_xtenant),
  0,
  'UPDATE tenders cross-tenant (OrgA tente OrgB) -> 0 ligne touchee (RLS invisible)'
);

-- Le status OrgB doit etre reste 'sourced' (verification cote bypass).
SET LOCAL row_security = off;
RESET ROLE;
SELECT is(
  (SELECT status::text FROM tenders WHERE id = 'bbbb3333-0000-0000-0000-000000000001'),
  'sourced',
  'tender OrgB toujours en sourced apres tentative UPDATE cross-tenant'
);
SET LOCAL ROLE test_authenticated;
SET LOCAL row_security = on;

-- Re-pose JWT Alice (le RESET ROLE perd parfois les claims, redondance safe)
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-1111111111a1","app_metadata":{"organization_id":"00000000-0000-0000-0000-00000000000a","role":"admin"}}',
  true
);

-- ---- 2. INSERT tender_events cross-tenant -> REFUSE RLS 42501 -------------

SELECT throws_ok(
  $$INSERT INTO tender_events
      (tender_id, organization_id, event_type, actor_id, data)
    VALUES (
      'bbbb3333-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-00000000000b',  -- org OrgB explicite -> RLS WITH CHECK refuse
      'rejected',
      '11111111-1111-1111-1111-1111111111a1',
      '{"reason":"cross tenant attempt"}'::jsonb
    )$$,
  '42501',
  NULL,
  'INSERT tender_events cross-tenant DOIT lever RLS 42501'
);

-- ---- 3. UPDATE tenders in-tenant legit -> OK ------------------------------

SELECT lives_ok(
  $$UPDATE tenders SET status = 'selected_solo'
    WHERE id = 'aaaa3333-0000-0000-0000-000000000001'$$,
  'UPDATE tenders in-tenant (Alice update son propre AO) autorise'
);

SELECT is(
  (SELECT status::text FROM tenders WHERE id = 'aaaa3333-0000-0000-0000-000000000001'),
  'selected_solo',
  'tender OrgA est bien passe en selected_solo apres UPDATE in-tenant'
);

-- ---- 4. INSERT tender_events in-tenant legit -> OK -----------------------

SELECT lives_ok(
  $$INSERT INTO tender_events
      (tender_id, organization_id, event_type, actor_id, data)
    VALUES (
      'aaaa3333-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-00000000000a',
      'selected',
      '11111111-1111-1111-1111-1111111111a1',
      '{"to_status":"selected_solo","external_ref":"EXT-A-TACT"}'::jsonb
    )$$,
  'INSERT tender_events in-tenant (OrgA) autorise'
);

-- ---- 5. UPDATE deferred_until cross-tenant -> 0 ligne ---------------------
-- Verification specifique a la nouvelle colonne (PR n°5).

DO $$
DECLARE
  affected int;
BEGIN
  UPDATE tenders
    SET deferred_until = now() + interval '24 hours'
  WHERE id = 'bbbb3333-0000-0000-0000-000000000001';
  GET DIAGNOSTICS affected = ROW_COUNT;
  CREATE TEMP TABLE _upd_defer_xtenant (n int);
  INSERT INTO _upd_defer_xtenant VALUES (affected);
END $$;

SELECT is(
  (SELECT n FROM _upd_defer_xtenant),
  0,
  'UPDATE tenders.deferred_until cross-tenant -> 0 ligne (RLS invisible)'
);

SELECT * FROM finish();
ROLLBACK;
