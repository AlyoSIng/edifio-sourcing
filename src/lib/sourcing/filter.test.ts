/**
 * Tests de `matchesProfile` — edifio Sourcing.
 *
 * Couvre les 5 raisons de rejet documentées par `MatchRejectReason` + le cas
 * `matched=true` avec mix de critères présents.
 *
 * Stratégie : on construit un `NormalizedTender` et un `SearchProfile` minimaux
 * via des helpers de fabrication, puis on fait varier un seul critère à la
 * fois pour isoler chaque branche de la fonction (table-driven tests).
 */

import { describe, expect, it } from "vitest";

import type { SearchProfile } from "@/db/schema/config";

import { matchesProfile } from "./filter";
import type { NormalizedTender } from "./types";

// ============================================================================
// Helpers de fabrication (factories minimales)
// ============================================================================

/**
 * Construit un `NormalizedTender` valide pour les tests. Tous les champs sont
 * surcharchables via `overrides`.
 */
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
    dceUrl: "https://www.boamp.fr/dce/abc",
    sourceUrl: "https://www.boamp.fr/avis/detail/25-XYZ-00001",
    rawData: {
      platform_code: "boamp",
      record: { idweb: "25-XYZ-00001" },
      fetched_at: "2026-05-20T12:00:00.000Z",
    },
    ...overrides,
  };
}

/**
 * Construit un `SearchProfile` valide pour les tests. Le `id`, `organizationId`
 * et timestamps sont mockés (le filter ne les lit pas).
 */
function makeProfile(overrides: Partial<SearchProfile> = {}): SearchProfile {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    organizationId: "22222222-2222-2222-2222-222222222222",
    name: "Profil test rénovation BTP",
    keywords: {
      positive: ["rénovation"],
      negative: [],
      exact: [],
    },
    cpvCodes: [],
    geoZones: [],
    marketTypes: [],
    amountMin: null,
    amountMax: null,
    active: true,
    cronTime: "06:30:00",
    cronDays: [1, 2, 3, 4, 5],
    createdAt: new Date("2026-05-01T00:00:00Z"),
    updatedAt: new Date("2026-05-01T00:00:00Z"),
    ...overrides,
  };
}

// ============================================================================
// 1. Mots-clés positifs
// ============================================================================

describe("matchesProfile — positifs", () => {
  it("matche si au moins un mot-clé positif est dans le title (case-insensitive)", () => {
    const tender = makeTender({ title: "Rénovation thermique école" });
    const profile = makeProfile({
      keywords: { positive: ["RÉNOVATION", "construction"], negative: [], exact: [] },
    });
    expect(matchesProfile(tender, profile)).toEqual({
      matched: true,
      reason: "all_criteria_pass",
    });
  });

  it("rejette no_positive_keyword si aucun positif ne matche", () => {
    const tender = makeTender({ title: "Marché de fournitures de bureau" });
    const profile = makeProfile({
      keywords: { positive: ["rénovation", "construction"], negative: [], exact: [] },
    });
    expect(matchesProfile(tender, profile)).toEqual({
      matched: false,
      reason: "no_positive_keyword",
    });
  });

  it("laisse passer si la liste de positifs est vide (pas de filtre)", () => {
    const tender = makeTender({ title: "Marché test sans aucun mot connu" });
    const profile = makeProfile({
      keywords: { positive: [], negative: [], exact: [] },
    });
    expect(matchesProfile(tender, profile)).toEqual({
      matched: true,
      reason: "all_criteria_pass",
    });
  });

  // Normalisation accents + casse — cf. DECISIONS.md 2026-05-22 (d)
  it("matche un positif sans accent contre un titre avec accents (kw 'batiment' / title 'bâtiment')", () => {
    const tender = makeTender({ title: "Travaux de bâtiment" });
    const profile = makeProfile({
      keywords: { positive: ["batiment"], negative: [], exact: [] },
    });
    expect(matchesProfile(tender, profile).matched).toBe(true);
  });

  it("matche un positif avec accent contre un titre sans accent (kw 'école' / title 'ECOLE PRIMAIRE')", () => {
    const tender = makeTender({ title: "ECOLE PRIMAIRE" });
    const profile = makeProfile({
      keywords: { positive: ["école"], negative: [], exact: [] },
    });
    expect(matchesProfile(tender, profile).matched).toBe(true);
  });

  it("matche en ignorant la casse pure (kw 'BTP' / title 'travaux btp')", () => {
    const tender = makeTender({ title: "travaux btp" });
    const profile = makeProfile({
      keywords: { positive: ["BTP"], negative: [], exact: [] },
    });
    expect(matchesProfile(tender, profile).matched).toBe(true);
  });
});

// ============================================================================
// 2. Mots-clés négatifs
// ============================================================================

