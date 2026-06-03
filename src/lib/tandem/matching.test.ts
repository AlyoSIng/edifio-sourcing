/**
 * Tests unitaires — matcher V1 architecte ↔ AO.
 *
 * Couvre :
 *  - inferCategoriesFromTender : accents + casse OBLIGATOIRES (Board 22/05 (d))
 *  - extractDepartment : rawData BOAMP > code postal buyer > null
 *  - adjacentDepartment : symétrique 75↔92, faux 75↔13
 *  - scoreArchitect : breakdown exact / connexe / cap historique / dégressif
 *  - rankArchitects : tri desc, top N, profil de pondération
 *
 * Module pur — pas de mock BDD.
 */

import { describe, expect, it } from "vitest";

import type { Architect } from "@/db/schema/architects";
import type { Tender } from "@/db/schema/tenders";

import {
  NEIGHBORING_DEPARTMENTS,
  WEIGHTS_BY_PROFILE,
  adjacentDepartment,
  extractDepartment,
  inferCategoriesFromTender,
  rankArchitects,
  relatedSpecialty,
  scoreArchitect,
  totalScore,
} from "./matching";

/** Fabrique d'architecte minimal pour les tests — surcharge optionnelle. */
function makeArchitect(overrides: Partial<Architect> = {}): Architect {
  return {
    id: overrides.id ?? "00000000-0000-0000-0000-000000000001",
    organizationId: "00000000-0000-0000-0000-00000000000a",
    cabinet: "Cabinet Test",
    contactName: null,
    email: "contact@test.fr",
    phone: null,
    website: null,
    siren: null,
    siret: null,
    zip: null,
    city: null,
    addressLine1: null,
    addressLine2: null,
    signatureCity: null,
    legalRepresentativeName: null,
    legalRepresentativeRole: null,
    legalForm: null,
    headcount: null,
    companySize: null,
    companyCreatedAt: null,
    odooExternalId: null,
    specialtyCodes: [],
    geoZones: [],
    tutoiement: false,
    preferred: false,
    active: true,
    solicitable: true,
    pastCollabsCount: 0,
    notes: null,
    createdAt: new Date("2026-05-01T00:00:00Z"),
    updatedAt: new Date("2026-05-01T00:00:00Z"),
    rgpdOpposition: false,
    rgpdOppositionDate: null,
    budgetMin: null,
    budgetMax: null,
    concoursOnly: false,
    annualRevenue: null,
    ...overrides,
  };
}

