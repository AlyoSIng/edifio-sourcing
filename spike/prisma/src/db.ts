// ============================================================================
// db.ts — Client Prisma + driver-adapter pg
// ----------------------------------------------------------------------------
// Point d'entrée unique pour le bench (cold start, upserts, scoring).
// Le cold start mesuré = temps entre `import` de ce fichier et premier query
// abouti. On force donc le moins d'init possible ici (pas de log middleware,
// pas de connect lazy si évitable).
//
// CONFORMITÉ Q2 COWORK — Data Proxy NO-GO :
//   On utilise @prisma/adapter-pg côté Node (driver pg direct, pas de proxy
//   intermédiaire). La cible production reste Supabase Edge Function (Deno
//   runtime) avec @prisma/adapter-pg-deno EXPÉRIMENTAL — non testable en
//   Phase 2b (handicap structurel assumé, à rappeler dans le rapport Phase 4
//   au titre du critère « compat Supabase + RLS » 15 %).
//
// Pattern driver-adapter :
//   1. const pool = new Pool({ connectionString })
//   2. const adapter = new PrismaPg(pool)
//   3. const prisma = new PrismaClient({ adapter })
// Cf. https://www.prisma.io/docs/orm/overview/databases/database-drivers
//
// Pourquoi `max: 1` ? Idem Drizzle : on mesure le cold path pur, pas un pool
// warm-up. En production Edge Function on aurait `max: 1` aussi (1 invocation
// = 1 connexion), donc cohérence bench/prod.
// ============================================================================

import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL manquant — copier .env.example vers .env.local");
}

// Pool pg : 1 seule connexion (bench séquentiel). `statement_timeout` 30 s
// défensif pour qu'un query bloquant ne fige pas la sonde cold start.
export const pool = new Pool({
  connectionString,
  max: 1,
  idleTimeoutMillis: 20_000,
  connectionTimeoutMillis: 10_000,
  statement_timeout: 30_000,
});

// @prisma/adapter-pg : wrapper du driver pg pour Prisma 6.x avec
// previewFeatures.driverAdapters activé.
const adapter = new PrismaPg(pool);

// PrismaClient construit avec adapter — pas de moteur Rust binaire chargé
// pour les requêtes (le moteur Rust n'est utilisé que pour la compilation
// du query plan, pas pour l'exécution réseau).
//
// NB : le cold start Prisma inclut quand même le chargement du Prisma engine
// (~30 MB embarqué dans @prisma/client). C'est un point clé du critère
// cold start 50 % Gate 5 — souligné dans bench/cold-start-probe.ts.
export const prisma = new PrismaClient({ adapter });

export type DB = typeof prisma;
