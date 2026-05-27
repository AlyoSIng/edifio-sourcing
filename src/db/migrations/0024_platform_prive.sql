-- ============================================================================
-- 0024_platform_prive — edifio Sourcing (2026-05-27)
-- ----------------------------------------------------------------------------
-- Objectif : ajouter la valeur 'prive' a l'enum platform_code pour permettre
-- la creation d'AO manuels (consultations privees ou de gre a gre).
--
-- Source de verite :
--   - src/db/schema/enums.ts (enum `platformCode` etendu)
--   - src/app/sourcing/ao/nouveau/ (formulaire creation AO manuel)
--
-- IMPORTANT — ALTER TYPE ... ADD VALUE et les transactions Postgres :
--   `ADD VALUE` ne peut PAS s'executer dans une transaction ouverte sur
--   Postgres < 12 (et Supabase PG 15 l'accepte dans une TX mais la nouvelle
--   valeur n'est PAS visible dans la meme TX). Ce fichier ne contient QUE
--   des ADD VALUE + un INSERT — aucun BEGIN/COMMIT n'encadre ces instructions.
--
--   `IF NOT EXISTS` : idempotence — re-jouable sans erreur si la valeur
--   existe deja (migration partielle, patch prod manuel, etc.).
-- ============================================================================

ALTER TYPE "public"."platform_code" ADD VALUE IF NOT EXISTS 'prive';--> statement-breakpoint

-- Seed : entree plateforme "prive" pour les AO manuels (consultations privees).
-- auth_type = 'none' (pas de connecteur automatise — saisie manuelle uniquement).
-- base_url = '' : pas d'URL source applicable, laissee vide par convention.
-- enabled = true : actif immediatement.
-- ON CONFLICT : idempotent si deja insere (re-jouable).
INSERT INTO "platforms" ("code", "display_name", "auth_type", "base_url", "enabled")
VALUES ('prive', 'Consultation privée', 'none', '', true)
ON CONFLICT ("code") DO NOTHING;
