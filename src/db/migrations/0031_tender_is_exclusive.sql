-- Migration 0031 — colonne is_exclusive sur tenders
--
-- Marque les AOs avec clause d'exclusivité (ex. sollicitation directe,
-- marché réservé ou exclusif pour AlyoS).
-- Booléen NOT NULL DEFAULT false — rétro-compatible : aucune ligne existante
-- ne change de comportement.

ALTER TABLE "tenders" ADD COLUMN IF NOT EXISTS "is_exclusive" boolean NOT NULL DEFAULT false;
