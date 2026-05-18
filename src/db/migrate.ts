/**
 * Script de migration custom -- edifio Sourcing
 *
 * Decision Board etape 4 (Gate 6) : pre-poser les extensions Postgres requises
 * AVANT le migrator drizzle, parce que la migration `0001_schema_v1.sql` utilise
 * `uuid_generate_v4()` (extension `uuid-ossp`) et `gin_trgm_ops` (`pg_trgm`).
 *
 * Sequencement :
 *   1. Lit `src/db/setup/extensions.sql` et l'execute via `sql.unsafe(...)`
 *      (idempotent grace aux `CREATE EXTENSION IF NOT EXISTS`).
 *   2. Enchaine avec `migrate(db, { migrationsFolder: 'src/db/migrations' })`
 *      qui applique 0000_init -> 0001_schema_v1 -> 0002_rls -> 0003_fk_supabase.
 *
 * En prod Supabase managed, les extensions sont deja activees cote infra : la
 * pre-amorce est neutre (no-op idempotent). En dev local + CI, c'est elle qui
 * fait que les migrations passent en cold-start.
 *
 * Reference ADR-013 (specs/adr_013_orm_drizzle.md), driver postgres-js 3.4.
 *
 * Testabilite : la garde sur DATABASE_URL est extraite dans une fonction pure
 * exportee `assertDatabaseUrl` -- testee dans tests/unit/db/migrate.test.ts.
 * Le `main()` n'est execute QUE quand le module est lance directement
 * (pattern Node.js `import.meta.url`-based entry guard).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * Garde d'invariant : DATABASE_URL doit etre defini, sinon throw clair pour
 * eviter une cascade d'erreurs postgres-js opaques. Exportee pour testabilite.
 *
 * Signature volontairement lache (`Record<string, string | undefined>`) plutot
 * que `NodeJS.ProcessEnv` -- evite de devoir mocker NODE_ENV dans les tests.
 */
export function assertDatabaseUrl(env: Record<string, string | undefined> = process.env): string {
  const url = env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Cf. .env.example -- connexion directe Postgres requise (port 5432, pas le pooler 6543).",
    );
  }
  return url;
}

/**
 * Detection runtime pooler PgBouncer (port 6543) : transaction mode ne supporte
 * pas les prepared statements ni le DDL drizzle-kit / migrator. Exportee pour
 * testabilite.
 */
export function isPgBouncerPooler(databaseUrl: string): boolean {
  return databaseUrl.includes(":6543") || databaseUrl.includes("pgbouncer=true");
}

async function main(): Promise<void> {
  const databaseUrl = assertDatabaseUrl();

  if (isPgBouncerPooler(databaseUrl)) {
    console.warn(
      "[migrate] WARNING : DATABASE_URL semble pointer sur le pooler 6543. Le migrator drizzle exige une connexion directe (port 5432).",
    );
  }

  // Pool minimal : 1 seule connexion pour migrations sequentielles.
  const sql = postgres(databaseUrl, { max: 1, prepare: false });

  try {
    // 1. Pre-amorce : extensions Postgres requises (idempotent).
    const extensionsSQL = readFileSync(
      resolve(process.cwd(), "src/db/setup/extensions.sql"),
      "utf8",
    );
    await sql.unsafe(extensionsSQL);
    console.log("[migrate] [OK] Extensions Postgres posees (uuid-ossp, pgcrypto, pg_trgm).");

    // 2. Migrations Drizzle (0000 -> 0001 -> 0002 -> 0003).
    const db = drizzle(sql);
    await migrate(db, {
      migrationsFolder: resolve(process.cwd(), "src/db/migrations"),
    });
    console.log("[migrate] [OK] Migrations Drizzle appliquees.");
  } finally {
    await sql.end();
  }
}

/**
 * Entry guard : on n'execute `main()` que si le module est lance directement
 * via `tsx src/db/migrate.ts` -- pas pendant un `import` (tests Vitest, etc).
 * Detection robuste via le path de process.argv[1] (entry script Node).
 */
const isDirectRun = process.argv[1]?.replace(/\\/g, "/").endsWith("src/db/migrate.ts") ?? false;

if (isDirectRun) {
  main().catch((err: unknown) => {
    console.error("[migrate] [FAIL]", err);
    process.exitCode = 1;
  });
}
