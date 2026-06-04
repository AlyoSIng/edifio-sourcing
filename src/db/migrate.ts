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
 *   2. Enchaine avec `runMigrationsPerTransaction()` (migrator custom) qui
 *      applique chaque migration dans sa propre transaction, en pre-executant
 *      les `ALTER TYPE ... ADD VALUE` hors transaction (contrainte PostgreSQL :
 *      la nouvelle valeur enum n'est pas visible dans la meme TX que l'ADD VALUE).
 *
 * Pourquoi un migrator custom au lieu de `migrate()` drizzle :
 *   Le migrator drizzle-orm@0.39 enveloppe TOUTES les migrations dans une seule
 *   transaction globale (`session.transaction(...)`). PostgreSQL 12+ autorise
 *   `ADD VALUE` dans une transaction mais la nouvelle valeur enum n'est PAS
 *   visible pour les operations DML (INSERT/UPDATE) dans la meme transaction.
 *   => Erreur : "unsafe use of new value of enum type" (cf. bug CI fix/enum-platform-code-ci).
 *   Solution : `splitAddValueStatements()` isole les `ADD VALUE` et les execute
 *   via `sql.unsafe()` (hors transaction) avant le reste de la migration.
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
 * `buildUrlFromParts`, `splitAddValueStatements`) -- testees dans
 * tests/unit/db/migrate.test.ts. Le `main()` n'est execute QUE quand le module
 * est lance directement (pattern Node.js `import.meta.url`-based entry guard).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { readMigrationFiles } from "drizzle-orm/migrator";
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
 * Hardening MEMORY 2026-05-21 (incident BDD prod) — la regle « PGPASSWORD
 * URI-safe a la source » est documentee. Cette helper offre une verification
 * non-bloquante (warn console) si le password contient des caracteres dont
 * l'encodage URL pourrait causer des deboires :
 *
 *   - `@` (separe user de host)        → URL ambiguë
 *   - `#` (fragment)                    → tronque l'URL
 *   - `%` (escape introducer)           → double-encodage potentiel
 *   - `?` (query string)                → tronque l'URL
 *   - `[` `]` (host IPv6)               → ambiguïté
 *   - `/`                               → confusion path
 *   - `<` `>` `"`                       → cassent HTML / shell
 *
 * Le `encodeURIComponent` dans `buildUrlFromParts` reste l'invariant
 * primaire qui rend l'URL parsable, mais on alerte explicitement si le
 * password contient ces chars : la pratique reste d'avoir un password
 * URI-safe en BDD (rotation Steve post-MVP).
 *
 * Renvoie la liste des caracteres « dangereux » detectes (vide si OK).
 * Exportee pour testabilite.
 */
export function findUnsafeUriChars(password: string): string[] {
  const unsafe = new Set(["@", "#", "%", "?", "[", "]", "/", "<", ">", '"', "'", "\\", " "]);
  const found = new Set<string>();
  for (const c of password) {
    if (unsafe.has(c)) found.add(c);
  }
  return Array.from(found).sort();
}

/**
 * Masque un password dans un message d'erreur (best-effort). postgres-js peut
 * inclure l'URL complete dans certains messages (DNS fail, authentication
 * failed). On remplace toute sous-chaine `:<password>@` par `:***@` pour
 * eviter qu'un copier-coller de stack trace fuit le secret dans un chat.
 *
 * Exportee pour testabilite.
 */
