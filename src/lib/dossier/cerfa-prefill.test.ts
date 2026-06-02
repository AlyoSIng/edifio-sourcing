/**
 * Tests unitaires — cerfa-prefill.ts
 *
 * Couvre :
 *   - buildDc1 : champs pré-remplis vs a_completer, mode Tandem vs Solo
 *   - buildDc2 : champs pré-remplis vs a_completer
 *   - Dérivation de `source` : non-vide → company_data/tender_data, vide → a_completer
 */

import { describe, expect, it } from "vitest";

import { buildDc1, buildDc2 } from "./cerfa-prefill";
import type { PrefillInput } from "./cerfa-prefill";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fullInput: PrefillInput = {
  tender: { title: "Mission MOE — Centre aquatique", buyer: "Ville de Rouen" },
  org: { name: "AlyoS Ingénierie", siren: "123456789" },
  orgProfile: {
    commercialName: "AlyoS",
    agencyDetails: "12 rue des Entrepreneurs, 76000 Rouen",
    phone: "02 35 00 00 00",
    contactEmail: "contact@alyosingenierie.fr",
  },
  isTandem: true,
};

const minimalInput: PrefillInput = {
  tender: { title: "AO test", buyer: "Mairie de Test" },
  org: { name: "AlyoS Ingénierie", siren: null },
  orgProfile: null,
  isTandem: false,
};

/**
 * Phase 3 — fixture Tandem multi-archi : l'archi devient mandataire.
 * Tous les champs DC1 sont remplis depuis la fiche archi (siren, adresse,
 * représentant légal, qualité, téléphone, email, lieu de signature).
 */
const tandemArchiInput: PrefillInput = {
  ...fullInput,
  selectedArchitect: {
    id: "00000000-0000-0000-0000-000000000001",
    cabinet: "Atelier Dubois & Associés",
    contactName: "Marie Dubois",
    email: "contact@atelier-dubois.fr",
    phone: "01 42 00 00 00",
    siren: "987654321",
    addressLine1: "12 rue de la Paix",
    addressLine2: "Bâtiment B",
    zip: "75002",
    city: "Paris",
    signatureCity: "Paris",
    legalRepresentativeName: "Marie Dubois",
    legalRepresentativeRole: "Gérante",
  },
};

/** Archi sans représentant légal explicite → fallback contactName. */
const tandemArchiFallbackInput: PrefillInput = {
  ...fullInput,
  selectedArchitect: {
    id: "00000000-0000-0000-0000-000000000002",
    cabinet: "Cabinet Léger",
    contactName: "Paul Léger",
    email: "paul@cabinet-leger.fr",
    phone: null,
    siren: null,
    addressLine1: null,
    addressLine2: null,
    zip: null,
    city: null,
    signatureCity: null,
    legalRepresentativeName: null,
    legalRepresentativeRole: null,
  },
};

// ---------------------------------------------------------------------------
// buildDc1
// ---------------------------------------------------------------------------

describe("buildDc1", () => {
  it("retourne cerfa_kind DC1", () => {
    const doc = buildDc1(fullInput);
    expect(doc.cerfa_kind).toBe("DC1");
  });

  it("rempli dc1_pouvoir_adjudicateur depuis tender.buyer (tender_data)", () => {
    const doc = buildDc1(fullInput);
    const field = doc.fields.find((f) => f.field_id === "dc1_pouvoir_adjudicateur");
    expect(field?.value).toBe("Ville de Rouen");
    expect(field?.source).toBe("tender_data");
  });

  it("rempli dc1_objet_marche depuis tender.title (tender_data)", () => {
    const doc = buildDc1(fullInput);
    const field = doc.fields.find((f) => f.field_id === "dc1_objet_marche");
    expect(field?.value).toBe("Mission MOE — Centre aquatique");
    expect(field?.source).toBe("tender_data");
  });

  it("type candidature = Groupement momentané en mode Tandem", () => {
    const doc = buildDc1(fullInput);
    const field = doc.fields.find((f) => f.field_id === "dc1_type_candidature");
    expect(field?.value).toBe("Groupement momentané d'entreprises");
    expect(field?.source).toBe("company_data");
  });

  it("type candidature = Candidat individuel en mode Solo", () => {
    const doc = buildDc1({ ...fullInput, isTandem: false });
    const field = doc.fields.find((f) => f.field_id === "dc1_type_candidature");
    expect(field?.value).toBe("Candidat individuel");
  });

  it("champ dc1_nom_mandataire présent uniquement en Tandem", () => {
    const docTandem = buildDc1(fullInput);
    const docSolo = buildDc1({ ...fullInput, isTandem: false });
    expect(docTandem.fields.some((f) => f.field_id === "dc1_nom_mandataire")).toBe(true);
    expect(docSolo.fields.some((f) => f.field_id === "dc1_nom_mandataire")).toBe(false);
  });

  it("dc1_siren = a_completer si org.siren est null", () => {
    const doc = buildDc1(minimalInput);
    const field = doc.fields.find((f) => f.field_id === "dc1_siren");
    expect(field?.source).toBe("a_completer");
    expect(field?.value).toBe("");
  });

  it("dc1_siren = company_data si org.siren est renseigné", () => {
    const doc = buildDc1(fullInput);
    const field = doc.fields.find((f) => f.field_id === "dc1_siren");
    expect(field?.source).toBe("company_data");
    expect(field?.value).toBe("123456789");
  });

  it("dc1_representant_legal est toujours a_completer et required", () => {
    const doc = buildDc1(fullInput);
    const field = doc.fields.find((f) => f.field_id === "dc1_representant_legal");
    expect(field?.source).toBe("a_completer");
    expect(field?.required).toBe(true);
  });

  it("dc1_telephone = a_completer si orgProfile est null", () => {
    const doc = buildDc1(minimalInput);
    const field = doc.fields.find((f) => f.field_id === "dc1_telephone");
    expect(field?.source).toBe("a_completer");
  });

  it("dc1_telephone rempli si orgProfile.phone non vide", () => {
    const doc = buildDc1(fullInput);
    const field = doc.fields.find((f) => f.field_id === "dc1_telephone");
    expect(field?.value).toBe("02 35 00 00 00");
    expect(field?.source).toBe("company_data");
  });
});

