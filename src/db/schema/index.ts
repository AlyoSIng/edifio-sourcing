/**
 * Schema Drizzle — edifio Sourcing
 *
 * Source de vérité : `specs/schema_v1.sql` + ADR-013 (specs/adr_013_orm_drizzle.md).
 *
 * Étape 2 du plan Gate 6 — Option A retenue : la migration 0000_init.sql
 * pose UNIQUEMENT l'enum `subscription_tier` (single-purpose, démontre que
 * la chaîne drizzle-kit generate fonctionne sur greenfield). Les 22+ tables
 * du schema v1 (organizations comprise) et les 12 policies RLS arriveront
 * à l'étape 3 dans la migration 0001.
 *
 * Le ré-export agrège tous les sous-modules pour que `drizzle(pgClient, { schema })`
 * (cf. src/db/client.ts) reçoive l'ensemble des objets typés.
 */

export * from "./enums";
