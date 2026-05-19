-- ============================================================================
-- edifio Sourcing — Schéma de base de données complet
-- Version : 1.0 — 2026-05-10
-- Auteur  : [CTO Sophie Vasseur] — AlyoS Ingénierie / DEV TEAM
-- Cible   : PostgreSQL 15+ via Supabase EU (Frankfurt)
-- Statut  : Spec figée Gate 5, à brancher sur Drizzle ou Prisma (spike Gate 6)
-- Notes   : RLS FORCE sur 100 % des tables multi-tenant. Audit log immutable.
--           Tutoiement architectes (Gate 4) intégré. 14 statuts (Gate 4).
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- recherche textuelle tenders.title

-- ============================================================================
-- TYPES ENUM
-- ============================================================================
CREATE TYPE membership_role AS ENUM ('admin', 'user', 'viewer');
CREATE TYPE platform_code AS ENUM ('boamp', 'place', 'francmarches', 'mp_info');
CREATE TYPE auth_type AS ENUM ('api_key', 'oauth', 'login_password', 'none');
CREATE TYPE partnership_status AS ENUM ('actif', 'inactif', 'prospect');

CREATE TYPE tender_status AS ENUM (
  'sourced',
  'selected_solo', 'selected_tandem',
  'awaiting_architect', 'architect_accepted',
  'architect_declined', 'architect_info_requested',
  'dossier_review_required', 'dossier_ready', 'dossier_diffused',
  'submitted', 'won', 'lost', 'dropped'
);

CREATE TYPE selection_mode AS ENUM ('solo', 'tandem');
CREATE TYPE architect_response_status AS ENUM ('pending', 'accepted', 'declined', 'info_requested');
CREATE TYPE ai_model AS ENUM ('sonnet-4-6', 'haiku-4-5');
CREATE TYPE brevo_register AS ENUM ('tu', 'vous', 'neutre');

CREATE TYPE audit_action AS ENUM (
  'login', 'membership_change', 'search_profile_change',
  'tender_select', 'architect_solicit', 'dossier_diffuse',
  'ai_run', 'odoo_opportunity_create', 'architect_change',
  'rgpd_export', 'token_revoke', 'data_delete', 'access_attempt'
);

CREATE TYPE learning_event_type AS ENUM ('selected', 'rejected');

-- ============================================================================
-- HELPERS RLS
-- ============================================================================
-- Récupère organization_id de l'utilisateur courant depuis JWT
CREATE OR REPLACE FUNCTION current_organization_id() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb #>> '{app_metadata,organization_id}', '')::uuid
$$ LANGUAGE sql STABLE;

-- Vérifie rôle de l'utilisateur courant
CREATE OR REPLACE FUNCTION current_user_role() RETURNS membership_role AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb #>> '{app_metadata,role}', '')::membership_role
$$ LANGUAGE sql STABLE;

-- ============================================================================
-- 1. ORGANIZATIONS & USERS
-- ============================================================================
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  siren text UNIQUE,
  odoo_config jsonb,  -- Vault-encrypted in app code
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  firstname text,
  lastname text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role membership_role NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE INDEX idx_memberships_user ON memberships(user_id);

-- ============================================================================
-- 2. CONFIGURATION (profils, plateformes)
-- ============================================================================
CREATE TABLE search_profiles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  keywords jsonb NOT NULL DEFAULT '{"positive":[],"negative":[],"exact":[]}'::jsonb,
  cpv_codes text[] NOT NULL DEFAULT '{}',
  geo_zones text[] NOT NULL DEFAULT '{}',  -- départements / régions
  market_types text[] NOT NULL DEFAULT '{}',  -- travaux, services, MOE
  amount_min numeric(14,2),
  amount_max numeric(14,2),
  active boolean NOT NULL DEFAULT true,
  cron_time time NOT NULL DEFAULT '06:30',
  cron_days int[] NOT NULL DEFAULT '{1,2,3,4,5}',  -- 1=lundi ... 5=vendredi
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_search_profiles_org ON search_profiles(organization_id) WHERE active;

CREATE TABLE platforms (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  code platform_code NOT NULL UNIQUE,
  display_name text NOT NULL,
  auth_type auth_type NOT NULL,
  base_url text NOT NULL,
  enabled boolean NOT NULL DEFAULT true
);

