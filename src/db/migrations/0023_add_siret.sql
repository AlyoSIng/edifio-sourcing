-- Migration 0023 — Ajout colonne siret (14 chars) sur architects, bureaux_etudes, organizations
--
-- Objectif : stocker le SIRET de l'établissement (14 chiffres = SIREN 9 + NIC 5)
-- en complément du SIREN existant. Utilisé dans les dossiers de candidature
-- (DC1, DC2, RIB) et les fiches de contact partenaires.
--
-- Source de vérité :
--   - Brief Board 2026-05-27 : SIRET requis dans dossiers candidature
--   - DECISIONS.md 2026-05-27 : colonne siret ajoutée sur architects + organizations
--
-- Stratégie :
--   - ADD COLUMN nullable TEXT — pas de contrainte pour permettre la migration
--     progressive des données existantes.
--   - La colonne siren existante est conservée intacte (sert au matching Opendatasoft).
--   - Validation applicative (regex /^\d{14}$/) dans l'UI et les Server Actions.
--   - RLS non touchée : même policy tenant que les colonnes voisines.

ALTER TABLE architects
  ADD COLUMN IF NOT EXISTS siret TEXT;

ALTER TABLE bureaux_etudes
  ADD COLUMN IF NOT EXISTS siret TEXT;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS siret TEXT;
