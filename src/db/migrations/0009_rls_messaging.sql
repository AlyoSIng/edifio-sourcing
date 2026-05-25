-- ============================================================================
-- 0009_rls_messaging -- RLS policies pour message_templates + organization_profiles
--
-- Tables creees en migration 0008 sans RLS. Ce fichier les securise avec
-- le meme pattern que 0002_rls.sql :
--   - ENABLE + FORCE RLS (bypass service_role bloque)
--   - tenant_isolation PERMISSIVE ALL (lecture + ecriture org-scoped)
--   - admin_write RESTRICTIVE INSERT (seuls admins inserent)
--   - admin_update RESTRICTIVE UPDATE (seuls admins mettent a jour)
--   - triggers touch_updated_at
--
-- Helpers current_organization_id() + current_user_role() deja definis
-- en 0002_rls. membership_role enum ('admin','user','viewer') deja declare.
--
-- Note : FORCE ROW LEVEL SECURITY bloque egalement service_role (utile en
-- Edge Functions qui tournent sous service_role). Le seul moyen de bypass
-- est BYPASSRLS sur le role postgres, reserve aux scripts de migration.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ENABLE + FORCE RLS
-- ----------------------------------------------------------------------------
ALTER TABLE "message_templates"    ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organization_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "message_templates"    FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organization_profiles" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- POLICIES tenant_isolation (PERMISSIVE FOR ALL)
-- Scope de lecture et d'ecriture limite au tenant courant.
-- PERMISSIVE = OR avec les autres policies PERMISSIVE (ici il n'y en a pas
-- d'autre), donc le RESTRICTIVE admin_write s'applique en AND par-dessus.
-- ----------------------------------------------------------------------------
CREATE POLICY "tenant_isolation" ON "message_templates"
  USING (organization_id = current_organization_id());--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "organization_profiles"
  USING (organization_id = current_organization_id());--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- POLICIES admin_write RESTRICTIVE (INSERT reserve aux admins)
-- AS RESTRICTIVE : AND-e avec tenant_isolation, evite qu'un user/viewer
-- contourne via la policy permissive (meme pattern que insert_by_member
-- sur architects en 0002_rls.sql l.207).
-- ----------------------------------------------------------------------------
CREATE POLICY "admin_write" ON "message_templates" AS RESTRICTIVE
  FOR INSERT WITH CHECK (
    organization_id = current_organization_id()
    AND current_user_role() = 'admin'
  );--> statement-breakpoint

CREATE POLICY "admin_write" ON "organization_profiles" AS RESTRICTIVE
  FOR INSERT WITH CHECK (
    organization_id = current_organization_id()
    AND current_user_role() = 'admin'
  );--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- POLICIES admin_update RESTRICTIVE (UPDATE reserve aux admins)
-- USING verifie la ligne existante avant update, WITH CHECK verifie la ligne
-- resultante apres update (evite de changer organization_id vers un autre tenant).
-- ----------------------------------------------------------------------------
CREATE POLICY "admin_update" ON "message_templates" AS RESTRICTIVE
  FOR UPDATE USING (
    organization_id = current_organization_id()
    AND current_user_role() = 'admin'
  ) WITH CHECK (
    organization_id = current_organization_id()
    AND current_user_role() = 'admin'
  );--> statement-breakpoint

CREATE POLICY "admin_update" ON "organization_profiles" AS RESTRICTIVE
  FOR UPDATE USING (
    organization_id = current_organization_id()
    AND current_user_role() = 'admin'
  ) WITH CHECK (
    organization_id = current_organization_id()
    AND current_user_role() = 'admin'
  );--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- TRIGGERS touch_updated_at
-- touch_updated_at() deja declaree en 0002_rls.sql -- on cree uniquement
-- les triggers manquants sur les tables 0008.
-- ----------------------------------------------------------------------------
CREATE TRIGGER "touch_message_templates" BEFORE UPDATE ON "message_templates"
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();--> statement-breakpoint

CREATE TRIGGER "touch_organization_profiles" BEFORE UPDATE ON "organization_profiles"
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
