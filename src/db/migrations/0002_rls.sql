-- ============================================================================
-- 0002_rls -- edifio Sourcing : RLS FORCE + 20 policies tenant_isolation + 1
--             insert_by_member + helpers + triggers immutabilite audit_logs
--             + triggers updated_at.
-- ----------------------------------------------------------------------------
-- Source de verite : specs/schema_v1.sql sections 10 + 11 + helper functions
-- (lignes 49-58, 437-447, 463-574).
-- Reference ADR-013 (specs/adr_013_orm_drizzle.md) : "RLS via SQL natif hors
-- ORM" -- drizzle-orm ne modelise pas les policies Postgres, on les pose en
-- migration custom (drizzle-kit generate --custom --name=rls).
--
-- Migration custom : ce fichier a ete redige manuellement (drizzle-kit ne
-- genere que le squelette vide). Il NE FAUT PAS le retoucher via
-- `drizzle-kit generate` sans supervision CTO.
--
-- Contenu :
--   1. Helpers SQL : current_organization_id(), current_user_role()
--   2. FORCE ROW LEVEL SECURITY sur 19 tables multi-tenant
--   3. ENABLE ROW LEVEL SECURITY (rappel : 21 tables, organizations + 20 autres
--      + tender_lots qui est enable mais pas force, cf. spec ligne 471 vs 488+)
--   4. 20 CREATE POLICY tenant_isolation (1 par table multi-tenant lisible)
--   5. 1 CREATE POLICY insert_by_member sur architects (gate role admin/user)
--   6. Trigger immutabilite audit_logs (INSERT only)
--   7. Triggers touch_updated_at sur 5 tables a updated_at
--
-- Note tender_lots : table sans organization_id direct -> policy par EXISTS
-- via la table tenders parente (spec ligne 519-520).
-- Note notifications : isolation par organization_id ET user_id (spec l.543).
-- Note audit_logs : visible admin only (current_user_role() = 'admin', l.546).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. HELPERS RLS -- lus a partir du JWT Supabase (cf. specs/schema_v1.sql l.49)
-- ----------------------------------------------------------------------------
-- current_organization_id() : lit app_metadata.organization_id du JWT courant
-- (positionne par Supabase Auth + custom claim). LANGUAGE sql STABLE -> peut
-- etre inline dans les policies par le planner.
CREATE OR REPLACE FUNCTION current_organization_id() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb #>> '{app_metadata,organization_id}', '')::uuid
$$ LANGUAGE sql STABLE;
--> statement-breakpoint

-- current_user_role() : lit app_metadata.role du JWT courant, type
-- membership_role (enum public).
CREATE OR REPLACE FUNCTION current_user_role() RETURNS membership_role AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb #>> '{app_metadata,role}', '')::membership_role
$$ LANGUAGE sql STABLE;
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 2. ENABLE ROW LEVEL SECURITY (spec l.465-485)
-- ----------------------------------------------------------------------------
ALTER TABLE "organizations"         ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "memberships"           ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "search_profiles"       ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "platform_credentials"  ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "architects"            ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenders"               ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tender_lots"           ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tender_documents"      ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tender_events"         ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "selections"            ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "match_proposals"       ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "architect_responses"   ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "architect_tokens"      ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "response_files"        ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "presentation_library"  ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_runs"               ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "odoo_opportunities"    ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "brevo_messages"        ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications"         ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_logs"            ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "learning_events"       ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 3. FORCE ROW LEVEL SECURITY (spec l.488-506) -- 19 tables
-- ----------------------------------------------------------------------------
-- Empeche tout bypass cote app meme avec service_role (BYPASSRLS). Ne s'applique
-- PAS a organizations (le tenant racine reste lisible pour la jointure JWT) ni
-- a tender_lots (isolation par EXISTS via tenders, force redondant + couteux).
ALTER TABLE "memberships"           FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "search_profiles"       FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "platform_credentials"  FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "architects"            FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenders"               FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tender_documents"      FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tender_events"         FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "selections"            FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "match_proposals"       FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "architect_responses"   FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "architect_tokens"      FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "response_files"        FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "presentation_library"  FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_runs"               FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "odoo_opportunities"    FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "brevo_messages"        FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications"         FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_logs"            FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "learning_events"       FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 4. POLICIES tenant_isolation -- 20 policies (spec l.509-548)
-- ----------------------------------------------------------------------------
-- Pattern standard : organization_id = current_organization_id() en USING.
-- Exceptions documentees : tender_lots (EXISTS), notifications (+user_id),
-- audit_logs (+role admin).

-- memberships
CREATE POLICY "tenant_isolation" ON "memberships"
  USING (organization_id = current_organization_id());--> statement-breakpoint

-- search_profiles
CREATE POLICY "tenant_isolation" ON "search_profiles"
  USING (organization_id = current_organization_id());--> statement-breakpoint

-- platform_credentials
CREATE POLICY "tenant_isolation" ON "platform_credentials"
  USING (organization_id = current_organization_id());--> statement-breakpoint

-- architects
CREATE POLICY "tenant_isolation" ON "architects"
  USING (organization_id = current_organization_id());--> statement-breakpoint

