/**
 * Tests compareWithBaseline (chantier M — Steve 2026-06-04).
 *
 * Vérifie la matrice de sévérité (ok / drift / regression) sur les 5 champs
 * comparés. La baseline est figée (snapshot 22/05).
 */

import { describe, expect, it } from "vitest";

import { compareWithBaseline, ALYOS_BTP_BASELINE_2026_05_22 } from "./baseline-profiles";

function makeCurrent(overrides: Partial<Parameters<typeof compareWithBaseline>[0]> = {}) {
  return {
    name: "Profil AlyoS BTP",
    positiveCount: 24,
    negativeCount: 9,
    cpvCount: 0,
    geoCount: 23,
    marketTypes: ["moe", "services", "fournitures"],
    ...overrides,
  };
}

describe("compareWithBaseline", () => {
  it("renvoie 5 diffs (un par champ comparé)", () => {
    const diffs = compareWithBaseline(makeCurrent());
    expect(diffs).toHaveLength(5);
    expect(diffs.map((d) => d.field)).toEqual([
      "Mots-clés positifs",
      "Mots-clés négatifs",
      "Codes CPV",
      "Zones géo (départements)",
      "Types de marché",
    ]);
  });

  it("tous OK si la config actuelle == baseline", () => {
    const diffs = compareWithBaseline(makeCurrent());
    expect(diffs.every((d) => d.severity === "ok")).toBe(true);
  });

  it("regression si positiveCount actuel < baseline (cause n°1 du 0 inserted)", () => {
    const diffs = compareWithBaseline(makeCurrent({ positiveCount: 0 }));
    const positiveDiff = diffs.find((d) => d.field === "Mots-clés positifs")!;
    expect(positiveDiff.severity).toBe("regression");
    expect(positiveDiff.hint).toContain("mot(s)-clé(s) en moins");
  });

  it("drift si positiveCount actuel > baseline (élargissement)", () => {
    const diffs = compareWithBaseline(makeCurrent({ positiveCount: 30 }));
    const positiveDiff = diffs.find((d) => d.field === "Mots-clés positifs")!;
    expect(positiveDiff.severity).toBe("drift");
    expect(positiveDiff.hint).toContain("ajouté");
  });

  it("regression si un marketType de la baseline manque", () => {
    const diffs = compareWithBaseline(makeCurrent({ marketTypes: ["moe", "services"] })); // manque 'fournitures'
    const mtDiff = diffs.find((d) => d.field === "Types de marché")!;
    expect(mtDiff.severity).toBe("regression");
    expect(mtDiff.hint).toContain("fournitures");
  });

  it("drift si on ajoute un marketType (travaux par exemple)", () => {
    const diffs = compareWithBaseline(
      makeCurrent({ marketTypes: ["moe", "services", "fournitures", "travaux"] }),
    );
    const mtDiff = diffs.find((d) => d.field === "Types de marché")!;
    expect(mtDiff.severity).toBe("drift");
    expect(mtDiff.hint).toContain("travaux");
  });

  it("drift si ajout de filtre CPV alors que la baseline avait 0", () => {
    const diffs = compareWithBaseline(makeCurrent({ cpvCount: 5 }));
    const cpvDiff = diffs.find((d) => d.field === "Codes CPV")!;
    expect(cpvDiff.severity).toBe("drift");
    expect(cpvDiff.hint).toContain("durcit");
  });

  it("regression si geoCount actuel < baseline (sourcing géographiquement plus restreint)", () => {
    const diffs = compareWithBaseline(makeCurrent({ geoCount: 10 }));
    const geoDiff = diffs.find((d) => d.field === "Zones géo (départements)")!;
    expect(geoDiff.severity).toBe("regression");
    expect(geoDiff.hint).toContain("département(s) en moins");
  });

  it("baseline figée — snapshot 2026-05-22", () => {
    expect(ALYOS_BTP_BASELINE_2026_05_22.capturedAt).toBe("2026-05-22T17:03:00Z");
    expect(ALYOS_BTP_BASELINE_2026_05_22.positiveCount).toBe(24);
    expect(ALYOS_BTP_BASELINE_2026_05_22.negativeCount).toBe(9);
    expect(ALYOS_BTP_BASELINE_2026_05_22.cpvCount).toBe(0);
    expect(ALYOS_BTP_BASELINE_2026_05_22.geoCount).toBe(23);
    expect(ALYOS_BTP_BASELINE_2026_05_22.marketTypes).toEqual(["moe", "services", "fournitures"]);
  });
});
