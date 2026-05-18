/**
 * Reset complet (TRUNCATE) + re-seed -- edifio Sourcing
 * ===========================================================================
 *
 * USAGE : `pnpm db:reset` (dev local + CI uniquement, JAMAIS prod).
 *
 * Protections :
 *   1. Garde NODE_ENV === 'production' -> throw immediat.
 *   2. Garde host Supabase managed (`supabase.co`) sans `--allow-prod-host`
 *      explicite -> throw. Cette double garde evite l'oubli en cas de
 *      `.env.local` mal configure pointant sur le projet prod.
 *
 * Ordre TRUNCATE : on truncate en CASCADE depuis les 4 tables racines
 * (organizations, platforms, ai_prompts, architect_specialties) qui suffisent
 * a tout vider grace aux FK ON DELETE CASCADE. organizations est protege par
 * un trigger plpgsql d'immutabilite -- on temporise via DISABLE TRIGGER ALL.
 *
 * NB sur audit_logs : table protegee par triggers BEFORE UPDATE/DELETE qui
 * raise EXCEPTION. TRUNCATE bypass ces triggers ROW-level mais on desactive
 * proprement pour rester explicite. Re-enable a la fin.
 */

import postgres from "postgres";

import { runSeed } from "./index";

function isPgBouncerPooler(url: string): boolean {
  return url.includes(":6543") || url.includes("pgbouncer=true");
}

async function main(): Promise<void> {
  // --- Garde 1 : NODE_ENV ---
  if (process.env.NODE_ENV === "production") {
    throw new Error("[db:reset] TRUNCATE refuse en production.");
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("[db:reset] DATABASE_URL non defini.");
  }

  // --- Garde 2 : host Supabase managed (suspicion prod) ---
  const allowProdHost = process.argv.includes("--allow-prod-host");
  if (databaseUrl.includes("supabase.co") && !allowProdHost) {
    throw new Error(
      "[db:reset] DATABASE_URL pointe sur un host Supabase managed (supabase.co). " +
        "Passe --allow-prod-host pour confirmer (re-lecture obligatoire CTO).",
    );
  }

  // eslint-disable-next-line no-console
  console.log("[db:reset] ==== TRUNCATE + re-seed ====");
  // eslint-disable-next-line no-console
  console.log(`[db:reset] DATABASE_URL : ${databaseUrl.replace(/:[^@]+@/, ":***@")}`);

  const sql = postgres(databaseUrl, { max: 1, prepare: !isPgBouncerPooler(databaseUrl) });

  try {
    // ----- TRUNCATE en CASCADE -------------------------------------------
    // L'ordre est important : audit_logs a triggers BEFORE UPDATE/DELETE qui
    // raise. On les disable ROW level (TRUNCATE n'est pas DELETE mais on
    // reste explicite pour clarte d'intention).
    await sql.unsafe(`
      ALTER TABLE audit_logs DISABLE TRIGGER USER;
      TRUNCATE TABLE
        organizations,
        platforms,
        ai_prompts,
        architect_specialties,
        users
      RESTART IDENTITY CASCADE;
      ALTER TABLE audit_logs ENABLE TRIGGER USER;
    `);

    // eslint-disable-next-line no-console
    console.log("[db:reset] TRUNCATE OK -- toutes tables vides.");
  } finally {
    await sql.end();
  }

  // Re-seed via le module index.ts (utilise db: client.ts singleton).
  await runSeed();

  // eslint-disable-next-line no-console
  console.log("[db:reset] ==== Reset + reseed termines OK ====");
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error("[db:reset] FAIL", err);
  process.exit(1);
});
