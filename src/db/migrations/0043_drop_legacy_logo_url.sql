-- Migration 0043 — Drop colonne legacy organization_profiles.logo_url
--
-- Contexte Steve 2026-06-03 (chantier G7). La colonne
-- `organization_profiles.logo_url` était redondante avec
-- `organizations.logo_url` (Personnalisation / bucket org-assets).
-- L'input UI a été retiré (commit a7d9dba) et la colonne n'est plus
-- écrite par saveOrgProfileAction. On la drop pour nettoyer le schéma.
--
-- Aucun risque de perte de données utiles : la valeur est dupliquée dans
-- organizations.logo_url, qui reste la source de vérité.
--
-- Idempotent : IF EXISTS.

ALTER TABLE "organization_profiles" DROP COLUMN IF EXISTS "logo_url";
