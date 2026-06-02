/**
 * Schema Drizzle — edifio Sourcing (barrel)
 *
 * Source de vérité : `specs/schema_v1.sql` + ADR-013 (specs/adr_013_orm_drizzle.md).
 *
 * Structure éclatée par domaine (décision Board étape 3) : un fichier par
 * domaine métier, ré-export agrégé ici pour que :
 *   - `drizzle.config.ts schema: './src/db/schema'` voie l'ensemble
 *   - `drizzle(pgClient, { schema })` (cf. src/db/client.ts) bénéficie du
 *     typage complet sur 22+ tables et 12 enums.
 *
 * Étape 3 du plan Gate 6 : migration `0001_schema_v1.sql` posée à partir
 * de ces déclarations TS via `drizzle-kit generate`. RLS (étape 4) ajoutera
 * 19 policies via une migration séparée.
 */

// Types — enums et énumérations Postgres
export * from "./enums";

// Tables — un module par domaine
export * from "./organizations";
export * from "./users";
export * from "./config";
export * from "./architects";
export * from "./tenders";
export * from "./selections";
export * from "./library";
export * from "./ai";
export * from "./integrations";
export * from "./audit";
export * from "./messaging";
export * from "./bureaux-etudes";
export * from "./companies";
export * from "./sharing";
export * from "./cotraitants";
export * from "./be-documents";
export * from "./superadmin";
export * from "./shortlist";
export * from "./tender-cotraitants";
