/**
 * Tests cerfa-docx-generator (chantier J3 / H1 — Steve 2026-06-04).
 *
 * Focus :
 *   - buildCerfaMustacheParams : variables contexte + écrasement par fields
 *   - cerfaKindToLibraryKind : mapping DC1/DC2 → dc1/dc2
 *   - generateCerfaDocx : intégration avec fillDocxTemplate (via vrai .docx)
 *
 * On construit un faux `.docx` minimal (zip avec word/document.xml) pour
 * tester generateCerfaDocx sans dépendre d'un vrai fichier Steve.
 */

import { describe, expect, it } from "vitest";
import { unzipSync, zipSync } from "fflate";

import {
  buildCerfaMustacheParams,
  cerfaKindToLibraryKind,
  generateCerfaDocx,
  type CerfaDocxInput,
} from "./cerfa-docx-generator";

function buildFakeInput(overrides: Partial<CerfaDocxInput> = {}): CerfaDocxInput {
  return {
    kind: "dc1",
    tenderTitle: "Construction centre sportif",
    tenderBuyer: "Mairie de Saint-Étienne",
    organizationName: "AlyoS Ingénierie",
    selectedArchitectCabinet: "Atelier ABC",
    selectedBeCabinet: null,
    fields: [
      { field_id: "archi_siret", value: "12345678900012" },
      { field_id: "ao_objet_detail", value: "Construction d'un gymnase de 1200 m²" },
    ],
    generatedAt: new Date("2026-06-04T10:00:00.000Z"),
    ...overrides,
  };
}

describe("buildCerfaMustacheParams", () => {
  it("expose les variables de contexte AO", () => {
    const params = buildCerfaMustacheParams(buildFakeInput());
    expect(params.ao_objet).toBe("Construction centre sportif");
    expect(params.ao_acheteur).toBe("Mairie de Saint-Étienne");
    expect(params.org_nom).toBe("AlyoS Ingénierie");
    expect(params.archi_cabinet).toBe("Atelier ABC");
    expect(params.be_cabinet).toBe(""); // null → empty string
  });

  it("expose les fields validés sous leur field_id", () => {
    const params = buildCerfaMustacheParams(buildFakeInput());
    expect(params.archi_siret).toBe("12345678900012");
    expect(params.ao_objet_detail).toBe("Construction d'un gymnase de 1200 m²");
  });

  it("les fields écrasent les variables de contexte si même clé", () => {
    const params = buildCerfaMustacheParams(
      buildFakeInput({
        fields: [{ field_id: "org_nom", value: "AlyoS BTP Filiale" }],
      }),
    );
    expect(params.org_nom).toBe("AlyoS BTP Filiale");
  });

  it("formatte la date au format FR + ISO", () => {
    const params = buildCerfaMustacheParams(
      buildFakeInput({ generatedAt: new Date("2026-06-04T10:00:00.000Z") }),
    );
    // En FR, jour-mois-année en 2 chiffres
    expect(params.date_jour).toMatch(/^\d{2}\/\d{2}\/2026$/);
    expect(params.date_iso).toBe("2026-06-04");
  });

  it("gère le cas selectedArchitectCabinet = null (mode Solo)", () => {
    const params = buildCerfaMustacheParams(buildFakeInput({ selectedArchitectCabinet: null }));
    expect(params.archi_cabinet).toBe("");
  });
});

describe("cerfaKindToLibraryKind", () => {
  it("map DC1 → dc1", () => {
    expect(cerfaKindToLibraryKind("DC1")).toBe("dc1");
  });

  it("map DC2 → dc2", () => {
    expect(cerfaKindToLibraryKind("DC2")).toBe("dc2");
  });
});

describe("generateCerfaDocx", () => {
  /**
   * Construit un .docx minimal valide pour les tests : un zip qui contient
   * word/document.xml avec quelques balises Mustache.
   */
  function buildFakeDocxTemplate(documentXml: string): Uint8Array {
    const encoder = new TextEncoder();
    return zipSync({
      "[Content_Types].xml": encoder.encode("<?xml version='1.0'?><Types/>"),
      "word/document.xml": encoder.encode(documentXml),
    });
  }

  it("remplit correctement un template avec des balises Mustache", () => {
    const template = buildFakeDocxTemplate(
      `<?xml version="1.0"?><w:document><w:body><w:p><w:r><w:t>Objet : {{ao_objet}}</w:t></w:r></w:p><w:p><w:r><w:t>Cabinet : {{archi_cabinet}}</w:t></w:r></w:p></w:body></w:document>`,
    );
    const result = generateCerfaDocx(template, buildFakeInput());
    expect(result.substitutionCount).toBe(2);
    expect(result.unknownTokens).toEqual([]);

    // Décompose le résultat pour vérifier l'interpolation
    const out = unzipSync(result.buffer);
    const doc = new TextDecoder().decode(out["word/document.xml"]!);
    expect(doc).toContain("Construction centre sportif");
    expect(doc).toContain("Atelier ABC");
    expect(doc).not.toContain("{{");
  });

  it("retourne les balises inconnues dans unknownTokens", () => {
    const template = buildFakeDocxTemplate(
      `<?xml version="1.0"?><w:document><w:body><w:p><w:r><w:t>{{ao_objet}} {{unknown_xyz}}</w:t></w:r></w:p></w:body></w:document>`,
    );
    const result = generateCerfaDocx(template, buildFakeInput());
    expect(result.substitutionCount).toBe(1);
    expect(result.unknownTokens).toContain("unknown_xyz");
  });

  it("recolle les balises fragmentées par Word (anti-runs)", () => {
    const template = buildFakeDocxTemplate(
      `<?xml version="1.0"?><w:document><w:body><w:p><w:r><w:t>{{ar</w:t></w:r><w:r><w:t>chi_cabinet}}</w:t></w:r></w:p></w:body></w:document>`,
    );
    const result = generateCerfaDocx(template, buildFakeInput());
    // La balise fragmentée doit être recollée → substituée
    expect(result.substitutionCount).toBe(1);
    const out = unzipSync(result.buffer);
    const doc = new TextDecoder().decode(out["word/document.xml"]!);
    expect(doc).toContain("Atelier ABC");
  });

  it("throw si le buffer n'est pas un .docx valide (pas de word/document.xml)", () => {
    const fake = zipSync({ "random.txt": new TextEncoder().encode("hello") });
    expect(() => generateCerfaDocx(fake, buildFakeInput())).toThrow(/word\/document\.xml/);
  });
});
