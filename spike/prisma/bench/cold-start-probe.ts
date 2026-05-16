// ============================================================================
// bench/cold-start-probe.ts — Sonde cold start Prisma, lancée en sub-process
// ----------------------------------------------------------------------------
// Mesure le temps entre :
//   t0 = début de mesure (juste avant l'import du module db.ts)
//   t1 = retour du premier $queryRaw `SELECT 1`
//
// Sortie : une ligne `COLD_START_MS=<n>` sur stdout, parsée par run-all.ts.
// Process spawn frais à chaque itération → mesure du coût d'import + init
// driver + premier roundtrip, sans warm-up partagé.
//
// CE QUE LA MESURE CAPTURE :
//   - Coût d'import des modules JS (Node module loader, ESM resolution)
//   - Coût d'init `new PrismaClient({ adapter })`
//   - Coût d'init du pool pg (handshake TCP, auth)
//   - Coût de `prisma.$connect()` (établissement explicite + sync engine)
//   - Premier roundtrip `SELECT 1`
//
// CE QUE LA MESURE NE CAPTURE PAS :
//   - Cold start Edge Function Deno réel (runtime sandbox V8 isolé) → cible
//     prod sur @prisma/adapter-pg-deno EXPÉRIMENTAL (cf. Q2 Cowork)
//   - Throughput soutenu (mesuré côté upsert)
//
// POINT CRITIQUE PHASE 4 — cold start 50 % Gate 5 :
//   Le cold start Prisma INCLUT le chargement du Prisma engine. Selon la
//   version, Prisma 6 sans driver adapter charge le moteur Rust binaire
//   (~10-15 MB). Avec previewFeatures.driverAdapters activé (notre cas),
//   le moteur Rust est REMPLACÉ par un moteur compilé en JS/Wasm (~30 MB
//   embarqué dans @prisma/client). Le temps d'import + parse de ce blob est
//   le candidat principal au handicap cold start côté Prisma — à comparer
//   au thin wrapper drizzle-orm (~quelques KB).
//
// Cf. https://www.prisma.io/docs/orm/overview/databases/database-drivers
// ============================================================================

// Marqueur ESM — sans export, TS considère le fichier comme un script et
// refuse `await` top-level.
export {};

// On retient t0 AVANT l'import dynamique du module db.ts pour intégrer le coût
// d'import (Prisma engine + adapter + pg) dans la mesure.
const t0 = performance.now();

// Imports dynamiques pour que t0 soit posé avant le module loader.
// On importe Prisma.sql + prisma + pool en deux fois pour mesurer le coût
// d'init côté @prisma/client séparément du driver adapter.
const { prisma, pool } = await import("../src/db");
const { Prisma } = await import("@prisma/client");

try {
  // $connect() force l'établissement de la connexion (le pool pg est lazy).
  // Mesure cold path complet : si on omettait $connect, la première query
  // le ferait implicitement → identique côté time mais moins explicite côté
  // logs en cas d'erreur.
  await prisma.$connect();
  await prisma.$queryRaw(Prisma.sql`SELECT 1`);
  const elapsed = performance.now() - t0;
  // Stdout = canal de mesure. Tout autre log → stderr pour ne pas parasiter.
  process.stdout.write(`COLD_START_MS=${elapsed.toFixed(3)}\n`);
} catch (err) {
  process.stderr.write(
    `[cold-start-probe] échec premier SELECT 1 : ${err instanceof Error ? err.message : String(err)}\n`,
  );
  await prisma.$disconnect().catch(() => undefined);
  await pool.end().catch(() => undefined);
  process.exit(2);
}

// Fermeture propre pour que le process n'attende pas l'idle_timeout pg.
await prisma.$disconnect();
await pool.end();
