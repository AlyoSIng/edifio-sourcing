/**
 * Tests parseRange + rangeDaysAgo (chantier I4 — Steve 2026-06-04).
 *
 * Couvre les helpers de RangeFilter utilisés par /admin/ia-usage et
 * /admin/tandem-activity (chantier I1). Le composant React lui-même
 * (RangeFilter) n'est pas testé ici — c'est un Server Component qui
 * produit des <Link>, sans logique métier.
 */

import { describe, expect, it } from "vitest";

import { parseRange, rangeDaysAgo } from "./range";

describe("parseRange", () => {
  it("renvoie la valeur quand input est '7', '30' ou '90'", () => {
    expect(parseRange("7")).toBe("7");
    expect(parseRange("30")).toBe("30");
    expect(parseRange("90")).toBe("90");
  });

  it("renvoie le défaut '30' quand input est invalide", () => {
    expect(parseRange("")).toBe("30");
    expect(parseRange("0")).toBe("30");
    expect(parseRange("abc")).toBe("30");
    expect(parseRange("365")).toBe("30");
    expect(parseRange(undefined)).toBe("30");
  });

  it("extrait le premier élément d'un tableau (Next.js searchParams)", () => {
    expect(parseRange(["7", "30"])).toBe("7");
    expect(parseRange(["bad", "7"])).toBe("30"); // premier élément invalide → défaut
    expect(parseRange([])).toBe("30");
  });
});

describe("rangeDaysAgo", () => {
  const now = new Date("2026-06-04T12:00:00.000Z");

  it("renvoie now - 7 jours pour range '7'", () => {
    const result = rangeDaysAgo("7", now);
    expect(result.toISOString()).toBe("2026-05-28T12:00:00.000Z");
  });

  it("renvoie now - 30 jours pour range '30'", () => {
    const result = rangeDaysAgo("30", now);
    expect(result.toISOString()).toBe("2026-05-05T12:00:00.000Z");
  });

  it("renvoie now - 90 jours pour range '90' (delta ~90j ± 1h DST)", () => {
    // `setDate` est local-aware donc un shift DST entre la date de départ
    // (CEST) et la date résultat (CET) peut introduire ±1h. On vérifie le
    // delta avec une tolérance d'1h pour rester portable.
    const result = rangeDaysAgo("90", now);
    const deltaMs = now.getTime() - result.getTime();
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
    const oneHourMs = 60 * 60 * 1000;
    expect(Math.abs(deltaMs - ninetyDaysMs)).toBeLessThanOrEqual(oneHourMs);
  });

  it("ne mute pas le `now` reçu (Date immutable côté caller)", () => {
    const original = new Date(now.getTime());
    rangeDaysAgo("30", now);
    expect(now.toISOString()).toBe(original.toISOString());
  });

  it("traverse correctement un changement de mois (jour 30 → jour -1)", () => {
    // 1er mai - 7j = 24 avril
    const may1 = new Date("2026-05-01T08:00:00.000Z");
    const result = rangeDaysAgo("7", may1);
    expect(result.toISOString()).toBe("2026-04-24T08:00:00.000Z");
  });
});
