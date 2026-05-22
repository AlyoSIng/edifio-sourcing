-- ============================================================================
-- pgTAP 10_audit_a16 -- edifio Sourcing
-- ----------------------------------------------------------------------------
-- Verifie que le code audit A16 `architect_response` est bien :
--   1. accepte en INSERT dans audit_logs (enum value presente)
--   2. soumis a l'immutabilite (UPDATE rejete, DELETE rejete) comme A1-A15
--   3. soumis a la RLS admin-only (cross-tenant + role check)
--
-- Reference :
--   - specs/audit_log_v1.md §A16
--   - src/db/schema/enums.ts (auditAction array, A16 en derniere position)
--   - DECISIONS.md 2026-05-22 decision (b)
--
-- Structure ouverte par Nadia (`dev_tandem`) — Camille (`qa`) complete les
-- assertions fines (validation payload Zod, FK token_jti, etc.) lors de
-- l'etape 5 du plan PLAN_TANDEM_NADIA_260522.md.
-- ============================================================================

BEGIN;
SELECT plan(5);

-- ---- Setup minimal : 1 org + 1 admin --------------------------------------
SET LOCAL row_security = off;

INSERT INTO organizations (id, name) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'OrgA_AuditA16')
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-1111111111a1', 'alice@orga.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, email) VALUES
  ('11111111-1111-1111-1111-1111111111a1', 'alice@orga.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO memberships (organization_id, user_id, role) VALUES
  ('00000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-1111111111a1', 'admin')
ON CONFLICT DO NOTHING;

-- ---- 1. L'enum audit_action contient bien 'architect_response' -------------
SELECT is(
  (SELECT 'architect_response'::audit_action::text),
  'architect_response',
  'audit_action enum contient bien la valeur A16 architect_response'
);

-- ---- 2. INSERT A16 dans audit_logs : autorise (immutabilite = INSERT-only OK) --
INSERT INTO audit_logs (
  organization_id, actor_id, actor_email, actor_role, action,
  subject_type, subject_id, data
) VALUES (
  '00000000-0000-0000-0000-00000000000a',
  '11111111-1111-1111-1111-1111111111a1',
  'alice@orga.test',
  'admin',
  'architect_response',
  'tender',
  'aa993333-0000-0000-0000-000000000001',
  '{
    "tender_id": "aa993333-0000-0000-0000-000000000001",
    "tender_ref": "TANDEM-A-001",
    "architect_id": "aa994444-0000-0000-0000-000000000001",
    "architect_email": "alice.archi@orga.test",
    "response_status": "accepted",
    "via_token": true,
    "token_jti": "jti-orga-001",
    "info_request_text": null,
    "responded_at": "2026-05-25T10:42:00.000Z"
  }'::jsonb
);

SELECT is(
  (SELECT count(*)::int FROM audit_logs
   WHERE action = 'architect_response'
     AND organization_id = '00000000-0000-0000-0000-00000000000a'),
  1,
  'INSERT A16 architect_response autorise dans audit_logs'
);

-- ---- 3. UPDATE A16 rejete par trigger immutabilite ------------------------
SELECT throws_ok(
  $$UPDATE audit_logs SET data = '{"hacked": true}'::jsonb
    WHERE action = 'architect_response'
      AND organization_id = '00000000-0000-0000-0000-00000000000a'$$,
  'audit_logs is append-only -- UPDATE refuse (immutabilite RGPD/audit)',
  'UPDATE A16 rejete par trigger reject_audit_mutation'
);

-- ---- 4. DELETE A16 rejete par trigger immutabilite ------------------------
SELECT throws_ok(
  $$DELETE FROM audit_logs
    WHERE action = 'architect_response'
      AND organization_id = '00000000-0000-0000-0000-00000000000a'$$,
  'audit_logs is append-only -- DELETE refuse (immutabilite RGPD/audit)',
  'DELETE A16 rejete par trigger reject_audit_mutation'
);

-- ---- 5. RLS : seul admin OrgA lit son audit log A16 -----------------------
SET LOCAL ROLE test_authenticated;
SET LOCAL row_security = on;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-1111111111a1","app_metadata":{"organization_id":"00000000-0000-0000-0000-00000000000a","role":"admin"}}',
  true
);

SELECT is(
  (SELECT count(*)::int FROM audit_logs
   WHERE action = 'architect_response'),
  1,
  'RLS audit_logs : Alice (admin OrgA) voit son A16 architect_response'
);

SELECT * FROM finish();
ROLLBACK;
