-- ============================================================================
-- pgTAP 07_tenders_resource_status_preservation -- edifio Sourcing
-- ----------------------------------------------------------------------------
-- Belt and suspenders : preuve que la politique re-source conservatrice
-- d'insertTender (cf. src/lib/sourcing/insert.ts JSDoc) ne ramene PAS un AO
-- post-sourcing (status='selected_solo') a 'sourced' lors d'un 2e INSERT
-- idempotent declenche par le connecteur BOAMP.
--
-- Scenario :
--   1. INSERT initial d'un tender via le pattern insertTender
--      (status=sourced par defaut, score=75, matching_profile_id renseigne).
--   2. UPDATE manuel : status='selected_solo' (simule l'action user A4
--      tender_select), score=87, matching_profile_id reaffirme.
--   3. 2e INSERT idempotent meme (organization_id, external_ref, platform_id)
--      avec raw_data modifie (simule re-sourcing BOAMP), score=0 et
--      status='sourced' (valeurs par defaut du connecteur).
--   4. Verifie que :
--      - 1 seule ligne (idempotence)
--      - status reste 'selected_solo' (PAS revenu a 'sourced')
--      - matching_profile_id preserve
--      - score preserve a 87 (PAS ecrase par le 0 du connecteur)
--      - raw_data mis a jour (version=2)
--      - updated_at > created_at (bump confirme)
--
-- Reference :
--   * src/lib/sourcing/insert.ts §JSDoc "POLITIQUE de re-source"
--   * src/db/schema/enums.ts tender_status (selected_solo apres sourced)
--   * DECISIONS.md 2026-05-19 verdict CTO H3 (NO_OP audit, helper fondation)
--   * Convention pgTAP du repo : cf. 05_tenders_insert_idempotence.sql
-- ============================================================================

BEGIN;
SELECT plan(6);

\echo '------------------------------------------------------------------------'
\echo '# 07_tenders_resource_status_preservation -- politique re-source'
\echo '------------------------------------------------------------------------'
DO $$ BEGIN RAISE NOTICE '[07] re-source preserve status=selected_solo + score + matching_profile_id'; END $$;

-- ---- Setup : 1 org + user + membership + platform BOAMP + search_profile ---

SET LOCAL row_security = off;

INSERT INTO organizations (id, name) VALUES
  ('00000000-0000-0000-0000-0000000007aa', 'OrgA-resource-preservation');

INSERT INTO auth.users (id, email) VALUES
  ('77777777-7777-7777-7777-7777777777a7', 'alice-resource@orga.test');
INSERT INTO users (id, email) VALUES
  ('77777777-7777-7777-7777-7777777777a7', 'alice-resource@orga.test');
INSERT INTO memberships (organization_id, user_id, role) VALUES
  ('00000000-0000-0000-0000-0000000007aa', '77777777-7777-7777-7777-7777777777a7', 'admin');

-- Plateforme BOAMP : seedee par migration ou pnpm db:seed -- ON CONFLICT par robustesse.
INSERT INTO platforms (id, code, display_name, auth_type, base_url) VALUES
  ('cccc0000-0000-0000-0000-000000000007', 'boamp', 'BOAMP', 'api_key', 'https://data.boamp.fr')
ON CONFLICT (code) DO NOTHING;

-- Search profile (renseigne au moment du sourcing initial)
INSERT INTO search_profiles (id, organization_id, name) VALUES
  ('aaaa7777-0000-0000-0000-000000000007', '00000000-0000-0000-0000-0000000007aa', 'profil-resource-A');

-- Bascule role non-superuser (RLS s'applique reellement).
SET LOCAL ROLE test_authenticated;
SET LOCAL row_security = on;

-- JWT Alice admin OrgA
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"77777777-7777-7777-7777-7777777777a7","app_metadata":{"organization_id":"00000000-0000-0000-0000-0000000007aa","role":"admin"}}',
  true
);

-- ---- Etape 1 : INSERT initial via pattern insertTender ---------------------

INSERT INTO tenders
    (organization_id, external_ref, platform_id, title, buyer,
     score, status, matching_profile_id, raw_data)
VALUES (
  '00000000-0000-0000-0000-0000000007aa',
  'RESOURCE-001',
  (SELECT id FROM platforms WHERE code = 'boamp'),
  'AO test re-source preservation v1',
  'Mairie test',
  '50.00',
  'sourced',
  'aaaa7777-0000-0000-0000-000000000007',
  '{"platform_code":"boamp","record":{"version":1,"idweb":"RESOURCE-001"},"fetched_at":"2026-05-19T10:00:00Z"}'::jsonb
);

-- ---- Etape 2 : UPDATE manuel pour simuler l'action user A4 tender_select ---
-- L'utilisateur a selectionne l'AO en mode solo. status='selected_solo',
-- score raffine a 87, matching_profile_id reaffirme. Le trigger touch_tenders
-- bumpera updated_at.

UPDATE tenders
   SET status = 'selected_solo',
       score = '87.00'
 WHERE organization_id = '00000000-0000-0000-0000-0000000007aa'
   AND external_ref = 'RESOURCE-001';

-- Snapshot des valeurs post-selection pour comparer apres re-source.
DO $$
DECLARE
  v_created_at timestamptz;
  v_updated_at timestamptz;
