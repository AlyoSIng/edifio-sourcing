/**
 * Tests unitaires — construction des variables Brevo architecte.
 *
 * Couvre :
 *  - splitContactName : "Marie Dupont" / "Jean Pierre Marie" / "Solo" / NULL / ""
 *  - formatClotureFr : Date → "28 mai 2026" / null → "à confirmer"
 *  - deriveCivilite : mapping title Odoo → "Madame" / "Monsieur" / fallback
 *  - buildBrevoVariables : intégration — produit toutes les vars attendues (v2)
 *  - rgpd_block intégré dans le résultat
 *  - civilite + presentation_societe présents (v2)
 */

import { describe, expect, it } from "vitest";

import {
  buildBrevoVariables,
  buildGreeting,
  deriveCivilite,
  formatClotureFr,
  splitContactName,
} from "./variables";

describe("splitContactName", () => {
  it("split sur 1er espace : 'Marie Dupont'", () => {
    expect(splitContactName("Marie Dupont")).toEqual({ prenom: "Marie", nom: "Dupont" });
  });
  it("conserve les noms composés après le prénom : 'Jean Pierre Marie'", () => {
    expect(splitContactName("Jean Pierre Marie")).toEqual({
      prenom: "Jean",
      nom: "Pierre Marie",
    });
  });
  it("nom unique → prénom seul", () => {
    expect(splitContactName("Solo")).toEqual({ prenom: "Solo", nom: "" });
  });
  it("NULL → fallback 'partenaire'", () => {
    expect(splitContactName(null)).toEqual({ prenom: "partenaire", nom: "" });
  });
  it("string vide → fallback 'partenaire'", () => {
    expect(splitContactName("")).toEqual({ prenom: "partenaire", nom: "" });
  });
  it("espaces multiples normalisés", () => {
    expect(splitContactName("  Marie    Dupont  ")).toEqual({
      prenom: "Marie",
      nom: "Dupont",
    });
  });
});

describe("formatClotureFr", () => {
  it("formate une Date en FR (jour mois année)", () => {
    const d = new Date("2026-05-28T10:00:00Z");
    const result = formatClotureFr(d);
    expect(result).toContain("28");
    expect(result).toMatch(/mai/i);
    expect(result).toContain("2026");
  });
  it("null → 'à confirmer'", () => {
    expect(formatClotureFr(null)).toBe("à confirmer");
  });
  it("undefined → 'à confirmer'", () => {
    expect(formatClotureFr(undefined)).toBe("à confirmer");
  });
});

describe("deriveCivilite", () => {
  it("'M.' → 'Monsieur'", () => {
    expect(deriveCivilite("M.")).toBe("Monsieur");
  });
  it("'M' → 'Monsieur'", () => {
    expect(deriveCivilite("M")).toBe("Monsieur");
  });
  it("'Monsieur' → 'Monsieur'", () => {
    expect(deriveCivilite("Monsieur")).toBe("Monsieur");
  });
  it("'monsieur' (minuscules) → 'Monsieur' (insensible casse)", () => {
    expect(deriveCivilite("monsieur")).toBe("Monsieur");
  });
  it("'Mme' → 'Madame'", () => {
    expect(deriveCivilite("Mme")).toBe("Madame");
  });
  it("'Mme.' → 'Madame'", () => {
    expect(deriveCivilite("Mme.")).toBe("Madame");
  });
  it("'Madame' → 'Madame'", () => {
    expect(deriveCivilite("Madame")).toBe("Madame");
  });
  it("null → fallback 'Madame, Monsieur,'", () => {
    expect(deriveCivilite(null)).toBe("Madame, Monsieur,");
  });
  it("string vide → fallback 'Madame, Monsieur,'", () => {
    expect(deriveCivilite("")).toBe("Madame, Monsieur,");
  });
  it("valeur inconnue 'Dr.' → fallback 'Madame, Monsieur,'", () => {
    expect(deriveCivilite("Dr.")).toBe("Madame, Monsieur,");
  });
});

