-- Migration 0017 — chiffre d'affaires annuel des cabinets d'architecture
-- Utilisé dans le filtre d'éligibilité Tandem : archi inéligible si
-- annual_revenue < 40 % du montant estimé du marché.
ALTER TABLE "architects" ADD COLUMN "annual_revenue" integer;
