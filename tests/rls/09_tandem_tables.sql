-- ============================================================================
-- pgTAP 09_tandem_tables -- edifio Sourcing
-- ----------------------------------------------------------------------------
-- Cross-tenant Tandem : verifie que les tables touchees par la PR
-- `feat/tandem-engine` etape 1 sont bien RLS FORCE + tenant_isolation strict.
--
-- Tables couvertes :
--   - architect_responses        (ajout tokenId + followupSentAt)
--   - architect_tokens           (deja en place, on revalide)
--   - architect_opposition_tokens (NEW)
--   - odoo_opportunities          (refonte multi-opp Solo/Tandem)
--   - match_proposals             (en place, revalide)
--
-- Methode (alignee sur 02_tenant_isolation.sql) :
--   1. Setup 2 orgs OrgA + OrgB en bypass RLS (superuser)
--   2. Insertion de fixtures Tandem cross-tenant (architects, tokens,
--      responses, oppositions, opportunities) dans les 2 orgs
--   3. Bascule sur role test_authenticated + JWT claims OrgA
--   4. Assertions cross-tenant : count = 1 par requete (OrgA seule)
--
-- Audit code A16 `architect_response` couvert par le test pgTAP dedie
-- `10_audit_a16.sql`.
--
-- Structure ouverte par Nadia (`dev_tandem`) — Camille (`qa`) complete les
-- assertions fines (multi-opp Solo/Tandem index partiels, idempotence
-- response, etc.) lors de l'etape 4 du plan PLAN_TANDEM_NADIA_260522.md.
-- ============================================================================

BEGIN;
-- 1 setup + 5 cross-tenant + 1 current_org check = 7 assertions
SELECT plan(7);

-- ---- Setup : 2 organisations + utilisateurs + memberships ------------------

SET LOCAL row_security = off;

INSERT INTO organizations (id, name) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'OrgA_Tandem'),
  ('00000000-0000-0000-0000-00000000000b', 'OrgB_Tandem')
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

-- Platform de reference
INSERT INTO platforms (id, code, display_name, auth_type, base_url) VALUES
  ('cccc0000-0000-0000-0000-000000000001', 'boamp', 'BOAMP', 'api_key', 'https://data.boamp.fr')
ON CONFLICT (code) DO NOTHING;

