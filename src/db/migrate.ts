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
 * Workaround postgres-js Windows (DECISIONS.md 2026-05-22, Task #5) : passer un
 * objet `{ host, port, user, password, database, ssl }` a `postgres()` declenche
 * sur Windows un fallback `PipeConnectWrap` -> `ENOENT host/.s.PGSQL.5432` au
 * lieu d'ouvrir un TCP. Mitigation : en mode `PG*` eclate, on construit une URL
 * via `buildUrlFromParts(cfg)` avec `encodeURIComponent` du password, et on
 * passe cette URL a postgres-js. La regle URI-safe-only post-incident 21/05
 * reste respectee : le password reste URI-safe en BDD, l'encodage interne du
 * wrapper ne masque pas un password mal forme (l'invariant est verrouille en
 * amont par la regle de generation password).
 *
 * Testabilite : les gardes pures sont extraites en fonctions exportees
 * (`assertDatabaseUrl`, `resolveDbConfig`, `isPgBouncerPooler`,
 * `buildUrlFromParts`) -- testees dans tests/unit/db/migrate.test.ts. Le
 * `main()` n'est execute QUE quand le module est lance directement (pattern
 * Node.js `import.meta.url`-based entry guard).
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
 * Resout la config de connexion BDD depuis l'env, avec preference pour la
 * forme eclatee `PG*` (URI-safe) sur `DATABASE_URL`. Exportee pour testabilite.
 */
export function resolveDbConfig(env: Record<string, string | undefined> = process.env):
  | { kind: "url"; url: string }
  | {
      kind: "parts";
      host: string;
      user: string;
      password: string;
      database: string;
      port: number;
    } {
  const host = env.PGHOST ?? "";
  const user = env.PGUSER ?? "";
  const password = env.PGPASSWORD ?? "";
  const database = env.PGDATABASE ?? "";
  const partsAll = [
    ["PGHOST", host],
    ["PGUSER", user],
    ["PGPASSWORD", password],
    ["PGDATABASE", database],
  ] as const;
  const posed = partsAll.filter(([, v]) => v.length > 0);
  const missing = partsAll.filter(([, v]) => v.length === 0).map(([k]) => k);

  if (posed.length === 4) {
    if (env.DATABASE_URL && env.DATABASE_URL.length > 0) {
      console.warn(
        "[migrate] PG*+DATABASE_URL tous posés — preference donnee a la forme eclatee (URI-safe).",
      );
    }
    const port = Number.parseInt(env.PGPORT ?? "", 10) || 5432;
    return { kind: "parts", host, user, password, database, port };
  }

  if (posed.length > 0) {
    throw new Error(
      `PG* environment variables incomplets : posez les 4 (PGHOST, PGUSER, PGPASSWORD, PGDATABASE) ou utilisez DATABASE_URL. Manquants : ${missing.join(", ")}.`,
    );
  }

  const url = assertDatabaseUrl(env);
  return { kind: "url", url };
}

/**
 * Detection runtime pooler PgBouncer (port 6543) : transaction mode ne supporte
 * pas les prepared statements ni le DDL drizzle-kit / migrator. Exportee pour
 * testabilite.
 */
export function isPgBouncerPooler(databaseUrl: string): boolean {
  return databaseUrl.includes(":6543") || databaseUrl.includes("pgbouncer=true");
}

/**
 * Construit une URL postgres canonique a partir d'une config eclatee `PG*`.
 *
 * Pourquoi : workaround bug postgres-js Windows (cf. JSDoc fichier + DECISIONS
 * Task #5 2026-05-22). Passer un objet d'options eclate au driver declenche un
 * fallback `PipeConnectWrap` -> ENOENT au lieu d'ouvrir un TCP. En convertissant
 * en URL string, le driver prend la voie TCP normale.
 *
 * Le password est passe a `encodeURIComponent` a la frontiere (RFC 3986) pour
 * que l'URL reste parsable meme si le password contient des caracteres
 * speciaux. La regle URI-safe-only de generation password reste l'invariant
 * primaire (cf. DECISIONS incident 21/05) : cet encodage est une ceinture en
 * complement de la bretelle, pas un substitut.
 *
 * `sslmode=require` est l'equivalent canonique URL du `ssl: 'require'` qu'on
 * passait jusqu'ici en option objet (coherent Supabase managed).
 *
 * Exportee pour testabilite (validation parsabilite via `new URL()`).
 */
export function buildUrlFromParts(cfg: {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}): string {
  const encodedPwd = encodeURIComponent(cfg.password);
  return `postgresql://${cfg.user}:${encodedPwd}@${cfg.host}:${cfg.port}/${cfg.database}?sslmode=require`;
}

async function main(): Promise<void> {
  const cfg = resolveDbConfig();

  // Construction URL unique cote wrapper -- workaround bug postgres-js Windows
  // sur les options eclatees { host, port, ... } (cf. DECISIONS.md Task #5
  // 2026-05-22). Le password est encodeURIComponent-e a la frontiere : conforme
  // regle URI-safe-only post-incident 21/05.
  let connectionUrl: string;
  if (cfg.kind === "url") {
    console.log("[migrate] Mode env : URL (DATABASE_URL).");
    connectionUrl = cfg.url;
  } else {
    console.log(
      "[migrate] Mode env : eclate (PG*) -- conversion en URL interne (workaround postgres-js Windows).",
    );
    connectionUrl = buildUrlFromParts(cfg);
  }

  if (isPgBouncerPooler(connectionUrl)) {
    console.warn(
      "[migrate] WARNING : connexion semble pointer sur le pooler 6543. Le migrator drizzle exige une connexion directe (port 5432).",
    );
  }

  const sql = postgres(connectionUrl, { max: 1, prepare: false });

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