BEGIN
  SELECT created_at, updated_at
    INTO v_created_at, v_updated_at
    FROM tenders
   WHERE organization_id = '00000000-0000-0000-0000-0000000007aa'
     AND external_ref = 'RESOURCE-001';

  CREATE TEMP TABLE _snap_resource (created_at timestamptz, updated_at timestamptz);
  INSERT INTO _snap_resource VALUES (v_created_at, v_updated_at);
END $$;

-- Desactivation temporaire du trigger touch_tenders : en TX pgTAP unique,
-- now() est fige sur BEGIN -> updated_at ne peut pas avancer naturellement
-- (cf. note identique dans 05_tenders_insert_idempotence.sql ligne ~119).
-- On utilisera clock_timestamp() dans le ON CONFLICT DO UPDATE pour simuler
-- le comportement multi-transaction.
SET LOCAL row_security = off;
RESET ROLE;
ALTER TABLE tenders DISABLE TRIGGER touch_tenders;
SET LOCAL ROLE test_authenticated;
SET LOCAL row_security = on;

-- Avance horloge.
SELECT pg_sleep(0.05);

-- ---- Etape 3 : 2e INSERT idempotent (re-source BOAMP) ----------------------
-- Le connecteur passe score=0 + status='sourced' (valeurs par defaut). Ces
-- valeurs DOIVENT etre ignorees par le ON CONFLICT DO UPDATE qui ne touche
-- que raw_data + updated_at.

INSERT INTO tenders
    (organization_id, external_ref, platform_id, title, buyer,
     score, status, matching_profile_id, raw_data)
VALUES (
  '00000000-0000-0000-0000-0000000007aa',
  'RESOURCE-001',
  (SELECT id FROM platforms WHERE code = 'boamp'),
  'TITRE DIFFERENT -- doit etre ignore au UPDATE',
  'BUYER DIFFERENT -- doit etre ignore au UPDATE',
  '0',           -- valeur par defaut connecteur : NE DOIT PAS ecraser 87
  'sourced',     -- valeur par defaut connecteur : NE DOIT PAS ecraser selected_solo
  NULL,          -- NE DOIT PAS ecraser le matching_profile_id existant
  '{"platform_code":"boamp","record":{"version":2,"idweb":"RESOURCE-001","amendment":true},"fetched_at":"2026-05-19T14:00:00Z"}'::jsonb
)
ON CONFLICT (organization_id, external_ref, platform_id)
DO UPDATE SET
  raw_data = EXCLUDED.raw_data,
  updated_at = clock_timestamp();

-- ---- Etape 4 : Assertions (6) ----------------------------------------------

-- 4.a) 1 seule ligne pour ce tender (idempotence UNIQUE honoree)
SELECT is(
  (SELECT count(*)::int FROM tenders
    WHERE organization_id = '00000000-0000-0000-0000-0000000007aa'
      AND external_ref = 'RESOURCE-001'),
  1,
  'idempotence : 1 seule ligne apres 2 INSERT meme (org, external_ref, platform_id)'
);

-- 4.b) status PRESERVE = 'selected_solo' (PAS revenu a 'sourced')
SELECT is(
  (SELECT status::text FROM tenders
    WHERE organization_id = '00000000-0000-0000-0000-0000000007aa'
      AND external_ref = 'RESOURCE-001'),
  'selected_solo',
  'status PRESERVE selected_solo apres re-source -- le sourced du connecteur a ete ignore'
);

-- 4.c) matching_profile_id PRESERVE (PAS ecrase par NULL)
SELECT is(
  (SELECT matching_profile_id FROM tenders
    WHERE organization_id = '00000000-0000-0000-0000-0000000007aa'
      AND external_ref = 'RESOURCE-001'),
  'aaaa7777-0000-0000-0000-000000000007'::uuid,
  'matching_profile_id PRESERVE apres re-source -- le NULL du connecteur a ete ignore'
);

-- 4.d) score PRESERVE a 87.00 (PAS ecrase par le 0 du connecteur)
SELECT is(
  (SELECT score::text FROM tenders
    WHERE organization_id = '00000000-0000-0000-0000-0000000007aa'
      AND external_ref = 'RESOURCE-001'),
  '87.00',
  'score PRESERVE 87.00 apres re-source -- le 0 du connecteur a ete ignore'
);

-- 4.e) raw_data MIS A JOUR (preuve que le UPDATE a bien eu lieu)
SELECT is(
  (SELECT (raw_data->'record'->>'version') FROM tenders
    WHERE organization_id = '00000000-0000-0000-0000-0000000007aa'
      AND external_ref = 'RESOURCE-001'),
  '2',
  'raw_data MIS A JOUR vers payload v2 (version=2, amendment=true)'
);

-- 4.f) updated_at > created_at (bump confirme par le re-source)
SELECT ok(
  (SELECT updated_at > created_at FROM tenders
    WHERE organization_id = '00000000-0000-0000-0000-0000000007aa'
      AND external_ref = 'RESOURCE-001'),
  'updated_at BUMPE strictement > created_at apres re-source'
);

SELECT * FROM finish();
ROLLBACK;
