-- Migration 0035 — Champs DC2 (CERFA 12157) sur les bureaux d'études
--
-- Contexte : Phase 1 Lot C — Préparation de la production du DC2 (déclaration
-- du candidat) en mode Cotraitance BE. AlyoS étant mandataire d'un groupement
-- avec des BE cotraitants, chaque BE cotraitant doit produire son propre DC2.
-- La fiche BE doit donc porter les champs administratifs nécessaires au
-- pré-remplissage du CERFA n°12157 côté BE cotraitant.
--
-- Champs ajoutés (tous nullable, BE existants restent valides) :
--   - legal_representative_name : "Nom du représentant légal"
--   - legal_representative_role : "Qualité du signataire" (Gérant, Président…)
--   - address_line1             : "Adresse du candidat" (rue, siège BE)
--   - address_line2             : Complément d'adresse (optionnel)
--   - capital_eur               : Capital social en euros (integer)
--   - signature_city            : "Fait à" (ville de signature par défaut)
--
-- Note : `siren`, `siret`, `zip`, `city`, `email`, `contact_name`, `phone`
-- existent déjà dans la table `bureaux_etudes` — on n'ajoute ici que les
-- champs DC2 spécifiques.
--
-- Migration idempotente (IF NOT EXISTS) — safe à rejouer.

ALTER TABLE "bureaux_etudes" ADD COLUMN IF NOT EXISTS "legal_representative_name" text;
ALTER TABLE "bureaux_etudes" ADD COLUMN IF NOT EXISTS "legal_representative_role" text;
ALTER TABLE "bureaux_etudes" ADD COLUMN IF NOT EXISTS "address_line1" text;
ALTER TABLE "bureaux_etudes" ADD COLUMN IF NOT EXISTS "address_line2" text;
ALTER TABLE "bureaux_etudes" ADD COLUMN IF NOT EXISTS "capital_eur" integer;
ALTER TABLE "bureaux_etudes" ADD COLUMN IF NOT EXISTS "signature_city" text;
