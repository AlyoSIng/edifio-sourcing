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

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$ SELECT NULL::uuid; $$ LANGUAGE sql STABLE;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text AS $$ SELECT 'authenticated'::text; $$ LANGUAGE sql STABLE;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb AS $$ SELECT '{}'::jsonb; $$ LANGUAGE sql STABLE;

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

SELECT 'STUBS SUPABASE OK' AS status;
