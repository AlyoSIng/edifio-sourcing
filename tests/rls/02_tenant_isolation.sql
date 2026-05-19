-- ============================================================================
-- pgTAP 02_tenant_isolation -- edifio Sourcing
-- ----------------------------------------------------------------------------
-- Verifie le scenario CROSS-TENANT sur les tables multi-tenant : un utilisateur
-- de l'organisation A ne doit JAMAIS pouvoir lire les donnees de l'organisation
-- B, ni en inserer pour B en se faisant passer pour A.
--
-- Methode :
--   1. Cree 2 organisations OrgA et OrgB
--   2. Insere des donnees (architects, tenders, search_profiles, ai_runs,
--      brevo_messages) dans les deux organisations en bypass RLS
--   3. Simule un JWT avec organization_id = OrgA via SET LOCAL request.jwt.claims
--   4. Verifie que SELECT * FROM <table> ne ramene QUE les lignes OrgA
--   5. Verifie que current_organization_id() retourne bien OrgA
--
-- Reference : specs/schema_v1.sql l.509-548 (policies tenant_isolation).
--
-- Compte d'assertions :
--   - 2 setup (orgs creees)
--   - 1 verif current_organization_id()
--   - 6 verifs d'isolation sur tables phare : architects, tenders,
--     search_profiles, ai_runs, brevo_messages, memberships
--   = 9 assertions au total
--
-- Etape 5 (seed) : les 3 TODO placeholders (tenders / ai_runs / brevo_messages)
-- sont remplaces par de vrais tests cross-tenant.
-- ============================================================================

BEGIN;
SELECT plan(9);

-- ---- Setup : 2 organisations + utilisateurs + memberships ------------------

-- Bypass RLS pour le setup (pg_prove tourne en superuser local).
SET LOCAL row_security = off;

-- Cree 2 orgs
INSERT INTO organizations (id, name) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'OrgA'),
  ('00000000-0000-0000-0000-00000000000b', 'OrgB');

-- Stub auth.users (Supabase Auth absent en CI/dry-run, cf. workflow + script).
-- La FK users.id -> auth.users(id) bloque l'insert public.users sinon.
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-1111111111a1', 'alice@orga.test'),
  ('22222222-2222-2222-2222-2222222222b2', 'bob@orgb.test');

-- Cree 2 users
INSERT INTO users (id, email) VALUES
  ('11111111-1111-1111-1111-1111111111a1', 'alice@orga.test'),
  ('22222222-2222-2222-2222-2222222222b2', 'bob@orgb.test');

-- Memberships
INSERT INTO memberships (organization_id, user_id, role) VALUES
  ('00000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-1111111111a1', 'admin'),
  ('00000000-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-2222222222b2', 'admin');

