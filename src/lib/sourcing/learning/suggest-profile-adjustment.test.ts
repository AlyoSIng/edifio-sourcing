/**
 * Tests Vitest — `computeSuggestions` (apprentissage par écartement, Salve U).
 *
 * Couvre :
 *  - seuil non atteint (< 3 events) → aucune suggestion
 *  - seuil atteint (>= 3 events) → suggestion générée par motif
 *  - motif non actionnable (deadline_too_short, too_competitive, other) ignoré
 *  - fenêtre 30 j respectée (events hors fenêtre exclus)
 *  - events déjà traités (appliedAt / dismissedAt) exclus
 *  - dédup départements + classement par fréquence (out_of_area)
 *  - calcul amountMin = max + marge (budget_too_low)
 *  - extraction termes récurrents verbatim, dédup vs negative existants (out_of_scope)
 *  - events `selected` ignorés
 */

import { describe, expect, it } from "vitest";

import {
  computeSuggestions,
  SUGGESTION_THRESHOLD,
  type LearningEventLite,
  type SearchProfileLite,
} from "./suggest-profile-adjustment";

// ----------------------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------------------

const NOW = new Date("2026-06-08T10:00:00.000Z");

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
}

function emptyProfile(overrides: Partial<SearchProfileLite> = {}): SearchProfileLite {
  return {
    geoZones: [],
    amountMin: null,
    keywords: { positive: [], negative: [], exact: [] },
    ...overrides,
  };
}

function rejected(overrides: Partial<LearningEventLite> = {}): LearningEventLite {
  return {
    eventType: "rejected",
    reasonCode: "out_of_area",
    verbatim: null,
    occurredAt: daysAgo(1),
    appliedAt: null,
    dismissedAt: null,
    payload: null,
    ...overrides,
  };
}

// ----------------------------------------------------------------------------
// Seuil
// ----------------------------------------------------------------------------

describe("computeSuggestions — seuil", () => {
  it("aucune suggestion sous le seuil (2 events out_of_area)", () => {
    const events: LearningEventLite[] = [
      rejected({ payload: { geo_zone: "13" } }),
      rejected({ payload: { geo_zone: "13" } }),
    ];
    const result = computeSuggestions(events, emptyProfile({ geoZones: ["13"] }), NOW);
    expect(result).toEqual([]);
  });

  it("génère une suggestion au seuil exact (3 events out_of_area)", () => {
    const events: LearningEventLite[] = [
      rejected({ payload: { geo_zone: "13" } }),
      rejected({ payload: { geo_zone: "13" } }),
      rejected({ payload: { geo_zone: "13" } }),
    ];
    const result = computeSuggestions(events, emptyProfile({ geoZones: ["13"] }), NOW);
    expect(result).toHaveLength(1);
    expect(result[0]?.reasonCode).toBe("out_of_area");
    expect(result[0]?.count).toBe(SUGGESTION_THRESHOLD);
    expect(result[0]?.suggestedChange).toEqual({ kind: "remove_geo_zones", values: ["13"] });
  });
});

// ----------------------------------------------------------------------------
// out_of_area
// ----------------------------------------------------------------------------

describe("computeSuggestions — out_of_area", () => {
  it("ne propose au retrait que les départements présents dans le profil", () => {
    const events: LearningEventLite[] = [
      rejected({ payload: { geo_zone: "13" } }),
      rejected({ payload: { geo_zone: "83" } }),
      rejected({ payload: { geo_zone: "06" } }), // pas dans le profil
    ];
    // Profil contient 13 et 83 mais pas 06.
    const result = computeSuggestions(events, emptyProfile({ geoZones: ["13", "83"] }), NOW);
    expect(result).toHaveLength(1);
    const change = result[0]?.suggestedChange;
    expect(change).toEqual({
      kind: "remove_geo_zones",
      values: expect.arrayContaining(["13", "83"]),
    });
    if (change?.kind === "remove_geo_zones") {
      expect(change.values).not.toContain("06");
    }
  });

  it("classe les départements par fréquence décroissante", () => {
    const events: LearningEventLite[] = [
      rejected({ payload: { geo_zone: "83" } }),
      rejected({ payload: { geo_zone: "13" } }),
      rejected({ payload: { geo_zone: "13" } }),
      rejected({ payload: { geo_zone: "13" } }),
    ];
    const result = computeSuggestions(events, emptyProfile({ geoZones: ["13", "83"] }), NOW);
    const change = result[0]?.suggestedChange;
    expect(change?.kind).toBe("remove_geo_zones");
    if (change?.kind === "remove_geo_zones") {
      expect(change.values[0]).toBe("13"); // 3 occurrences en tête
    }
  });

  it("aucune suggestion si aucun département écarté n'est dans le profil", () => {
    const events: LearningEventLite[] = [
      rejected({ payload: { geo_zone: "06" } }),
      rejected({ payload: { geo_zone: "06" } }),
      rejected({ payload: { geo_zone: "06" } }),
    ];
    const result = computeSuggestions(events, emptyProfile({ geoZones: ["13"] }), NOW);
    expect(result).toEqual([]);
  });
});