INSERT INTO platforms (code, display_name, auth_type, base_url) VALUES
  ('boamp',       'BOAMP',         'api_key',        'https://api.boamp.fr/'),
  ('place',       'PLACE',         'login_password', 'https://www.marches-publics.gouv.fr/'),
  ('francmarches','Francmarchés',  'none',           'https://www.francemarches.com/'),
  ('mp_info',     'marches-publics.info', 'none',    'https://www.marches-publics.info/');

CREATE TABLE platform_credentials (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  platform_id uuid NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
  credentials_vault_ref text NOT NULL,  -- pointeur Supabase Vault, jamais en clair
  active boolean NOT NULL DEFAULT true,
  last_validated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, platform_id)
);

-- ============================================================================
-- 3. ARCHITECTS
-- ============================================================================
CREATE TABLE architect_specialties (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  code text NOT NULL UNIQUE,
  label_fr text NOT NULL
);

INSERT INTO architect_specialties (code, label_fr) VALUES
  ('erp',         'ERP'),
  ('logement',    'Logement'),
  ('scolaire',    'Scolaire'),
  ('sante',       'Santé'),
  ('patrimoine',  'Patrimoine'),
  ('tertiaire',   'Tertiaire'),
  ('industriel',  'Industriel');

CREATE TABLE architects (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  firstname text NOT NULL,
  lastname text NOT NULL,
  title text,  -- M./Mme/Dr/etc.
  email text NOT NULL,
  phone text,
  siret text,
  specialty_codes text[] NOT NULL DEFAULT '{}',
  geo_zones text[] NOT NULL DEFAULT '{}',
  references text,
  partnership_status partnership_status NOT NULL DEFAULT 'prospect',
  notes text,
  tutoiement boolean NOT NULL DEFAULT FALSE,  -- Gate 4 directive Board : vouvoiement par défaut
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, email)
);

CREATE INDEX idx_architects_org ON architects(organization_id);
CREATE INDEX idx_architects_siret ON architects(siret) WHERE siret IS NOT NULL;
CREATE INDEX idx_architects_specialties ON architects USING gin(specialty_codes);

-- ============================================================================
-- 4. TENDERS (AO sourcés)
-- ============================================================================
CREATE TABLE tenders (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  external_ref text NOT NULL,
  platform_id uuid NOT NULL REFERENCES platforms(id),
  title text NOT NULL,
  buyer text NOT NULL,
  cpv text[] NOT NULL DEFAULT '{}',
  amount numeric(14,2),
  deadline timestamptz,
  questions_deadline timestamptz,
  visit_date timestamptz,
  dce_url text,
  source_url text,
  raw_data jsonb,  -- payload brut de la plateforme pour debug
  score numeric(5,2) CHECK (score >= 0 AND score <= 100),
  status tender_status NOT NULL DEFAULT 'sourced',
  matching_profile_id uuid REFERENCES search_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, external_ref, platform_id)  -- idempotence
);

CREATE INDEX idx_tenders_org_status ON tenders(organization_id, status);
CREATE INDEX idx_tenders_deadline ON tenders(deadline) WHERE deadline > now();
CREATE INDEX idx_tenders_title_trgm ON tenders USING gin(title gin_trgm_ops);
CREATE INDEX idx_tenders_score ON tenders(organization_id, score DESC) WHERE status = 'sourced';

CREATE TABLE tender_lots (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tender_id uuid NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  lot_number int NOT NULL,
  description text,
  amount numeric(14,2),
  UNIQUE (tender_id, lot_number)
);

CREATE TABLE tender_documents (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tender_id uuid NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind text NOT NULL,  -- RC, CCAP, CCTP, BPU, DPGF, plans, etc.
  name text NOT NULL,
  format text,  -- pdf, docx, xlsx, dwg, etc.
  storage_path text NOT NULL,  -- chemin Supabase Storage
  size_bytes bigint,
  analyzed boolean NOT NULL DEFAULT FALSE,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tender_documents_tender ON tender_documents(tender_id);

CREATE TABLE tender_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tender_id uuid NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type text NOT NULL,  -- 'sourced','selected','architect_solicited',...
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  data jsonb
);

