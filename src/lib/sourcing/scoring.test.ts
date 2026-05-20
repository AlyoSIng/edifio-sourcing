/**
 * Tests de `scoreTender` / `scoreTenderDetailed` — edifio Sourcing.
 *
 * Couvre :
 *  - Score de base (50) sans aucun matching
 *  - Chaque composant pris isolément (exact, positifs, CPV exact)
 *  - Cumul positifs (+10 par mot-clé)
 *  - Clamp à 100 quand la somme dépasse (1 exact + 3 positifs + CPV exact = 115)
 *  - Clamp à 0 — N/A en pratique car base=50 mais on garde un test défensif
 *  - Insensibilité à la casse (cohérent avec le filter)
 *  - CPV exact (pas préfixe) — un code AO `45211350` ne match pas `45` exact
 */

import { describe, expect, it } from "vitest";

import type { SearchProfile } from "@/db/schema/config";

import {
  SCORING_BASE,
  SCORING_CPV_EXACT_BONUS,
  SCORING_EXACT_BONUS,
  SCORING_POSITIVE_BONUS,
  scoreTender,
  scoreTenderDetailed,
} from "./scoring";
import type { NormalizedTender } from "./types";

function makeTender(overrides: Partial<NormalizedTender> = {}): NormalizedTender {
  return {
    externalRef: "25-XYZ-00001",
    platformCode: "boamp",
    title: "Rénovation thermique groupe scolaire Jules Ferry",
    buyer: "Mairie de Bordeaux",
    cpvCodes: ["45211350"],
    amount: 500000,
    deadline: new Date("2026-06-30T17:00:00+02:00"),
    questionsDeadline: null,
    visitDate: null,
    dceUrl: null,
    sourceUrl: null,
    rawData: {
      platform_code: "boamp",
      record: {},
      fetched_at: "2026-05-20T12:00:00.000Z",
    },
    ...overrides,
  };
}

