/**
 * Tests unitaires — génération de rationale (fallback + hook IA).
 */

import { describe, expect, it } from "vitest";

import type { Architect } from "@/db/schema/architects";

import { fallbackRationale, generateRationaleWithAi } from "./ai-rationale";

function makeArchitect(overrides: Partial<Architect> = {}): Architect {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    organizationId: "00000000-0000-0000-0000-00000000000a",
    cabinet: "Atelier Dupont",
    contactName: null,
    email: "contact@dupont.fr",
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
    createdAt: new Date(),
    updatedAt: new Date(),
    rgpdOpposition: false,
    rgpdOppositionDate: null,
    budgetMin: null,
    budgetMax: null,
    concoursOnly: false,
    annualRevenue: null,
    revenueN1: null,
    revenueN2: null,
    revenueN3: null,
    ...overrides,
  };
}

describe("fallbackRationale", () => {
  it("score 0 → message dédié", () => {
    const r = fallbackRationale(makeArchitect(), { title: "x" }, 0, {
      specialty: 0,
      geo: 0,
      history: 0,
      availability: 0,
      preference: 0,
      staffSize: 0,
    });
    expect(r).toContain("aucun critère");
  });

  it("score positif : mentionne les critères matchés", () => {
    const r = fallbackRationale(
      makeArchitect({ pastCollabsCount: 3, preferred: true }),
      { title: "Construction école" },
      80,
      { specialty: 15, geo: 30, history: 15, availability: 15, preference: 5, staffSize: 0 },
    );
    expect(r).toContain("Atelier Dupont");
    expect(r).toContain("80/100");
    expect(r).toContain("spécialité directement");
    expect(r).toContain("département cible");
    expect(r).toContain("3 collaborations");
    expect(r).toContain("préféré");
  });

  it("cap à 220 chars", () => {
    const r = fallbackRationale(makeArchitect({ cabinet: "x".repeat(300) }), { title: "y" }, 50, {
      specialty: 15,
      geo: 30,
      history: 0,
      availability: 5,
      preference: 0,
      staffSize: 0,
    });
    expect(r.length).toBeLessThanOrEqual(220);
  });
});

describe("generateRationaleWithAi", () => {
  it("utilise l'IA si fournie + non vide", async () => {
    const r = await generateRationaleWithAi(
      makeArchitect(),
      { title: "x", buyer: "y" },
      { specialty: 0, geo: 0, history: 0, availability: 0, preference: 0, staffSize: 0 },
      0,
      {
        generate: async () => "Très bon match grâce à ses 3 dernières collaborations.",
      },
    );
    expect(r).toContain("Très bon match");
  });

  it("fallback si l'IA throw", async () => {
    const r = await generateRationaleWithAi(
      makeArchitect(),
      { title: "x", buyer: "y" },
      { specialty: 0, geo: 0, history: 0, availability: 0, preference: 0, staffSize: 0 },
      0,
      {
        generate: async () => {
          throw new Error("API down");
        },
      },
    );
    expect(r).toContain("aucun critère");
  });

  it("fallback si l'IA retourne null", async () => {
    const r = await generateRationaleWithAi(
      makeArchitect(),
      { title: "x", buyer: "y" },
      { specialty: 0, geo: 0, history: 0, availability: 0, preference: 0, staffSize: 0 },
      0,
      { generate: async () => null },
    );
    expect(r).toContain("aucun critère");
  });

  it("sans client IA → fallback direct", async () => {
    const r = await generateRationaleWithAi(
      makeArchitect(),
      { title: "x", buyer: "y" },
      { specialty: 0, geo: 0, history: 0, availability: 0, preference: 0, staffSize: 0 },
      0,
    );
    expect(r).toContain("aucun critère");
  });
});
