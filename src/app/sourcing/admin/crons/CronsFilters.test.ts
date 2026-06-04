/**
 * Tests filterCronRows (chantier J7 — Steve 2026-06-04).
 *
 * Focus pure-logic : on teste la fonction de filtrage extraite du Client
 * Component. Pas besoin de React Testing Library (pas installé en deps).
 */

import { describe, expect, it } from "vitest";

import { filterCronRows } from "./filter-rows";
import type { CronRunRow } from "./crons-types";

function makeRow(overrides: Partial<CronRunRow> = {}): CronRunRow {
  return {
    id: "row-1",
    cron_name: "sourcing-run",
    started_at: "2026-06-04T06:30:00Z",
    finished_at: "2026-06-04T06:30:12Z",
    duration_ms: 12000,
    status: "ok",
    payload: { totalProfiles: 1 },
    error_message: null,
    ...overrides,
  };
}

describe("filterCronRows", () => {
  const rows: CronRunRow[] = [
    makeRow({ id: "1", cron_name: "sourcing-run", status: "ok" }),
    makeRow({ id: "2", cron_name: "sourcing-run", status: "error" }),
    makeRow({ id: "3", cron_name: "tandem-followup", status: "ok" }),
    makeRow({ id: "4", cron_name: "tandem-followup", status: "running" }),
    makeRow({ id: "5", cron_name: "library-expiry-digest", status: "ok" }),
  ];

  it("renvoie toutes les rows si filtres = all/all", () => {
    expect(filterCronRows(rows, "all", "all")).toHaveLength(5);
  });

  it("filtre par cron_name exact", () => {
    const result = filterCronRows(rows, "sourcing-run", "all");
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.cron_name === "sourcing-run")).toBe(true);
  });

  it("filtre par status 'ok'", () => {
    const result = filterCronRows(rows, "all", "ok");
    expect(result).toHaveLength(3);
    expect(result.every((r) => r.status === "ok")).toBe(true);
  });

  it("filtre par status 'error'", () => {
    const result = filterCronRows(rows, "all", "error");
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("2");
  });

  it("filtre par status 'running'", () => {
    const result = filterCronRows(rows, "all", "running");
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("4");
  });

  it("combine name + status (intersection)", () => {
    const result = filterCronRows(rows, "sourcing-run", "error");
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("2");
  });

  it("renvoie une liste vide si l'intersection est vide", () => {
    const result = filterCronRows(rows, "tandem-followup", "error");
    expect(result).toEqual([]);
  });

  it("ne mute pas l'array source", () => {
    const original = [...rows];
    filterCronRows(rows, "sourcing-run", "ok");
    expect(rows).toEqual(original);
  });

  it("préserve l'ordre des rows d'origine", () => {
    const result = filterCronRows(rows, "all", "ok");
    expect(result.map((r) => r.id)).toEqual(["1", "3", "5"]);
  });
});
