-- Migration 0033 — Champs DC1 (CERFA 12156) sur la fiche architecte
--
-- Contexte : Phase 1 Lot A — Préparation de la production du DC1 (lettre de
-- candidature mandataire) en cotraitance MOE BTP. L'architecte étant le
-- mandataire du groupement (chef de file), sa fiche doit porter tous les
-- champs administratifs nécessaires au pré-remplissage du CERFA n°12156.
--
-- Champs ajoutés (tous nullable, anciens architectes restent valides) :
--   - legal_representative_name : "Nom du représentant légal"
--   - legal_representative_role : "Qualité du signataire" (Gérant, Président…)
--   - address_line1             : "Adresse du candidat" (rue)
--   - address_line2             : Complément d'adresse (optionnel)
--   - signature_city            : "Fait à" (ville de signature par défaut)
--
-- Note : `siren`, `zip`, `city`, `email`, `contact_name`, `phone` existent déjà
-- dans la table `architects` — on n'ajoute ici que les champs DC1 spécifiques.
--
-- Migration idempotente (IF NOT EXISTS) — safe à rejouer.

ALTER TABLE "architects" ADD COLUMN IF NOT EXISTS "legal_representative_name" text;
ALTER TABLE "architects" ADD COLUMN IF NOT EXISTS "legal_representative_role" text;
ALTER TABLE "architects" ADD COLUMN IF NOT EXISTS "address_line1" text;
ALTER TABLE "architects" ADD COLUMN IF NOT EXISTS "address_line2" text;
ALTER TABLE "architects" ADD COLUMN IF NOT EXISTS "signature_city" text;
