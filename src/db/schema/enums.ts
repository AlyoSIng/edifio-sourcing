/**
 * Enums Postgres — edifio Sourcing
 *
 * Source de vérité : `specs/schema_v1.sql` + ADR-013 (specs/adr_013_orm_drizzle.md).
 *
 * Convention : nom Postgres en lowercase snake_case, identifiant TS en camelCase.
 * Toutes les valeurs sont en lowercase strict (jamais 'Sourcing' / 'STUDIO').
 *
 * Étape 2 du plan Gate 6 — Option A : la migration 0000_init.sql ne pose que
 * l'enum `subscription_tier` (single-purpose). Les 21+ tables et la table
 * `organizations` (qui consomme ce type) arrivent à l'étape 3 dans 0001.
 */

import { pgEnum } from "drizzle-orm/pg-core";

/**
 * subscription_tier — palier de souscription d'une organisation cliente.
 *
 * Valeurs figées par le CTO :
 *   - sourcing    : palier d'entrée, module Sourcing seul
 *   - cotraitance : palier intermédiaire, ajout de la cotraitance architectes
 *   - studio      : palier complet (DEFAULT pour AlyoS Ingénierie au MVP)
 *
 * La colonne `organizations.subscription_tier` (NOT NULL, DEFAULT 'studio')
 * et l'index `idx_organizations_tier` seront créés à l'étape 3 (migration 0001).
 */
export const subscriptionTier = pgEnum("subscription_tier", ["sourcing", "cotraitance", "studio"]);
