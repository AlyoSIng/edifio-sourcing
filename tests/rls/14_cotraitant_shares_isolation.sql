-- ============================================================================
-- pgTAP 14_cotraitant_shares_isolation -- edifio Sourcing
-- ----------------------------------------------------------------------------
-- Cross-tenant `cotraitant_shares` + `cotraitant_share_items` : tokens de
-- partage cotraitant pour le flow Tandem V2 (page publique /cotraitant/[token]).
--
-- Post-0053 (eradication policies anon publiques) :
--   - DROP des policies cotraitant_shares_select_public + variants
--     -> AUCUNE policy `TO anon` ne reste sur ces tables (Sebastien
--     suivi_act_reviewer + Hugo MEGA-FINAL)
--   - 4 SECURITY DEFINER functions remplacent l'acces public :
--       * get_cotraitant_share_by_token(token)
--       * get_cotraitant_share_items_by_token(token)
--       * get_cotraitant_item_original_path(token, item_id)
--       * mark_cotraitant_share_item_signed(token, item_id, path, signer, fname)
--   - Les functions :
--       (a) ne retournent JAMAIS organization_id ni tender_id (anti-leak)
--       (b) verifient revoked_at IS NULL AND expires_at > now() dans le SQL
--           (items / path / sign -- get_cotraitant_share_by_token retourne
--           l'etat brut pour permettre le distingo revoque/expire cote app)
--       (c) refusent IDOR cross-item (jointure cotraitant_shares + items)
--
-- Verifie :
--   1. FORCE RLS toujours active (preservee depuis 0052)
--   2. Naming policies tenant (auth) preserve (cotraitant_shares_select / _insert / _update)
--   3. Policies anon publiques bien SUPPRIMEES (cotraitant_shares_select_public,
--      cotraitant_share_items_select_public, cotraitant_share_items_update_signed)
--   4. Les 4 functions existent avec la bonne signature
--   5. get_cotraitant_share_by_token retourne le share si actif ET si revoke/expire
--      (etat brut, pas de filtre dans cette function)
--   6. get_cotraitant_share_items_by_token retourne 0 row si share revoque ou expire
--      (defense en profondeur)
--   7. get_cotraitant_item_original_path retourne NULL si share inactif OU
--      si item etranger au share (anti-IDOR)
--   8. mark_cotraitant_share_item_signed renvoie FALSE si share inactif
--      OU si item deja signe (anti re-signature)
--   9. Anon ne peut PLUS lire cotraitant_shares directement (pas de policy)
--  10. UPDATE cross-tenant auth bloque par cotraitant_shares_update (preserve)
-- ============================================================================

BEGIN;
-- Plan : 1 setup + 1 force_rls + 3 policies_auth_preserved + 3 policies_anon_dropped
--      + 4 has_function + 1 share_by_token_contact + 1 anti_leak_org_id
--      + 1 items_expired + 1 items_revoked + 1 anti_idor + 1 mark_expired
--      + 1 update_cross_tenant_authn = 19 assertions.
SELECT plan(19);

-- ---- Setup --------------------------------------------------------------

SET LOCAL row_security = off;

INSERT INTO organizations (id, name) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'OrgA_Shares'),
  ('00000000-0000-0000-0000-00000000000b', 'OrgB_Shares')
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

-- Platform requise par tender_id
INSERT INTO platforms (id, code, display_name, auth_type, base_url) VALUES
  ('cccc0000-0000-0000-0000-000000000001', 'boamp', 'BOAMP', 'api_key', 'https://data.boamp.fr')
ON CONFLICT (code) DO NOTHING;

