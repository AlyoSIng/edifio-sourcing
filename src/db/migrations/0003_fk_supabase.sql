-- ============================================================================
-- 0003_fk_supabase -- edifio Sourcing : FK cross-schema users.id -> auth.users
-- ----------------------------------------------------------------------------
-- Source de verite : specs/schema_v1.sql l.72-78 (CREATE TABLE users).
-- Reference src/db/schema/users.ts : commentaire JSDoc qui annonce ce follow-up.
--
-- Drizzle ne modelise PAS le schema `auth` natif Supabase -- on declare la
-- colonne `users.id uuid PRIMARY KEY` cote schema TS sans `.references()` et
-- on pose la FK cross-schema ici en SQL natif.
--
-- ON DELETE CASCADE : si Supabase supprime l'utilisateur dans auth.users (ex.
-- self-delete RGPD), la ligne publique `users` cascade et toutes les
-- dependances (memberships, selections.selected_by, ...) suivent leur propre
-- politique de cascade ou SET NULL.
--
-- Migration custom : redigee manuellement (drizzle-kit --custom ne genere que
-- le squelette vide).
-- ============================================================================

ALTER TABLE "users"
  ADD CONSTRAINT "users_id_auth_users_fk"
  FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
