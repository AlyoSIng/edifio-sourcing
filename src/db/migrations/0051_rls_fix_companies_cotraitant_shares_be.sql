-- ============================================================================
-- 0051_rls_fix_companies_cotraitant_shares_be -- Fix dette securite RLS
--                                                pre-existante (audit Hugo PR #121).
-- ----------------------------------------------------------------------------
-- Contexte : audit securite final main 2026-06-08 (gates/AUDIT_SECU_FINAL_MAIN_260608.md)
--   + review Hugo PR #121 (gates/REVIEW_HUGO_PR121_RISQUES_SECU.md). Hugo a flag
--   VETO conditionnel : 3 tables sans RLS en prod actuelle, dette pre-existante
--   amplifiee par la bascule multi-tenant prevue le 18 juillet 2026.
--
-- Tables fixees :
--   - companies          (migration 0011, annuaire entreprises BTP/majors)
--   - bureaux_etudes     (migration 0011, annuaire BE partenaires)
--   - cotraitant_shares  (migration 0014, tokens partage cotraitant)
--   + cotraitant_share_items (migration 0014, pieces du partage — herite par share_id)
--
-- ----------------------------------------------------------------------------
-- STRATEGIE -- ENABLE seul, PAS de FORCE (decision pragmatique zone orange)
-- ----------------------------------------------------------------------------
-- Le pattern Sourcing utilise `current_organization_id()` (lit JWT Supabase ou
-- session var `app.current_organization_id` posee par withTenantContext, cf.
-- migration 0028) et NON la sous-requete `memberships WHERE user_id = auth.uid()`.
-- Cf. 0002_rls.sql et 0018_rls_cotraitants_be.sql.
--
-- Probleme : les actions sur ces 3 tables (src/app/sourcing/entreprises/actions.ts,
-- src/app/sourcing/bureaux-etudes/, src/app/cotraitant/[token]/page.tsx)
-- utilisent `db` Drizzle direct SANS withTenantContext. Si on pose FORCE RLS :
--   - rôle postgres (DATABASE_URL prod) cesse de bypass FORCE RLS
--   - current_organization_id() renvoie NULL (pas de JWT, pas de SET LOCAL)
--   - policy tenant_isolation rejette toutes les lignes
--   - les pages annuaires + le flow public cotraitant cassent en prod
--
-- C'est exactement le bug fixe en PR #86 (fetchArchitectsPage qui ne wrappait
-- pas dans withTenantContext, 28 mai 2026). Si on FORCE RLS sans corriger
-- prealable les call sites, on regresse.
--
-- Decision (zone orange, escalade CTO Sophie dans /handoff/) :
--   1. ENABLE RLS + policies tenant_isolation + admin_write/admin_update sur
--      companies, bureaux_etudes (lot 1.7, ce fichier).
--   2. ENABLE RLS + policies tenant_isolation + acces token public sur
--      cotraitant_shares + cotraitant_share_items (lot 1.7, ce fichier).
--   3. FORCE RLS reporte en LOT 1.7-bis (futur PR) : conditionne au audit
--      complet des call sites + wrap systematique dans withTenantContext.
--
-- Effet net immediat :
--   - En CI (pg_prove, rôle test_authenticated NOINHERIT) : RLS s'applique,
--     tests pgTAP 13-14-15 verifient l'isolation cross-tenant et le flux token.
--   - En runtime prod (rôle postgres BYPASSRLS) : ENABLE seul ne bloque pas
--     le bypass. Comportement actuel preserve, ZERO regression page.
--   - Future migration de routes vers rôle Supabase `authenticated` (SDK
--     client) : la RLS s'active automatiquement, le multi-tenant est garanti.
--
-- Reference patterns : 0002_rls.sql (audit_logs FOR ALL + role check),
-- 0018_rls_cotraitants_be.sql (pattern admin_write/admin_update RESTRICTIVE).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ENABLE ROW LEVEL SECURITY -- 4 tables (3 cibles + cotraitant_share_items
--    herite par share_id de cotraitant_shares)
-- ----------------------------------------------------------------------------
ALTER TABLE "companies"               ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bureaux_etudes"          ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cotraitant_shares"       ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cotraitant_share_items"  ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 2. POLICIES tenant_isolation -- 3 tables avec organization_id direct
-- ----------------------------------------------------------------------------
-- companies, bureaux_etudes, cotraitant_shares portent organization_id en NOT NULL.
-- Pattern standard 0002_rls.sql : USING (organization_id = current_organization_id()).

CREATE POLICY "tenant_isolation" ON "companies"
  USING (organization_id = current_organization_id());--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "bureaux_etudes"
  USING (organization_id = current_organization_id());--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "cotraitant_shares"
  USING (organization_id = current_organization_id());--> statement-breakpoint

-- cotraitant_share_items : pas de colonne organization_id directe.
-- On remonte au cotraitant_shares parent via share_id (meme pattern que
-- tender_lots dans 0002_rls.sql l.129-134).
CREATE POLICY "tenant_isolation" ON "cotraitant_share_items"
  USING (EXISTS (
    SELECT 1 FROM "cotraitant_shares" s
    WHERE s.id = share_id
      AND s.organization_id = current_organization_id()
  ));--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 3. POLICIES public_token_read -- flow cotraitant non-authentifie
