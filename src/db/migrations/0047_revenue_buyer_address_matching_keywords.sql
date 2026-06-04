-- Migration 0047 — Chiffre d'affaires N-1/N-2/N-3 + adresse acheteur AO
--                   + matching_keywords pour fiches métiers biblio
--
-- Steve 2026-06-04. Trois axes d'enrichissement non-bloquants pour le DC2 et
-- la sélection automatique des pièces du dossier :
--
-- 1. **CA n-1 / n-2 / n-3 sur 3 entités** (architects, bureau_etudes,
--    organization_profiles). Champs DC2 standards demandés par les acheteurs
--    publics pour évaluer la capacité financière du candidat. Tous nullable :
--    les fiches existantes restent valides.
--
-- 2. **Adresse acheteur sur tenders** (`buyer_address`). Le champ `buyer` ne
--    porte que le nom (« Mairie de X »). L'adresse postale est utile pour les
--    courriers de réponse et les CERFA. Nullable : peut être complété
--    manuellement ou extrait du raw_data BOAMP au prochain re-source.
--
-- 3. **matching_keywords sur presentation_library**. Pour la nouvelle
--    catégorie `fiche_metier` (cf. seed `LIBRARY_KINDS` côté app), Steve
--    associe des mots-clés à chaque fiche métier. À la compile du dossier,
--    l'app sélectionne automatiquement les fiches dont les keywords
--    intersectent ceux du profil de recherche actif.
--
-- Migration idempotente (IF NOT EXISTS). Pas de backfill — tout nullable.

-- ============================================================================
-- 1. CA n-1 / n-2 / n-3 (3 entités)
-- ============================================================================

-- architects
ALTER TABLE "architects" ADD COLUMN IF NOT EXISTS "revenue_n1" integer;
ALTER TABLE "architects" ADD COLUMN IF NOT EXISTS "revenue_n2" integer;
ALTER TABLE "architects" ADD COLUMN IF NOT EXISTS "revenue_n3" integer;

-- bureau_etudes
ALTER TABLE "bureau_etudes" ADD COLUMN IF NOT EXISTS "revenue_n1" integer;
ALTER TABLE "bureau_etudes" ADD COLUMN IF NOT EXISTS "revenue_n2" integer;
ALTER TABLE "bureau_etudes" ADD COLUMN IF NOT EXISTS "revenue_n3" integer;

-- organization_profiles (DC2 AlyoS)
ALTER TABLE "organization_profiles" ADD COLUMN IF NOT EXISTS "revenue_n1" integer;
ALTER TABLE "organization_profiles" ADD COLUMN IF NOT EXISTS "revenue_n2" integer;
ALTER TABLE "organization_profiles" ADD COLUMN IF NOT EXISTS "revenue_n3" integer;

-- ============================================================================
-- 2. Adresse acheteur sur tenders
-- ============================================================================

ALTER TABLE "tenders" ADD COLUMN IF NOT EXISTS "buyer_address" text;

-- ============================================================================
-- 3. matching_keywords pour fiches métiers biblio
-- ============================================================================

ALTER TABLE "presentation_library" ADD COLUMN IF NOT EXISTS "matching_keywords" text[];

-- Index GIN pour les futures requêtes de matching (intersection text[]).
-- Filtré sur kind='fiche_metier' pour ne pas saturer l'index global.
CREATE INDEX IF NOT EXISTS "idx_presentation_library_fiche_metier_keywords"
  ON "presentation_library" USING GIN ("matching_keywords")
  WHERE "kind" = 'fiche_metier';
