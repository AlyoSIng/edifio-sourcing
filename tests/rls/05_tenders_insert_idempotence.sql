-- ============================================================================
-- pgTAP 05_tenders_insert_idempotence -- edifio Sourcing
-- ----------------------------------------------------------------------------
-- Verifie le comportement attendu de la couche insertTender (cf.
-- src/lib/sourcing/insert.ts) cote BDD :
--
--   1. INSERT autorise pour un membre (admin) de l'organisation
--   2. INSERT cross-tenant REFUSE (RLS violation 42501)
--   3. Idempotence : 2x INSERT meme (org, external_ref, platform_id)
--      -> 1 seule ligne, created_at preserve, updated_at bumpe, raw_data
--      mis a jour avec le 2e payload (politique "re-source" cf. JSDoc
--      insertTender)
--   4. Preservation : score, status, matching_profile_id INCHANGES apres
--      re-source (verrouille la "politique re-source")
--
-- Reference : specs/schema_v1.sql §4 (contrainte UNIQUE
-- (organization_id, external_ref, platform_id)) + insertTender JSDoc.
-- Convention pgTAP du repo : cf. tests/rls/02_tenant_isolation.sql et
-- tests/rls/03_insert_by_member.sql.
-- ============================================================================

BEGIN;
SELECT plan(10);

-- ---- Setup : 2 orgs + users + memberships + platform BOAMP -----------------

SET LOCAL row_security = off;

INSERT INTO organizations (id, name) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'OrgA-idempo'),
  ('00000000-0000-0000-0000-00000000000b', 'OrgB-idempo');

INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-1111111111a1', 'alice-idempo@orga.test');
INSERT INTO users (id, email) VALUES
  ('11111111-1111-1111-1111-1111111111a1', 'alice-idempo@orga.test');
INSERT INTO memberships (organization_id, user_id, role) VALUES
  ('00000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-1111111111a1', 'admin');

-- Plateforme BOAMP : seedee par la migration ou par pnpm db:seed. ON CONFLICT
-- pour rester compatible avec les deux modes.
INSERT INTO platforms (id, code, display_name, auth_type, base_url) VALUES
  ('cccc0000-0000-0000-0000-000000000001', 'boamp', 'BOAMP', 'api_key', 'https://data.boamp.fr')
ON CONFLICT (code) DO NOTHING;

-- Search profile OrgA (utilise pour verifier la preservation matching_profile_id)
INSERT INTO search_profiles (id, organization_id, name) VALUES
  ('aaaa1111-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'profil-idempo-A');

SELECT ok(true, 'setup OrgA + OrgB + alice admin + platform boamp + profile seedes');

-- Bascule sur role non-superuser : RLS s'applique reellement.
SET LOCAL ROLE test_authenticated;
SET LOCAL row_security = on;

-- JWT Alice (admin OrgA)
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-1111111111a1","app_metadata":{"organization_id":"00000000-0000-0000-0000-00000000000a","role":"admin"}}',
  true
);

-- ---- 1. INSERT autorise pour membre OrgA ----------------------------------

SELECT lives_ok(
  $$INSERT INTO tenders
      (organization_id, external_ref, platform_id, title, buyer,
       score, status, matching_profile_id, raw_data)
    VALUES (
      '00000000-0000-0000-0000-00000000000a',
      'IDEMPO-001',
      (SELECT id FROM platforms WHERE code = 'boamp'),
      'Test idempotence v1',
      'Mairie test',
      '75.00',
      'sourced',
      'aaaa1111-0000-0000-0000-000000000001',
      '{"platform_code":"boamp","record":{"version":1},"fetched_at":"2026-05-19T12:00:00Z"}'::jsonb
    )$$,
  'INSERT initial autorise pour Alice (admin OrgA)'
);

-- ---- 2. INSERT cross-tenant refuse ----------------------------------------

SELECT throws_ok(
  $$INSERT INTO tenders
      (organization_id, external_ref, platform_id, title, buyer)
    VALUES (
      '00000000-0000-0000-0000-00000000000b',
      'IDEMPO-CROSS',
      (SELECT id FROM platforms WHERE code = 'boamp'),
      'Cross-tenant attempt',
      'Mairie B'
    )$$,
  '42501',
  NULL,
  'INSERT cross-tenant DOIT lever une RLS violation 42501'
);

-- ---- 3. Idempotence : 2e INSERT meme cle, ne touche que raw_data + updated_at

-- Snapshot des valeurs apres le 1er INSERT
DO $$
DECLARE
  v_created_at timestamptz;
  v_updated_at timestamptz;
BEGIN
  SELECT created_at, updated_at
    INTO v_created_at, v_updated_at
    FROM tenders
   WHERE organization_id = '00000000-0000-0000-0000-00000000000a'
     AND external_ref = 'IDEMPO-001';

  -- On expose les valeurs via une table temporaire pour le test ci-apres.
  CREATE TEMP TABLE _snap_idempo (created_at timestamptz, updated_at timestamptz);
  INSERT INTO _snap_idempo VALUES (v_created_at, v_updated_at);
END $$;