-- tenders
CREATE POLICY "tenant_isolation" ON "tenders"
  USING (organization_id = current_organization_id());--> statement-breakpoint

-- tender_lots : pas de colonne organization_id, on remonte au tender parent.
CREATE POLICY "tenant_isolation" ON "tender_lots"
  USING (EXISTS (
    SELECT 1 FROM "tenders" t
    WHERE t.id = tender_id
      AND t.organization_id = current_organization_id()
  ));--> statement-breakpoint

-- tender_documents
CREATE POLICY "tenant_isolation" ON "tender_documents"
  USING (organization_id = current_organization_id());--> statement-breakpoint

-- tender_events
CREATE POLICY "tenant_isolation" ON "tender_events"
  USING (organization_id = current_organization_id());--> statement-breakpoint

-- selections
CREATE POLICY "tenant_isolation" ON "selections"
  USING (organization_id = current_organization_id());--> statement-breakpoint

-- match_proposals
CREATE POLICY "tenant_isolation" ON "match_proposals"
  USING (organization_id = current_organization_id());--> statement-breakpoint

-- architect_responses
CREATE POLICY "tenant_isolation" ON "architect_responses"
  USING (organization_id = current_organization_id());--> statement-breakpoint

-- architect_tokens
CREATE POLICY "tenant_isolation" ON "architect_tokens"
  USING (organization_id = current_organization_id());--> statement-breakpoint

-- response_files
CREATE POLICY "tenant_isolation" ON "response_files"
  USING (organization_id = current_organization_id());--> statement-breakpoint

-- presentation_library
CREATE POLICY "tenant_isolation" ON "presentation_library"
  USING (organization_id = current_organization_id());--> statement-breakpoint

-- ai_runs
CREATE POLICY "tenant_isolation" ON "ai_runs"
  USING (organization_id = current_organization_id());--> statement-breakpoint

-- odoo_opportunities
CREATE POLICY "tenant_isolation" ON "odoo_opportunities"
  USING (organization_id = current_organization_id());--> statement-breakpoint

-- brevo_messages
CREATE POLICY "tenant_isolation" ON "brevo_messages"
  USING (organization_id = current_organization_id());--> statement-breakpoint

-- notifications : isolation par org ET par user (notifications personnelles).
CREATE POLICY "tenant_isolation" ON "notifications"
  USING (
    organization_id = current_organization_id()
    AND user_id = (auth.jwt() ->> 'sub')::uuid
  );--> statement-breakpoint

-- audit_logs : visible admin uniquement (spec l.545-546).
CREATE POLICY "tenant_isolation" ON "audit_logs"
  USING (
    organization_id = current_organization_id()
    AND current_user_role() = 'admin'
  );--> statement-breakpoint

-- learning_events
CREATE POLICY "tenant_isolation" ON "learning_events"
  USING (organization_id = current_organization_id());--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 5. POLICY insert_by_member -- gate role admin/user sur INSERT architects
-- ----------------------------------------------------------------------------
-- Empeche un viewer d'inserer un architecte (lecture seule = pas d'ecriture).
-- Spec ligne 551-552.
-- AS RESTRICTIVE : le check est ANDe avec tenant_isolation (PERMISSIVE FOR ALL)
-- au lieu d'etre OR'd. Sans RESTRICTIVE, un viewer dans son org passe par
-- tenant_isolation (org match) malgre le role check de insert_by_member.
-- Cf. DECISIONS.md 2026-05-19 + memory feedback-postgres-dry-run-local.
CREATE POLICY "insert_by_member" ON "architects" AS RESTRICTIVE FOR INSERT
  WITH CHECK (
    organization_id = current_organization_id()
    AND current_user_role() IN ('admin', 'user')
  );--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 6. IMMUTABILITE audit_logs (spec l.437-447)
-- ----------------------------------------------------------------------------
-- audit_logs est INSERT-only : rejet de tout UPDATE/DELETE au niveau trigger.
-- Retention 5 ans, jamais d'effacement applicatif.
CREATE OR REPLACE FUNCTION reject_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is immutable: UPDATE and DELETE are forbidden';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER "audit_logs_no_update" BEFORE UPDATE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();--> statement-breakpoint

CREATE TRIGGER "audit_logs_no_delete" BEFORE DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 7. TRIGGERS updated_at (spec l.558-574)
-- ----------------------------------------------------------------------------
-- Met a jour la colonne updated_at sur 5 tables a chaque UPDATE.
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER "touch_organizations" BEFORE UPDATE ON "organizations"
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();--> statement-breakpoint

CREATE TRIGGER "touch_search_profiles" BEFORE UPDATE ON "search_profiles"
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();--> statement-breakpoint

CREATE TRIGGER "touch_architects" BEFORE UPDATE ON "architects"
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();--> statement-breakpoint

CREATE TRIGGER "touch_tenders" BEFORE UPDATE ON "tenders"
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();--> statement-breakpoint

CREATE TRIGGER "touch_presentation_library" BEFORE UPDATE ON "presentation_library"
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