CREATE INDEX idx_tender_events_tender ON tender_events(tender_id, occurred_at);

-- ============================================================================
-- 5. SELECTIONS, MATCHING, ARCHITECT RESPONSES
-- ============================================================================
CREATE TABLE selections (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tender_id uuid NOT NULL UNIQUE REFERENCES tenders(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  mode selection_mode NOT NULL,
  selected_by uuid NOT NULL REFERENCES users(id),
  selected_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz
);

CREATE TABLE match_proposals (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tender_id uuid NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  architect_id uuid NOT NULL REFERENCES architects(id) ON DELETE CASCADE,
  score numeric(5,2) NOT NULL,
  rank int NOT NULL,
  rationale text,  -- texte généré par IA pour "Pourquoi cet archi"
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tender_id, architect_id)
);

CREATE INDEX idx_match_proposals_tender ON match_proposals(tender_id, rank);

CREATE TABLE architect_responses (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tender_id uuid NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  architect_id uuid NOT NULL REFERENCES architects(id) ON DELETE CASCADE,
  status architect_response_status NOT NULL DEFAULT 'pending',
  responded_at timestamptz,
  info_request_text text,
  UNIQUE (tender_id, architect_id)
);

CREATE INDEX idx_architect_responses_status ON architect_responses(status, tender_id);