// ---------------------------------------------------------------------------
// buildDc1 — Phase 3 Tandem multi-archi (archi mandataire)
// ---------------------------------------------------------------------------

describe("buildDc1 — Phase 3 archi mandataire", () => {
  it("dc1_nom_mandataire = cabinet archi quand selectedArchitect fourni", () => {
    const doc = buildDc1(tandemArchiInput);
    const field = doc.fields.find((f) => f.field_id === "dc1_nom_mandataire");
    expect(field?.value).toBe("Atelier Dubois & Associés");
    expect(field?.source).toBe("company_data");
  });

  it("dc1_siren = siren archi (company_data) quand selectedArchitect fourni", () => {
    const doc = buildDc1(tandemArchiInput);
    const field = doc.fields.find((f) => f.field_id === "dc1_siren");
    expect(field?.value).toBe("987654321");
    expect(field?.source).toBe("company_data");
  });

  it("dc1_adresse = concaténation addressLine1 + addressLine2 + zip + city archi", () => {
    const doc = buildDc1(tandemArchiInput);
    const field = doc.fields.find((f) => f.field_id === "dc1_adresse");
    expect(field?.value).toBe("12 rue de la Paix, Bâtiment B, 75002, Paris");
    expect(field?.source).toBe("company_data");
  });

  it("dc1_representant_legal = legalRepresentativeName archi", () => {
    const doc = buildDc1(tandemArchiInput);
    const field = doc.fields.find((f) => f.field_id === "dc1_representant_legal");
    expect(field?.value).toBe("Marie Dubois");
    expect(field?.source).toBe("company_data");
  });

  it("dc1_qualite = legalRepresentativeRole archi", () => {
    const doc = buildDc1(tandemArchiInput);
    const field = doc.fields.find((f) => f.field_id === "dc1_qualite");
    expect(field?.value).toBe("Gérante");
    expect(field?.source).toBe("company_data");
  });

  it("dc1_telephone = phone archi (company_data) quand renseigné", () => {
    const doc = buildDc1(tandemArchiInput);
    const field = doc.fields.find((f) => f.field_id === "dc1_telephone");
    expect(field?.value).toBe("01 42 00 00 00");
    expect(field?.source).toBe("company_data");
  });

  it("dc1_email = email archi (company_data)", () => {
    const doc = buildDc1(tandemArchiInput);
    const field = doc.fields.find((f) => f.field_id === "dc1_email");
    expect(field?.value).toBe("contact@atelier-dubois.fr");
    expect(field?.source).toBe("company_data");
  });

  it("dc1_lieu_date = signatureCity archi", () => {
    const doc = buildDc1(tandemArchiInput);
    const field = doc.fields.find((f) => f.field_id === "dc1_lieu_date");
    expect(field?.value).toBe("Paris");
    expect(field?.source).toBe("company_data");
  });

  it("dc1_type_candidature reste 'Groupement momentané' quand archi mandataire", () => {
    const doc = buildDc1(tandemArchiInput);
    const field = doc.fields.find((f) => f.field_id === "dc1_type_candidature");
    expect(field?.value).toBe("Groupement momentané d'entreprises");
  });

  it("force le mode Tandem si selectedArchitect fourni même quand isTandem=false", () => {
    const doc = buildDc1({ ...tandemArchiInput, isTandem: false });
    const mandataire = doc.fields.find((f) => f.field_id === "dc1_nom_mandataire");
    const typeField = doc.fields.find((f) => f.field_id === "dc1_type_candidature");
    expect(mandataire?.value).toBe("Atelier Dubois & Associés");
    expect(typeField?.value).toBe("Groupement momentané d'entreprises");
  });

  it("représentant légal fallback sur contactName si legalRepresentativeName null", () => {
    const doc = buildDc1(tandemArchiFallbackInput);
    const field = doc.fields.find((f) => f.field_id === "dc1_representant_legal");
    expect(field?.value).toBe("Paul Léger");
    expect(field?.source).toBe("company_data");
  });

  it("dc1_siren = a_completer si archi.siren null (mode archi mandataire)", () => {
    const doc = buildDc1(tandemArchiFallbackInput);
    const field = doc.fields.find((f) => f.field_id === "dc1_siren");
    expect(field?.value).toBe("");
    expect(field?.source).toBe("a_completer");
  });

  it("dc1_adresse vide → a_completer si tous les champs adresse archi sont null", () => {
    const doc = buildDc1(tandemArchiFallbackInput);
    const field = doc.fields.find((f) => f.field_id === "dc1_adresse");
    expect(field?.value).toBe("");
    expect(field?.source).toBe("a_completer");
  });

  it("dc1_telephone = a_completer si archi.phone null", () => {
    const doc = buildDc1(tandemArchiFallbackInput);
    const field = doc.fields.find((f) => f.field_id === "dc1_telephone");
    expect(field?.source).toBe("a_completer");
  });

  it("dc1_qualite = a_completer si archi.legalRepresentativeRole null", () => {
    const doc = buildDc1(tandemArchiFallbackInput);
    const field = doc.fields.find((f) => f.field_id === "dc1_qualite");
    expect(field?.source).toBe("a_completer");
    expect(field?.required).toBe(true);
  });

  it("selectedArchitect=null se comporte comme Solo/Tandem AlyoS classique", () => {
    const doc = buildDc1({ ...fullInput, selectedArchitect: null });
    const mandataire = doc.fields.find((f) => f.field_id === "dc1_nom_mandataire");
    const siren = doc.fields.find((f) => f.field_id === "dc1_siren");
    expect(mandataire?.value).toBe("AlyoS Ingénierie");
    expect(siren?.value).toBe("123456789");
  });

  it("buildDc2 ignore selectedArchitect (DC2 = candidat AlyoS uniquement)", () => {
    // Le DC2 décrit AlyoS en tant que candidat individuel/membre du groupement.
    // Phase 3 ne change pas son comportement.
    const doc = buildDc2(tandemArchiInput);
    const denomination = doc.fields.find((f) => f.field_id === "dc2_denomination");
    expect(denomination?.value).toBe("AlyoS Ingénierie");
  });
});