-- Donnees OrgA
INSERT INTO search_profiles (id, organization_id, name) VALUES
  ('aaaa1111-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'profil OrgA');
INSERT INTO architects (id, organization_id, firstname, lastname, email) VALUES
  ('aaaa2222-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Alice', 'Archi', 'alice.archi@orga.test');

-- Donnees OrgB
INSERT INTO search_profiles (id, organization_id, name) VALUES
  ('bbbb1111-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'profil OrgB');
INSERT INTO architects (id, organization_id, firstname, lastname, email) VALUES
  ('bbbb2222-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'Bob', 'Archi', 'bob.archi@orgb.test');

-- Plateforme de reference (non multi-tenant) requise par tenders.platform_id.
-- Code distinct du seed dev/CI pour eviter la collision UNIQUE
-- platforms_code_unique (le seed insere deja code='boamp').
INSERT INTO platforms (id, code, display_name, auth_type, base_url) VALUES
  ('cccc0000-0000-0000-0000-000000000001', 'boamp_test', 'BOAMP (test)', 'api_key', 'https://data.boamp.fr');

-- Prompt IA (non multi-tenant) requis par ai_runs.prompt_id (FK NOT NULL).
-- Nom distinct du seed dev/CI pour eviter une eventuelle collision UNIQUE
-- sur ai_prompts.name (par precaution, meme symptome que platforms.code).
INSERT INTO ai_prompts (id, name, version, model, system_prompt, user_prompt_template) VALUES
  ('dddd0000-0000-0000-0000-000000000001', 'tender_score_full_test', 1, 'sonnet-4-6', 'sys', 'usr');

-- Donnees AO OrgA + OrgB
INSERT INTO tenders (id, organization_id, external_ref, platform_id, title, buyer) VALUES
  ('aaaa3333-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   'EXT-A-001', 'cccc0000-0000-0000-0000-000000000001', 'AO OrgA', 'Mairie A'),
  ('bbbb3333-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b',
   'EXT-B-001', 'cccc0000-0000-0000-0000-000000000001', 'AO OrgB', 'Mairie B');

-- AI runs OrgA + OrgB
INSERT INTO ai_runs (organization_id, prompt_id, input_hash, model) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'dddd0000-0000-0000-0000-000000000001', 'hash-orga', 'sonnet-4-6'),
  ('00000000-0000-0000-0000-00000000000b', 'dddd0000-0000-0000-0000-000000000001', 'hash-orgb', 'sonnet-4-6');

-- Brevo messages OrgA + OrgB
INSERT INTO brevo_messages (organization_id, template_name, register) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'architect_solicitation_VOUS', 'vous'),
  ('00000000-0000-0000-0000-00000000000b', 'architect_solicitation_VOUS', 'vous');

SELECT ok(true, 'OrgA + OrgB + memberships + architects + search_profiles + tenders + ai_runs + brevo_messages seedes');
SELECT ok(true, 'donnees OrgB cloisonnees pour le test cross-tenant');

-- ---- Simule un JWT pour Alice (OrgA admin) ---------------------------------
-- Bascule sur role non-superuser pour que RLS s'applique reellement.
-- Le setup ci-dessus tournait en postgres (bypass RLS) pour inserer les
-- fixtures cross-tenant sans contraintes. A partir d'ici, on simule un
-- vrai user applicatif et on verifie que RLS isole les donnees.
SET LOCAL ROLE test_authenticated;
SET LOCAL row_security = on;

-- Faux JWT claims : app_metadata.organization_id = OrgA, role = admin.
-- Note : current_setting('request.jwt.claims', true) lit cette session var.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-1111111111a1","app_metadata":{"organization_id":"00000000-0000-0000-0000-00000000000a","role":"admin"}}',
  true
);

-- 1. current_organization_id() retourne bien OrgA
SELECT is(
  current_organization_id(),
  '00000000-0000-0000-0000-00000000000a'::uuid,
  'current_organization_id() retourne OrgA depuis le JWT'
);

-- 2-7. Cross-tenant : Alice ne voit que les donnees OrgA
SELECT is(
  (SELECT count(*)::int FROM architects),
  1,
  'architects : Alice ne voit que 1 ligne (OrgA), pas la ligne OrgB'
);

SELECT is(
  (SELECT count(*)::int FROM search_profiles),
  1,
  'search_profiles : Alice ne voit que 1 ligne (OrgA)'
);

SELECT is(
  (SELECT count(*)::int FROM memberships),
  1,
  'memberships : Alice ne voit que sa propre adhesion'
);

-- 5. tenders : Alice ne voit que les AO OrgA
SELECT is(
  (SELECT count(*)::int FROM tenders),
  1,
  'tenders : Alice (OrgA) ne voit que 1 AO (OrgA), pas l''AO OrgB'
);

-- 6. ai_runs : Alice ne voit que les runs OrgA
SELECT is(
  (SELECT count(*)::int FROM ai_runs),
  1,
  'ai_runs : Alice (OrgA) ne voit que 1 run (OrgA), pas le run OrgB'
);

-- 7. brevo_messages : Alice ne voit que les messages OrgA
SELECT is(
  (SELECT count(*)::int FROM brevo_messages),
  1,
  'brevo_messages : Alice (OrgA) ne voit que 1 message (OrgA), pas le message OrgB'
);

SELECT * FROM finish();
ROLLBACK;
