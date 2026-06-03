-- Migration 0040 — Ajout du champ « Forme juridique » pour DC1 / DC2
--
-- Contexte Steve 2026-06-03 : la forme juridique (SA, SARL, SAS, SASU, EURL,
-- SCP, SELARL, etc.) est un champ obligatoire des CERFA DC1 (§ A1) et DC2
-- (§ B1). Aucune des 3 tables productrices de DC1/DC2 n'avait cette colonne :
--
--   - `organization_profiles` : profil AlyoS (utilisé pour DC2 AlyoS en Tandem,
--     pour DC1 AlyoS en Solo, pour DC2 AlyoS en Cotraitance BE).
--   - `architects` : pour DC1 archi mandataire en Tandem.
--   - `bureaux_etudes` : pour DC2 BE cotraitant en Cotraitance BE.
--
-- Format : TEXT nullable (libre, pas d'enum — il en existe des dizaines de
-- formes juridiques et certaines hors France). Validation côté UI seulement
-- (suggérer les plus courantes via datalist).
--
-- Migration additive idempotente — safe à rejouer.

ALTER TABLE "organization_profiles"
  ADD COLUMN IF NOT EXISTS "legal_form" text;

ALTER TABLE "architects"
  ADD COLUMN IF NOT EXISTS "legal_form" text;

ALTER TABLE "bureaux_etudes"
  ADD COLUMN IF NOT EXISTS "legal_form" text;
