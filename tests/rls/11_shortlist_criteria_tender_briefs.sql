-- ============================================================================
-- pgTAP 11_shortlist_criteria_tender_briefs -- edifio Sourcing
-- ----------------------------------------------------------------------------
-- Verifie la RLS FORCE sur les tables :
--   - shortlist_criteria  (migration 0027 — criteres short-list Tandem)
--   - tender_briefs       (migration 0022 — briefs IA a la demande)
--
-- Scenarios couverts par table :
--
--   shortlist_criteria (policy via current_organization_id()) :
--     1. FORCE RLS active (relrowsecurity + relforcerowsecurity = true)
--     2. SELECT sans app.current_organization_id retourne 0 lignes
--     3. SELECT retourne uniquement les lignes du tenant courant (OrgA)
--     4. SELECT retourne 0 lignes pour un tenant different (test negatif OrgB)
--     5. INSERT cross-tenant refuse (RLS 42501)
--
--   tender_briefs (policy via auth.uid() + memberships sous-SELECT) :
--     6. FORCE RLS active (relrowsecurity + relforcerowsecurity = true)
--     7. SELECT sans JWT pose retourne 0 lignes
--     8. SELECT retourne uniquement les briefs du tenant courant (OrgA)
--     9. SELECT retourne 0 lignes pour un tenant different (test negatif OrgB)
--    10. is_active = true : le brief actif est bien retourne (LEFT JOIN safe)
--    11. INSERT cross-tenant refuse (RLS 42501)
--
-- References :
--   - src/db/migrations/0027_shortlist_criteria.sql (RLS shortlist_criteria)
--   - src/db/migrations/0022_tender_briefs.sql (RLS tender_briefs)
--   - tests/rls/02_tenant_isolation.sql (pattern setup orgs + JWT)
--   - tests/rls/08_tender_actions_cross_tenant.sql (pattern throws_ok INSERT)
--
-- Total assertions : 13 (voir SELECT plan ci-dessous)
-- shortlist_criteria : 2 FORCE RLS + 1 no-JWT + 1 tenant OrgA + 1 cross-org + 1 throws_ok = 6
-- tender_briefs      : 2 FORCE RLS + 1 no-JWT + 1 tenant OrgA + 1 cross-org + 1 is_active + 1 throws_ok = 7
-- ============================================================================

BEGIN;
SELECT plan(13);

-- ============================================================================
-- SETUP GLOBAL : 2 organisations + utilisateurs + memberships
-- Bypass RLS (superuser local) pour inserer les fixtures cross-tenant.
-- ============================================================================

SET LOCAL row_security = off;

-- Organisations OrgA + OrgB
INSERT INTO organizations (id, name) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'OrgA_SL_TB'),
  ('00000000-0000-0000-0000-00000000000b', 'OrgB_SL_TB')
ON CONFLICT (id) DO NOTHING;

-- Stub auth.users (Supabase Auth absent en CI)
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

-- Platform de reference pour les tenders (FK non-nullable)
INSERT INTO platforms (id, code, display_name, auth_type, base_url) VALUES
  ('cccc0000-0000-0000-0000-000000000001', 'boamp', 'BOAMP', 'api_key', 'https://data.boamp.fr')
ON CONFLICT (code) DO NOTHING;