// ----------------------------------------------------------------------------
// budget_too_low
// ----------------------------------------------------------------------------

describe("computeSuggestions — budget_too_low", () => {
  it("suggère amountMin = max des montants + 10 % de marge", () => {
    const events: LearningEventLite[] = [
      rejected({ reasonCode: "budget_too_low", payload: { amount: 100000 } }),
      rejected({ reasonCode: "budget_too_low", payload: { amount: 200000 } }),
      rejected({ reasonCode: "budget_too_low", payload: { amount: 150000 } }),
    ];
    const result = computeSuggestions(events, emptyProfile(), NOW);
    expect(result).toHaveLength(1);
    expect(result[0]?.reasonCode).toBe("budget_too_low");
    expect(result[0]?.suggestedChange).toEqual({
      kind: "set_amount_min",
      value: Math.round(200000 * 1.1), // 220000
    });
  });

  it("ne suggère pas si amountMin actuel est déjà >= au seuil proposé", () => {
    const events: LearningEventLite[] = [
      rejected({ reasonCode: "budget_too_low", payload: { amount: 100000 } }),
      rejected({ reasonCode: "budget_too_low", payload: { amount: 100000 } }),
      rejected({ reasonCode: "budget_too_low", payload: { amount: 100000 } }),
    ];
    // amountMin actuel 500000 > 110000 proposé → pas de suggestion.
    const result = computeSuggestions(events, emptyProfile({ amountMin: "500000.00" }), NOW);
    expect(result).toEqual([]);
  });

  it("ignore les montants nuls ou absents et reste sous le seuil exploitable", () => {
    const events: LearningEventLite[] = [
      rejected({ reasonCode: "budget_too_low", payload: { amount: null } }),
      rejected({ reasonCode: "budget_too_low", payload: null }),
      rejected({ reasonCode: "budget_too_low", payload: { amount: 0 } }),
    ];
    // 3 events atteignent le seuil mais aucun montant exploitable → pas de suggestion.
    const result = computeSuggestions(events, emptyProfile(), NOW);
    expect(result).toEqual([]);
  });
});

// ----------------------------------------------------------------------------
// out_of_scope
// ----------------------------------------------------------------------------

describe("computeSuggestions — out_of_scope", () => {
  it("propose les termes récurrents du verbatim en negative", () => {
    const events: LearningEventLite[] = [
      rejected({ reasonCode: "out_of_scope", verbatim: "Marché informatique, pas notre métier" }),
      rejected({ reasonCode: "out_of_scope", verbatim: "Informatique réseau, hors compétence" }),
      rejected({ reasonCode: "out_of_scope", verbatim: "Encore de l'informatique" }),
    ];
    const result = computeSuggestions(events, emptyProfile(), NOW);
    expect(result).toHaveLength(1);
    expect(result[0]?.reasonCode).toBe("out_of_scope");
    const change = result[0]?.suggestedChange;
    expect(change?.kind).toBe("add_negative_keywords");
    if (change?.kind === "add_negative_keywords") {
      expect(change.values).toContain("informatique");
    }
  });

  it("exclut les termes déjà présents en negative", () => {
    const events: LearningEventLite[] = [
      rejected({ reasonCode: "out_of_scope", verbatim: "informatique logiciel" }),
      rejected({ reasonCode: "out_of_scope", verbatim: "informatique logiciel" }),
      rejected({ reasonCode: "out_of_scope", verbatim: "informatique logiciel" }),
    ];
    const profile = emptyProfile({
      keywords: { positive: [], negative: ["informatique"], exact: [] },
    });
    const result = computeSuggestions(events, profile, NOW);
    const change = result[0]?.suggestedChange;
    if (change?.kind === "add_negative_keywords") {
      expect(change.values).not.toContain("informatique");
      expect(change.values).toContain("logiciel");
    }
  });

  it("aucune suggestion si pas de terme récurrent (occurrences < 2)", () => {
    const events: LearningEventLite[] = [
      rejected({ reasonCode: "out_of_scope", verbatim: "alpha" }),
      rejected({ reasonCode: "out_of_scope", verbatim: "beta" }),
      rejected({ reasonCode: "out_of_scope", verbatim: "gamma" }),
    ];
    // Mots courts (< 4 chars) + occurrences uniques → rien à proposer.
    const result = computeSuggestions(events, emptyProfile(), NOW);
    expect(result).toEqual([]);
  });
});

