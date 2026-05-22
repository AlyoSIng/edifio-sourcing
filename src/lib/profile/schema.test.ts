/**
 * Tests Zod — `searchProfileUpdateSchema` (P2 Gate 6).
 *
 * Couvre :
 *  - cas valides (payload conforme + payload minimal vide)
 *  - cas invalides (par contrainte) :
 *    * array trop long (> 100 items)
 *    * string > 100 chars
 *    * CPV non-digit / hors plage
 *    * geo_zones hors regex département FR
 *    * market_types hors enum
 *    * montant négatif
 *    * amount_min > amount_max (refine)
 *  - normalisations :
 *    * trim + lowercase keywords
 *    * dedup post-normalisation
 *    * dedup market_types
 *
 * Convention : on utilise `safeParse` partout pour exposer les erreurs sans
 * `try/catch`, et on assert sur `result.success` + `result.error.issues`.
 */

import { describe, expect, it } from "vitest";

import { MARKET_TYPES, searchProfileUpdateSchema } from "./schema";

// ----------------------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------------------

const VALID_FULL = {
  keywords: {
    positive: ["BTP", "Renovation", "Construction"],
    negative: ["informatique"],
    exact: ["AlyoS", "edifio"],
  },
  cpv_codes: ["45000000", "71"],
  geo_zones: ["33", "40", "2A", "971"],
  market_types: ["travaux", "services"],
  amount_min: 0,
  amount_max: 1_000_000,
};

const VALID_MINIMAL = {
  keywords: { positive: [], negative: [], exact: [] },
  cpv_codes: [],
  geo_zones: [],
  market_types: [],
  amount_min: null,
  amount_max: null,
};

// ============================================================================
// 1. Cas valides
// ============================================================================