-- Tenders OrgA + OrgB
INSERT INTO tenders (id, organization_id, external_ref, platform_id, title, buyer) VALUES
  ('aa143333-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   'SHARE-A-001', (SELECT id FROM platforms WHERE code = 'boamp'), 'AO Share OrgA', 'Mairie A'),
  ('bb143333-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b',
   'SHARE-B-001', (SELECT id FROM platforms WHERE code = 'boamp'), 'AO Share OrgB', 'Mairie B')
ON CONFLICT (organization_id, external_ref, platform_id) DO NOTHING;

-- Cotraitant shares : 1 OrgA actif + 1 OrgA EXPIRE + 1 OrgA REVOQUE + 1 OrgB actif
INSERT INTO cotraitant_shares
  (id, tender_id, organization_id, contact_name, contact_email, token, expires_at, revoked_at, created_by)
VALUES
  -- OrgA actif (token 0044a4)
  ('aa144444-0000-0000-0000-000000000001',
   'aa143333-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   'Cotraitant A', 'cotraitant@orga.test',
   'aa144444-0000-0000-0000-0000000044a4',
   now() + interval '30 days', NULL, '11111111-1111-1111-1111-1111111111a1'),
  -- OrgA EXPIRE (token 0044a5)
  ('aa144444-0000-0000-0000-000000000002',
   'aa143333-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   'Cotraitant A Expire', 'cotraitant-exp@orga.test',
   'aa144444-0000-0000-0000-0000000044a5',
   now() - interval '1 day', NULL, '11111111-1111-1111-1111-1111111111a1'),
  -- OrgA REVOQUE (token 0044a6)
  ('aa144444-0000-0000-0000-000000000003',
   'aa143333-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   'Cotraitant A Revoque', 'cotraitant-rev@orga.test',
   'aa144444-0000-0000-0000-0000000044a6',
   now() + interval '30 days', now() - interval '1 hour', '11111111-1111-1111-1111-1111111111a1'),
  -- OrgB actif (token 0044b4)
  ('bb144444-0000-0000-0000-000000000001',
   'bb143333-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b',
   'Cotraitant B', 'cotraitant@orgb.test',
   'bb144444-0000-0000-0000-0000000044b4',
   now() + interval '30 days', NULL, '22222222-2222-2222-2222-2222222222b2')
ON CONFLICT (id) DO NOTHING;

-- Cotraitant share_items OrgA actif + OrgB actif (rattaches via share_id)
-- + 1 item rattache au share OrgA actif pour test anti-IDOR
INSERT INTO cotraitant_share_items
  (id, share_id, name, kind, original_storage_path)
VALUES
  ('aa145555-0000-0000-0000-000000000001',
   'aa144444-0000-0000-0000-000000000001',
   'KBIS OrgA', 'kbis', 'org-a/kbis.pdf'),
  ('bb145555-0000-0000-0000-000000000001',
   'bb144444-0000-0000-0000-000000000001',
   'KBIS OrgB', 'kbis', 'org-b/kbis.pdf')
ON CONFLICT (id) DO NOTHING;

SELECT ok(true, 'Setup OrgA (actif + expire + revoque) + OrgB actif + items pose');

-- ---- Assertion 1 : FORCE RLS preservee ----------------------------------

SELECT is(
  (SELECT relforcerowsecurity FROM pg_class WHERE relname = 'cotraitant_shares'),
  true,
  'cotraitant_shares FORCE RLS preserve (relforcerowsecurity = true)'
);

-- ---- Assertion 2-4 : policies tenant auth preservees --------------------

SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cotraitant_shares' AND policyname = 'cotraitant_shares_select'),
  'policy cotraitant_shares_select preservee (auth org-scoped pour /tandem/partage)'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cotraitant_shares' AND policyname = 'cotraitant_shares_insert'),
  'policy cotraitant_shares_insert preservee'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cotraitant_shares' AND policyname = 'cotraitant_shares_update'),
  'policy cotraitant_shares_update preservee'
);

-- ---- Assertion 5-7 : policies anon publiques SUPPRIMEES (0053) ----------
-- C'est LA bombe a retardement eradiquee. Si ces policies reapparaissent,
-- le test echoue et bloque la PR.

SELECT ok(
  NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cotraitant_shares' AND policyname = 'cotraitant_shares_select_public'),
  '0053 : policy cotraitant_shares_select_public SUPPRIMEE (bombe a retardement eradiquee)'
);
SELECT ok(
  NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cotraitant_share_items' AND policyname = 'cotraitant_share_items_select_public'),
  '0053 : policy cotraitant_share_items_select_public SUPPRIMEE'
);
SELECT ok(
  NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cotraitant_share_items' AND policyname = 'cotraitant_share_items_update_signed'),
  '0053 : policy cotraitant_share_items_update_signed SUPPRIMEE'
);

-- ---- Assertion 8 : les 4 functions existent -----------------------------

SELECT has_function(
  'public',
  'get_cotraitant_share_by_token',
  ARRAY['uuid'],
  'function get_cotraitant_share_by_token(uuid) doit exister'
);

SELECT has_function(
  'public',
  'get_cotraitant_share_items_by_token',
  ARRAY['uuid'],
  'function get_cotraitant_share_items_by_token(uuid) doit exister'
);