describe("buildGreeting", () => {
  it("TU → 'Bonjour {{prenom}},'", () => {
    expect(buildGreeting("tu", "Madame", "Marie", "Dupont")).toBe("Bonjour Marie,");
  });
  it("TU + prenom fallback → 'Bonjour partenaire,'", () => {
    expect(buildGreeting("tu", "Madame, Monsieur,", "partenaire", "")).toBe("Bonjour partenaire,");
  });
  it("VOUS + Madame + nom → 'Bonjour Madame Dupont,'", () => {
    expect(buildGreeting("vous", "Madame", "Marie", "Dupont")).toBe("Bonjour Madame Dupont,");
  });
  it("VOUS + Monsieur + nom → 'Bonjour Monsieur Dupont,'", () => {
    expect(buildGreeting("vous", "Monsieur", "Jean", "Martin")).toBe("Bonjour Monsieur Martin,");
  });
  it("VOUS + Madame + nom vide → 'Bonjour Madame,'", () => {
    expect(buildGreeting("vous", "Madame", "partenaire", "")).toBe("Bonjour Madame,");
  });
  it("VOUS + fallback civilite → 'Bonjour Madame, Monsieur,'", () => {
    expect(buildGreeting("vous", "Madame, Monsieur,", "Marie", "Dupont")).toBe(
      "Bonjour Madame, Monsieur,",
    );
  });
});

