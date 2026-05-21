/**
 * Tests unit -- src/db/migrate.ts (gardes pures, sans connexion DB)
 *
 * Objectif : verrouiller les invariants du script de migration custom :
 *   1. `assertDatabaseUrl(env)` throw quand DATABASE_URL est absent / vide.
 *   2. `isPgBouncerPooler(url)` detecte les URLs pooler PgBouncer (6543 +
 *      pgbouncer=true) -- evite le DDL casse en transaction-mode.
 *   3. `resolveDbConfig(env)` privilegie la forme eclatee PG* (URI-safe) sur
 *      DATABASE_URL, et throw clair sur PG* incomplet.
 *
 * Pas de connexion DB reelle : les tests resolvent contre des stubs purs.
 * Tests d'integration migrations + extensions reels = workflow db-rls.yml.
 */

import { describe, expect, it } from "vitest";

import { assertDatabaseUrl, isPgBouncerPooler, resolveDbConfig } from "@/db/migrate";

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

describe("src/db/migrate -- resolveDbConfig", () => {
  it("throw quand aucune var d'env posee", () => {
    expect(() => resolveDbConfig({})).toThrowError(/DATABASE_URL/);
  });

  it("retourne kind='url' quand seule DATABASE_URL posee", () => {
    const url = "postgres://postgres:postgres@localhost:5432/edifio_sourcing";
    const cfg = resolveDbConfig({ DATABASE_URL: url });
    expect(cfg).toEqual({ kind: "url", url });
  });

  it("retourne kind='parts' avec port=5432 quand les 4 PG* poses sans PGPORT", () => {
    const cfg = resolveDbConfig({
      PGHOST: "db.example.com",
      PGUSER: "postgres.xxxx",
      PGPASSWORD: "URI-safe.password.32",
      PGDATABASE: "postgres",
    });
    expect(cfg).toEqual({
      kind: "parts",
      host: "db.example.com",
      user: "postgres.xxxx",
      password: "URI-safe.password.32",
      database: "postgres",
      port: 5432,
    });
  });

  it("retourne kind='parts' avec port=6543 quand PGPORT='6543' explicite", () => {
    const cfg = resolveDbConfig({
      PGHOST: "db.example.com",
      PGUSER: "postgres.xxxx",
      PGPASSWORD: "URI-safe.password.32",
      PGDATABASE: "postgres",
      PGPORT: "6543",
    });
    expect(cfg).toMatchObject({ kind: "parts", port: 6543 });
  });

  it("throw clair quand PG* incomplet, message mentionne les vars manquantes", () => {
    try {
      resolveDbConfig({
        PGHOST: "db.example.com",
        PGUSER: "postgres.xxxx",
      });
      throw new Error("resolveDbConfig aurait du throw");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toMatch(/PG\* environment variables incomplets/);
      expect(msg).toMatch(/PGPASSWORD/);
      expect(msg).toMatch(/PGDATABASE/);
    }
  });

  it("precedence : PG* complet ET DATABASE_URL posee -> kind='parts' (PG* gagne)", () => {
    const cfg = resolveDbConfig({
      PGHOST: "db.example.com",
      PGUSER: "postgres.xxxx",
      PGPASSWORD: "URI-safe.password.32",
      PGDATABASE: "postgres",
      DATABASE_URL: "postgres://u:p@other-host:5432/db",
    });
    expect(cfg).toMatchObject({ kind: "parts", host: "db.example.com" });
  });

  it("PG* vides ('') comptent comme absentes, liste mentionne PGHOST", () => {
    try {
      resolveDbConfig({
        PGHOST: "",
        PGUSER: "postgres.xxxx",
        PGPASSWORD: "URI-safe.password.32",
        PGDATABASE: "postgres",
      });
      throw new Error("resolveDbConfig aurait du throw");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toMatch(/PG\* environment variables incomplets/);
      expect(msg).toMatch(/PGHOST/);
    }
  });
});