// ----------------------------------------------------------------------------
// not_moe_travaux (Salve U — 7e motif, Steve 2026-06-10)
// ----------------------------------------------------------------------------

describe("computeSuggestions — not_moe_travaux", () => {
  it("suggère hardcode « travaux » au seuil (3 events, indépendamment du verbatim)", () => {
    const events: LearningEventLite[] = [
      rejected({ reasonCode: "not_moe_travaux", verbatim: null }),
      rejected({ reasonCode: "not_moe_travaux", verbatim: null }),
      rejected({ reasonCode: "not_moe_travaux", verbatim: null }),
    ];
    const result = computeSuggestions(events, emptyProfile(), NOW);
    expect(result).toHaveLength(1);
    expect(result[0]?.reasonCode).toBe("not_moe_travaux");
    expect(result[0]?.count).toBe(SUGGESTION_THRESHOLD);
    expect(result[0]?.suggestedChange).toEqual({
      kind: "add_negative_keywords",
      values: ["travaux"],
    });
  });

  it("ignore le verbatim : aucun mot du verbatim ne remonte (hardcode pur)", () => {
    const events: LearningEventLite[] = [
      rejected({ reasonCode: "not_moe_travaux", verbatim: "Marché de fournitures bureau" }),
      rejected({ reasonCode: "not_moe_travaux", verbatim: "Marché de fournitures bureau" }),
      rejected({ reasonCode: "not_moe_travaux", verbatim: "Marché de fournitures bureau" }),
    ];
    const result = computeSuggestions(events, emptyProfile(), NOW);
    expect(result).toHaveLength(1);
    const change = result[0]?.suggestedChange;
    expect(change).toEqual({ kind: "add_negative_keywords", values: ["travaux"] });
    if (change?.kind === "add_negative_keywords") {
      expect(change.values).not.toContain("fournitures");
      expect(change.values).not.toContain("bureau");
    }
  });

  it("ne suggère rien si « travaux » est déjà dans keywords.negative", () => {
    const events: LearningEventLite[] = [
      rejected({ reasonCode: "not_moe_travaux" }),
      rejected({ reasonCode: "not_moe_travaux" }),
      rejected({ reasonCode: "not_moe_travaux" }),
    ];
    const profile = emptyProfile({
      keywords: { positive: [], negative: ["travaux"], exact: [] },
    });
    const result = computeSuggestions(events, profile, NOW);
    expect(result).toEqual([]);
  });

  it("dédup insensible à la casse (« Travaux » déjà présent → pas de suggestion)", () => {
    const events: LearningEventLite[] = [
      rejected({ reasonCode: "not_moe_travaux" }),
      rejected({ reasonCode: "not_moe_travaux" }),
      rejected({ reasonCode: "not_moe_travaux" }),
    ];
    const profile = emptyProfile({
      keywords: { positive: [], negative: ["Travaux"], exact: [] },
    });
    const result = computeSuggestions(events, profile, NOW);
    expect(result).toEqual([]);
  });
});

// ----------------------------------------------------------------------------
// Motifs non actionnables
// ----------------------------------------------------------------------------

describe("computeSuggestions — motifs non actionnables", () => {
  it.each(["deadline_too_short", "too_competitive", "other"])(
    "ignore le motif non actionnable %s même au-delà du seuil",
    (code) => {
      const events: LearningEventLite[] = [
        rejected({ reasonCode: code, verbatim: "raison raison raison" }),
        rejected({ reasonCode: code, verbatim: "raison raison raison" }),
        rejected({ reasonCode: code, verbatim: "raison raison raison" }),
        rejected({ reasonCode: code, verbatim: "raison raison raison" }),
      ];
      const result = computeSuggestions(events, emptyProfile({ geoZones: ["13"] }), NOW);
      expect(result).toEqual([]);
    },
  );

  it("ignore reasonCode null", () => {
    const events: LearningEventLite[] = [
      rejected({ reasonCode: null }),
      rejected({ reasonCode: null }),
      rejected({ reasonCode: null }),
    ];
    const result = computeSuggestions(events, emptyProfile(), NOW);
    expect(result).toEqual([]);
  });
});

