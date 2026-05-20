/**
 * Tests unit -- src/db/migrate.ts (gardes pures, sans connexion DB)
 *
 * Objectif : verrouiller deux invariants du script de migration custom :
 *   1. `assertDatabaseUrl(env)` throw quand DATABASE_URL est absent / vide.
 *   2. `isPgBouncerPooler(url)` detecte les URLs pooler PgBouncer (6543 +
 *      pgbouncer=true) -- evite le DDL casse en transaction-mode.
 *
 * Pas de connexion DB reelle : les tests resolvent contre des stubs purs.
 * Tests d'integration migrations + extensions reels = workflow db-rls.yml.
 */

import { describe, expect, it } from "vitest";

import { assertDatabaseUrl, isPgBouncerPooler } from "@/db/migrate";

describe("src/db/migrate -- assertDatabaseUrl", () => {
  it("throw quand DATABASE_URL est absent (clef undefined)", () => {
    expect(() => assertDatabaseUrl({})).toThrowError(/DATABASE_URL/);
  });

  it("throw quand DATABASE_URL est vide", () => {
    expect(() => assertDatabaseUrl({ DATABASE_URL: "" })).toThrowError(/DATABASE_URL/);
  });

  it("retourne l'URL quand elle est definie", () => {
    const url = "postgres://postgres:postgres@localhost:5432/edifio_sourcing";
    expect(assertDatabaseUrl({ DATABASE_URL: url })).toBe(url);
  });

  it("message d'erreur mentionne le port 5432 vs pooler 6543", () => {
    expect(() => assertDatabaseUrl({})).toThrowError(/5432.*6543/);
  });
});

describe("src/db/migrate -- isPgBouncerPooler", () => {
  it("retourne false pour une connexion directe 5432", () => {
    expect(isPgBouncerPooler("postgres://u:p@host:5432/db")).toBe(false);
  });

  it("retourne true pour une connexion pooler 6543", () => {
    expect(isPgBouncerPooler("postgres://u:p@host:6543/db")).toBe(true);
  });

  it("retourne true si pgbouncer=true en query string", () => {
    expect(isPgBouncerPooler("postgres://u:p@host:5432/db?pgbouncer=true")).toBe(true);
  });

  it("retourne false sans marqueur pooler explicite", () => {
    expect(isPgBouncerPooler("postgres://u:p@host:5432/edifio_sourcing")).toBe(false);
  });
});