function makeTender(
  overrides: Partial<Pick<Tender, "title" | "buyer" | "rawData" | "amount">> = {},
): Pick<Tender, "title" | "buyer" | "rawData" | "amount"> {
  return {
    title: "Construction d'un équipement public",
    buyer: "Mairie de Paris, 75001 Paris",
    rawData: null,
    amount: null,
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/*  Normalisation accents+casse — la règle Board 22/05 (d)                    */
/* -------------------------------------------------------------------------- */

describe("inferCategoriesFromTender — normalisation des 2 côtés", () => {
  it("matche 'Bâtiment scolaire' → enseignement (accent + casse)", () => {
    const codes = inferCategoriesFromTender({ title: "Bâtiment scolaire — extension d'une école" });
    expect(codes.has("enseignement")).toBe(true);
  });

  it("matche 'ÉCOLE' majuscule + accent → enseignement", () => {
    const codes = inferCategoriesFromTender({ title: "Rénovation de l'ÉCOLE primaire" });
    expect(codes.has("enseignement")).toBe(true);
  });

  it("matche 'Réhabilitation' avec accent → rehabilitation", () => {
    const codes = inferCategoriesFromTender({ title: "Réhabilitation d'un EHPAD" });
    expect(codes.has("rehabilitation")).toBe(true);
    expect(codes.has("sante")).toBe(true);
  });

  it("multi-codes : 'extension d'un gymnase' → sport + rehabilitation", () => {
    const codes = inferCategoriesFromTender({ title: "Extension d'un gymnase municipal" });
    expect(codes.has("sport")).toBe(true);
    expect(codes.has("rehabilitation")).toBe(true);
  });

  it("titre sans mot-clé connu → set vide", () => {
    const codes = inferCategoriesFromTender({ title: "Prestation diverse non catégorisée" });
    expect(codes.size).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/*  Extraction département                                                     */
/* -------------------------------------------------------------------------- */

describe("extractDepartment", () => {
  it("priorise rawData BOAMP", () => {
    const dept = extractDepartment({
      buyer: "ACHETEUR INCONNU",
      rawData: { record: { departement: "92" } } as never,
    });
    expect(dept).toBe("92");
  });

  it("tombe sur le code postal du buyer si rawData absent", () => {
    const dept = extractDepartment({
      buyer: "Mairie de Paris, 75001 Paris",
      rawData: null,
    });
    expect(dept).toBe("75");
  });

  it("retourne null si aucune source", () => {
    const dept = extractDepartment({
      buyer: "Acheteur sans adresse",
      rawData: null,
    });
    expect(dept).toBeNull();
  });

  it("gère la Corse 2A (cp 20100)", () => {
    const dept = extractDepartment({
      buyer: "Mairie de Ajaccio, 20100 Ajaccio",
      rawData: null,
    });
    // 20100 → sub 100 < 200 → 2A
    expect(dept).toBe("2A");
  });
});

describe("adjacentDepartment", () => {
  it("symétrique 75 ↔ 92", () => {
    expect(adjacentDepartment("75", "92")).toBe(true);
    expect(adjacentDepartment("92", "75")).toBe(true);
  });

  it("faux pour départements non limitrophes 75 / 13", () => {
    expect(adjacentDepartment("75", "13")).toBe(false);
  });

  it("utilise NEIGHBORING_DEPARTMENTS complet — 69 ↔ 42 (Rhône / Loire)", () => {
    expect(adjacentDepartment("69", "42")).toBe(true);
    expect(adjacentDepartment("42", "69")).toBe(true);
  });

  it("34 ↔ 30 (Hérault / Gard)", () => {
    expect(adjacentDepartment("34", "30")).toBe(true);
  });

  it("01 ↔ 74 (Ain / Haute-Savoie)", () => {
    expect(adjacentDepartment("01", "74")).toBe(true);
  });

  it("NEIGHBORING_DEPARTMENTS — DOM (971) sans voisin (tableau vide)", () => {
    expect(NEIGHBORING_DEPARTMENTS["971"]).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/*  Scoring per-architect                                                      */
/* -------------------------------------------------------------------------- */

describe("scoreArchitect — profil sparse_data", () => {
  const weights = WEIGHTS_BY_PROFILE.sparse_data;
  const tender = makeTender({
    title: "Construction d'une école primaire",
    buyer: "Mairie, 75001 Paris",
  });
  const inferred = inferCategoriesFromTender(tender);
  const dept = extractDepartment(tender);

  it("spécialité exacte → 100% du poids specialty (15)", () => {
    const archi = makeArchitect({ specialtyCodes: ["enseignement"] });
    const b = scoreArchitect(archi, tender, 0, weights, inferred, dept);
    expect(b.specialty).toBe(15);
  });

  it("spécialité connexe (equipement_public ↔ enseignement) → 50% (7)", () => {
    const archi = makeArchitect({ specialtyCodes: ["equipement_public"] });
    const b = scoreArchitect(archi, tender, 0, weights, inferred, dept);
    // SPECIALTY_RELATED enseignement → equipement_public ⇒ math 15/2 = 7
    expect(b.specialty).toBe(7);
  });

  it("géo exact → min(35, geo_weight=30) = 30, limitrophe → min(15, 30) = 15, aucun → 0", () => {
    const exact = makeArchitect({ geoZones: ["75"] });
    const adjacent = makeArchitect({ geoZones: ["92"] });
    const noMatch = makeArchitect({ geoZones: ["13"] });
    expect(scoreArchitect(exact, tender, 0, weights, inferred, dept).geo).toBe(30);
    expect(scoreArchitect(adjacent, tender, 0, weights, inferred, dept).geo).toBe(15);
    expect(scoreArchitect(noMatch, tender, 0, weights, inferred, dept).geo).toBe(0);
  });

  it("historique capé au poids history (35) : 7 collabs = max", () => {
    const archi = makeArchitect({ pastCollabsCount: 7 });
    const b = scoreArchitect(archi, tender, 0, weights, inferred, dept);
    expect(b.history).toBe(35);
  });

  it("disponibilité dégressive : 0 sollic → 15, 5 sollic → 5, 10+ sollic → 0", () => {
    const archi = makeArchitect();
    expect(scoreArchitect(archi, tender, 0, weights, inferred, dept).availability).toBe(15);
    // 5 sollic → max(0, 15 - 5*2) = 5
    expect(scoreArchitect(archi, tender, 5, weights, inferred, dept).availability).toBe(5);
    // 10 sollic → max(0, 15 - 10*2) = max(0, -5) = 0
    expect(scoreArchitect(archi, tender, 10, weights, inferred, dept).availability).toBe(0);
  });

  it("preference : flag preferred → 100% (5), sinon 0", () => {
    expect(
      scoreArchitect(makeArchitect({ preferred: true }), tender, 0, weights, inferred, dept)
        .preference,
    ).toBe(5);
    expect(scoreArchitect(makeArchitect(), tender, 0, weights, inferred, dept).preference).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/*  Bonus géo +35/+15 — absolus capés au poids                                */
/* -------------------------------------------------------------------------- */

describe("scoreArchitect — bonus géo absolu (NEIGHBORING_DEPARTMENTS complet)", () => {
  // AO en Seine-Maritime (76) — buyer contient cp 76000
  const tenderNormandie = makeTender({
    title: "Construction d'un équipement public",
    buyer: "Mairie de Rouen, 76000 Rouen",
  });
  const inferred76 = inferCategoriesFromTender(tenderNormandie);
  const dept76 = extractDepartment(tenderNormandie); // "76"

  it("match exact département → geo = min(35, poids) = 30 (sparse_data)", () => {
    const archi = makeArchitect({ geoZones: ["76"] });
    const b = scoreArchitect(
      archi,
      tenderNormandie,
      0,
      WEIGHTS_BY_PROFILE.sparse_data,
      inferred76,
      dept76,
    );
    expect(b.geo).toBe(30); // min(35, 30) = 30
  });

  it("département limitrophe → geo = min(15, poids) = 15 (sparse_data)", () => {
    // 27 (Eure) est limitrophe de 76 dans NEIGHBORING_DEPARTMENTS
    const archi = makeArchitect({ geoZones: ["27"] });
    const b = scoreArchitect(
      archi,
      tenderNormandie,
      0,
      WEIGHTS_BY_PROFILE.sparse_data,
      inferred76,
      dept76,
    );
    expect(b.geo).toBe(15); // min(15, 30) = 15
  });

  it("aucune zone correspondante → geo = 0", () => {
    const archi = makeArchitect({ geoZones: ["13"] });
    const b = scoreArchitect(
      archi,
      tenderNormandie,
      0,
      WEIGHTS_BY_PROFILE.sparse_data,
      inferred76,
      dept76,
    );
    expect(b.geo).toBe(0);
  });

  it("profil mature : match exact → min(35, geo_weight=20) = 20", () => {
    const archi = makeArchitect({ geoZones: ["76"] });
    const b = scoreArchitect(
      archi,
      tenderNormandie,
      0,
      WEIGHTS_BY_PROFILE.mature,
      inferred76,
      dept76,
    );
    expect(b.geo).toBe(20); // min(35, 20) = 20
  });

  it("profil mature : limitrophe → min(15, geo_weight=20) = 15", () => {
    const archi = makeArchitect({ geoZones: ["27"] });
    const b = scoreArchitect(
      archi,
      tenderNormandie,
      0,
      WEIGHTS_BY_PROFILE.mature,
      inferred76,
      dept76,
    );
    expect(b.geo).toBe(15); // min(15, 20) = 15
  });

  it("geoZones vide → geo = 0 même si tenderDept connu", () => {
    const archi = makeArchitect({ geoZones: [] });
    const b = scoreArchitect(
      archi,
      tenderNormandie,
      0,
      WEIGHTS_BY_PROFILE.sparse_data,
      inferred76,
      dept76,
    );
    expect(b.geo).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/*  Profils sparse_data vs mature                                              */
/* -------------------------------------------------------------------------- */

describe("WEIGHTS_BY_PROFILE", () => {
  it("sparse_data : total 100, géo prioritaire", () => {
    const w = WEIGHTS_BY_PROFILE.sparse_data;
    expect(w.geo + w.specialty + w.history + w.availability + w.preference).toBe(100);
    expect(w.geo).toBeGreaterThan(w.specialty);
  });

  it("mature : total 100, spécialité prioritaire", () => {
    const w = WEIGHTS_BY_PROFILE.mature;
    expect(w.geo + w.specialty + w.history + w.availability + w.preference).toBe(100);
    expect(w.specialty).toBeGreaterThan(w.geo);
  });
});

/* -------------------------------------------------------------------------- */
/*  Ranking — top N                                                           */
/* -------------------------------------------------------------------------- */

describe("rankArchitects", () => {
  it("trie par score décroissant et retourne top N", () => {
    const tender = makeTender({
      title: "Construction d'une école",
      buyer: "Mairie, 75001 Paris",
    });
    const archis: Architect[] = [
      makeArchitect({
        id: "00000000-0000-0000-0000-00000000aaaa",
        specialtyCodes: ["enseignement"],
        geoZones: ["75"],
        pastCollabsCount: 5,
        preferred: true,
      }),
      makeArchitect({
        id: "00000000-0000-0000-0000-00000000bbbb",
        specialtyCodes: ["sante"],
        geoZones: ["13"],
        pastCollabsCount: 0,
      }),
      makeArchitect({
        id: "00000000-0000-0000-0000-00000000cccc",
        specialtyCodes: ["enseignement"],
        geoZones: ["92"],
        pastCollabsCount: 2,
      }),
    ];
    const top = rankArchitects(
      tender,
      {
        architects: archis,
        recentSolicitationsByArchitect: new Map(),
      },
      { topN: 2, profile: "sparse_data" },
    );
    expect(top.length).toBe(2);
    const first = top[0]!;
    const second = top[1]!;
    expect(first.score).toBeGreaterThanOrEqual(second.score);
    // L'archi aaaa est le mieux placé (spec exact + geo exact + 5 collabs + preferred)
    expect(first.architectId).toBe("00000000-0000-0000-0000-00000000aaaa");
  });

  it("retourne tableau vide si aucun architecte", () => {
    const top = rankArchitects(
      makeTender(),
      { architects: [], recentSolicitationsByArchitect: new Map() },
      { topN: 3 },
    );
    expect(top).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/*  relatedSpecialty + totalScore                                              */
/* -------------------------------------------------------------------------- */

describe("relatedSpecialty", () => {
  it("logements_collectifs ↔ habitat_individuel (proche)", () => {
    expect(relatedSpecialty("logements_collectifs", "habitat_individuel")).toBe(true);
  });
  it("sport ↔ sante (pas relié direct)", () => {
    expect(relatedSpecialty("sport", "sante")).toBe(false);
  });
});

describe("totalScore", () => {
  it("somme les 6 colonnes du breakdown (dont staffSize)", () => {
    expect(
      totalScore({
        specialty: 15,
        geo: 30,
        history: 25,
        availability: 10,
        preference: 5,
        staffSize: 0,
      }),
    ).toBe(85);
    expect(
      totalScore({
        specialty: 15,
        geo: 30,
        history: 25,
        availability: 10,
        preference: 5,
        staffSize: 8,
      }),
    ).toBe(93);
  });
});

/* -------------------------------------------------------------------------- */
/*  Bonus staffSize                                                            */
/* -------------------------------------------------------------------------- */

describe("scoreArchitect — bonus staffSize", () => {
  const baseTender = {
    title: "Réhabilitation école",
    buyer: "Mairie 75001 Paris",
    rawData: null,
  };
  const baseWeights = WEIGHTS_BY_PROFILE.sparse_data;
  const base: Architect = makeArchitect({
    specialtyCodes: [],
    geoZones: [],
    preferred: false,
    pastCollabsCount: 0,
    headcount: null,
  });

  it("headcount null → staffSize 0", () => {
    const b = scoreArchitect(
      { ...base, headcount: null },
      baseTender,
      0,
      baseWeights,
      new Set(),
      null,
    );
    expect(b.staffSize).toBe(0);
  });
  it("headcount 2 → staffSize 0", () => {
    const b = scoreArchitect(
      { ...base, headcount: 2 },
      baseTender,
      0,
      baseWeights,
      new Set(),
      null,
    );
    expect(b.staffSize).toBe(0);
  });
  it("headcount 3 → staffSize 3", () => {
    const b = scoreArchitect(
      { ...base, headcount: 3 },
      baseTender,
      0,
      baseWeights,
      new Set(),
      null,
    );
    expect(b.staffSize).toBe(3);
  });
  it("headcount 9 → staffSize 3", () => {
    const b = scoreArchitect(
      { ...base, headcount: 9 },
      baseTender,
      0,
      baseWeights,
      new Set(),
      null,
    );
    expect(b.staffSize).toBe(3);
  });
  it("headcount 10 → staffSize 8", () => {
    const b = scoreArchitect(
      { ...base, headcount: 10 },
      baseTender,
      0,
      baseWeights,
      new Set(),
      null,
    );
    expect(b.staffSize).toBe(8);
  });
  it("headcount 50 → staffSize 8", () => {
    const b = scoreArchitect(
      { ...base, headcount: 50 },
      baseTender,
      0,
      baseWeights,
      new Set(),
      null,
    );
    expect(b.staffSize).toBe(8);
  });
});

/* -------------------------------------------------------------------------- */
/*  Composition shortlist — bigFirms + midFirms                               */
/* -------------------------------------------------------------------------- */

describe("rankArchitects — composition headcount (bigFirms + midFirms)", () => {
  const tender = makeTender({
    title: "Réhabilitation école",
    buyer: "Mairie 75001 Paris",
  });

  it("3 premiers résultats viennent des bigFirms (>=10) quand ils ont de bons scores", () => {
    // 3 big firms (headcount >= 10) + 3 mid firms (3-9) + 1 small (< 3)
    const archis: Architect[] = [
      makeArchitect({
        id: "00000000-0000-0000-0000-000000000b01",
        headcount: 15,
        geoZones: ["75"],
        specialtyCodes: ["rehabilitation"],
      }),
      makeArchitect({
        id: "00000000-0000-0000-0000-000000000b02",
        headcount: 20,
        geoZones: ["75"],
        specialtyCodes: ["rehabilitation"],
      }),
      makeArchitect({
        id: "00000000-0000-0000-0000-000000000b03",
        headcount: 12,
        geoZones: ["75"],
        specialtyCodes: ["rehabilitation"],
      }),
      makeArchitect({
        id: "00000000-0000-0000-0000-000000000m01",
        headcount: 5,
        geoZones: ["75"],
        specialtyCodes: ["rehabilitation"],
      }),
      makeArchitect({
        id: "00000000-0000-0000-0000-000000000m02",
        headcount: 7,
        geoZones: ["75"],
        specialtyCodes: ["rehabilitation"],
      }),
      makeArchitect({
        id: "00000000-0000-0000-0000-000000000m03",
        headcount: 4,
        geoZones: ["75"],
        specialtyCodes: ["rehabilitation"],
      }),
      makeArchitect({
        id: "00000000-0000-0000-0000-000000000s01",
        headcount: 1,
        geoZones: ["75"],
        specialtyCodes: ["rehabilitation"],
      }),
    ];
    const top = rankArchitects(
      tender,
      { architects: archis, recentSolicitationsByArchitect: new Map() },
      { topN: 6, profile: "sparse_data" },
    );
    expect(top.length).toBe(6);
    // Les 3 premiers doivent être des bigFirms
    const bigIds = new Set([
      "00000000-0000-0000-0000-000000000b01",
      "00000000-0000-0000-0000-000000000b02",
      "00000000-0000-0000-0000-000000000b03",
    ]);
    expect(bigIds.has(top[0]!.architectId)).toBe(true);
    expect(bigIds.has(top[1]!.architectId)).toBe(true);
    expect(bigIds.has(top[2]!.architectId)).toBe(true);
    // Les suivants viennent des midFirms (ou fallback)
    const midIds = new Set([
      "00000000-0000-0000-0000-000000000m01",
      "00000000-0000-0000-0000-000000000m02",
      "00000000-0000-0000-0000-000000000m03",
    ]);
    expect(midIds.has(top[3]!.architectId)).toBe(true);
  });

  it("complete avec le fallback si pas assez de bigFirms", () => {
    // Seulement 1 big firm — les places restantes doivent être comblées
    const archis: Architect[] = [
      makeArchitect({
        id: "00000000-0000-0000-0000-000000000c01",
        headcount: 10,
        geoZones: ["75"],
      }),
      makeArchitect({
        id: "00000000-0000-0000-0000-000000000c02",
        headcount: 2,
        geoZones: ["75"],
      }),
      makeArchitect({
        id: "00000000-0000-0000-0000-000000000c03",
        headcount: 1,
        geoZones: ["75"],
      }),
    ];
    const top = rankArchitects(
      tender,
      { architects: archis, recentSolicitationsByArchitect: new Map() },
      { topN: 3, profile: "sparse_data" },
    );
    // Tous les architectes doivent figurer dans la shortlist (fallback)
    expect(top.length).toBe(3);
    const ids = top.map((s) => s.architectId);
    expect(ids).toContain("00000000-0000-0000-0000-000000000c01");
    expect(ids).toContain("00000000-0000-0000-0000-000000000c02");
    expect(ids).toContain("00000000-0000-0000-0000-000000000c03");
  });
});

/* -------------------------------------------------------------------------- */
/*  Filtre CA éligibilité                                                      */
/* -------------------------------------------------------------------------- */

describe("rankArchitects — filtre CA", () => {
  const recentMap = new Map<string, number>();

  it("architecte avec annualRevenue=100_000 et tender.amount='300000' → exclu (100k < 40% de 300k)", () => {
    const archi = makeArchitect({
      id: "00000000-0000-0000-0000-000000cafe01",
      annualRevenue: 100_000,
    });
    const tender = makeTender({ amount: "300000" });
    const top = rankArchitects(
      tender,
      { architects: [archi], recentSolicitationsByArchitect: recentMap },
      { topN: 3 },
    );
    // 100_000 < 300_000 * 0.4 = 120_000 → exclu
    expect(top.length).toBe(0);
  });

  it("architecte avec annualRevenue=150_000 et tender.amount='300000' → inclus (150k >= 120k)", () => {
    const archi = makeArchitect({
      id: "00000000-0000-0000-0000-000000cafe02",
      annualRevenue: 150_000,
    });
    const tender = makeTender({ amount: "300000" });
    const top = rankArchitects(
      tender,
      { architects: [archi], recentSolicitationsByArchitect: recentMap },
      { topN: 3 },
    );
    // 150_000 >= 300_000 * 0.4 = 120_000 → inclus
    expect(top.length).toBe(1);
    expect(top[0]!.architectId).toBe("00000000-0000-0000-0000-000000cafe02");
  });

  it("architecte avec annualRevenue=null et tender.amount='300000' → inclus (inconnu → bénéfice du doute)", () => {
    const archi = makeArchitect({
      id: "00000000-0000-0000-0000-000000cafe03",
      annualRevenue: null,
    });
    const tender = makeTender({ amount: "300000" });
    const top = rankArchitects(
      tender,
      { architects: [archi], recentSolicitationsByArchitect: recentMap },
      { topN: 3 },
    );
    expect(top.length).toBe(1);
    expect(top[0]!.architectId).toBe("00000000-0000-0000-0000-000000cafe03");
  });

  it("architecte avec annualRevenue=50_000 et tender.amount=null → inclus (montant inconnu → bénéfice du doute)", () => {
    const archi = makeArchitect({
      id: "00000000-0000-0000-0000-000000cafe04",
      annualRevenue: 50_000,
    });
    const tender = makeTender({ amount: null });
    const top = rankArchitects(
      tender,
      { architects: [archi], recentSolicitationsByArchitect: recentMap },
      { topN: 3 },
    );
    expect(top.length).toBe(1);
    expect(top[0]!.architectId).toBe("00000000-0000-0000-0000-000000cafe04");
  });
});