-- Tenders OrgA + OrgB (requis comme FK par tender_briefs)
INSERT INTO tenders (id, organization_id, external_ref, platform_id, title, buyer) VALUES
  ('aabb3333-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   'SL-A-001', (SELECT id FROM platforms WHERE code = 'boamp'), 'AO SL OrgA', 'Mairie A'),
  ('bbcc3333-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b',
   'SL-B-001', (SELECT id FROM platforms WHERE code = 'boamp'), 'AO SL OrgB', 'Mairie B')
ON CONFLICT (organization_id, external_ref, platform_id) DO NOTHING;

-- ─── shortlist_criteria : 1 ligne OrgA + 1 ligne OrgB ──────────────────────

INSERT INTO shortlist_criteria
  (id, organization_id, target, required_specialties, allowed_departments)
VALUES
  ('aabb1111-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-00000000000a',
   'architects', '{}', '{}'),
  ('bbcc1111-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-00000000000b',
   'architects', '{}', '{}')
ON CONFLICT (organization_id, target) DO NOTHING;

-- ─── tender_briefs : 2 briefs OrgA (1 actif, 1 inactif) + 1 brief OrgB ────
-- Le brief OrgA actif sert au test is_active ; le brief OrgB sert aux tests
-- cross-tenant.

INSERT INTO tender_briefs (id, tender_id, organization_id, content, is_active, generated_at)
VALUES
  ('aabb2222-0000-0000-0000-000000000001',
   'aabb3333-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-00000000000a',
   'Brief actif OrgA', true, now()),
  ('aabb2222-0000-0000-0000-000000000002',
   'aabb3333-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-00000000000a',
   'Brief inactif OrgA', false, now() - interval '1 day'),
  ('bbcc2222-0000-0000-0000-000000000001',
   'bbcc3333-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-00000000000b',
   'Brief actif OrgB', true, now())
ON CONFLICT DO NOTHING;

-- ============================================================================
-- PARTIE I — shortlist_criteria
-- ============================================================================

-- ─── Test 1 : FORCE RLS active sur shortlist_criteria ──────────────────────

SELECT is(
  (SELECT relrowsecurity      FROM pg_class WHERE relname = 'shortlist_criteria'),
  true,
  'shortlist_criteria ENABLE RLS (relrowsecurity = true)'
);
SELECT is(
  (SELECT relforcerowsecurity FROM pg_class WHERE relname = 'shortlist_criteria'),
  true,
  'shortlist_criteria FORCE RLS (relforcerowsecurity = true)'
);

-- ─── Test 2 : SELECT sans contexte tenant retourne 0 lignes ────────────────
-- On bascule sur role test_authenticated SANS poser de JWT.
-- current_organization_id() retourne NULL → policy USING retourne false → 0 lignes.

SET LOCAL ROLE test_authenticated;
SET LOCAL row_security = on;

-- JWT vide (objet JSON valide mais sans app_metadata.organization_id).
-- current_setting(...)::jsonb #>> '{app_metadata,organization_id}' retourne NULL
-- → current_organization_id() = NULL → policy USING = false → 0 lignes.
-- NB : '' (chaine vide) n'est pas du JSON valide → erreur de cast jsonb.
SELECT set_config('request.jwt.claims', '{}', true);

SELECT is(
  (SELECT count(*)::int FROM shortlist_criteria),
  0,
  'shortlist_criteria : SELECT sans JWT (no tenant context) retourne 0 lignes'
);

-- ─── Test 3 : SELECT retourne uniquement les lignes OrgA ───────────────────

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-1111111111a1","app_metadata":{"organization_id":"00000000-0000-0000-0000-00000000000a","role":"admin"}}',
  true
);

SELECT is(
  (SELECT count(*)::int FROM shortlist_criteria
   WHERE id IN (
     'aabb1111-0000-0000-0000-000000000001'::uuid,
     'bbcc1111-0000-0000-0000-000000000001'::uuid
   )),
  1,
  'shortlist_criteria : Alice (OrgA) ne voit que sa ligne, pas celle de OrgB'
);

-- ─── Test 4 : test negatif cross-org — 0 ligne OrgB visible depuis OrgA ────

SELECT is(
  (SELECT count(*)::int FROM shortlist_criteria
   WHERE organization_id = '00000000-0000-0000-0000-00000000000b'),
  0,
  'shortlist_criteria : Alice (OrgA) voit 0 lignes de OrgB (isolation cross-tenant)'
);

-- ─── Test 5 : INSERT cross-tenant refuse (RLS 42501) ───────────────────────
-- Alice (OrgA admin) tente un INSERT avec organization_id = OrgB.
-- La policy WITH CHECK (organization_id = current_organization_id()) doit rejeter.

SELECT throws_ok(
  $$INSERT INTO shortlist_criteria
      (organization_id, target, required_specialties, allowed_departments)
    VALUES (
      '00000000-0000-0000-0000-00000000000b',
      'companies',
      '{}',
      '{}'
    )$$,
  '42501',
  NULL,
  'shortlist_criteria : INSERT cross-tenant (OrgA tente OrgB) refuse RLS 42501'
);