CREATE TABLE architect_tokens (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tender_id uuid NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  architect_id uuid NOT NULL REFERENCES architects(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  jwt_id text NOT NULL UNIQUE,  -- jti claim
  expires_at timestamptz NOT NULL,
  revoked boolean NOT NULL DEFAULT FALSE,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_architect_tokens_active ON architect_tokens(jwt_id) WHERE revoked = FALSE;

-- ============================================================================
-- 6. RESPONSE FILES & PRESENTATION LIBRARY
-- ============================================================================
CREATE TABLE response_files (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tender_id uuid NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind text NOT NULL,  -- 'DC1','DC2','DC4','ATTRI1','memo','annexe', etc.
  name text NOT NULL,
  storage_path text NOT NULL,
  size_bytes bigint,
  validated boolean NOT NULL DEFAULT FALSE,
  validated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  validated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_response_files_tender ON response_files(tender_id);

CREATE TABLE presentation_library (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind text NOT NULL,  -- 'presentation','attestation','reference','cv'
  name text NOT NULL,
  storage_path text NOT NULL,
  size_bytes bigint,
  valid_until date,  -- pour attestations (alertes J-30/J-7/J-1)
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_presentation_library_org_kind ON presentation_library(organization_id, kind);
CREATE INDEX idx_presentation_library_expiry ON presentation_library(valid_until) WHERE valid_until IS NOT NULL;

-- ============================================================================
-- 7. AI PROMPTS & RUNS (provenance Gate 5 - prompts versionnés en BDD)
-- ============================================================================
CREATE TABLE ai_prompts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,  -- ex. 'rc_analysis_full'
  version int NOT NULL,
  model ai_model NOT NULL,
  system_prompt text NOT NULL,
  user_prompt_template text NOT NULL,
  output_schema_zod text,  -- expression Zod sérialisée pour validation côté app
  active boolean NOT NULL DEFAULT TRUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, version)
);

CREATE INDEX idx_ai_prompts_active ON ai_prompts(name) WHERE active;

CREATE TABLE ai_runs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  prompt_id uuid NOT NULL REFERENCES ai_prompts(id),
  tender_id uuid REFERENCES tenders(id) ON DELETE SET NULL,
  input_hash text NOT NULL,
  output jsonb,
  cost_usd numeric(8,4),
  latency_ms int,
  model ai_model NOT NULL,
  succeeded boolean NOT NULL DEFAULT TRUE,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_runs_org_date ON ai_runs(organization_id, created_at DESC);
CREATE INDEX idx_ai_runs_tender ON ai_runs(tender_id) WHERE tender_id IS NOT NULL;

-- ============================================================================
-- 8. INTÉGRATIONS (Odoo, Brevo, Notifications)
-- ============================================================================
CREATE TABLE odoo_opportunities (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tender_id uuid NOT NULL UNIQUE REFERENCES tenders(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  odoo_id int NOT NULL,
  odoo_stage text,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE brevo_messages (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tender_id uuid REFERENCES tenders(id) ON DELETE CASCADE,
  architect_id uuid REFERENCES architects(id) ON DELETE SET NULL,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_name text NOT NULL,  -- 'architect_solicitation_TU' etc.
  register brevo_register NOT NULL,
  brevo_message_id text,
  sent_at timestamptz,
  events jsonb NOT NULL DEFAULT '[]'::jsonb,  -- delivered, opened, clicked, bounced
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_brevo_messages_tender ON brevo_messages(tender_id);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  notification_type text NOT NULL,  -- 'ao_du_jour','architect_responded','dossier_ready',...
  title text NOT NULL,
  body text,
  payload jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_unread ON notifications(user_id, created_at DESC) WHERE read_at IS NULL;

-- ============================================================================
-- 9. AUDIT LOG & LEARNING EVENTS
-- ============================================================================
-- Audit log : IMMUTABLE (insertion only, pas d'UPDATE/DELETE), rétention 5 ans.
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_email text,  -- snapshot (utile si user supprimé)
  actor_role membership_role,
  action audit_action NOT NULL,
  subject_type text,  -- 'tender','architect','user','dossier',...
  subject_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  ip_address inet,
  user_agent text,
  data jsonb
);

CREATE INDEX idx_audit_logs_org_date ON audit_logs(organization_id, occurred_at DESC);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_id) WHERE actor_id IS NOT NULL;
CREATE INDEX idx_audit_logs_action ON audit_logs(action, occurred_at DESC);

-- Immutabilité : pas d'UPDATE ni de DELETE
CREATE OR REPLACE FUNCTION reject_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is immutable: UPDATE and DELETE are forbidden';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_update BEFORE UPDATE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();
CREATE TRIGGER audit_logs_no_delete BEFORE DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();

CREATE TABLE learning_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tender_id uuid NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  event_type learning_event_type NOT NULL,
  motif_category text,  -- 'mots_cles','type_marche','geo','autre'
  verbatim text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_learning_events_org_date ON learning_events(organization_id, occurred_at DESC);

-- ============================================================================
-- 10. RLS POLICIES — FORCE sur toutes tables multi-tenant
-- ============================================================================
ALTER TABLE organizations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships           ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_credentials  ENABLE ROW LEVEL SECURITY;
ALTER TABLE architects            ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenders               ENABLE ROW LEVEL SECURITY;
ALTER TABLE tender_lots           ENABLE ROW LEVEL SECURITY;
ALTER TABLE tender_documents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tender_events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE selections            ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_proposals       ENABLE ROW LEVEL SECURITY;
ALTER TABLE architect_responses   ENABLE ROW LEVEL SECURITY;
ALTER TABLE architect_tokens      ENABLE ROW LEVEL SECURITY;
ALTER TABLE response_files        ENABLE ROW LEVEL SECURITY;
ALTER TABLE presentation_library  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_runs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE odoo_opportunities    ENABLE ROW LEVEL SECURITY;
ALTER TABLE brevo_messages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications         ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_events       ENABLE ROW LEVEL SECURITY;

-- FORCE RLS pour empêcher tout bypass par le service_role côté app
ALTER TABLE memberships           FORCE ROW LEVEL SECURITY;
ALTER TABLE search_profiles       FORCE ROW LEVEL SECURITY;
ALTER TABLE platform_credentials  FORCE ROW LEVEL SECURITY;
ALTER TABLE architects            FORCE ROW LEVEL SECURITY;
ALTER TABLE tenders               FORCE ROW LEVEL SECURITY;
ALTER TABLE tender_documents      FORCE ROW LEVEL SECURITY;
ALTER TABLE tender_events         FORCE ROW LEVEL SECURITY;
ALTER TABLE selections            FORCE ROW LEVEL SECURITY;
ALTER TABLE match_proposals       FORCE ROW LEVEL SECURITY;
ALTER TABLE architect_responses   FORCE ROW LEVEL SECURITY;
ALTER TABLE architect_tokens      FORCE ROW LEVEL SECURITY;
ALTER TABLE response_files        FORCE ROW LEVEL SECURITY;
ALTER TABLE presentation_library  FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_runs               FORCE ROW LEVEL SECURITY;
ALTER TABLE odoo_opportunities    FORCE ROW LEVEL SECURITY;
ALTER TABLE brevo_messages        FORCE ROW LEVEL SECURITY;
ALTER TABLE notifications         FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs            FORCE ROW LEVEL SECURITY;
ALTER TABLE learning_events       FORCE ROW LEVEL SECURITY;

-- Politique standard : isolation par organization_id
CREATE POLICY tenant_isolation ON memberships
  USING (organization_id = current_organization_id());
CREATE POLICY tenant_isolation ON search_profiles
  USING (organization_id = current_organization_id());
CREATE POLICY tenant_isolation ON platform_credentials
  USING (organization_id = current_organization_id());
CREATE POLICY tenant_isolation ON architects
  USING (organization_id = current_organization_id());
CREATE POLICY tenant_isolation ON tenders
  USING (organization_id = current_organization_id());
CREATE POLICY tenant_isolation ON tender_lots
  USING (EXISTS (SELECT 1 FROM tenders t WHERE t.id = tender_id AND t.organization_id = current_organization_id()));
CREATE POLICY tenant_isolation ON tender_documents
  USING (organization_id = current_organization_id());
CREATE POLICY tenant_isolation ON tender_events
  USING (organization_id = current_organization_id());
CREATE POLICY tenant_isolation ON selections
  USING (organization_id = current_organization_id());
CREATE POLICY tenant_isolation ON match_proposals
  USING (organization_id = current_organization_id());
CREATE POLICY tenant_isolation ON architect_responses
  USING (organization_id = current_organization_id());
CREATE POLICY tenant_isolation ON architect_tokens
  USING (organization_id = current_organization_id());
CREATE POLICY tenant_isolation ON response_files
  USING (organization_id = current_organization_id());
CREATE POLICY tenant_isolation ON presentation_library
  USING (organization_id = current_organization_id());
CREATE POLICY tenant_isolation ON ai_runs
  USING (organization_id = current_organization_id());
CREATE POLICY tenant_isolation ON odoo_opportunities
  USING (organization_id = current_organization_id());
CREATE POLICY tenant_isolation ON brevo_messages
  USING (organization_id = current_organization_id());
CREATE POLICY tenant_isolation ON notifications
  USING (organization_id = current_organization_id() AND user_id = (auth.jwt()->>'sub')::uuid);
CREATE POLICY tenant_isolation ON audit_logs
  USING (organization_id = current_organization_id() AND current_user_role() = 'admin');  -- audit logs visibles admin only
CREATE POLICY tenant_isolation ON learning_events
  USING (organization_id = current_organization_id());

-- Insertion : admin OU user
-- AS RESTRICTIVE : sans ce qualificatif, le check est OR'd avec la policy
-- PERMISSIVE tenant_isolation FOR ALL (qui couvre l'INSERT par defaut),
-- ce qui laisse un viewer inserer dans sa propre org. RESTRICTIVE force le AND.
-- Cf. DECISIONS.md 2026-05-19 (post-mortem 6e derive Postgres consecutive).
CREATE POLICY insert_by_member ON architects AS RESTRICTIVE FOR INSERT
  WITH CHECK (organization_id = current_organization_id() AND current_user_role() IN ('admin','user'));
-- (À répliquer sur tables où insert nécessite membre actif. Volontairement laissé minimal — Alex complétera selon contraintes métier.)

-- ============================================================================
-- 11. UPDATED_AT TRIGGERS
-- ============================================================================
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER touch_organizations BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER touch_search_profiles BEFORE UPDATE ON search_profiles
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER touch_architects BEFORE UPDATE ON architects
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER touch_tenders BEFORE UPDATE ON tenders
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER touch_presentation_library BEFORE UPDATE ON presentation_library
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ============================================================================
-- FIN DU SCHÉMA v1.0
-- ============================================================================
-- À fournir à [DEV Alex] après spike ORM.
-- Côté Drizzle : transformation 1:1 du DDL via drizzle-kit introspect, puis
--   ajustement des relations.
-- Côté Prisma : transformation via prisma db pull puis ajustement schema.prisma.
-- Tests pgTAP RLS à écrire : 1 test par table multi-tenant (cross-tenant denied),
--   1 test par enum (valeurs autorisées), 1 test sur immutabilité audit_logs.
