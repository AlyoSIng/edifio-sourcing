-- ============================================================================
-- 0052_rls_lot17_bis_force_helper_naming -- Alignement Lot 1.7-bis pattern
--                                          monorepo (Sebastien suivi_act_reviewer)
-- ----------------------------------------------------------------------------
-- Contexte : 0051 (Lot 1.7) a pose ENABLE RLS + policies tenant_isolation /
-- admin_write / admin_update / public_token_read sur 4 tables (companies,
-- bureaux_etudes, cotraitant_shares, cotraitant_share_items). Camille (`qa`)
-- a flag CC-1 : FORCE RLS obligatoire sinon service_role bypass = cron sourcing
-- voit tout cross-tenant. Sebastien (suivi_act_reviewer) a identifie 3 ajustements
-- pour aligner sur le pattern monorepo alyos-suivi-chantier (bascule 18 juillet 2026) :
--
--   1. Helper public.current_user_org_id() SECURITY DEFINER + search_path,
--      lookup memberships au lieu du JWT claim. Reference :
--      C:\Dev\alyos-suivi-chantier\app\db\migrations\0001_init.sql:321-330
--      Cree mais PAS encore utilise dans les policies de 0052 (les policies
--      gardent current_organization_id() actuel -- la bascule de la valeur lue
--      sera faite par Sebastien lors du Lot 2 monorepo, en wrap des call sites
--      manquants). Note : ce helper est cree ici comme preparation, pour qu'il
--      soit deja disponible cote BDD prod le 18/07 sans nouvelle migration.
--
--   2. Naming des policies en `<table>_<action>` au lieu de
--      `tenant_isolation` / `admin_write` / `admin_update` / `public_token_*`.
--      Pattern Suivi+ACT (Q2 monorepo : supabase-js direct, 1 policy par action
--      pour clarte audit pgTAP). 12 policies sur les 3 tables + 2 sur
--      cotraitant_share_items.
--
--   3. FORCE ROW LEVEL SECURITY sur les 3 tables (+ cotraitant_share_items
--      pour coherence). Sans FORCE, le role service_role (cron sourcing
--      Edge Functions, scripts) bypass la RLS. Le role `postgres` prod
--      Supabase reste BYPASSRLS -- comportement runtime page identique au
--      Lot 1.7. Cf. patterns 0009, 0018, 0022, 0027, 0038, 0041, 0046, 0048
--      qui FORCE depuis longtemps sans casser la prod.
--
--   4. Restriction `cotraitant_shares` (flow public anon) : remplace
--      `USING (TRUE)` par contrainte de defense en profondeur sur
--      `revoked_at IS NULL AND expires_at > now()`. La policy auth (org-scoped)
--      reste sans cette contrainte -- les admins continuent de voir les shares
--      expires / revoques pour audit / listing sur /sourcing/ao/[id]/tandem/partage.
--
-- ----------------------------------------------------------------------------
-- ANALYSE DE RISQUE FORCE RLS
-- ----------------------------------------------------------------------------
-- Le rôle `postgres` (utilise par DATABASE_URL prod, cf. src/db/client.ts)
-- a rolbypassrls=true cote Supabase. FORCE RLS ne s'applique PAS au role
-- BYPASSRLS (PG doc, `ALTER TABLE ... FORCE ROW LEVEL SECURITY`). Donc :
--   - Pages Next.js Server (db Drizzle direct, sans withTenantContext) :
--     fonctionnent IDENTIQUEMENT (bypass total). Aucune regression.
--   - Edge Functions cron sourcing (service_role, sans BYPASSRLS) :
--     RLS s'applique. Si elles ecrivent dans companies / bureaux_etudes /
--     cotraitant_shares cross-tenant via service_role, elles seront bloquees
--     -- ce qui est LE COMPORTEMENT VOULU par Camille (CC-1).
--   - Flow public /cotraitant/[token] : utilise `db` Drizzle direct (role
--     postgres BYPASSRLS) -- bypass total, aucune regression.
--
-- Si une regression apparait, la migration 0053 fera REVERT de FORCE
-- (ALTER TABLE ... NO FORCE) en attendant le wrap call sites Lot 2 monorepo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. HELPER public.current_user_org_id() -- pattern monorepo Suivi+ACT
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER : execute avec les droits du proprietaire (postgres) qui
-- bypass RLS sur `memberships`. Sans cela, un user authentifie non-admin ne
-- pourrait pas lire sa propre membership (tenant_isolation sur memberships).
-- SET search_path = public, pg_temp : protege contre les attaques de
-- shadowing (CVE-pattern Postgres) -- recommandation officielle PG.
-- ORDER BY created_at LIMIT 1 : un user peut avoir N memberships (multi-org
-- futur Phase 2). On retient la plus ancienne (org "primaire").
--
-- Note : cette fonction n'est PAS utilisee dans les policies 0052 (les policies
-- gardent current_organization_id() pour ne pas casser la prod actuelle). Elle
-- sera adoptee par Sebastien dans le Lot 2 monorepo, apres wrap systematique
-- des call sites dans withTenantContext.

