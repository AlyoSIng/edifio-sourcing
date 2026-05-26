-- Migration 0013 — colonne excluded_at sur tenders (exclusion réversible)
--
-- Objectif : permettre à l'utilisateur d'exclure un AO de la vue « AO du jour »
-- de façon réversible, sans changer son statut (orthogonal au workflow métier).
--
-- excluded_at NULL  = AO visible dans le digest (comportement par défaut)
-- excluded_at NOT NULL = AO masqué (clic « Exclure »), restoreable via « Inclure »
--
-- L'index partiel WHERE excluded_at IS NOT NULL est utilisé :
--   1. Pour la vue future « AO exclus » (listage des AO masqués)
--   2. Comme accélérateur du filtre négatif IS NULL dans getTendersOfTheDay
--      (Postgres peut utiliser un index partiel pour résoudre IS NULL sur petite
--       fraction exclue, même si le cas principal passe par un scan d'index inversé)

ALTER TABLE "tenders" ADD COLUMN "excluded_at" timestamp with time zone;

CREATE INDEX "idx_tenders_excluded_at" ON "tenders" ("excluded_at") WHERE "excluded_at" IS NOT NULL;
