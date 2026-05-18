-- ============================================================================
-- edifio Sourcing -- Pre-amorce extensions Postgres
-- ----------------------------------------------------------------------------
-- Joue AVANT toute migration drizzle (cf. src/db/migrate.ts).
-- Idempotent grace a IF NOT EXISTS : OK en dev local, OK en CI, OK en
-- Supabase managed (ou les extensions sont deja activees cote infra).
--
-- Source de verite : specs/schema_v1.sql ligne 11-14.
-- Reference ADR-013 (specs/adr_013_orm_drizzle.md) -- RLS et triggers en
-- SQL natif hors ORM.
--
-- Extensions requises par le schema v1 :
--   - uuid-ossp : default uuid_generate_v4() sur 18+ tables
--   - pgcrypto  : hashing (futur audit jwt_id, tokens architectes)
--   - pg_trgm   : index gin trigramme sur tenders.title (recherche textuelle)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
