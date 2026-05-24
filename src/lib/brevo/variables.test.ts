/**
 * Tests unitaires — construction des variables Brevo architecte.
 *
 * Couvre :
 *  - splitContactName : "Marie Dupont" / "Jean Pierre Marie" / "Solo" / NULL / ""
 *  - formatClotureFr : Date → "28 mai 2026" / null → "à confirmer"
 *  - buildBrevoVariables : intégration — produit toutes les vars attendues
 *  - rgpd_block intégré dans le résultat
 */

import { describe, expect, it } from "vitest";

import { buildBrevoVariables, formatClotureFr, splitContactName } from "./variables";

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

describe("buildBrevoVariables — intégration", () => {
  const baseInput = {
    architect: { cabinet: "Atelier Dupont", contactName: "Marie Dupont" },
    tender: {
      title: "Rénovation école Jean Moulin",
      buyer: "Mairie de Lyon",
      deadline: new Date("2026-06-15T17:00:00Z"),
    },
    tenderDepartment: "69",
    lienAo: "https://sourcing.alyosingenierie.fr/archi/abc.def.ghi",
    lienOpposition: "https://sourcing.alyosingenierie.fr/archi/oppose/xyz.uvw.rst",
  };

  it("produit toutes les variables attendues", () => {
    const v = buildBrevoVariables(baseInput);
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
});
