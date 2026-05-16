// ============================================================================
// bench/cold-start-probe.ts — Sonde cold start, lancée en sub-process
// ----------------------------------------------------------------------------
// Mesure le temps entre :
//   t0 = début de mesure (juste avant l'import du client Drizzle)
//   t1 = retour du premier db.execute(sql`SELECT 1`)
//
// Sortie : une ligne `COLD_START_MS=<n>` sur stdout, parsée par run-all.ts.
//
// Le sub-process est spawn frais à chaque itération → on mesure bien le coût
// d'import + init du driver + premier roundtrip, sans warm-up partagé.
//
// LIMITATION : ce que cette mesure capture
//   - Coût d'import des modules JS (Node module loader, ESM resolution)
//   - Coût d'init drizzle (peu, c'est un thin wrapper)
//   - Coût d'init postgres-js (création de la socket, handshake TCP, auth)
//   - Premier roundtrip (1 SELECT 1)
//
//   Elle ne mesure PAS :
//   - Le vrai cold start Edge Function Deno (différent runtime, sandbox V8 isol)
//   - Le throughput soutenu (c'est l'objet du bench upsert)
//
//   À la lecture du rapport Phase 4 : ces valeurs sont des proxys Node, à
//   pondérer avec le résultat de la même mesure côté Prisma (comparaison
//   relative valide) et avec une mesure Deno réelle si possible Phase 3.
// ============================================================================

// Marqueur ESM — sans export, TS considère le fichier comme un script et
// refuse `await` top-level.
export {};

// On retient t0 AVANT l'import dynamique du module db.ts pour intégrer le coût
// d'import dans la mesure (= ce qui se passe en cold start réel).
const t0 = performance.now();

// Import dynamique pour que t0 soit posé avant le coût du module loader.
const { db, sql: pgSql } = await import("../db");
const { sql: drizzleSql } = await import("drizzle-orm");

try {
  await db.execute(drizzleSql`SELECT 1`);
  const elapsed = performance.now() - t0;
  // Stdout = canal de mesure. Tout autre log → stderr pour ne pas parasiter.
  process.stdout.write(`COLD_START_MS=${elapsed.toFixed(3)}\n`);
} catch (err) {
  process.stderr.write(
    `[cold-start-probe] échec premier SELECT 1 : ${err instanceof Error ? err.message : String(err)}\n`,
  );
  // Forcer la fermeture connexion même en erreur pour libérer le process.
  await pgSql.end({ timeout: 5 }).catch(() => undefined);
  process.exit(2);
}

// Fermeture propre pour que le process n'attende pas l'idle_timeout postgres-js.
await pgSql.end({ timeout: 5 });
