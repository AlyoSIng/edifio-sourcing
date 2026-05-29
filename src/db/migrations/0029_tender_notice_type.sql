-- Migration 0028 — colonne notice_type sur tenders
--
-- Objectif : stocker le type d'avis fourni par la plateforme source.
-- Pour BOAMP Opendatasoft v2.1, c'est le champ `nature` :
--   ex. "Avis de marché", "Avis d'attribution de marché", "Avis de préinformation"
--
-- Les avis d'attribution sont exclus du filtre getTendersOfTheDay
-- (filtre applicatif dans src/lib/sourcing/queries.ts).
--
-- notice_type NULL = type non renseigné (PLACE scraper, prive, ancien BOAMP).
-- Les lignes existantes resteront NULL jusqu'au prochain run cron (backfill passif).

ALTER TABLE "tenders" ADD COLUMN "notice_type" text;