function makeProfile(overrides: Partial<SearchProfile> = {}): SearchProfile {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    organizationId: "22222222-2222-2222-2222-222222222222",
    name: "Profil test",
    keywords: { positive: [], negative: [], exact: [] },
    cpvCodes: [],
    geoZones: [],
    marketTypes: [],
    amountMin: null,
    amountMax: null,
    active: true,
    cronTime: "06:30:00",
    cronDays: [1, 2, 3, 4, 5],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ============================================================================
// Base sans matching
// ============================================================================

describe("scoreTender — base", () => {
  it("retourne 50 (base) si aucun critère n'est défini sur le profil", () => {
    expect(scoreTender(makeTender(), makeProfile())).toBe(SCORING_BASE);
  });

  it("retourne 50 si les critères ne matchent rien", () => {
    const tender = makeTender({ title: "Marché de fournitures", cpvCodes: ["30000000"] });
    const profile = makeProfile({
      keywords: { positive: ["rénovation"], negative: [], exact: ["école primaire"] },
      cpvCodes: ["45211350"],
    });
    expect(scoreTender(tender, profile)).toBe(SCORING_BASE);
  });
});

// ============================================================================
// Composants individuels
// ============================================================================

describe("scoreTender — exact bonus", () => {
  it("ajoute +20 si une expression exacte est dans le title", () => {
    const tender = makeTender({ title: "Rénovation école primaire centre-bourg" });
    const profile = makeProfile({
      keywords: { positive: [], negative: [], exact: ["école primaire"] },
    });
    expect(scoreTender(tender, profile)).toBe(SCORING_BASE + SCORING_EXACT_BONUS);
  });

  it("plafonne à +20 même si plusieurs expressions exactes matchent (non cumulable)", () => {
    const tender = makeTender({ title: "Rénovation école primaire Jules Ferry" });
    const profile = makeProfile({
      keywords: {
        positive: [],
        negative: [],
        exact: ["école primaire", "Jules Ferry", "Rénovation"],
      },
    });
    expect(scoreTender(tender, profile)).toBe(SCORING_BASE + SCORING_EXACT_BONUS);
  });
});

describe("scoreTender — positifs cumulables", () => {
  it("ajoute +10 par mot-clé positif matché", () => {
    const tender = makeTender({ title: "Rénovation thermique école" });
    const profile = makeProfile({
      keywords: { positive: ["rénovation", "thermique", "école"], negative: [], exact: [] },
    });
    expect(scoreTender(tender, profile)).toBe(SCORING_BASE + 3 * SCORING_POSITIVE_BONUS);
  });

  it("ne compte pas les positifs non matchés", () => {
    const tender = makeTender({ title: "Rénovation simple" });
    const profile = makeProfile({
      keywords: { positive: ["rénovation", "thermique", "école"], negative: [], exact: [] },
    });
    expect(scoreTender(tender, profile)).toBe(SCORING_BASE + 1 * SCORING_POSITIVE_BONUS);
  });
});

describe("scoreTender — CPV exact", () => {
  it("ajoute +15 si un code AO est listé EXACTEMENT dans profile.cpvCodes", () => {
    const tender = makeTender({ cpvCodes: ["45211350"] });
    const profile = makeProfile({ cpvCodes: ["45211350"] });
    expect(scoreTender(tender, profile)).toBe(SCORING_BASE + SCORING_CPV_EXACT_BONUS);
  });

  it("n'ajoute PAS le bonus CPV si seul un préfixe matche (cas du filter, pas du scoring)", () => {
    const tender = makeTender({ cpvCodes: ["45211350"] });
    const profile = makeProfile({ cpvCodes: ["45"] }); // préfixe, pas exact
    expect(scoreTender(tender, profile)).toBe(SCORING_BASE);
  });
});

// ============================================================================
// Insensibilité à la casse
// ============================================================================

describe("scoreTender — case-insensitive", () => {
  it("matche les positifs en ignorant la casse", () => {
    const tender = makeTender({ title: "RÉNOVATION THERMIQUE" });
    const profile = makeProfile({
      keywords: { positive: ["rénovation"], negative: [], exact: [] },
    });
    expect(scoreTender(tender, profile)).toBe(SCORING_BASE + SCORING_POSITIVE_BONUS);
  });

  it("matche les exacts en ignorant la casse", () => {
    const tender = makeTender({ title: "rénovation école primaire" });
    const profile = makeProfile({
      keywords: { positive: [], negative: [], exact: ["ÉCOLE PRIMAIRE"] },
    });
    expect(scoreTender(tender, profile)).toBe(SCORING_BASE + SCORING_EXACT_BONUS);
  });
});

// ============================================================================
// Clamp & cumuls maximum
// ============================================================================

describe("scoreTender — clamp", () => {
  it("clampe à 100 quand la somme dépasse (1 exact + 3 positifs + CPV exact = 115)", () => {
    const tender = makeTender({
      title: "Rénovation thermique école primaire Jules Ferry",
      cpvCodes: ["45211350"],
    });
    const profile = makeProfile({
      keywords: {
        positive: ["rénovation", "thermique", "Jules Ferry"],
        negative: [],
        exact: ["école primaire"],
      },
      cpvCodes: ["45211350"],
    });
    const result = scoreTenderDetailed(tender, profile);
    expect(result.rawTotal).toBe(115);
    expect(result.total).toBe(100);
  });

  it("le total est toujours un entier dans [0, 100]", () => {
    const tender = makeTender();
    const profile = makeProfile();
    const total = scoreTender(tender, profile);
    expect(Number.isInteger(total)).toBe(true);
    expect(total).toBeGreaterThanOrEqual(0);
    expect(total).toBeLessThanOrEqual(100);
  });
});

// ============================================================================
// Breakdown détaillé
// ============================================================================

describe("scoreTenderDetailed — breakdown", () => {
  it("expose les composants individuels pour debug UI", () => {
    const tender = makeTender({
      title: "Rénovation thermique école primaire",
      cpvCodes: ["45211350"],
    });
    const profile = makeProfile({
      keywords: {
        positive: ["rénovation", "thermique"],
        negative: [],
        exact: ["école primaire"],
      },
      cpvCodes: ["45211350"],
    });
    const result = scoreTenderDetailed(tender, profile);
    expect(result).toEqual({
      base: 50,
      exactBonus: 20,
      positiveBonus: 20, // 2 positifs × 10
      cpvExactBonus: 15,
      rawTotal: 105,
      total: 100,
    });
  });
});
