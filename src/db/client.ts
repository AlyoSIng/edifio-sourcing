/**
 * Client Drizzle — edifio Sourcing
 *
 * Source de vérité : ADR-013 (specs/adr_013_orm_drizzle.md).
 * Driver retenu : `postgres` (postgres-js) — Deno-natif, stable, recommandé
 * Supabase. PAS `pg` (Node-only) ni `@prisma/adapter-pg-deno` (expérimental).
 *
 * Singleton hot-reload-safe : Next.js 14 dev mode recharge les modules à
 * chaque requête, ce qui sature pool Postgres et logs Supabase si on
 * ré-instancie. On cache la connexion sur `globalThis`.
 *
 * Exposition stricte : seul l'objet `db` (wrapper Drizzle typé via schema)
 * est exporté. Le client `postgres` brut reste interne pour éviter tout
 * bypass typage ou contournement des conventions ORM côté caller.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Cf. .env.example. En local + CI : connexion directe Postgres port 5432 (pas le pooler 6543).",
  );
}

/**
 * Cache global pour survivre aux hot-reloads Next.js dev mode.
 * En prod (build standalone), `globalThis` est unique → comportement identique.
 */
type GlobalWithDb = typeof globalThis & {
  __edifioSourcingPgClient?: ReturnType<typeof postgres>;
};

const globalForDb = globalThis as GlobalWithDb;

/**
 * Détection runtime pooler PgBouncer (port 6543) : transaction mode ne
 * supporte pas les prepared statements → forcer `prepare: false` côté
 * postgres-js, conformément à la doc Supabase.
 */
const isPooler = DATABASE_URL.includes(":6543") || DATABASE_URL.includes("pgbouncer=true");

const pgClient =
  globalForDb.__edifioSourcingPgClient ??
  postgres(DATABASE_URL, {
    max: isPooler ? 1 : 10,
    prepare: !isPooler,
    idle_timeout: 20,
    connect_timeout: 10,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__edifioSourcingPgClient = pgClient;
}

/**
 * Instance Drizzle exportée — typée via le schema (vide à l'étape 1,
 * étoffée à l'étape 2 du plan Gate 6).
 */
export const db = drizzle(pgClient, { schema });

export type Db = typeof db;