CREATE OR REPLACE FUNCTION public.current_user_org_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT organization_id
  FROM memberships
  WHERE user_id = auth.uid()
  ORDER BY created_at
  LIMIT 1
$$;
--> statement-breakpoint

-- GRANT EXECUTE aux roles Supabase standards. En prod Supabase, `authenticated`
-- et `anon` existent nativement. En CI local Postgres vanilla, ils n'existent pas
-- -> on guard avec un DO block qui no-op si le role est absent (undefined_object).
DO $$
BEGIN
  BEGIN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.current_user_org_id() TO authenticated';
  EXCEPTION WHEN undefined_object THEN
    RAISE NOTICE 'Role authenticated absent (CI local), skip GRANT current_user_org_id().';
  END;
  BEGIN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.current_user_org_id() TO anon';
  EXCEPTION WHEN undefined_object THEN
    RAISE NOTICE 'Role anon absent (CI local), skip GRANT current_user_org_id().';
  END;
END $$;
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 2. FORCE ROW LEVEL SECURITY (CC-1 Camille -- bypass service_role bloque)
-- ----------------------------------------------------------------------------
-- Sans FORCE, le service_role (utilise par Edge Functions cron sourcing) bypass
-- la RLS et pourrait ecrire cross-tenant. Avec FORCE, seul le role postgres
-- (rolbypassrls=true) continue de bypass -- les pages Next.js Server
-- continuent de fonctionner identiquement.

ALTER TABLE "companies"              FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bureaux_etudes"         FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cotraitant_shares"      FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cotraitant_share_items" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 3. DROP des policies du Lot 1.7 (naming tenant_isolation / admin_*)
-- ----------------------------------------------------------------------------
-- Pour eviter le doublonnage de policies (anciennes + nouvelles), on droppe
-- d'abord puis on recree avec le naming <table>_<action>. DROP IF EXISTS
-- assure l'idempotence -- la migration peut etre re-rejouee sans erreur.

-- Anciennes policies Lot 1.7 (DROP IF EXISTS = idempotent)
DROP POLICY IF EXISTS "tenant_isolation"           ON "companies";--> statement-breakpoint
DROP POLICY IF EXISTS "admin_write"                ON "companies";--> statement-breakpoint
DROP POLICY IF EXISTS "admin_update"               ON "companies";--> statement-breakpoint

DROP POLICY IF EXISTS "tenant_isolation"           ON "bureaux_etudes";--> statement-breakpoint
DROP POLICY IF EXISTS "admin_write"                ON "bureaux_etudes";--> statement-breakpoint
DROP POLICY IF EXISTS "admin_update"               ON "bureaux_etudes";--> statement-breakpoint

DROP POLICY IF EXISTS "tenant_isolation"           ON "cotraitant_shares";--> statement-breakpoint
DROP POLICY IF EXISTS "public_token_read"          ON "cotraitant_shares";--> statement-breakpoint

DROP POLICY IF EXISTS "tenant_isolation"           ON "cotraitant_share_items";--> statement-breakpoint
DROP POLICY IF EXISTS "public_token_read"          ON "cotraitant_share_items";--> statement-breakpoint
DROP POLICY IF EXISTS "public_token_update_signed" ON "cotraitant_share_items";--> statement-breakpoint

