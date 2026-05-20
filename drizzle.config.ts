/**
 * Configuration drizzle-kit — edifio Sourcing
 *
 * Source de vérité : ADR-013 (specs/adr_013_orm_drizzle.md), décision ORM
 * actée Board 2026-05-18. Versions pinned drizzle-orm@0.39 + drizzle-kit@0.30
 * + postgres@3.4 (driver postgres-js, Deno-natif Edge Function).
 *
 * Le schema (src/db/schema.ts) sera posé à l'étape 2 du plan Gate 6. À ce
 * stade (étape 1 — bootstrap tooling), un stub `src/db/schema/index.ts`
 * vide permet à drizzle-kit + client.ts de compiler.
 *
 * En local + CI : DATABASE_URL pointe sur le port 5432 (connexion directe
 * Postgres), JAMAIS sur le pooler 6543 PgBouncer (incompatible DDL drizzle-kit).
 */

import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Cf. .env.example — connexion directe Postgres requise (port 5432, pas le pooler 6543).",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema",
  out: "./src/db/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  verbose: true,
  strict: true,
});
