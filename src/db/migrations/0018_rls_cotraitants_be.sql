-- ============================================================================
-- 0018_rls_cotraitants_be -- RLS policies pour cotraitants, tender_cotraitants,
--                            cotraitant_documents, be_documents
--
-- Tables creees en migrations 0014 et 0016 sans RLS. Ce fichier les securise
-- avec le meme pattern que 0009_rls_messaging.sql :
--   - ENABLE + FORCE RLS (bypass service_role bloque)
--   - tenant_isolation PERMISSIVE ALL (lecture + ecriture org-scoped)
--   - admin_write RESTRICTIVE INSERT (seuls admins inserent)
--   - admin_update RESTRICTIVE UPDATE (seuls admins mettent a jour)
--   - trigger touch_updated_at sur cotraitants uniquement (seule table avec updated_at)
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
ALTER TABLE "cotraitants"           ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tender_cotraitants"    ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cotraitant_documents"  ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "be_documents"          ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cotraitants"           FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tender_cotraitants"    FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cotraitant_documents"  FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "be_documents"          FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- POLICIES tenant_isolation (PERMISSIVE FOR ALL)
-- Scope de lecture et d'ecriture limite au tenant courant.
-- PERMISSIVE = OR avec les autres policies PERMISSIVE (ici il n'y en a pas
-- d'autre), donc le RESTRICTIVE admin_write s'applique en AND par-dessus.
-- ----------------------------------------------------------------------------
CREATE POLICY "tenant_isolation" ON "cotraitants"
  USING (organization_id = current_organization_id());--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "tender_cotraitants"
  USING (organization_id = current_organization_id());--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "cotraitant_documents"
  USING (organization_id = current_organization_id());--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "be_documents"
  USING (organization_id = current_organization_id());--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- POLICIES admin_write RESTRICTIVE (INSERT reserve aux admins)
-- AS RESTRICTIVE : AND-e avec tenant_isolation, evite qu'un user/viewer
-- contourne via la policy permissive (meme pattern que insert_by_member
-- sur architects en 0002_rls.sql l.207).
-- ----------------------------------------------------------------------------
CREATE POLICY "admin_write" ON "cotraitants" AS RESTRICTIVE
  FOR INSERT WITH CHECK (
    organization_id = current_organization_id()
    AND current_user_role() = 'admin'
  );--> statement-breakpoint

CREATE POLICY "admin_write" ON "tender_cotraitants" AS RESTRICTIVE
  FOR INSERT WITH CHECK (
    organization_id = current_organization_id()
    AND current_user_role() = 'admin'
  );--> statement-breakpoint

CREATE POLICY "admin_write" ON "cotraitant_documents" AS RESTRICTIVE
  FOR INSERT WITH CHECK (
    organization_id = current_organization_id()
    AND current_user_role() = 'admin'
  );--> statement-breakpoint

CREATE POLICY "admin_write" ON "be_documents" AS RESTRICTIVE
  FOR INSERT WITH CHECK (
    organization_id = current_organization_id()
    AND current_user_role() = 'admin'
  );--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- POLICIES admin_update RESTRICTIVE (UPDATE reserve aux admins)
-- USING verifie la ligne existante avant update, WITH CHECK verifie la ligne
-- resultante apres update (evite de changer organization_id vers un autre tenant).
-- ----------------------------------------------------------------------------
CREATE POLICY "admin_update" ON "cotraitants" AS RESTRICTIVE
  FOR UPDATE USING (
    organization_id = current_organization_id()
    AND current_user_role() = 'admin'
  ) WITH CHECK (
    organization_id = current_organization_id()
    AND current_user_role() = 'admin'
  );--> statement-breakpoint

CREATE POLICY "admin_update" ON "tender_cotraitants" AS RESTRICTIVE
  FOR UPDATE USING (
    organization_id = current_organization_id()
    AND current_user_role() = 'admin'
  ) WITH CHECK (
    organization_id = current_organization_id()
    AND current_user_role() = 'admin'
  );--> statement-breakpoint

CREATE POLICY "admin_update" ON "cotraitant_documents" AS RESTRICTIVE
  FOR UPDATE USING (
    organization_id = current_organization_id()
    AND current_user_role() = 'admin'
  ) WITH CHECK (
    organization_id = current_organization_id()
    AND current_user_role() = 'admin'
  );--> statement-breakpoint

CREATE POLICY "admin_update" ON "be_documents" AS RESTRICTIVE
  FOR UPDATE USING (
    organization_id = current_organization_id()
    AND current_user_role() = 'admin'
  ) WITH CHECK (
    organization_id = current_organization_id()
    AND current_user_role() = 'admin'
  );--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- TRIGGER touch_updated_at
-- touch_updated_at() deja declaree en 0002_rls.sql -- on cree uniquement
-- le trigger manquant sur cotraitants (seule table avec colonne updated_at).
-- tender_cotraitants, cotraitant_documents, be_documents n'ont pas updated_at.
-- ----------------------------------------------------------------------------
CREATE TRIGGER "touch_cotraitants" BEFORE UPDATE ON "cotraitants"
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
