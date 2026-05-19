-- ============================================================================
-- pgTAP 04_audit_immutable -- edifio Sourcing
-- ----------------------------------------------------------------------------
-- Verifie l'immutabilite de la table audit_logs :
--   - INSERT autorise (audit normal)
--   - UPDATE refuse (trigger reject_audit_mutation -- SQLSTATE P0001)
--   - DELETE refuse (trigger reject_audit_mutation -- SQLSTATE P0001)
--
-- Reference : specs/schema_v1.sql l.437-447, migration 0002_rls section 6.
-- ADR-013 + Gate 5 : retention 5 ans, jamais d'effacement applicatif meme
-- pour un admin. Ce test verrouille cette regle au niveau du schema.
-- ============================================================================

BEGIN;
SELECT plan(3);

-- Bypass RLS pour le setup
SET LOCAL row_security = off;

-- Cree une org + un user + une ligne audit_logs
INSERT INTO organizations (id, name) VALUES
  ('00000000-0000-0000-0000-00000000000c', 'OrgC-audit');
-- Stub auth.users (Supabase Auth absent en CI/dry-run, cf. workflow + script).
INSERT INTO auth.users (id, email) VALUES
  ('33333333-3333-3333-3333-333333333333', 'admin-audit@orga.test');
INSERT INTO users (id, email) VALUES
  ('33333333-3333-3333-3333-333333333333', 'admin-audit@orga.test');
INSERT INTO memberships (organization_id, user_id, role) VALUES
  ('00000000-0000-0000-0000-00000000000c', '33333333-3333-3333-3333-333333333333', 'admin');

-- 1. INSERT audit_logs : autorise (audit normal)
SELECT lives_ok(
  $$INSERT INTO audit_logs (organization_id, actor_id, actor_email, actor_role, action, subject_type)
    VALUES ('00000000-0000-0000-0000-00000000000c',
            '33333333-3333-3333-3333-333333333333',
            'admin-audit@orga.test',
            'admin',
            'login',
            'session')$$,
  'INSERT audit_logs autorise (audit immutable = append-only, pas insert-interdit)'
);

-- 2. UPDATE audit_logs : refuse (trigger reject_audit_mutation -> P0001)
SELECT throws_ok(
  $$UPDATE audit_logs SET subject_type = 'hacked'$$,
  'P0001',
  'audit_logs is immutable: UPDATE and DELETE are forbidden',
  'UPDATE audit_logs DOIT lever l''exception immutabilite (P0001)'
);

-- 3. DELETE audit_logs : refuse (trigger reject_audit_mutation -> P0001)
SELECT throws_ok(
  $$DELETE FROM audit_logs$$,
  'P0001',
  'audit_logs is immutable: UPDATE and DELETE are forbidden',
  'DELETE audit_logs DOIT lever l''exception immutabilite (P0001)'
);

SELECT * FROM finish();
ROLLBACK;