-- Nouvelles policies Lot 1.7-bis (DROP IF EXISTS = re-runnable en dev)
DROP POLICY IF EXISTS "companies_select"                   ON "companies";--> statement-breakpoint
DROP POLICY IF EXISTS "companies_insert"                   ON "companies";--> statement-breakpoint
DROP POLICY IF EXISTS "companies_update"                   ON "companies";--> statement-breakpoint
DROP POLICY IF EXISTS "companies_delete"                   ON "companies";--> statement-breakpoint

DROP POLICY IF EXISTS "bureaux_etudes_select"              ON "bureaux_etudes";--> statement-breakpoint
DROP POLICY IF EXISTS "bureaux_etudes_insert"              ON "bureaux_etudes";--> statement-breakpoint
DROP POLICY IF EXISTS "bureaux_etudes_update"              ON "bureaux_etudes";--> statement-breakpoint
DROP POLICY IF EXISTS "bureaux_etudes_delete"              ON "bureaux_etudes";--> statement-breakpoint

DROP POLICY IF EXISTS "cotraitant_shares_select"           ON "cotraitant_shares";--> statement-breakpoint
DROP POLICY IF EXISTS "cotraitant_shares_select_public"    ON "cotraitant_shares";--> statement-breakpoint
DROP POLICY IF EXISTS "cotraitant_shares_insert"           ON "cotraitant_shares";--> statement-breakpoint
DROP POLICY IF EXISTS "cotraitant_shares_update"           ON "cotraitant_shares";--> statement-breakpoint
DROP POLICY IF EXISTS "cotraitant_shares_delete"           ON "cotraitant_shares";--> statement-breakpoint

DROP POLICY IF EXISTS "cotraitant_share_items_select"        ON "cotraitant_share_items";--> statement-breakpoint
DROP POLICY IF EXISTS "cotraitant_share_items_select_public" ON "cotraitant_share_items";--> statement-breakpoint
DROP POLICY IF EXISTS "cotraitant_share_items_update_signed" ON "cotraitant_share_items";--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 4. POLICIES `companies` -- naming <table>_<action>
-- ----------------------------------------------------------------------------
-- companies_select   : PERMISSIVE -- org-scoped tenant isolation
-- companies_insert   : PERMISSIVE -- org-scoped + role admin (was admin_write RESTRICTIVE)
-- companies_update   : PERMISSIVE -- org-scoped + role admin (was admin_update RESTRICTIVE)
-- companies_delete   : PERMISSIVE -- org-scoped + role admin
--
-- Choix PERMISSIVE plutot que RESTRICTIVE : 1 seule policy par action permet
-- d'eviter le double check role/org du pattern RESTRICTIVE + tenant_isolation
-- PERMISSIVE qui melange les semantiques. Le pattern monorepo Sebastien
-- (Q2 supabase-js direct) prefere une seule policy par action.

CREATE POLICY "companies_select" ON "companies"
  FOR SELECT
  USING (organization_id = current_organization_id());--> statement-breakpoint

CREATE POLICY "companies_insert" ON "companies"
  FOR INSERT
  WITH CHECK (
    organization_id = current_organization_id()
    AND current_user_role() = 'admin'
  );--> statement-breakpoint

CREATE POLICY "companies_update" ON "companies"
  FOR UPDATE
  USING (
    organization_id = current_organization_id()
    AND current_user_role() = 'admin'
  )
  WITH CHECK (
    organization_id = current_organization_id()
    AND current_user_role() = 'admin'
  );--> statement-breakpoint

CREATE POLICY "companies_delete" ON "companies"
  FOR DELETE
  USING (
    organization_id = current_organization_id()
    AND current_user_role() = 'admin'
  );--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 5. POLICIES `bureaux_etudes` -- naming <table>_<action>
-- ----------------------------------------------------------------------------

CREATE POLICY "bureaux_etudes_select" ON "bureaux_etudes"
  FOR SELECT
  USING (organization_id = current_organization_id());--> statement-breakpoint

CREATE POLICY "bureaux_etudes_insert" ON "bureaux_etudes"
  FOR INSERT
  WITH CHECK (
    organization_id = current_organization_id()
    AND current_user_role() = 'admin'
  );--> statement-breakpoint

CREATE POLICY "bureaux_etudes_update" ON "bureaux_etudes"
  FOR UPDATE
  USING (
    organization_id = current_organization_id()
    AND current_user_role() = 'admin'
  )
  WITH CHECK (
    organization_id = current_organization_id()
    AND current_user_role() = 'admin'
  );--> statement-breakpoint

