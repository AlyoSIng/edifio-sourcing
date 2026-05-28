-- Migration 0028 — Fix current_organization_id() : COALESCE JWT + app.current_organization_id
--
-- Problème : withTenantContext() pose app.current_organization_id via SET LOCAL,
-- mais la fonction current_organization_id() ne lisait que request.jwt.claims.
-- Les deux settings ne se croisaient pas → withTenantContext() inopérant pour
-- les Edge Functions avec rôles restreints (hors postgres/service_role).
--
-- Fix : COALESCE — essaie JWT d'abord (path standard Supabase Auth),
-- tombe sur app.current_organization_id en fallback (scripts, withTenantContext).
-- Le rôle postgres a rolbypassrls=true et bypasse FORCE RLS de toute façon ;
-- le fix sécurise les futurs rôles restreints dès la Phase 2.
--
-- NB : Steve applique cette migration en prod (règle ops prod).

CREATE OR REPLACE FUNCTION current_organization_id() RETURNS uuid AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true)::jsonb #>> '{app_metadata,organization_id}', '')::uuid,
    NULLIF(current_setting('app.current_organization_id', true), '')::uuid
  )
$$ LANGUAGE sql STABLE;