describe("searchProfileUpdateSchema — cas valides", () => {
  it("valide un payload complet conforme", () => {
    const result = searchProfileUpdateSchema.safeParse(VALID_FULL);
    expect(result.success).toBe(true);
    if (result.success) {
      // lowercase appliqué
      expect(result.data.keywords.positive).toContain("btp");
      expect(result.data.keywords.positive).not.toContain("BTP");
      // dedup conservant l'ordre
      expect(result.data.market_types).toEqual(["travaux", "services"]);
    }
  });

  it("valide un payload minimal (arrays vides + montants null)", () => {
    const result = searchProfileUpdateSchema.safeParse(VALID_MINIMAL);
    expect(result.success).toBe(true);
  });

  it("dedup les keywords positive après lowercase", () => {
    const result = searchProfileUpdateSchema.safeParse({
      ...VALID_MINIMAL,
      keywords: { positive: ["BTP", "btp", "Btp", "renovation"], negative: [], exact: [] },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.keywords.positive).toEqual(["btp", "renovation"]);
    }
  });

  it("dedup les market_types en préservant l'ordre", () => {
    const result = searchProfileUpdateSchema.safeParse({
      ...VALID_MINIMAL,
      market_types: ["travaux", "services", "travaux", "fournitures"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.market_types).toEqual(["travaux", "services", "fournitures"]);
    }
  });

  it("accepte amount_min = amount_max (égalité passe le refine)", () => {
    const result = searchProfileUpdateSchema.safeParse({
      ...VALID_MINIMAL,
      amount_min: 100_000,
      amount_max: 100_000,
    });
    expect(result.success).toBe(true);
  });

  it("accepte amount_min seul (max null) — pas de refine déclenché", () => {
    const result = searchProfileUpdateSchema.safeParse({
      ...VALID_MINIMAL,
      amount_min: 50_000,
      amount_max: null,
    });
    expect(result.success).toBe(true);
  });

  it("trim les strings keywords avant lowercase + dedup", () => {
    const result = searchProfileUpdateSchema.safeParse({
      ...VALID_MINIMAL,
      keywords: {
        positive: ["  BTP  ", "btp", "rénovation"],
        negative: [],
        exact: [],
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // dedup ignore les variantes whitespace
      expect(result.data.keywords.positive).toContain("btp");
      // rénovation conserve l'accent (la normalisation se fait côté filter.ts
      // au matching, pas au stockage)
      expect(result.data.keywords.positive).toContain("rénovation");
    }
  });
});

// ============================================================================
// 2. Cas invalides
// ============================================================================

describe("searchProfileUpdateSchema — cas invalides", () => {
  it("rejette un array de keywords > 100 items", () => {
    const tooMany = Array.from({ length: 101 }, (_, i) => `kw${i}`);
    const result = searchProfileUpdateSchema.safeParse({
      ...VALID_MINIMAL,
      keywords: { positive: tooMany, negative: [], exact: [] },
    });
    expect(result.success).toBe(false);
  });

  it("rejette un keyword > 100 chars", () => {
    const result = searchProfileUpdateSchema.safeParse({
      ...VALID_MINIMAL,
      keywords: { positive: ["x".repeat(101)], negative: [], exact: [] },
    });
    expect(result.success).toBe(false);
  });

  it("rejette un CPV non-digit", () => {
    const result = searchProfileUpdateSchema.safeParse({
      ...VALID_MINIMAL,
      cpv_codes: ["45abc"],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const firstIssuePath = result.error.issues[0]?.path.join(".");
      expect(firstIssuePath?.startsWith("cpv_codes")).toBe(true);
    }
  });

  it("rejette un CPV avec wildcard *", () => {
    const result = searchProfileUpdateSchema.safeParse({
      ...VALID_MINIMAL,
      cpv_codes: ["45*"],
    });
    expect(result.success).toBe(false);
  });

  it("rejette un CPV de 1 digit", () => {
    const result = searchProfileUpdateSchema.safeParse({
      ...VALID_MINIMAL,
      cpv_codes: ["4"],
    });
    expect(result.success).toBe(false);
  });

  it("rejette un CPV de 9 digits", () => {
    const result = searchProfileUpdateSchema.safeParse({
      ...VALID_MINIMAL,
      cpv_codes: ["450000000"],
    });
    expect(result.success).toBe(false);
  });

  it("rejette une geo_zone non-conforme (texte)", () => {
    const result = searchProfileUpdateSchema.safeParse({
      ...VALID_MINIMAL,
      geo_zones: ["Paris"],
    });
    expect(result.success).toBe(false);
  });

  it("rejette une geo_zone Corse minuscule (2a)", () => {
    // 2a minuscule HS — on impose 2A/2B majuscule pour cohérence INSEE
    const result = searchProfileUpdateSchema.safeParse({
      ...VALID_MINIMAL,
      geo_zones: ["2a"],
    });
    expect(result.success).toBe(false);
  });

  it("accepte 2A et 2B Corse + 971-976 DROM", () => {
    const result = searchProfileUpdateSchema.safeParse({
      ...VALID_MINIMAL,
      geo_zones: ["2A", "2B", "971", "972", "973", "974", "976"],
    });
    expect(result.success).toBe(true);
  });

  it("rejette un market_type hors enum", () => {
    const result = searchProfileUpdateSchema.safeParse({
      ...VALID_MINIMAL,
      market_types: ["travaux", "freestyle"],
    });
    expect(result.success).toBe(false);
  });

  it("rejette un amount_min négatif", () => {
    const result = searchProfileUpdateSchema.safeParse({
      ...VALID_MINIMAL,
      amount_min: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejette amount_min > amount_max via refine", () => {
    const result = searchProfileUpdateSchema.safeParse({
      ...VALID_MINIMAL,
      amount_min: 500_000,
      amount_max: 100_000,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      // Le refine pose le path sur amount_min
      const refineIssue = result.error.issues.find((iss) => iss.path.includes("amount_min"));
      expect(refineIssue).toBeDefined();
    }
  });

  it("rejette un payload qui n'est pas un objet (string)", () => {
    const result = searchProfileUpdateSchema.safeParse("not an object");
    expect(result.success).toBe(false);
  });

  it("rejette un keyword vide après trim", () => {
    const result = searchProfileUpdateSchema.safeParse({
      ...VALID_MINIMAL,
      keywords: { positive: ["   "], negative: [], exact: [] },
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// 3. Garde-fou enum MARKET_TYPES exposé pour cohérence UI
// ============================================================================

describe("MARKET_TYPES export", () => {
  it("expose les 4 valeurs canoniques alignées Q4 Board 22/05", () => {
    expect(MARKET_TYPES).toEqual(["travaux", "services", "fournitures", "moe"]);
  });
});
