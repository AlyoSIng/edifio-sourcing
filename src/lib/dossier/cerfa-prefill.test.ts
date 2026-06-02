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

/**
 * Lot B — fixture Cotraitance BE : le BE devient candidat (DC2). Tous les
 * champs candidat (dénomination, SIREN, adresse, représentant légal, capital,
 * etc.) sont remplis depuis la fiche BE.
 */
const cotraitanceBeInput: PrefillInput = {
  ...fullInput,
  selectedBe: {
    id: "00000000-0000-0000-0000-0000000000be",
    cabinet: "Bureau d'Études Structure SARL",
    contactName: "Sophie Martin",
    email: "contact@bestructure.fr",
    phone: "01 44 00 00 00",
    siren: "456789123",
    addressLine1: "8 boulevard Voltaire",
    addressLine2: null,
    zip: "75011",
    city: "Paris",
    capitalEur: 125000,
    signatureCity: "Paris",
    legalRepresentativeName: "Sophie Martin",
    legalRepresentativeRole: "Gérante",
  },
};

/** BE avec champs minimaux — vérifie les fallback / a_completer. */
const cotraitanceBeMinimalInput: PrefillInput = {
  ...fullInput,
  selectedBe: {
    id: "00000000-0000-0000-0000-0000000000bf",
    cabinet: "BE Lambda",
    contactName: "Jean Lambda",
    email: null,
    phone: null,
    siren: null,
    addressLine1: null,
    addressLine2: null,
    zip: null,
    city: null,
    capitalEur: null,
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

// ---------------------------------------------------------------------------
// buildDc2 — Lot B Cotraitance BE (BE candidat membre du groupement)
// ---------------------------------------------------------------------------

describe("buildDc2 — Lot B Cotraitance BE", () => {
  it("dc2_denomination = cabinet BE quand selectedBe fourni (company_data)", () => {
    const doc = buildDc2(cotraitanceBeInput);
    const field = doc.fields.find((f) => f.field_id === "dc2_denomination");
    expect(field?.value).toBe("Bureau d'Études Structure SARL");
    expect(field?.source).toBe("company_data");
  });

  it("dc2_siren = siren BE quand selectedBe fourni (company_data)", () => {
    const doc = buildDc2(cotraitanceBeInput);
    const field = doc.fields.find((f) => f.field_id === "dc2_siren");
    expect(field?.value).toBe("456789123");
    expect(field?.source).toBe("company_data");
  });

  it("dc2_adresse = concaténation des champs adresse BE", () => {
    const doc = buildDc2(cotraitanceBeInput);
    const field = doc.fields.find((f) => f.field_id === "dc2_adresse");
    expect(field?.value).toBe("8 boulevard Voltaire, 75011, Paris");
    expect(field?.source).toBe("company_data");
  });

  it("dc2_representant_legal = legalRepresentativeName BE", () => {
    const doc = buildDc2(cotraitanceBeInput);
    const field = doc.fields.find((f) => f.field_id === "dc2_representant_legal");
    expect(field?.value).toBe("Sophie Martin");
    expect(field?.source).toBe("company_data");
  });

  it("dc2_qualite = legalRepresentativeRole BE", () => {
    const doc = buildDc2(cotraitanceBeInput);
    const field = doc.fields.find((f) => f.field_id === "dc2_qualite");
    expect(field?.value).toBe("Gérante");
    expect(field?.source).toBe("company_data");
  });

  it("dc2_capital = capitalEur BE (string brut, sans formatage)", () => {
    const doc = buildDc2(cotraitanceBeInput);
    const field = doc.fields.find((f) => f.field_id === "dc2_capital");
    expect(field?.value).toBe("125000");
    expect(field?.source).toBe("company_data");
  });

  it("dc2_lieu_date = signatureCity BE", () => {
    const doc = buildDc2(cotraitanceBeInput);
    const field = doc.fields.find((f) => f.field_id === "dc2_lieu_date");
    expect(field?.value).toBe("Paris");
    expect(field?.source).toBe("company_data");
  });

  it("dc2_activite_principale est vide pour un BE (pas d'activité par défaut)", () => {
    // En mode AlyoS on a un texte par défaut ; pour un BE on laisse vide
    // (l'utilisateur doit compléter selon le profil du BE).
    const doc = buildDc2(cotraitanceBeInput);
    const field = doc.fields.find((f) => f.field_id === "dc2_activite_principale");
    expect(field?.value).toBe("");
    expect(field?.source).toBe("a_completer");
  });

  it("représentant légal fallback sur contactName si legalRepresentativeName null", () => {
    // BE Lambda → contactName = "Jean Lambda", legalRepresentativeName = null
    const doc = buildDc2(cotraitanceBeMinimalInput);
    const field = doc.fields.find((f) => f.field_id === "dc2_representant_legal");
    expect(field?.value).toBe("Jean Lambda");
    expect(field?.source).toBe("company_data");
  });

  it("dc2_siren = a_completer si BE.siren null", () => {
    const doc = buildDc2(cotraitanceBeMinimalInput);
    const field = doc.fields.find((f) => f.field_id === "dc2_siren");
    expect(field?.value).toBe("");
    expect(field?.source).toBe("a_completer");
  });

  it("dc2_adresse vide → a_completer si tous les champs adresse BE sont null", () => {
    const doc = buildDc2(cotraitanceBeMinimalInput);
    const field = doc.fields.find((f) => f.field_id === "dc2_adresse");
    expect(field?.value).toBe("");
    expect(field?.source).toBe("a_completer");
  });

  it("dc2_capital = a_completer si BE.capitalEur null", () => {
    const doc = buildDc2(cotraitanceBeMinimalInput);
    const field = doc.fields.find((f) => f.field_id === "dc2_capital");
    expect(field?.value).toBe("");
    expect(field?.source).toBe("a_completer");
  });

  it("dc2_qualite = a_completer si BE.legalRepresentativeRole null", () => {
    const doc = buildDc2(cotraitanceBeMinimalInput);
    const field = doc.fields.find((f) => f.field_id === "dc2_qualite");
    expect(field?.source).toBe("a_completer");
    expect(field?.required).toBe(true);
  });

  it("selectedBe=null → comportement AlyoS classique", () => {
    const doc = buildDc2({ ...fullInput, selectedBe: null });
    const denomination = doc.fields.find((f) => f.field_id === "dc2_denomination");
    const activite = doc.fields.find((f) => f.field_id === "dc2_activite_principale");
    expect(denomination?.value).toBe("AlyoS Ingénierie");
    expect(activite?.value).toContain("Ingénierie");
  });

  it("buildDc1 ignore selectedBe (DC1 = mandataire AlyoS, pas BE)", () => {
    // Le DC1 décrit le mandataire du groupement = AlyoS en mode Cotraitance BE.
    // Le BE étant cotraitant, il n'apparaît pas comme mandataire.
    const doc = buildDc1(cotraitanceBeInput);
    const mandataire = doc.fields.find((f) => f.field_id === "dc1_nom_mandataire");
    // En mode Tandem (isTandem: true via fullInput), le mandataire reste AlyoS
    // car selectedArchitect n'est pas fourni.
    expect(mandataire?.value).toBe("AlyoS Ingénierie");
  });
});