describe("buildBrevoVariables — intégration (v2)", () => {
  const baseInput = {
    architect: { cabinet: "Atelier Dupont", contactName: "Marie Dupont", title: "Mme" },
    tender: {
      title: "Rénovation école Jean Moulin",
      buyer: "Mairie de Lyon",
      deadline: new Date("2026-06-15T17:00:00Z"),
      sourceUrl: "https://www.boamp.fr/avis/detail/26-12345",
    },
    tenderDepartment: "69",
    lienAo: "https://sourcing.alyosingenierie.fr/archi/abc.def.ghi",
    lienOpposition: "https://sourcing.alyosingenierie.fr/archi/oppose/xyz.uvw.rst",
  };

  it("produit toutes les variables attendues (y compris civilite v2)", () => {
    const v = buildBrevoVariables(baseInput);
    expect(v.civilite).toBe("Madame");
    expect(v.archi_prenom).toBe("Marie");
    expect(v.archi_nom).toBe("Dupont");
    expect(v.cabinet).toBe("Atelier Dupont");
    expect(v.ao_objet).toBe("Rénovation école Jean Moulin");
    expect(v.ao_acheteur).toBe("Mairie de Lyon");
    expect(v.ao_departement).toBe("69");
    expect(v.ao_cloture).toContain("juin");
    expect(v.ao_cloture).toContain("2026");
    expect(v.lien_ao).toBe(baseInput.lienAo);
    expect(v.lien_opposition).toBe(baseInput.lienOpposition);
  });

  it("civilite fallback 'Madame, Monsieur,' si title absent", () => {
    const v = buildBrevoVariables({
      ...baseInput,
      architect: { ...baseInput.architect, title: null },
    });
    expect(v.civilite).toBe("Madame, Monsieur,");
  });

  it("presentation_societe contient le contenu par défaut AlyoS (4 puces)", () => {
    const v = buildBrevoVariables(baseInput);
    expect(v.presentation_societe).toContain("AlyoS Ingénierie");
    expect(v.presentation_societe).toContain("BIM");
    expect(v.presentation_societe).toContain("économie circulaire");
  });

  it("presentation_societe override si fourni en input", () => {
    const v = buildBrevoVariables({
      ...baseInput,
      presentationSociete: "<p>Override custom</p>",
    });
    expect(v.presentation_societe).toBe("<p>Override custom</p>");
  });

  it("rgpd_block contient cabinet + lien opposition + mention art.14", () => {
    const v = buildBrevoVariables(baseInput);
    expect(v.rgpd_block).toContain("Atelier Dupont");
    expect(v.rgpd_block).toContain(baseInput.lienOpposition);
    expect(v.rgpd_block).toContain("intérêt légitime");
    expect(v.rgpd_block).toContain("Union européenne");
  });

  it("rgpd_block_text est en texte brut (pas de balise <a>)", () => {
    const v = buildBrevoVariables(baseInput);
    expect(v.rgpd_block_text).not.toContain("<a ");
    expect(v.rgpd_block_text).not.toContain("<p ");
    expect(v.rgpd_block_text).toContain(baseInput.lienOpposition);
  });

  it("fallback partenaire si contactName NULL", () => {
    const v = buildBrevoVariables({
      ...baseInput,
      architect: { cabinet: "Atelier X", contactName: null },
    });
    expect(v.archi_prenom).toBe("partenaire");
    expect(v.archi_nom).toBe("");
  });

  it("tenderDepartment null → ao_departement = '—'", () => {
    const v = buildBrevoVariables({ ...baseInput, tenderDepartment: null });
    expect(v.ao_departement).toBe("—");
  });

  it("deadline null → ao_cloture = 'à confirmer'", () => {
    const v = buildBrevoVariables({
      ...baseInput,
      tender: { ...baseInput.tender, deadline: null },
    });
    expect(v.ao_cloture).toBe("à confirmer");
  });

  it("lien_annonce_officielle = tender.sourceUrl quand l'AO a une URL source", () => {
    const v = buildBrevoVariables(baseInput);
    expect(v.lien_annonce_officielle).toBe("https://www.boamp.fr/avis/detail/26-12345");
  });

  it("lien_annonce_officielle = '' quand tender.sourceUrl est null", () => {
    const v = buildBrevoVariables({
      ...baseInput,
      tender: { ...baseInput.tender, sourceUrl: null },
    });
    expect(v.lien_annonce_officielle).toBe("");
  });

  it("nom_commercial fallback 'AlyoS Ingénierie' si nomCommercial absent", () => {
    const v = buildBrevoVariables(baseInput); // pas de nomCommercial
    expect(v.nom_commercial).toBe("AlyoS Ingénierie");
  });

  it("nom_commercial = valeur fournie si nomCommercial présent", () => {
    const v = buildBrevoVariables({ ...baseInput, nomCommercial: "Dupont Ingénierie" });
    expect(v.nom_commercial).toBe("Dupont Ingénierie");
  });

  it("nom_commercial fallback si nomCommercial est une chaine vide", () => {
    const v = buildBrevoVariables({ ...baseInput, nomCommercial: "" });
    expect(v.nom_commercial).toBe("AlyoS Ingénierie");
  });

  it("nom_commercial fallback si nomCommercial est uniquement des espaces", () => {
    const v = buildBrevoVariables({ ...baseInput, nomCommercial: "   " });
    expect(v.nom_commercial).toBe("AlyoS Ingénierie");
  });

  it("greeting VOUS connu → 'Bonjour Madame Dupont,'", () => {
    const v = buildBrevoVariables({ ...baseInput, register: "vous" });
    expect(v.greeting).toBe("Bonjour Madame Dupont,");
  });
  it("greeting TU → 'Bonjour Marie,'", () => {
    const v = buildBrevoVariables({ ...baseInput, register: "tu" });
    expect(v.greeting).toBe("Bonjour Marie,");
  });
  it("greeting VOUS sans register explicite → défaut VOUS", () => {
    const v = buildBrevoVariables(baseInput); // pas de register
    expect(v.greeting).toBe("Bonjour Madame Dupont,"); // title='Mme' → Madame; nom='Dupont'
  });
  it("greeting VOUS + civilité fallback → 'Bonjour Madame, Monsieur,'", () => {
    const v = buildBrevoVariables({
      ...baseInput,
      register: "vous",
      architect: { ...baseInput.architect, title: null },
    });
    expect(v.greeting).toBe("Bonjour Madame, Monsieur,");
  });
});