-- IMPORTANT : un trigger BEFORE UPDATE `touch_tenders` ecrase `updated_at`
-- avec `now()` (fige sur la transaction courante). Dans une vraie prod, le
-- re-source est dans une 2e transaction donc `now()` est strictement > au
-- created_at d'origine. Ici on est dans la meme TX (BEGIN/ROLLBACK pgTAP)
-- donc `now() == created_at`. On desactive temporairement le trigger pour
-- simuler le comportement multi-transaction et pouvoir verifier la semantique
-- "updated_at bumpe a chaque re-source".
-- Reference : src/db/migrations/0001_schema_v1.sql (trigger touch_tenders).
SET LOCAL row_security = off;
RESET ROLE;  -- besoin d'etre superuser pour ALTER TRIGGER
ALTER TABLE tenders DISABLE TRIGGER touch_tenders;
SET LOCAL ROLE test_authenticated;
SET LOCAL row_security = on;

-- Petite pause pour garantir que clock_timestamp() avance entre snapshot et UPDATE.
SELECT pg_sleep(0.05);

-- 2e INSERT meme (org, external_ref, platform_id) -> doit etre intercepte par
-- la contrainte UNIQUE et mettre a jour UNIQUEMENT raw_data + updated_at.
-- On utilise clock_timestamp() au lieu de now() pour que updated_at avance
-- strictement dans la meme transaction (now() est fige sur BEGIN).
INSERT INTO tenders
  (organization_id, external_ref, platform_id, title, buyer,
   score, status, matching_profile_id, raw_data)
VALUES (
  '00000000-0000-0000-0000-00000000000a',
  'IDEMPO-001',
  (SELECT id FROM platforms WHERE code = 'boamp'),
  'TITRE DIFFERENT -- ne doit PAS etre persiste sur UPDATE',
  'BUYER DIFFERENT -- ne doit PAS etre persiste sur UPDATE',
  '99.00',
  'won',
  NULL,
  '{"platform_code":"boamp","record":{"version":2,"amendment":true},"fetched_at":"2026-05-19T13:00:00Z"}'::jsonb
)
ON CONFLICT (organization_id, external_ref, platform_id)
DO UPDATE SET
  raw_data = EXCLUDED.raw_data,
  updated_at = clock_timestamp();

-- 3.a) 1 seule ligne pour (OrgA, IDEMPO-001)
SELECT is(
  (SELECT count(*)::int FROM tenders
    WHERE organization_id = '00000000-0000-0000-0000-00000000000a'
      AND external_ref = 'IDEMPO-001'),
  1,
  'idempotence : 1 seule ligne apres 2 INSERT meme (org, external_ref, platform_id)'
);

-- 3.b) created_at preserve (= snapshot)
SELECT is(
  (SELECT created_at FROM tenders
    WHERE organization_id = '00000000-0000-0000-0000-00000000000a'
      AND external_ref = 'IDEMPO-001'),
  (SELECT created_at FROM _snap_idempo),
  'created_at PRESERVE apres re-source'
);

-- 3.c) updated_at bumpe (> snapshot)
SELECT ok(
  (SELECT updated_at FROM tenders
     WHERE organization_id = '00000000-0000-0000-0000-00000000000a'
       AND external_ref = 'IDEMPO-001')
  > (SELECT updated_at FROM _snap_idempo),
  'updated_at BUMPE apres re-source (clock_timestamp > snapshot)'
);

-- 3.d) raw_data mis a jour vers le 2e payload
SELECT is(
  (SELECT (raw_data->'record'->>'version') FROM tenders
    WHERE organization_id = '00000000-0000-0000-0000-00000000000a'
      AND external_ref = 'IDEMPO-001'),
  '2',
  'raw_data MIS A JOUR vers le 2e payload (version=2)'
);

-- ---- 4. Preservation des colonnes metier (politique re-source) -------------

-- score doit etre reste a 75.00 (pas 99.00 du 2e INSERT)
SELECT is(
  (SELECT score::text FROM tenders
    WHERE organization_id = '00000000-0000-0000-0000-00000000000a'
      AND external_ref = 'IDEMPO-001'),
  '75.00',
  'score PRESERVE (75.00) apres re-source -- le 99.00 du 2e INSERT a ete ignore'
);

-- status doit etre reste a 'sourced' (pas 'won')
SELECT is(
  (SELECT status::text FROM tenders
    WHERE organization_id = '00000000-0000-0000-0000-00000000000a'
      AND external_ref = 'IDEMPO-001'),
  'sourced',
  'status PRESERVE (sourced) apres re-source -- le ''won'' du 2e INSERT a ete ignore'
);

-- matching_profile_id doit etre reste a aaaa1111... (pas NULL)
SELECT is(
  (SELECT matching_profile_id FROM tenders
    WHERE organization_id = '00000000-0000-0000-0000-00000000000a'
      AND external_ref = 'IDEMPO-001'),
  'aaaa1111-0000-0000-0000-000000000001'::uuid,
  'matching_profile_id PRESERVE apres re-source -- le NULL du 2e INSERT a ete ignore'
);

SELECT * FROM finish();
ROLLBACK;
