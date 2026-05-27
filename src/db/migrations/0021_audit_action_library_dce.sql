-- ============================================================================
-- 0021_audit_action_library_dce -- edifio Sourcing Bloc C (2026-05-27)
-- ----------------------------------------------------------------------------
-- Source de verite :
--   - src/db/schema/enums.ts (enum `auditAction` etendu 19 -> 22)
--   - src/lib/audit/schemas.ts (schemas Zod A20/A21/A22)
--   - src/db/types/jsonb.ts (interfaces AuditLogDataLibraryDocUpload/Delete/DceDownload)
--
-- 3 nouvelles valeurs audit_action :
--   A20 library_doc_upload  : upload piece bibliotheque cotraitant/BE (admin)
--   A21 library_doc_delete  : suppression piece bibliotheque cotraitant/BE (admin)
--   A22 dce_download        : telechargement DCE/RC depuis l'annonce (tous roles)
--
-- IMPORTANT — ALTER TYPE ... ADD VALUE et les transactions Postgres :
--   `ADD VALUE` ne peut PAS s'executer dans une transaction ouverte sur
--   Postgres < 12 (et Supabase PG 15 l'accepte dans une TX mais la nouvelle
--   valeur n'est PAS visible dans la meme TX). Ce fichier ne contient QUE
--   des ADD VALUE — aucun BEGIN/COMMIT n'encadre ces instructions.
--   Drizzle-kit a ete genere sans enveloppe transactionnelle (verifie
--   manuellement — cf. contrainte spec Bloc C).
--
--   `IF NOT EXISTS` : idempotence — re-jouable sans erreur si la valeur
--   existe deja (migration partielle, patch prod manuel, etc.).
-- ============================================================================

ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'library_doc_upload';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'library_doc_delete';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'dce_download';
