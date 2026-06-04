/**
 * Tests parseRange + rangeDaysAgo (chantier I4 — Steve 2026-06-04).
 *
 * Couvre les helpers de RangeFilter utilisés par /admin/ia-usage et
 * /admin/tandem-activity (chantier I1). Le composant React lui-même
 * (RangeFilter) n'est pas testé ici — c'est un Server Component qui
 * produit des <Link>, sans logique métier.
 */

import { describe, expect, it } from "vitest";

import { formatDateLocal, parseCustomRange, parseRange, rangeDaysAgo } from "./range";

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

describe("parseRange — option custom (J1)", () => {
  it("renvoie 'custom' quand input = 'custom'", () => {
    expect(parseRange("custom")).toBe("custom");
  });
});

describe("parseCustomRange (J1)", () => {
  it("parse correctement from/to au format YYYY-MM-DD", () => {
    const res = parseCustomRange("2026-05-01", "2026-05-15");
    expect(res).not.toBeNull();
    expect(res!.from.getFullYear()).toBe(2026);
    expect(res!.from.getMonth()).toBe(4); // mai = index 4
    expect(res!.from.getDate()).toBe(1);
    expect(res!.to.getDate()).toBe(15);
  });

  it("renvoie null si from > to", () => {
    expect(parseCustomRange("2026-05-15", "2026-05-01")).toBeNull();
  });

  it("renvoie null si format invalide", () => {
    expect(parseCustomRange("2026-5-1", "2026-05-15")).toBeNull();
    expect(parseCustomRange("not-a-date", "2026-05-15")).toBeNull();
    expect(parseCustomRange("", "2026-05-15")).toBeNull();
  });

  it("renvoie null si un des deux paramètres est absent", () => {
    expect(parseCustomRange(undefined, "2026-05-15")).toBeNull();
    expect(parseCustomRange("2026-05-01", undefined)).toBeNull();
    expect(parseCustomRange(undefined, undefined)).toBeNull();
  });

  it("renvoie null si la plage dépasse 366 jours (borne anti-DoS BDD)", () => {
    expect(parseCustomRange("2024-01-01", "2026-01-01")).toBeNull(); // 2 ans
  });

  it("accepte une plage exactement = 365 jours", () => {
    const res = parseCustomRange("2026-01-01", "2026-12-31");
    expect(res).not.toBeNull();
  });

  it("extrait le premier élément d'un tableau (Next.js searchParams)", () => {
    const res = parseCustomRange(["2026-05-01", "x"], ["2026-05-15"]);
    expect(res).not.toBeNull();
    expect(res!.from.getDate()).toBe(1);
  });
});

describe("formatDateLocal (J1)", () => {
  it("formatte une Date locale en YYYY-MM-DD", () => {
    // On utilise getFullYear/getMonth/getDate dans formatDateLocal donc
    // on test sur une date construite localement.
    const d = new Date(2026, 4, 1); // 1er mai 2026, midnight local
    expect(formatDateLocal(d)).toBe("2026-05-01");
  });

  it("padde correctement les mois/jours < 10", () => {
    const d = new Date(2026, 0, 5); // 5 jan 2026
    expect(formatDateLocal(d)).toBe("2026-01-05");
  });
});
