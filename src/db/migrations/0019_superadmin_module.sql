-- Migration 0019 — Module superadmin (rôle éditeur edifio)
--
-- Ajoute :
--   - valeur 'superadmin' à l'enum membership_role
--   - 9 tables : support_tickets, news_items, user_news_reads, formations,
--     faq_items, guided_tests, guided_test_submissions, app_content, notifications
--   - RLS ENABLE + FORCE sur toutes les nouvelles tables
--   - Policies RLS (accès propre + superadmin all)
--
-- IMPORTANT : ALTER TYPE ADD VALUE ne peut PAS tourner dans une transaction.
-- Ce bloc doit être exécuté hors BEGIN/COMMIT.
--
-- Décision Board 2026-05-27 — 3e rôle 'superadmin' réservé à l'éditeur edifio
-- (contact@edifio.fr + steissier@alyosingenierie.fr).

ALTER TYPE membership_role ADD VALUE IF NOT EXISTS 'superadmin';

-- ─── Tables ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS support_tickets (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id        UUID        NOT NULL,
  subject        TEXT        NOT NULL CHECK (char_length(subject) <= 200),
  message        TEXT        NOT NULL CHECK (char_length(message) <= 5000),
  status         TEXT        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'closed')),
  response       TEXT,
  responded_at   TIMESTAMPTZ,
  responded_by   UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS news_items (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT        NOT NULL CHECK (char_length(title) <= 300),
  content      TEXT        NOT NULL,
  is_published BOOLEAN     NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  author_id    UUID        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_news_reads (
  user_id UUID        NOT NULL,
  news_id UUID        NOT NULL REFERENCES news_items(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, news_id)
);

CREATE TABLE IF NOT EXISTS formations (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT        NOT NULL CHECK (char_length(title) <= 300),
  description   TEXT,
  url           TEXT,
  type          TEXT        NOT NULL DEFAULT 'video' CHECK (type IN ('video', 'doc', 'external')),
  thumbnail_url TEXT,
  duration_min  INTEGER,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  display_order INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS faq_items (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  question      TEXT        NOT NULL CHECK (char_length(question) <= 500),
  answer        TEXT        NOT NULL,
  category      TEXT        NOT NULL DEFAULT 'general',
  display_order INTEGER     NOT NULL DEFAULT 0,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS guided_tests (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT        NOT NULL CHECK (char_length(title) <= 300),
  formation_id  UUID        REFERENCES formations(id) ON DELETE SET NULL,
  steps         JSONB       NOT NULL DEFAULT '[]',
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  display_order INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS guided_test_submissions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id      UUID        NOT NULL REFERENCES guided_tests(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL,
  org_id       UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  answers      JSONB       NOT NULL DEFAULT '{}',
  remarks      TEXT,
  score        INTEGER,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_content (
  key          TEXT        PRIMARY KEY,
  content_text TEXT,
  content_url  TEXT,
  content_json JSONB,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   UUID
);

-- Clés initiales pour la plaquette, la roadmap et la démo
INSERT INTO app_content (key) VALUES
  ('pitch_pdf_url'),
  ('roadmap_pdf_url'),
  ('demo_video_url')
ON CONFLICT (key) DO NOTHING;

-- Attention : la table `notifications` est déjà utilisée par le module intégrations
-- (migration 0001, notifications Odoo/Brevo avec org_id). Cette table est distincte :
-- notifications in-app légères (news, support_reply, system) sans org_id.
CREATE TABLE IF NOT EXISTS user_notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL,
  type       TEXT        NOT NULL CHECK (type IN ('news', 'support_reply', 'system')),
  title      TEXT        NOT NULL,
  body       TEXT,
  payload    JSONB,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Index ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_support_tickets_org_id
  ON support_tickets(org_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id
  ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status
  ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_news_items_published
  ON news_items(is_published, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_notifications_user_id
  ON user_notifications(user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_guided_test_submissions_user
  ON guided_test_submissions(user_id, test_id);

-- ─── Fonction trigger updated_at ─────────────────────────────────────────────

-- La fonction touch_updated_at() peut déjà exister (migration 0001).
-- CREATE OR REPLACE est idempotent.
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER touch_support_tickets
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE OR REPLACE TRIGGER touch_news_items
  BEFORE UPDATE ON news_items
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE OR REPLACE TRIGGER touch_formations
  BEFORE UPDATE ON formations
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE OR REPLACE TRIGGER touch_guided_tests
  BEFORE UPDATE ON guided_tests
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ─── RLS : ENABLE + FORCE ────────────────────────────────────────────────────

ALTER TABLE support_tickets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets         FORCE  ROW LEVEL SECURITY;
ALTER TABLE news_items              ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_items              FORCE  ROW LEVEL SECURITY;
ALTER TABLE user_news_reads         ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_news_reads         FORCE  ROW LEVEL SECURITY;
ALTER TABLE formations              ENABLE ROW LEVEL SECURITY;
ALTER TABLE formations              FORCE  ROW LEVEL SECURITY;
ALTER TABLE faq_items               ENABLE ROW LEVEL SECURITY;
ALTER TABLE faq_items               FORCE  ROW LEVEL SECURITY;
ALTER TABLE guided_tests            ENABLE ROW LEVEL SECURITY;
ALTER TABLE guided_tests            FORCE  ROW LEVEL SECURITY;
ALTER TABLE guided_test_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE guided_test_submissions FORCE  ROW LEVEL SECURITY;
ALTER TABLE app_content             ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_content             FORCE  ROW LEVEL SECURITY;
ALTER TABLE user_notifications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_notifications      FORCE  ROW LEVEL SECURITY;

-- ─── Policies RLS ────────────────────────────────────────────────────────────

-- support_tickets
CREATE POLICY support_tickets_user_select ON support_tickets
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY support_tickets_user_insert ON support_tickets
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY support_tickets_superadmin_all ON support_tickets
  FOR ALL
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'superadmin');

-- news_items
CREATE POLICY news_items_read ON news_items
  FOR SELECT
  USING (
    is_published = true
    OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'superadmin'
  );

CREATE POLICY news_items_superadmin_write ON news_items
  FOR ALL
  USING  ((auth.jwt() -> 'user_metadata' ->> 'role') = 'superadmin')
  WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') = 'superadmin');

-- user_news_reads
CREATE POLICY user_news_reads_own ON user_news_reads
  FOR ALL
  USING    (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- formations
CREATE POLICY formations_read ON formations
  FOR SELECT
  USING (
    is_active = true
    OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'superadmin'
  );

CREATE POLICY formations_superadmin_write ON formations
  FOR ALL
  USING  ((auth.jwt() -> 'user_metadata' ->> 'role') = 'superadmin')
  WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') = 'superadmin');

-- faq_items
CREATE POLICY faq_items_read ON faq_items
  FOR SELECT
  USING (
    is_active = true
    OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'superadmin'
  );

CREATE POLICY faq_items_superadmin_write ON faq_items
  FOR ALL
  USING  ((auth.jwt() -> 'user_metadata' ->> 'role') = 'superadmin')
  WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') = 'superadmin');

-- guided_tests
CREATE POLICY guided_tests_read ON guided_tests
  FOR SELECT
  USING (
    is_active = true
    OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'superadmin'
  );

CREATE POLICY guided_tests_superadmin_write ON guided_tests
  FOR ALL
  USING  ((auth.jwt() -> 'user_metadata' ->> 'role') = 'superadmin')
  WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') = 'superadmin');

-- guided_test_submissions
CREATE POLICY guided_test_submissions_own ON guided_test_submissions
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'superadmin'
  );

CREATE POLICY guided_test_submissions_insert ON guided_test_submissions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- app_content (lecture publique — tous les authentifiés peuvent voir le contenu)
CREATE POLICY app_content_read ON app_content
  FOR SELECT
  USING (true);

CREATE POLICY app_content_superadmin_write ON app_content
  FOR ALL
  USING  ((auth.jwt() -> 'user_metadata' ->> 'role') = 'superadmin')
  WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') = 'superadmin');

-- user_notifications (chaque user voit et gère ses propres notifications in-app)
CREATE POLICY user_notifications_own ON user_notifications
  FOR ALL
  USING    (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
