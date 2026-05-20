-- ============================================================================
-- FICHIER DE RÉFÉRENCE — Spike ORM (Phase 1)
-- ============================================================================
-- Ce SQL est la référence à pré-poser dans les 2 prototypes spike
-- (spike/orm-drizzle et spike/orm-prisma) AVANT toute mesure de bench.
--
-- Objet : ajouter le type enum `subscription_tier` puis la colonne
-- `organizations.tier` correspondante. Permet aux deux prototypes de porter
-- exactement le même modèle de données pour la table `organizations`
-- (sinon le bench scoring n'est pas comparable — Q3 du handoff
-- REQUEST_260515_1300_PREREQ_SPIKE_ORM.md).
--
-- IMPORTANT — Ce fichier N'EST PAS UNE MIGRATION APPLICATIVE.
-- Il n'a sa place ni dans `src/db/migrations/`, ni dans `prisma/migrations/`,
-- ni dans `drizzle/`. Tant que la décision ORM (Drizzle vs Prisma) n'est
-- pas tranchée par la CTO Sophie, AUCUNE migration applicative n'est
-- committée — cf. CLAUDE.md règle « AUCUNE MIGRATION COMMITTÉE AVANT
-- DÉCISION » et DECISIONS.md Gate 5 Arbitrage 3.
--
-- Usage : chaque prototype (Drizzle puis Prisma) applique ce DDL en début
-- de bench via `psql` ou équivalent sur sa propre base Supabase locale /
-- preview. La forme exécutable côté ORM (`schema.ts` Drizzle ou
-- `schema.prisma`) sera ensuite générée par l'outillage natif de chaque
-- ORM pour vérifier que les types TypeScript émis matchent bien.
--
-- Valeurs enum : alignées sur le tiering commercial validé Gate 1
-- (DECISIONS.md 2026-05-07 G1 — Sourcing 190 € / Cotraitance 390 € /
-- Studio IA 790 €). Si l'ANSWER Cowork pose un libellé technique
-- différent (`sourcing` lowercase, `studio_ia` snake_case…), ce fichier
-- sera réaligné avant exécution dans les prototypes.
--
-- Référence handoff : `handoff/ANSWER_260515_1430_PREREQ_SPIKE_ORM.md`
-- (verdict Q3 — enum Postgres, défaut + NOT NULL).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Type enum subscription_tier
-- ----------------------------------------------------------------------------
-- Trois paliers commerciaux Gate 1. L'ordre déclaré reflète la hiérarchie
-- fonctionnelle (Sourcing < Cotraitance < Studio IA), ce qui permet l'usage
-- du seuil `tier >= 'Cotraitance'` dans la logique de scoring IA décrite
-- dans `specs/module_sourcing_engine_v1.md` (cast vers smallint via une
-- expression CASE côté requête — Postgres ne pose pas d'ordre sur les enums
-- mais l'ordre déclaratif sert de convention partagée).

CREATE TYPE subscription_tier AS ENUM (
  'Sourcing',
  'Cotraitance',
  'Studio IA'
);

-- ----------------------------------------------------------------------------
-- 2. Colonne organizations.tier
-- ----------------------------------------------------------------------------
-- DEFAULT 'Sourcing' : palier d'entrée pour toute nouvelle organisation,
-- conformément à la grille tarifaire (190 €). Permet d'ajouter la colonne
-- NOT NULL sans backfill explicite — la seule organisation existante au
-- MVP (AlyoS Ingénierie, cf. DECISIONS.md 2026-05-10) sera mise à jour à
-- la valeur cible (`Studio IA` interne probable) en seed séparé hors spike.
--
-- NOT NULL : pas d'organisation sans palier — contrainte d'intégrité forte
-- exigée par la logique de scoring IA (qui doit savoir si le module
-- Cotraitance est accessible).

ALTER TABLE organizations
  ADD COLUMN tier subscription_tier NOT NULL DEFAULT 'Sourcing';

-- ----------------------------------------------------------------------------
-- 3. Index — optionnel, à confirmer lors du bench
-- ----------------------------------------------------------------------------
-- Pas d'index sur `tier` au démarrage. Si le scoring IA filtre fréquemment
-- par tier (selectivity faible sur 1 org au MVP, mais à mesurer en Phase 3
-- bench), envisager un index partiel `WHERE tier >= 'Cotraitance'`. Décision
-- laissée à la Phase 3 (bench) sur la base de l'EXPLAIN ANALYZE réel.

COMMIT;

-- ============================================================================
-- Fin du fichier de référence.
-- ============================================================================