// ----------------------------------------------------------------------------
// Fenêtre 30 j + events traités + type
// ----------------------------------------------------------------------------

describe("computeSuggestions — fenêtre temporelle et filtres", () => {
  it("exclut les events hors fenêtre 30 j", () => {
    const events: LearningEventLite[] = [
      rejected({ payload: { geo_zone: "13" }, occurredAt: daysAgo(1) }),
      rejected({ payload: { geo_zone: "13" }, occurredAt: daysAgo(15) }),
      rejected({ payload: { geo_zone: "13" }, occurredAt: daysAgo(40) }), // hors fenêtre
    ];
    const result = computeSuggestions(events, emptyProfile({ geoZones: ["13"] }), NOW);
    // 2 events dans la fenêtre < seuil → pas de suggestion.
    expect(result).toEqual([]);
  });

  it("respecte la borne exacte de 30 j (event à 31 j exclu, 29 j inclus)", () => {
    const events: LearningEventLite[] = [
      rejected({ payload: { geo_zone: "13" }, occurredAt: daysAgo(29) }),
      rejected({ payload: { geo_zone: "13" }, occurredAt: daysAgo(29) }),
      rejected({ payload: { geo_zone: "13" }, occurredAt: daysAgo(31) }), // exclu
    ];
    const result = computeSuggestions(events, emptyProfile({ geoZones: ["13"] }), NOW);
    expect(result).toEqual([]); // seulement 2 dans la fenêtre
  });

  it("exclut les events déjà appliqués (appliedAt non-null)", () => {
    const events: LearningEventLite[] = [
      rejected({ payload: { geo_zone: "13" }, appliedAt: daysAgo(1) }),
      rejected({ payload: { geo_zone: "13" } }),
      rejected({ payload: { geo_zone: "13" } }),
    ];
    const result = computeSuggestions(events, emptyProfile({ geoZones: ["13"] }), NOW);
    expect(result).toEqual([]); // 2 actionnables < seuil
  });

  it("exclut les events déjà ignorés (dismissedAt non-null)", () => {
    const events: LearningEventLite[] = [
      rejected({ payload: { geo_zone: "13" }, dismissedAt: daysAgo(1) }),
      rejected({ payload: { geo_zone: "13" } }),
      rejected({ payload: { geo_zone: "13" } }),
    ];
    const result = computeSuggestions(events, emptyProfile({ geoZones: ["13"] }), NOW);
    expect(result).toEqual([]);
  });

  it("ignore les events eventType=selected", () => {
    const events: LearningEventLite[] = [
      { ...rejected({ payload: { geo_zone: "13" } }), eventType: "selected" },
      { ...rejected({ payload: { geo_zone: "13" } }), eventType: "selected" },
      { ...rejected({ payload: { geo_zone: "13" } }), eventType: "selected" },
    ];
    const result = computeSuggestions(events, emptyProfile({ geoZones: ["13"] }), NOW);
    expect(result).toEqual([]);
  });
});

// ----------------------------------------------------------------------------
// Multi-motifs
// ----------------------------------------------------------------------------

describe("computeSuggestions — plusieurs motifs simultanés", () => {
  it("génère une suggestion par motif actionnable et trie par count décroissant", () => {
    const events: LearningEventLite[] = [
      // out_of_area : 3
      rejected({ reasonCode: "out_of_area", payload: { geo_zone: "13" } }),
      rejected({ reasonCode: "out_of_area", payload: { geo_zone: "13" } }),
      rejected({ reasonCode: "out_of_area", payload: { geo_zone: "13" } }),
      // budget_too_low : 4
      rejected({ reasonCode: "budget_too_low", payload: { amount: 100000 } }),
      rejected({ reasonCode: "budget_too_low", payload: { amount: 100000 } }),
      rejected({ reasonCode: "budget_too_low", payload: { amount: 100000 } }),
      rejected({ reasonCode: "budget_too_low", payload: { amount: 100000 } }),
    ];
    const result = computeSuggestions(events, emptyProfile({ geoZones: ["13"] }), NOW);
    expect(result).toHaveLength(2);
    // budget_too_low (4) avant out_of_area (3)
    expect(result[0]?.reasonCode).toBe("budget_too_low");
    expect(result[0]?.count).toBe(4);
    expect(result[1]?.reasonCode).toBe("out_of_area");
    expect(result[1]?.count).toBe(3);
  });
});