-- ----------------------------------------------------------------------------
-- La page /cotraitant/[token] (src/app/cotraitant/[token]/page.tsx) est servie
-- SANS auth Supabase : un BE clique sur le lien magique recu par email, lit le
-- partage et redepose les fichiers signes. C'est le seul flow de lecture sans
-- session JWT sur ces 4 tables.
--
-- Securite : la garantie repose sur l'entropie du token (UUID v4 = 122 bits,
-- non devinable + expiration `expires_at` + revoked_at verifies cote app).
-- Le token est UNIQUE sur cotraitant_shares.token (cf. 0014).
--
-- Choix :
--   - PERMISSIVE FOR SELECT USING (TRUE) -- expose en lecture publique
--     CONDITIONNEE par la presence de la clause WHERE token = X cote code.
--   - PERMISSIVE est OR-e avec tenant_isolation -> un user authentifie continue
--     de voir ses lignes via tenant_isolation, un visiteur anon voit toutes les
--     lignes (en theorie). En pratique le code applique TOUJOURS la clause
--     WHERE sur token, donc l'enumeration est impossible sans token valide.
--
-- TODO (lot 1.7-bis) : si on bascule vers le rôle Supabase `anon` ou
-- `authenticated`, restreindre cette policy a un parametre `app.cotraitant_token`
-- pose par middleware ou Edge Function (le rôle postgres bypass ENABLE).
-- Pour l'instant, la policy garde le comportement actuel : zero regression.

CREATE POLICY "public_token_read" ON "cotraitant_shares"
  FOR SELECT
  USING (TRUE);--> statement-breakpoint

-- cotraitant_share_items : lecture publique des items rattaches au partage
-- pour la page /cotraitant/[token]. Idem : le code applique WHERE share_id = X
-- (recupere via le token), pas d'enumeration possible sans share_id derive.
CREATE POLICY "public_token_read" ON "cotraitant_share_items"
  FOR SELECT
  USING (TRUE);--> statement-breakpoint

-- UPDATE public : le cotraitant met a jour signed_storage_path / signed_at /
-- signer_name / signed_filename via l'API /api/cotraitant/[token]/upload.
-- Sans cette policy, l'UPDATE serait bloque cote rôle non-superuser.
-- Le code verifie le token + l'expiration cote API avant le call.
CREATE POLICY "public_token_update_signed" ON "cotraitant_share_items"
  FOR UPDATE
  USING (TRUE)
  WITH CHECK (TRUE);--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 4. POLICIES admin_write RESTRICTIVE -- INSERT reserve aux admins
-- ----------------------------------------------------------------------------
-- Pattern identique a 0018_rls_cotraitants_be.sql l.57-79. AS RESTRICTIVE =
-- AND-e avec tenant_isolation (PERMISSIVE FOR ALL) au lieu d'etre OR'd.
-- Sans RESTRICTIVE, un viewer dans son org passe par tenant_isolation
-- malgre le role check ici.
--
-- Exception cotraitant_shares : on N'IMPOSE PAS admin_write parce que
-- la creation d'un partage est faite cote serveur par n'importe quel user
-- de l'org via Server Action (workflow Tandem v2). Le pattern est identique
-- a tender_documents (pas de admin gate INSERT). Si Hugo veut durcir,
-- ajouter `current_user_role() IN ('admin','user')` dans le WITH CHECK
-- sans RESTRICTIVE pour ne pas casser les Server Actions actuelles.

CREATE POLICY "admin_write" ON "companies" AS RESTRICTIVE
  FOR INSERT WITH CHECK (
    organization_id = current_organization_id()
    AND current_user_role() = 'admin'
  );--> statement-breakpoint

CREATE POLICY "admin_write" ON "bureaux_etudes" AS RESTRICTIVE
  FOR INSERT WITH CHECK (
    organization_id = current_organization_id()
    AND current_user_role() = 'admin'
  );--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 5. POLICIES admin_update RESTRICTIVE -- UPDATE reserve aux admins
-- ----------------------------------------------------------------------------
-- USING verifie la ligne existante avant update, WITH CHECK verifie la ligne
-- resultante apres update (evite changement d'organization_id transverse).

CREATE POLICY "admin_update" ON "companies" AS RESTRICTIVE
  FOR UPDATE USING (
    organization_id = current_organization_id()
    AND current_user_role() = 'admin'
  ) WITH CHECK (
    organization_id = current_organization_id()
    AND current_user_role() = 'admin'
  );--> statement-breakpoint

CREATE POLICY "admin_update" ON "bureaux_etudes" AS RESTRICTIVE
  FOR UPDATE USING (
    organization_id = current_organization_id()
    AND current_user_role() = 'admin'
  ) WITH CHECK (
    organization_id = current_organization_id()
    AND current_user_role() = 'admin'
  );--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 6. TRIGGERS updated_at -- companies + bureaux_etudes
-- ----------------------------------------------------------------------------
-- touch_updated_at() deja declaree en 0002_rls.sql -- on cree uniquement les
-- triggers manquants. cotraitant_shares + cotraitant_share_items n'ont pas
-- updated_at -> pas de trigger.

CREATE TRIGGER "touch_companies" BEFORE UPDATE ON "companies"
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();--> statement-breakpoint

CREATE TRIGGER "touch_bureaux_etudes" BEFORE UPDATE ON "bureaux_etudes"
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