describe("matchesProfile — négatifs", () => {
  it("rejette negative_keyword:<mot> si un négatif matche, raison enrichie", () => {
    const tender = makeTender({ title: "Rénovation toiture amiante" });
    const profile = makeProfile({
      keywords: { positive: ["rénovation"], negative: ["amiante"], exact: [] },
    });
    expect(matchesProfile(tender, profile)).toEqual({
      matched: false,
      reason: "negative_keyword:amiante",
    });
  });

  it("ignore les négatifs absents du title", () => {
    const tender = makeTender({ title: "Rénovation école Jules Ferry" });
    const profile = makeProfile({
      keywords: { positive: ["rénovation"], negative: ["amiante", "désamiantage"], exact: [] },
    });
    expect(matchesProfile(tender, profile).matched).toBe(true);
  });

  // Normalisation accents + casse — la raison de rejet remonte le keyword ORIGINAL
  it("rejette un négatif avec accents matchant un titre majuscule (kw 'démolition' / title 'DEMOLITION') — raison = kw original", () => {
    const tender = makeTender({ title: "Marché de DEMOLITION" });
    const profile = makeProfile({
      keywords: { positive: ["rénovation"], negative: ["démolition"], exact: [] },
    });
    // Le positif doit matcher d'abord pour ne pas court-circuiter sur "no_positive_keyword".
    // Ici le titre ne contient pas "rénovation" → le test est ajusté pour isoler le négatif.
    const tender2 = makeTender({ title: "Rénovation et DEMOLITION partielle" });
    expect(matchesProfile(tender2, profile)).toEqual({
      matched: false,
      reason: "negative_keyword:démolition",
    });
    // tender (sans positif) rejeté sur no_positive_keyword en premier
    expect(matchesProfile(tender, profile).reason).toBe("no_positive_keyword");
  });
});

// ============================================================================
// 3. CPV
// ============================================================================

describe("matchesProfile — CPV", () => {
  it("matche si un code AO commence par un préfixe profile (famille CPV)", () => {
    const tender = makeTender({ cpvCodes: ["45211350"] });
    const profile = makeProfile({ cpvCodes: ["45"] });
    expect(matchesProfile(tender, profile).matched).toBe(true);
  });

  it("matche si un code AO est exactement listé en profile", () => {
    const tender = makeTender({ cpvCodes: ["45211350"] });
    const profile = makeProfile({ cpvCodes: ["45211350"] });
    expect(matchesProfile(tender, profile).matched).toBe(true);
  });

  it("rejette cpv_mismatch si aucun code AO ne matche aucun préfixe", () => {
    const tender = makeTender({ cpvCodes: ["30200000"] });
    const profile = makeProfile({ cpvCodes: ["45", "71"] });
    expect(matchesProfile(tender, profile)).toEqual({
      matched: false,
      reason: "cpv_mismatch",
    });
  });

  it("laisse passer si cpvCodes profile est vide (pas de filtre)", () => {
    const tender = makeTender({ cpvCodes: ["99999999"] });
    const profile = makeProfile({ cpvCodes: [] });
    expect(matchesProfile(tender, profile).matched).toBe(true);
  });
});

// ============================================================================
// 4. Montant
// ============================================================================

describe("matchesProfile — montant", () => {
  it("rejette amount_below_min si tender.amount < amountMin profile", () => {
    const tender = makeTender({ amount: 50000 });
    const profile = makeProfile({ amountMin: "100000" });
    expect(matchesProfile(tender, profile)).toEqual({
      matched: false,
      reason: "amount_below_min",
    });
  });

  it("rejette amount_above_max si tender.amount > amountMax profile", () => {
    const tender = makeTender({ amount: 2000000 });
    const profile = makeProfile({ amountMax: "1000000" });
    expect(matchesProfile(tender, profile)).toEqual({
      matched: false,
      reason: "amount_above_max",
    });
  });

  it("matche si tender.amount dans [min, max]", () => {
    const tender = makeTender({ amount: 500000 });
    const profile = makeProfile({ amountMin: "100000", amountMax: "1000000" });
    expect(matchesProfile(tender, profile).matched).toBe(true);
  });

  it("laisse passer un tender sans montant connu (amount=null) même avec bornes posées", () => {
    const tender = makeTender({ amount: null });
    const profile = makeProfile({ amountMin: "100000", amountMax: "1000000" });
    expect(matchesProfile(tender, profile).matched).toBe(true);
  });
});

// ============================================================================
// 5. Combinaison — court-circuit dans l'ordre attendu
// ============================================================================

describe("matchesProfile — combinaison", () => {
  it("évalue positifs avant négatifs avant CPV avant montant", () => {
    // Un AO qui violerait CPV ET montant ET négatif mais déjà rejeté par positifs
    // doit retourner no_positive_keyword (le premier critère qui échoue).
    const tender = makeTender({
      title: "Marché de bureau",
      cpvCodes: ["30000000"],
      amount: 9999999,
    });
    const profile = makeProfile({
      keywords: { positive: ["rénovation"], negative: ["bureau"], exact: [] },
      cpvCodes: ["45"],
      amountMax: "1000000",
    });
    expect(matchesProfile(tender, profile).reason).toBe("no_positive_keyword");
  });
});