-- Tenders OrgA + OrgB
INSERT INTO tenders (id, organization_id, external_ref, platform_id, title, buyer) VALUES
  ('aa993333-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   'TANDEM-A-001', (SELECT id FROM platforms WHERE code = 'boamp'), 'AO Tandem OrgA', 'Mairie A'),
  ('bb993333-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b',
   'TANDEM-B-001', (SELECT id FROM platforms WHERE code = 'boamp'), 'AO Tandem OrgB', 'Mairie B')
ON CONFLICT (organization_id, external_ref) DO NOTHING;

-- Architects OrgA + OrgB (nouveau modele : cabinet/contact_name/email)
INSERT INTO architects (id, organization_id, cabinet, contact_name, email) VALUES
  ('aa994444-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   'Cabinet A Tandem', 'Alice Archi', 'alice.archi@orga.test'),
  ('bb994444-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b',
   'Cabinet B Tandem', 'Bob Archi', 'bob.archi@orgb.test')
ON CONFLICT (organization_id, email) DO NOTHING;

-- Tokens architectes (sollicitation Tandem) OrgA + OrgB
INSERT INTO architect_tokens (id, tender_id, architect_id, organization_id, jwt_id, expires_at) VALUES
  ('aa995555-0000-0000-0000-000000000001', 'aa993333-0000-0000-0000-000000000001',
   'aa994444-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   'jti-orga-001', now() + interval '30 days'),
  ('bb995555-0000-0000-0000-000000000001', 'bb993333-0000-0000-0000-000000000001',
   'bb994444-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b',
   'jti-orgb-001', now() + interval '30 days')
ON CONFLICT (jwt_id) DO NOTHING;

-- Architect responses (avec tokenId — colonne NEW)
INSERT INTO architect_responses (tender_id, organization_id, architect_id, token_id, status) VALUES
  ('aa993333-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   'aa994444-0000-0000-0000-000000000001', 'aa995555-0000-0000-0000-000000000001', 'pending'),
  ('bb993333-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b',
   'bb994444-0000-0000-0000-000000000001', 'bb995555-0000-0000-0000-000000000001', 'pending')
ON CONFLICT (tender_id, architect_id) DO NOTHING;

-- Architect opposition tokens (NEW table)
INSERT INTO architect_opposition_tokens (architect_id, organization_id, jti, expires_at) VALUES
  ('aa994444-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   'oppose-jti-orga-001', now() + interval '5 years'),
  ('bb994444-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b',
   'oppose-jti-orgb-001', now() + interval '5 years')
ON CONFLICT (jti) DO NOTHING;

-- Match proposals OrgA + OrgB
INSERT INTO match_proposals (tender_id, organization_id, architect_id, score, rank) VALUES
  ('aa993333-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   'aa994444-0000-0000-0000-000000000001', 87.50, 1),
  ('bb993333-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b',
   'bb994444-0000-0000-0000-000000000001', 92.00, 1)
ON CONFLICT (tender_id, architect_id) DO NOTHING;

-- Odoo opportunities multi-opp (refonte : 1 Solo OrgA + 1 Tandem OrgA + 1 Solo OrgB)
INSERT INTO odoo_opportunities (tender_id, organization_id, architect_id, origin, odoo_id) VALUES
  ('aa993333-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   NULL, 'solo', 10001),
  ('aa993333-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   'aa994444-0000-0000-0000-000000000001', 'tandem', 10002),
  ('bb993333-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b',
   NULL, 'solo', 20001)
ON CONFLICT DO NOTHING;

SELECT ok(true, 'Setup Tandem OrgA + OrgB cross-tenant pose');

-- ---- Bascule sur role applicatif + JWT OrgA --------------------------------
SET LOCAL ROLE test_authenticated;
SET LOCAL row_security = on;

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

-- 2-6. Cross-tenant : Alice ne voit que les donnees OrgA
SELECT is(
  (SELECT count(*)::int FROM architect_responses
   WHERE tender_id IN ('aa993333-0000-0000-0000-000000000001'::uuid,
                       'bb993333-0000-0000-0000-000000000001'::uuid)),
  1,
  'architect_responses : Alice (OrgA) ne voit que sa reponse, pas OrgB'
);

SELECT is(
  (SELECT count(*)::int FROM architect_tokens
   WHERE jwt_id IN ('jti-orga-001', 'jti-orgb-001')),
  1,
  'architect_tokens : Alice (OrgA) ne voit que son token, pas OrgB'
);

SELECT is(
  (SELECT count(*)::int FROM architect_opposition_tokens
   WHERE jti IN ('oppose-jti-orga-001', 'oppose-jti-orgb-001')),
  1,
  'architect_opposition_tokens : Alice (OrgA) ne voit que son token oppo, pas OrgB'
);

SELECT is(
  (SELECT count(*)::int FROM odoo_opportunities
   WHERE tender_id IN ('aa993333-0000-0000-0000-000000000001'::uuid,
                       'bb993333-0000-0000-0000-000000000001'::uuid)),
  2,
  'odoo_opportunities : Alice (OrgA) voit 2 opps (1 Solo + 1 Tandem) sur AO OrgA, pas l opp OrgB'
);

SELECT is(
  (SELECT count(*)::int FROM match_proposals
   WHERE tender_id IN ('aa993333-0000-0000-0000-000000000001'::uuid,
                       'bb993333-0000-0000-0000-000000000001'::uuid)),
  1,
  'match_proposals : Alice (OrgA) ne voit que sa proposition, pas OrgB'
);

SELECT * FROM finish();
ROLLBACK;
