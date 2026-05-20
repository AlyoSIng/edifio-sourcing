/**
 * Client Drizzle — edifio Sourcing
 *
 * Source de vérité : ADR-013 (specs/adr_013_orm_drizzle.md).
 * Driver retenu : `postgres` (postgres-js) — Deno-natif, stable, recommandé
 * Supabase. PAS `pg` (Node-only) ni `@prisma/adapter-pg-deno` (expérimental).
 *
 * **Lazy init via Proxy** (refactor 2026-05-20 — cf. DECISIONS.md) :
 * la connexion `postgres()` et la validation de `DATABASE_URL` sont
 * différées au premier accès à `db.*`, pas faites au top-level du module.
 * Sans ce delay, `import { db } from '@/db/client'` plante au build
 * Next.js (`next build` → « Collecting page data ») dès qu'une route API
 * importe transitivement le client mais que le job CI n'a pas `DATABASE_URL`
 * (cf. ci-build / ci-e2e). Le catch-no-throw du helper `insertAuditLog`
 * absorbe alors gracieusement l'absence de DB en CI e2e (audit log skip,
 * routes continuent).
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

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

type GlobalWithDb = typeof globalThis & {
  __edifioSourcingPgClient?: ReturnType<typeof postgres>;
  __edifioSourcingDrizzle?: DrizzleDb;
};

const globalForDb = globalThis as GlobalWithDb;

function buildDb(): DrizzleDb {
  const DATABASE_URL = process.env.DATABASE_URL;

  if (!DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Cf. .env.example. En local + CI : connexion directe Postgres port 5432 (pas le pooler 6543).",
    );
  }

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

  return drizzle(pgClient, { schema });
}

function getOrCreateDb(): DrizzleDb {
  if (!globalForDb.__edifioSourcingDrizzle) {
    globalForDb.__edifioSourcingDrizzle = buildDb();
  }
  return globalForDb.__edifioSourcingDrizzle;
}

/**
 * Instance Drizzle exportée — Proxy lazy : tant qu'aucune méthode (`.select`,
 * `.insert`, ...) n'est appelée, `process.env.DATABASE_URL` n'est PAS lu.
 * Permet à `next build` de collecter la page data des routes API qui
 * importent transitivement ce module, sans nécessiter `DATABASE_URL` au
 * build (Vercel runtime aura toujours la var, CI build non).
 *
 * On bind les méthodes à `realDb` pour préserver le `this` interne de
 * Drizzle (qui s'attend à un receiver concret, pas le Proxy).
 */
export const db: DrizzleDb = new Proxy({} as DrizzleDb, {
  get(_target, prop) {
    const realDb = getOrCreateDb();
    const value = realDb[prop as keyof DrizzleDb];
    return typeof value === "function" ? value.bind(realDb) : value;
  },
});

export type Db = DrizzleDb;