// ---------------------------------------------------------------------------
// buildDc2
// ---------------------------------------------------------------------------

describe("buildDc2", () => {
  it("retourne cerfa_kind DC2", () => {
    const doc = buildDc2(fullInput);
    expect(doc.cerfa_kind).toBe("DC2");
  });

  it("dc2_denomination = org.name (company_data)", () => {
    const doc = buildDc2(fullInput);
    const field = doc.fields.find((f) => f.field_id === "dc2_denomination");
    expect(field?.value).toBe("AlyoS Ingénierie");
    expect(field?.source).toBe("company_data");
  });

  it("dc2_forme_juridique est toujours a_completer", () => {
    const doc = buildDc2(fullInput);
    const field = doc.fields.find((f) => f.field_id === "dc2_forme_juridique");
    expect(field?.source).toBe("a_completer");
    expect(field?.required).toBe(true);
  });

  it("dc2_activite_principale est pré-rempli (company_data)", () => {
    const doc = buildDc2(fullInput);
    const field = doc.fields.find((f) => f.field_id === "dc2_activite_principale");
    expect(field?.source).toBe("company_data");
    expect(field?.value).toContain("Ingénierie");
  });

  it("champs financiers CA sont toujours a_completer", () => {
    const doc = buildDc2(fullInput);
    for (const id of ["dc2_ca_n1", "dc2_ca_n2", "dc2_ca_n3"]) {
      const field = doc.fields.find((f) => f.field_id === id);
      expect(field?.source).toBe("a_completer");
    }
  });

  it("dc2_attestation_fiscal est company_data (valeur pré-remplie)", () => {
    const doc = buildDc2(fullInput);
    const field = doc.fields.find((f) => f.field_id === "dc2_attestation_fiscal");
    expect(field?.source).toBe("company_data");
    expect(field?.required).toBe(true);
  });

  it("dc2_siren = a_completer si siren null", () => {
    const doc = buildDc2(minimalInput);
    const field = doc.fields.find((f) => f.field_id === "dc2_siren");
    expect(field?.source).toBe("a_completer");
  });
});
