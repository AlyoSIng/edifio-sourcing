-- ============================================================================
-- dryrun-supabase-stubs.sql — stubs Supabase pour banc de dry-run vanilla PG
-- ============================================================================
-- Reproduit le minimum des objets manages par Supabase (roles, auth, storage)
-- pour que les migrations du monorepo (0001-0128) + Sourcing (0129-0131)
-- s appliquent sur un postgres:17 vanilla. Aligne sur le stub valide lors du
-- dry-run bascule 0050-0053 du 10/06 (cf. notes-de-suivi CC_260610_0855).
-- ============================================================================

-- Roles Supabase
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
END $$;

-- Extension utilisee par le monorepo (contrib incluse dans postgres:17)
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Schema auth (stub GoTrue)
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  raw_app_meta_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- auth.uid()/jwt() lisent request.jwt.claims (comme le vrai GoTrue + le stub
-- db-rls.yml) : permet les smokes RLS S13/S14 avec sessions simulees via
-- SET request.jwt.claims. NULL si aucune session simulee.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS
  $$ SELECT (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid; $$
  LANGUAGE sql STABLE;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text AS
  $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', 'authenticated'); $$
  LANGUAGE sql STABLE;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb AS
  $$ SELECT NULLIF(current_setting('request.jwt.claims', true), '')::jsonb; $$
  LANGUAGE sql STABLE;

-- Schema storage (stub Storage API) — policies des migrations 0002, 0033, 0041,
-- 0045, 0046, 0059, 0065, 0068b, 0079, 0092 ciblent storage.objects/buckets.
CREATE SCHEMA IF NOT EXISTS storage;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[],
  owner uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets(id),
  name text,
  owner uuid,
  metadata jsonb,
  path_tokens text[] GENERATED ALWAYS AS (string_to_array(name, '/')) STORED,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[] AS $$
  SELECT string_to_array(name, '/');
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION storage.filename(name text) RETURNS text AS $$
  SELECT (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)];
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION storage.extension(name text) RETURNS text AS $$
  SELECT reverse(split_part(reverse(name), '.', 1));
$$ LANGUAGE sql IMMUTABLE;

GRANT USAGE ON SCHEMA auth, storage TO authenticated, anon, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA storage TO authenticated, anon, service_role;

-- Default privileges du schema public — la PLATEFORME Supabase les pose a
-- l'init du projet (hors migrations) : anon/authenticated/service_role ont
-- GRANT sur tables/fonctions/sequences de public. Sans ce bloc, un banc
-- vanilla refuse aux roles simules l'acces aux objets crees par les
-- migrations (constat smoke S13 du 11/06 : permission denied organizations).
GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, anon, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, anon, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated, anon, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated, anon, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated, anon, service_role;

SELECT 'STUBS SUPABASE OK' AS status;
