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
    zip: null,
    city: null,
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
    ...overrides,
  };
}

function makeTender(
  overrides: Partial<Pick<Tender, "title" | "buyer" | "rawData">> = {},
): Pick<Tender, "title" | "buyer" | "rawData"> {
  return {
    title: "Construction d'un équipement public",
    buyer: "Mairie de Paris, 75001 Paris",
    rawData: null,
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

  it("géo exact → 100% (30), géo limitrophe → 50% (15)", () => {
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
  it("somme les 5 colonnes du breakdown", () => {
    expect(
      totalScore({ specialty: 15, geo: 30, history: 25, availability: 10, preference: 5 }),
    ).toBe(85);
  });
});
