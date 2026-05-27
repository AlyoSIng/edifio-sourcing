-- Migration 0025 — Multi-profils de recherche (Tâche #29, 2026-05-27)
--
-- Objectif : ajouter le support multi-profils nommés par organisation sur
-- la table search_profiles existante. Deux colonnes :
--   - is_default  BOOLEAN NOT NULL DEFAULT false  → profil actif par défaut
--   - display_order INTEGER NOT NULL DEFAULT 0    → ordre d'affichage des onglets
--
-- Source de vérité :
--   - Tâche #29 Board 2026-05-27 (multi profils + onglets AO du jour)
--   - src/db/schema/config.ts → searchProfiles
--
-- Stratégie :
--   - ADD COLUMN avec DEFAULT (rétro-compatible — les profils existants
--     reçoivent is_default = false et display_order = 0).
--   - Après ajout des colonnes, on promeut le profil actif le plus ancien de
--     chaque organisation comme profil par défaut (UPDATE ... WHERE id IN (...)).
--     Cela garantit que la page AO du jour continue de fonctionner sans profil
--     explicite pour les orgs existantes (AlyoS Ingénierie).
--   - Un index partiel dédié est ajouté pour accélérer la lookup du profil
--     par défaut (utilisé à chaque chargement de la page AO du jour).
--
-- Note technique :
--   drizzle-kit generate n'est pas accessible sur ARM64 Windows en CI.
--   Migration écrite manuellement, alignée sur src/db/schema/config.ts.

-- ─── 1. Ajout des colonnes ───────────────────────────────────────────────────

ALTER TABLE "search_profiles"
  ADD COLUMN IF NOT EXISTS "is_default" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "search_profiles"
  ADD COLUMN IF NOT EXISTS "display_order" INTEGER NOT NULL DEFAULT 0;

-- ─── 2. Promotion du profil le plus ancien comme défaut par organisation ─────
--
-- Pour chaque organisation, on sélectionne l'id du profil actif le plus ancien
-- (ORDER BY created_at ASC LIMIT 1) et on le passe à is_default = true.
-- Idempotent : si un profil a déjà is_default = true, le WHERE active = true
-- le re-sélectionne sans dommage.
--
-- La sous-requête DISTINCT ON (organization_id) garantit 1 résultat max
-- par org, même si plusieurs profils actifs existent.

UPDATE "search_profiles" sp
SET "is_default" = true
WHERE sp."id" IN (
  SELECT DISTINCT ON (organization_id) "id"
  FROM "search_profiles"
  WHERE "active" = true
  ORDER BY "organization_id", "created_at" ASC
);

-- ─── 3. Index partiel is_default ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "idx_search_profiles_org_default"
  ON "search_profiles" ("organization_id")
  WHERE "is_default" = true;