export function maskPasswordInMessage(message: string, password: string): string {
  if (!password || password.length === 0) return message;
  // 1. Remplacement exact (cas le plus frequent : URL recomposee)
  let masked = message.split(password).join("***");
  // 2. Remplacement de la version encodée (encodeURIComponent peut differer)
  const encoded = encodeURIComponent(password);
  if (encoded !== password) {
    masked = masked.split(encoded).join("***");
  }
  return masked;
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

/**
 * Separe les statements SQL d'une migration en deux groupes :
 *   - `addValueStmts` : statements contenant `ALTER TYPE ... ADD VALUE`
 *     (doivent etre executes HORS transaction sous PostgreSQL 12+ pour que
 *     la nouvelle valeur enum soit visible dans les DML de la meme session).
 *   - `otherStmts`   : tous les autres statements (DDL + DML).
 *
 * Contrainte PostgreSQL : `ADD VALUE` dans une transaction est accepte mais la
 * nouvelle valeur n'est pas visible pour INSERT/UPDATE dans la meme transaction
 * => "unsafe use of new value of enum type". En executant les ADD VALUE via
 * `sql.unsafe()` avant d'ouvrir la transaction, on contourne cette limite.
 *
 * Exportee pour testabilite.
 *
 * @param stmts - Tableau de statements SQL (tel que produit par readMigrationFiles,
 *                apres split sur `--> statement-breakpoint`).
 */
export function splitAddValueStatements(stmts: string[]): {
  addValueStmts: string[];
  otherStmts: string[];
} {
  const addValueRegex = /ALTER\s+TYPE\s+\S+\s+ADD\s+VALUE/i;
  const addValueStmts: string[] = [];
  const otherStmts: string[] = [];

  for (const stmt of stmts) {
    if (addValueRegex.test(stmt)) {
      addValueStmts.push(stmt);
    } else {
      otherStmts.push(stmt);
    }
  }

  return { addValueStmts, otherStmts };
}

/**
 * Migrator custom qui remplace `migrate()` de drizzle-orm pour corriger
 * l'incompatibilite entre `ALTER TYPE ... ADD VALUE` et la transaction globale
 * du migrator officiel.
 *
 * Comportement :
 *   1. Cree le schema + table `drizzle.__drizzle_migrations` si absents.
 *   2. Recupere la derniere migration appliquee.
 *   3. Pour chaque migration non encore jouee (folderMillis > lastDbMigration) :
 *      a. Execute les statements `ADD VALUE` via `sql.unsafe()` (hors TX).
 *      b. Ouvre une transaction par migration pour le reste des statements.
 *      c. Dans la transaction, execute les autres statements puis enregistre
 *         le hash dans `drizzle.__drizzle_migrations`.
 *
 * Cette approche garantit :
 *   - Les ADD VALUE sont commis avant l'ouverture de la TX => valeur visible.
 *   - L'atomicite DDL/DML par migration (une migration = une TX).
 *   - La compatibilite avec le journal drizzle (meme schema de table, meme hash).
 *
 * Exportee pour testabilite (integration tests avec vraie connexion).
 *
 * @param sql       - Connexion postgres-js (max: 1, prepare: false).
 * @param migrationsFolder - Chemin absolu vers le dossier des migrations.
 */
export async function runMigrationsPerTransaction(
  sql: ReturnType<typeof postgres>,
  migrationsFolder: string,
): Promise<void> {
  const MIGRATIONS_SCHEMA = "drizzle";
  const MIGRATIONS_TABLE = "__drizzle_migrations";

  // Cree le schema et la table de journal Drizzle si absents (idempotent).
  await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS "${MIGRATIONS_SCHEMA}"`);
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);

  // Recupere la derniere migration appliquee (tri DESC limit 1 -- meme logique que drizzle).
  // sql.unsafe() pour les noms de schema/table fixes (pas d'injection possible -- constantes).
  const rows = await sql.unsafe<{ created_at: string }[]>(
    `SELECT created_at FROM "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" ORDER BY created_at DESC LIMIT 1`,
  );
  const lastAppliedTs: number = rows.length > 0 && rows[0] ? Number(rows[0].created_at) : 0;

  // Lit les fichiers de migration via l'API publique drizzle (respect du journal + hash).
  const migrations = readMigrationFiles({ migrationsFolder });

  for (const migration of migrations) {
    // Ignore les migrations deja jouees (meme logique que le migrator officiel).
    if (migration.folderMillis <= lastAppliedTs) {
      continue;
    }

    const { addValueStmts, otherStmts } = splitAddValueStatements(migration.sql);

    // a. ADD VALUE hors transaction -- DOIT etre commis avant l'ouverture de la TX.
    // PostgreSQL 12+ accepte ADD VALUE dans une TX, mais la nouvelle valeur n'est
    // PAS visible pour les DML (INSERT/UPDATE) dans la meme TX. En executant hors TX,
    // la valeur est visible des que la commande retourne.
    for (const stmt of addValueStmts) {
      await sql.unsafe(stmt);
    }

    // b. Reste de la migration dans une transaction atomique par migration.
    // sql.begin() ouvre BEGIN ... COMMIT (avec ROLLBACK automatique si erreur).
    await sql.begin(async (tx) => {
      for (const stmt of otherStmts) {
        await tx.unsafe(stmt);
      }

      // Enregistrement dans le journal Drizzle (hash SHA-256 du contenu brut du fichier,
      // tel que calcule par readMigrationFiles -- meme schema que le migrator officiel).
      await tx.unsafe(
        `INSERT INTO "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" (hash, created_at) VALUES ($1, $2)`,
        [migration.hash, String(migration.folderMillis)],
      );
    });

    console.log(
      `[migrate] [OK] Migration appliquee : ${migration.folderMillis} (hash ${migration.hash.substring(0, 12)}...)`,
    );
  }
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

    // Hardening MEMORY 2026-05-21 : warn si le password contient des chars
    // qui ne sont pas URI-safe a la source. L'encodage interne marche, mais
    // la pratique reste un password URI-safe-only en BDD (rotation Steve).
    const unsafe = findUnsafeUriChars(cfg.password);
    if (unsafe.length > 0) {
      console.warn(
        `[migrate] WARNING : PGPASSWORD contient ${unsafe.length} caractere(s) non URI-safe : ${unsafe.join(" ")}. ` +
          `L'encodage cote wrapper compense, mais la pratique recommandee est un password URI-safe a la source (rotation post-MVP).`,
      );
    }
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

    // 2. Migrations Drizzle via migrator custom (une TX par migration).
    // Pourquoi pas `migrate(db, ...)` officiel : le migrator drizzle-orm@0.39
    // enveloppe TOUTES les migrations dans une seule transaction globale, ce qui
    // rend les valeurs ajoutees par `ALTER TYPE ... ADD VALUE` invisibles pour les
    // DML (INSERT/UPDATE) dans la meme transaction. Notre migrator custom execute
    // les ADD VALUE hors TX puis le reste dans une TX par migration.
    const migrationsFolder = resolve(process.cwd(), "src/db/migrations");
    await runMigrationsPerTransaction(sql, migrationsFolder);
    console.log("[migrate] [OK] Migrations appliquees (migrator custom per-TX).");
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
    // Hardening MEMORY 2026-05-21 : masque le password dans le stack trace.
    // postgres-js peut inclure l'URL complete dans certaines erreurs (DNS
    // fail, auth fail). On masque avant d'imprimer cote console.
    //
    // On essaye 2 sources pour le mask : PGPASSWORD (mode eclate) puis
    // l'extraction depuis DATABASE_URL (mode URL) en best-effort.
    const passwords = new Set<string>();
    if (process.env.PGPASSWORD) passwords.add(process.env.PGPASSWORD);
    if (process.env.DATABASE_URL) {
      try {
        const parsed = new URL(process.env.DATABASE_URL);
        if (parsed.password) passwords.add(decodeURIComponent(parsed.password));
      } catch {
        // ignore
      }
    }

    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error && typeof err.stack === "string" ? err.stack : "";
    let maskedMessage = message;
    let maskedStack = stack;
    for (const pwd of passwords) {
      maskedMessage = maskPasswordInMessage(maskedMessage, pwd);
      if (maskedStack) maskedStack = maskPasswordInMessage(maskedStack, pwd);
    }

    console.error("[migrate] [FAIL]", maskedMessage);
    if (maskedStack) console.error(maskedStack);
    process.exitCode = 1;
  });
}
