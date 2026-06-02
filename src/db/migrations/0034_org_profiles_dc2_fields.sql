-- Migration 0034 — Champs DC2 (CERFA 12157) sur le profil organisation
--
-- Contexte : Phase 1 Lot B — Préparation de la production du DC2 (déclaration
-- du candidat) en cotraitance MOE BTP. AlyoS étant cotraitant (l'architecte est
-- mandataire), chaque cotraitant doit produire son propre DC2. Le profil
-- organisation doit donc porter les champs administratifs nécessaires au
-- pré-remplissage du CERFA n°12157 côté AlyoS.
--
-- Champs ajoutés (tous nullable, profils existants restent valides) :
--   - address_line1             : "Adresse du candidat" (rue, siège AlyoS)
--   - address_line2             : Complément d'adresse (optionnel)
--   - legal_representative_name : "Nom du représentant légal"
--   - legal_representative_role : "Qualité du signataire" (Gérant, Président…)
--   - capital_eur               : Capital social en euros (integer)
--   - signature_city            : "Fait à" (ville de signature par défaut)
--
-- Note : `siren`, `siret`, `name` existent déjà dans la table `organizations`
-- — on n'ajoute ici que les champs DC2 spécifiques au profil étendu.
--
-- Migration idempotente (IF NOT EXISTS) — safe à rejouer.

ALTER TABLE "organization_profiles" ADD COLUMN IF NOT EXISTS "address_line1" text;
ALTER TABLE "organization_profiles" ADD COLUMN IF NOT EXISTS "address_line2" text;
ALTER TABLE "organization_profiles" ADD COLUMN IF NOT EXISTS "legal_representative_name" text;
ALTER TABLE "organization_profiles" ADD COLUMN IF NOT EXISTS "legal_representative_role" text;
ALTER TABLE "organization_profiles" ADD COLUMN IF NOT EXISTS "capital_eur" integer;
ALTER TABLE "organization_profiles" ADD COLUMN IF NOT EXISTS "signature_city" text;
