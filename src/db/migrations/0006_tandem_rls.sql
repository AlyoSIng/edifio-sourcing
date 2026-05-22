-- ============================================================================
-- 0006_tandem_rls -- edifio Sourcing PR `feat/tandem-engine` etape 1
-- ----------------------------------------------------------------------------
-- *** DRAFT NADIA -- migration RLS custom (drizzle-kit ne modelise pas RLS) ***
--
-- Source de verite : memes principes que 0002_rls.sql (ADR-013 + helper
-- functions current_organization_id() / current_user_role()).
--
-- Contenu :
--   1. ENABLE + FORCE ROW LEVEL SECURITY sur la NEW table
--      architect_opposition_tokens
--   2. POLICY tenant_isolation sur architect_opposition_tokens
--   3. Pas de modif des policies existantes (architects, architect_responses,
--      architect_tokens, odoo_opportunities -- restent les memes en 0002).
--
-- Generation :
--   `pnpm drizzle-kit generate --custom --name=tandem_rls` cote Yann pour
--   inserer ce SQL dans une migration officielle proprement ordonnee.
--
-- Justification separation 0005 (DDL) / 0006 (RLS) :
--   - Aligne sur 0001/0002 (CTO ADR-013).
--   - Permet de rejouer le DDL sans le RLS si besoin de debug (rare mais
--     utile en investigation production).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ENABLE + FORCE RLS sur architect_opposition_tokens
-- ----------------------------------------------------------------------------
ALTER TABLE "architect_opposition_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "architect_opposition_tokens" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 2. POLICY tenant_isolation sur architect_opposition_tokens
-- ----------------------------------------------------------------------------
-- Meme pattern que les 19 autres tables multi-tenant (cf. 0002_rls.sql l.109-196).
-- La page publique /archi/oppose/[token] accede a cette table en bypass RLS
-- (service_role) APRES validation JWT cote serveur — l'isolation tenant est
-- assuree par la signature JWT (jti + architect_id), pas par le RLS pour ce
-- chemin tres precis. Le RLS ici protege l'acces admin in-app.
CREATE POLICY "tenant_isolation" ON "architect_opposition_tokens"
  USING (organization_id = current_organization_id());--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- FIN DRAFT 0006_tandem_rls
-- ----------------------------------------------------------------------------