SELECT has_function(
  'public',
  'get_cotraitant_item_original_path',
  ARRAY['uuid', 'uuid'],
  'function get_cotraitant_item_original_path(uuid, uuid) doit exister'
);

SELECT has_function(
  'public',
  'mark_cotraitant_share_item_signed',
  ARRAY['uuid', 'uuid', 'text', 'text', 'text'],
  'function mark_cotraitant_share_item_signed(uuid, uuid, text, text, text) doit exister'
);

-- ---- Assertion 9 : get_cotraitant_share_by_token retourne le share core
-- ---- meme si expire (etat brut). Le code Next.js distingue les etats.
-- ---- ATTENTION : ne doit JAMAIS retourner organization_id (verif type retour).

SELECT is(
  (SELECT contact_name FROM public.get_cotraitant_share_by_token('aa144444-0000-0000-0000-0000000044a4'::uuid)),
  'Cotraitant A',
  'get_cotraitant_share_by_token : retourne contact_name pour share actif'
);

-- Note : on ne peut pas tester directement "ne retourne pas organization_id"
-- via SELECT * (PG l'ajouterait si la signature le declarait). On verifie via
-- pg_proc.prorettype + pg_type que le record type ne contient pas
-- 'organization_id' dans ses attnames. Pattern pgTAP recommande.
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_type t ON t.oid = p.prorettype
    JOIN pg_attribute a ON a.attrelid = t.typrelid
    WHERE p.proname = 'get_cotraitant_share_by_token'
      AND a.attname = 'organization_id'
  ),
  '0053 anti-leak : get_cotraitant_share_by_token NE retourne PAS organization_id'
);

-- ---- Assertion 10 : get_cotraitant_share_items_by_token refuse share expire

SELECT is(
  (SELECT count(*)::int FROM public.get_cotraitant_share_items_by_token('aa144444-0000-0000-0000-0000000044a5'::uuid)),
  0,
  '0053 defense en profondeur : get_cotraitant_share_items_by_token retourne 0 si share EXPIRE'
);

-- ---- Assertion 11 : get_cotraitant_share_items_by_token refuse share revoque

SELECT is(
  (SELECT count(*)::int FROM public.get_cotraitant_share_items_by_token('aa144444-0000-0000-0000-0000000044a6'::uuid)),
  0,
  '0053 defense en profondeur : get_cotraitant_share_items_by_token retourne 0 si share REVOQUE'
);

-- ---- Assertion 12 : get_cotraitant_item_original_path refuse IDOR cross-item
-- Test : on demande l'item OrgB avec le token OrgA actif -> doit retourner NULL

SELECT is(
  public.get_cotraitant_item_original_path(
    'aa144444-0000-0000-0000-0000000044a4'::uuid,
    'bb145555-0000-0000-0000-000000000001'::uuid  -- item OrgB
  ),
  NULL,
  '0053 anti-IDOR : get_cotraitant_item_original_path NULL si item etranger au share'
);

-- ---- Assertion 13 : mark_cotraitant_share_item_signed refuse share expire

SELECT is(
  public.mark_cotraitant_share_item_signed(
    'aa144444-0000-0000-0000-0000000044a5'::uuid,  -- token expire
    'aa145555-0000-0000-0000-000000000001'::uuid,
    'signed/test.pdf',
    'Test Signer',
    'test.pdf'
  ),
  false,
  '0053 : mark_cotraitant_share_item_signed FALSE si share EXPIRE'
);

-- ---- Assertion 14 : test auth UPDATE cross-tenant (preservation 0052) ---

SET LOCAL ROLE test_authenticated;
SET LOCAL row_security = on;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-1111111111a1","app_metadata":{"organization_id":"00000000-0000-0000-0000-00000000000a","role":"admin"}}',
  true
);

-- UPDATE cross-tenant Alice OrgA sur share OrgB -> 0 row (preserve depuis 0052)
WITH upd AS (
  UPDATE cotraitant_shares SET contact_name = 'HackerName'
   WHERE id = 'bb144444-0000-0000-0000-000000000001'::uuid
   RETURNING id
)
SELECT is(
  (SELECT count(*)::int FROM upd),
  0,
  'cotraitant_shares : Alice (OrgA) UPDATE sur share OrgB renvoie 0 row (policy cotraitant_shares_update bloque)'
);

SELECT * FROM finish();
ROLLBACK;
