-- ============================================================================
-- pgTAP 01_force_rls -- edifio Sourcing
-- ----------------------------------------------------------------------------
-- Verifie sur pg_class que les 19 tables multi-tenant ont :
--   - relrowsecurity      = true (ENABLE RLS)
--   - relforcerowsecurity = true (FORCE RLS -- bypass interdit meme service_role)
--
-- Reference : specs/schema_v1.sql l.488-506, migration 0002_rls section 3.
-- Note : organizations est ENABLE mais PAS FORCE (tenant racine).
--        tender_lots est ENABLE mais PAS FORCE (policy par EXISTS).
-- ============================================================================

BEGIN;
SELECT plan(38);  -- 19 tables x 2 assertions (relrowsecurity + relforcerowsecurity)

-- Helper inline : verifie qu'une table donnee a relrowsecurity ET relforcerowsecurity = true.
-- On enchaine 2 SELECT is(...) par table pour rester lisible et localiser le fail.

-- memberships
SELECT is((SELECT relrowsecurity      FROM pg_class WHERE relname = 'memberships'),           true, 'memberships ENABLE RLS');
SELECT is((SELECT relforcerowsecurity FROM pg_class WHERE relname = 'memberships'),           true, 'memberships FORCE RLS');

-- search_profiles
SELECT is((SELECT relrowsecurity      FROM pg_class WHERE relname = 'search_profiles'),       true, 'search_profiles ENABLE RLS');
SELECT is((SELECT relforcerowsecurity FROM pg_class WHERE relname = 'search_profiles'),       true, 'search_profiles FORCE RLS');

-- platform_credentials
SELECT is((SELECT relrowsecurity      FROM pg_class WHERE relname = 'platform_credentials'),  true, 'platform_credentials ENABLE RLS');
SELECT is((SELECT relforcerowsecurity FROM pg_class WHERE relname = 'platform_credentials'),  true, 'platform_credentials FORCE RLS');

-- architects
SELECT is((SELECT relrowsecurity      FROM pg_class WHERE relname = 'architects'),            true, 'architects ENABLE RLS');
SELECT is((SELECT relforcerowsecurity FROM pg_class WHERE relname = 'architects'),            true, 'architects FORCE RLS');

-- tenders
SELECT is((SELECT relrowsecurity      FROM pg_class WHERE relname = 'tenders'),               true, 'tenders ENABLE RLS');
SELECT is((SELECT relforcerowsecurity FROM pg_class WHERE relname = 'tenders'),               true, 'tenders FORCE RLS');

-- tender_documents
SELECT is((SELECT relrowsecurity      FROM pg_class WHERE relname = 'tender_documents'),      true, 'tender_documents ENABLE RLS');
SELECT is((SELECT relforcerowsecurity FROM pg_class WHERE relname = 'tender_documents'),      true, 'tender_documents FORCE RLS');

-- tender_events
SELECT is((SELECT relrowsecurity      FROM pg_class WHERE relname = 'tender_events'),         true, 'tender_events ENABLE RLS');
SELECT is((SELECT relforcerowsecurity FROM pg_class WHERE relname = 'tender_events'),         true, 'tender_events FORCE RLS');

-- selections
SELECT is((SELECT relrowsecurity      FROM pg_class WHERE relname = 'selections'),            true, 'selections ENABLE RLS');
SELECT is((SELECT relforcerowsecurity FROM pg_class WHERE relname = 'selections'),            true, 'selections FORCE RLS');

-- match_proposals
SELECT is((SELECT relrowsecurity      FROM pg_class WHERE relname = 'match_proposals'),       true, 'match_proposals ENABLE RLS');
SELECT is((SELECT relforcerowsecurity FROM pg_class WHERE relname = 'match_proposals'),       true, 'match_proposals FORCE RLS');

-- architect_responses
SELECT is((SELECT relrowsecurity      FROM pg_class WHERE relname = 'architect_responses'),   true, 'architect_responses ENABLE RLS');
SELECT is((SELECT relforcerowsecurity FROM pg_class WHERE relname = 'architect_responses'),   true, 'architect_responses FORCE RLS');

-- architect_tokens
SELECT is((SELECT relrowsecurity      FROM pg_class WHERE relname = 'architect_tokens'),      true, 'architect_tokens ENABLE RLS');
SELECT is((SELECT relforcerowsecurity FROM pg_class WHERE relname = 'architect_tokens'),      true, 'architect_tokens FORCE RLS');

-- response_files
SELECT is((SELECT relrowsecurity      FROM pg_class WHERE relname = 'response_files'),        true, 'response_files ENABLE RLS');
SELECT is((SELECT relforcerowsecurity FROM pg_class WHERE relname = 'response_files'),        true, 'response_files FORCE RLS');

-- presentation_library
SELECT is((SELECT relrowsecurity      FROM pg_class WHERE relname = 'presentation_library'),  true, 'presentation_library ENABLE RLS');
SELECT is((SELECT relforcerowsecurity FROM pg_class WHERE relname = 'presentation_library'),  true, 'presentation_library FORCE RLS');

-- ai_runs
SELECT is((SELECT relrowsecurity      FROM pg_class WHERE relname = 'ai_runs'),               true, 'ai_runs ENABLE RLS');
SELECT is((SELECT relforcerowsecurity FROM pg_class WHERE relname = 'ai_runs'),               true, 'ai_runs FORCE RLS');

-- odoo_opportunities
SELECT is((SELECT relrowsecurity      FROM pg_class WHERE relname = 'odoo_opportunities'),    true, 'odoo_opportunities ENABLE RLS');
SELECT is((SELECT relforcerowsecurity FROM pg_class WHERE relname = 'odoo_opportunities'),    true, 'odoo_opportunities FORCE RLS');

-- brevo_messages
SELECT is((SELECT relrowsecurity      FROM pg_class WHERE relname = 'brevo_messages'),        true, 'brevo_messages ENABLE RLS');
SELECT is((SELECT relforcerowsecurity FROM pg_class WHERE relname = 'brevo_messages'),        true, 'brevo_messages FORCE RLS');

-- notifications
SELECT is((SELECT relrowsecurity      FROM pg_class WHERE relname = 'notifications'),         true, 'notifications ENABLE RLS');
SELECT is((SELECT relforcerowsecurity FROM pg_class WHERE relname = 'notifications'),         true, 'notifications FORCE RLS');

-- audit_logs
SELECT is((SELECT relrowsecurity      FROM pg_class WHERE relname = 'audit_logs'),            true, 'audit_logs ENABLE RLS');
SELECT is((SELECT relforcerowsecurity FROM pg_class WHERE relname = 'audit_logs'),            true, 'audit_logs FORCE RLS');

-- learning_events
SELECT is((SELECT relrowsecurity      FROM pg_class WHERE relname = 'learning_events'),       true, 'learning_events ENABLE RLS');
SELECT is((SELECT relforcerowsecurity FROM pg_class WHERE relname = 'learning_events'),       true, 'learning_events FORCE RLS');

SELECT * FROM finish();
ROLLBACK;