-- ============================================================================
-- PARTIE II — tender_briefs
-- ============================================================================

-- Repasse en superuser pour verifier pg_class puis rebascule
RESET ROLE;
SET LOCAL row_security = off;

-- ─── Test 6 : FORCE RLS active sur tender_briefs ───────────────────────────

SELECT is(
  (SELECT relrowsecurity      FROM pg_class WHERE relname = 'tender_briefs'),
  true,
  'tender_briefs ENABLE RLS (relrowsecurity = true)'
);
SELECT is(
  (SELECT relforcerowsecurity FROM pg_class WHERE relname = 'tender_briefs'),
  true,
  'tender_briefs FORCE RLS (relforcerowsecurity = true)'
);

-- ─── Test 7 : SELECT sans JWT retourne 0 lignes ────────────────────────────
-- La policy utilise auth.uid() (sub du JWT) + memberships sous-SELECT.
-- Sans JWT valide, auth.uid() retourne NULL → sous-SELECT retourne 0 lignes
-- → aucun brief n'est visible.

SET LOCAL ROLE test_authenticated;
SET LOCAL row_security = on;

-- Même pattern : JWT vide {} → auth.uid() = NULL → 0 lignes.
SELECT set_config('request.jwt.claims', '{}', true);

SELECT is(
  (SELECT count(*)::int FROM tender_briefs),
  0,
  'tender_briefs : SELECT sans JWT (auth.uid() = NULL) retourne 0 lignes'
);

-- ─── Test 8 : SELECT retourne uniquement les briefs OrgA ───────────────────
-- Alice (OrgA admin) a un membership dans OrgA.
-- La policy "organization_id IN (SELECT org FROM memberships WHERE user_id = auth.uid())"
-- doit retourner uniquement les 2 briefs OrgA (actif + inactif).

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-1111111111a1","app_metadata":{"organization_id":"00000000-0000-0000-0000-00000000000a","role":"admin"}}',
  true
);

SELECT is(
  (SELECT count(*)::int FROM tender_briefs
   WHERE id IN (
     'aabb2222-0000-0000-0000-000000000001'::uuid,
     'aabb2222-0000-0000-0000-000000000002'::uuid,
     'bbcc2222-0000-0000-0000-000000000001'::uuid
   )),
  2,
  'tender_briefs : Alice (OrgA) voit ses 2 briefs (actif + inactif), pas celui de OrgB'
);

-- ─── Test 9 : test negatif cross-org — 0 brief OrgB visible depuis OrgA ────

SELECT is(
  (SELECT count(*)::int FROM tender_briefs
   WHERE organization_id = '00000000-0000-0000-0000-00000000000b'),
  0,
  'tender_briefs : Alice (OrgA) voit 0 briefs de OrgB (isolation cross-tenant)'
);

-- ─── Test 10 : filtre is_active = true — seul le brief actif est retourne ───
-- Simule le LEFT JOIN que getTendersOfTheDay effectue :
-- WHERE tender_id = <id> AND is_active = true.

SELECT is(
  (SELECT count(*)::int FROM tender_briefs
   WHERE tender_id = 'aabb3333-0000-0000-0000-000000000001'::uuid
     AND is_active = true),
  1,
  'tender_briefs : filtre is_active = true retourne exactement 1 brief actif pour OrgA'
);

-- ─── Test 11 : INSERT cross-tenant refuse (RLS 42501) ──────────────────────
-- Alice (OrgA admin) tente un INSERT avec organization_id = OrgB.
-- La policy WITH CHECK doit rejeter (org OrgB n'est pas dans les memberships Alice).

SELECT throws_ok(
  $$INSERT INTO tender_briefs
      (tender_id, organization_id, content, is_active)
    VALUES (
      'bbcc3333-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-00000000000b',
      'Brief injecte cross-tenant',
      true
    )$$,
  '42501',
  NULL,
  'tender_briefs : INSERT cross-tenant (OrgA tente OrgB) refuse RLS 42501'
);

SELECT * FROM finish();
ROLLBACK;
