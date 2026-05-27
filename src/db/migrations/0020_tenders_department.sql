-- Migration 0020 — colonnes postal_code + department sur tenders
--
-- Objectif : stocker le code postal du lieu d'exécution et le département
-- dérivés au moment du scraping/ingest via derivePostalCodeAndDepartment().
--
-- Ces colonnes permettent :
--   1. Le filtre multi-select département dans la vue « AO du jour »
--   2. Le tri par département A→Z
--   3. L'affichage du badge CP + Dept. sur TenderCard sans recalcul côté UI
--
-- postal_code NULL  = CP non renseigné dans rawData BOAMP ni dans buyer
-- department  NULL  = département non dérivable (même règle)
--
-- Les lignes existantes auront NULL — à backfiller via :
--   npx tsx scripts/backfill-departments.ts --commit
--
-- L'index idx_tenders_department accélère :
--   - filtre WHERE department = ANY($1)  (multi-select)
--   - ORDER BY department ASC NULLS LAST (tri)

ALTER TABLE "tenders" ADD COLUMN "postal_code" text;
ALTER TABLE "tenders" ADD COLUMN "department" text;

CREATE INDEX "idx_tenders_department" ON "tenders" ("department");
