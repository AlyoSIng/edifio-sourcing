// ============================================================================
// drizzle.config.ts — Spike Drizzle Phase 2a
// ----------------------------------------------------------------------------
// Configuration drizzle-kit pour le prototype isolé. AUCUNE incidence sur le
// projet Next.js racine — ce fichier est lu uniquement par la commande
// `drizzle-kit generate|check` exécutée depuis ce sous-dossier.
// ============================================================================

import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  // Schema en TypeScript canonique
  schema: "./schema.ts",

  // Migrations SQL générées (committées en tant qu'artefact spike)
  out: "./migrations",

  // Dialect Postgres (Supabase EU Frankfurt cible)
  dialect: "postgresql",

  // Connexion utilisée uniquement pour `drizzle-kit pull` / `push` / `check`.
  // Le bench (Phase 3) consomme la connexion via `db.ts` qui lit la même var.
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:54322/postgres",
  },

  // Verbose pour observer la génération en Phase 3
  verbose: true,

  // Pas de strict-mode destructif — on génère, on n'applique pas
  strict: true,
});