CREATE POLICY "bureaux_etudes_delete" ON "bureaux_etudes"
  FOR DELETE
  USING (
    organization_id = current_organization_id()
    AND current_user_role() = 'admin'
  );--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 6. POLICIES `cotraitant_shares` -- naming + restriction anon
-- ----------------------------------------------------------------------------
-- DUAL-POLICY SELECT (PERMISSIVE OR-d) :
--   - cotraitant_shares_select        : auth user org-scoped, voit TOUT
--     (y compris shares expires/revoques) -- necessaire pour
--     /sourcing/ao/[id]/tandem/partage qui liste l'historique des partages
--     pour audit/admin.
--   - cotraitant_shares_select_public : anon flow /cotraitant/[token],
--     contrainte de defense en profondeur sur revoked_at IS NULL
--     AND expires_at > now(). La securite reelle reste l'entropie du token
--     UUID v4 (122 bits) + verif code, mais la policy bloque l'enumeration
--     d'un share revoque/expire meme si le token leak post-revocation.
--
-- cotraitant_shares_insert / update / delete : org-scoped, pas de check role
-- (les Server Actions creent/revoquent les shares pour n'importe quel user
-- de l'org, pattern Tandem v2 -- cf. Lot 1.7 commentaire section 4).

CREATE POLICY "cotraitant_shares_select" ON "cotraitant_shares"
  FOR SELECT
  USING (organization_id = current_organization_id());--> statement-breakpoint

CREATE POLICY "cotraitant_shares_select_public" ON "cotraitant_shares"
  FOR SELECT
  USING (
    revoked_at IS NULL
    AND expires_at > now()
  );--> statement-breakpoint

CREATE POLICY "cotraitant_shares_insert" ON "cotraitant_shares"
  FOR INSERT
  WITH CHECK (organization_id = current_organization_id());--> statement-breakpoint

CREATE POLICY "cotraitant_shares_update" ON "cotraitant_shares"
  FOR UPDATE
  USING (organization_id = current_organization_id())
  WITH CHECK (organization_id = current_organization_id());--> statement-breakpoint

CREATE POLICY "cotraitant_shares_delete" ON "cotraitant_shares"
  FOR DELETE
  USING (organization_id = current_organization_id());--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 7. POLICIES `cotraitant_share_items` -- naming + flow public update signed
-- ----------------------------------------------------------------------------
-- Pas de colonne organization_id : on remonte via cotraitant_shares parent.
-- DUAL SELECT (auth via parent + anon via parent actif).
-- UPDATE public signed : depot signe par le BE via /api/cotraitant/[token]/upload,
-- contrainte sur parent share actif (revoked_at IS NULL AND expires_at > now()).

CREATE POLICY "cotraitant_share_items_select" ON "cotraitant_share_items"
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM "cotraitant_shares" s
    WHERE s.id = share_id
      AND s.organization_id = current_organization_id()
  ));--> statement-breakpoint

CREATE POLICY "cotraitant_share_items_select_public" ON "cotraitant_share_items"
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM "cotraitant_shares" s
    WHERE s.id = share_id
      AND s.revoked_at IS NULL
      AND s.expires_at > now()
  ));--> statement-breakpoint

CREATE POLICY "cotraitant_share_items_update_signed" ON "cotraitant_share_items"
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM "cotraitant_shares" s
    WHERE s.id = share_id
      AND s.revoked_at IS NULL
      AND s.expires_at > now()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "cotraitant_shares" s
    WHERE s.id = share_id
      AND s.revoked_at IS NULL
      AND s.expires_at > now()
  ));--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- FIN Lot 1.7-bis
-- ----------------------------------------------------------------------------
-- Tests pgTAP adaptes : tests/rls/13_companies_isolation.sql,
-- tests/rls/14_cotraitant_shares_isolation.sql,
-- tests/rls/15_bureaux_etudes_isolation.sql.
-- Verifications :
--   - relforcerowsecurity = true sur les 4 tables
--   - policies <table>_<action> existent dans pg_policies
--   - current_user_org_id() retourne bien la 1ere membership user
--   - flow anon cotraitant_shares respecte expires_at (test cas expire)
-- ============================================================================
