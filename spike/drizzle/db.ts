// ============================================================================
// db.ts — Client Drizzle + driver postgres-js
// ----------------------------------------------------------------------------
// Point d'entrée unique pour le bench (cold start, upserts, scoring).
// Le cold start mesuré = temps entre `import` de ce fichier et premier query
// abouti. On force donc le moins d'init possible ici (pas de prepared statements
// lazy si évitable, pas de pool warm-up — on veut mesurer le cas froid réel).
// ============================================================================

import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL manquant — copier .env.example vers .env.local");
}

// postgres-js : driver TCP direct, pas de pool partagé global. On instancie
// une seule connexion par script (suffisant pour le bench séquentiel).
// `max: 1` = pas de pool, on mesure le cold path pur.
// `prepare: false` = pas de prepared statements (Supabase pgbouncer transaction
// mode incompatible avec prepared — cf. doc postgres-js).
export const sql = postgres(connectionString, {
  max: 1,
  prepare: false,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(sql, { schema });

export type DB = typeof db;
