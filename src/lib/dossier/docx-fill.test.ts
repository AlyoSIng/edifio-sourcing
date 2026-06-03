/**
 * Tests Vitest — moteur Mustache .docx (fillDocxTemplate).
 *
 * Stratégie : on construit en mémoire un .docx minimaliste valide
 * (3 fichiers : `[Content_Types].xml`, `_rels/.rels`, `word/document.xml`)
 * puis on appelle `fillDocxTemplate` et on vérifie le contenu du .docx
 * résultant en le re-dézippant via fflate.
 */

import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import { escapeXml, fillDocxTemplate, mergeFragmentedMustache } from "./docx-fill";

// ---------------------------------------------------------------------------
// Fixture .docx minimaliste
// ---------------------------------------------------------------------------

/** Construit un buffer .docx contenant le document.xml fourni. */
function buildDocxFixture(documentXml: string): Uint8Array {
  const contentTypesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    "</Types>";
  const relsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    "</Relationships>";
  return zipSync({
    "[Content_Types].xml": strToU8(contentTypesXml),
    "_rels/.rels": strToU8(relsXml),
    "word/document.xml": strToU8(documentXml),
  });
}

/** Récupère le `word/document.xml` rendu après fill. */
function extractDocumentXml(docx: Uint8Array): string {
  const files = unzipSync(docx);
  const raw = files["word/document.xml"];
  expect(raw).toBeDefined();
  return strFromU8(raw!);
}

// ---------------------------------------------------------------------------
// escapeXml
// ---------------------------------------------------------------------------

describe("escapeXml", () => {
  it("échappe les 5 caractères XML standard", () => {
    expect(escapeXml("&")).toBe("&amp;");
    expect(escapeXml("<")).toBe("&lt;");
    expect(escapeXml(">")).toBe("&gt;");
    expect(escapeXml('"')).toBe("&quot;");
    expect(escapeXml("'")).toBe("&apos;");
  });

  it("ne double-escape pas — & traité avant les autres", () => {
    expect(escapeXml("Tom & Jerry")).toBe("Tom &amp; Jerry");
    expect(escapeXml("a < b & c > d")).toBe("a &lt; b &amp; c &gt; d");
  });

  it("retourne tel quel si pas de caractère à échapper", () => {
    expect(escapeXml("Bonjour Marie")).toBe("Bonjour Marie");
    expect(escapeXml("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// mergeFragmentedMustache
// ---------------------------------------------------------------------------

describe("mergeFragmentedMustache", () => {
  it("ne touche pas un span sans tag XML interne", () => {
    expect(mergeFragmentedMustache("Hello {{archi_cabinet}} world")).toBe(
      "Hello {{archi_cabinet}} world",
    );
  });

  it("recolle les fragments XML entre {{ et }}", () => {
    const input = "{{ar</w:t></w:r><w:r><w:t>chi_cabinet}}";
    expect(mergeFragmentedMustache(input)).toBe("{{archi_cabinet}}");
  });

  it("supporte plusieurs balises fragmentées", () => {
    const input = "{{ar</w:t></w:r><w:r><w:t>chi}} et {{ao</w:t></w:r><w:r><w:t>_objet}}";
    expect(mergeFragmentedMustache(input)).toBe("{{archi}} et {{ao_objet}}");
  });

  it("n'agglutine pas deux balises séparées", () => {
    const input = "{{a}}<w:t>du texte</w:t>{{b}}";
    expect(mergeFragmentedMustache(input)).toBe("{{a}}<w:t>du texte</w:t>{{b}}");
  });
});

// ---------------------------------------------------------------------------
// fillDocxTemplate — happy paths
// ---------------------------------------------------------------------------

describe("fillDocxTemplate — substitutions simples", () => {
  it("remplace une balise propre", () => {
    const xml =
      "<w:document><w:body><w:p><w:r><w:t>Bonjour {{archi}}</w:t></w:r></w:p></w:body></w:document>";
    const result = fillDocxTemplate(buildDocxFixture(xml), { archi: "Marie Dupont" });
    expect(result.substitutionCount).toBe(1);
    expect(result.unknownTokens).toEqual([]);
    const out = extractDocumentXml(result.buffer);
    expect(out).toContain("Bonjour Marie Dupont");
    expect(out).not.toContain("{{archi}}");
  });

  it("remplace plusieurs balises dans le même document", () => {
    const xml =
      "<w:document><w:body>" +
      "<w:p><w:r><w:t>Cabinet : {{cabinet}}</w:t></w:r></w:p>" +
      "<w:p><w:r><w:t>AO : {{ao_objet}}</w:t></w:r></w:p>" +
      "</w:body></w:document>";
    const result = fillDocxTemplate(buildDocxFixture(xml), {
      cabinet: "Atelier Test",
      ao_objet: "Réfection toiture",
    });
    expect(result.substitutionCount).toBe(2);
    const out = extractDocumentXml(result.buffer);
    expect(out).toContain("Cabinet : Atelier Test");
    expect(out).toContain("AO : Réfection toiture");
  });

  it("remplace une balise répétée plusieurs fois", () => {
    const xml =
      "<w:document><w:body><w:p><w:r><w:t>{{x}} et {{x}} et {{x}}</w:t></w:r></w:p></w:body></w:document>";
    const result = fillDocxTemplate(buildDocxFixture(xml), { x: "A" });
    expect(result.substitutionCount).toBe(3);
    expect(extractDocumentXml(result.buffer)).toContain("A et A et A");
  });

  it("tolère les espaces autour du token", () => {
    const xml =
      "<w:document><w:body><w:p><w:r><w:t>{{ archi }} {{  ao_objet  }}</w:t></w:r></w:p></w:body></w:document>";
    const result = fillDocxTemplate(buildDocxFixture(xml), { archi: "X", ao_objet: "Y" });
    expect(result.substitutionCount).toBe(2);
    expect(extractDocumentXml(result.buffer)).toContain("X Y");
  });

  it("remplace une balise fragmentée par Word (multi-runs)", () => {
    const xml =
      "<w:document><w:body><w:p>" +
      "<w:r><w:t>Cabinet : {{ar</w:t></w:r>" +
      "<w:r><w:t>chi_cabinet}}</w:t></w:r>" +
      "</w:p></w:body></w:document>";
    const result = fillDocxTemplate(buildDocxFixture(xml), { archi_cabinet: "Atelier Test" });
    expect(result.substitutionCount).toBe(1);
    const out = extractDocumentXml(result.buffer);
    expect(out).toContain("Atelier Test");
  });
});

describe("fillDocxTemplate — cas limites", () => {
  it("garde la balise inconnue et la signale dans unknownTokens", () => {
    const xml =
      "<w:document><w:body><w:p><w:r><w:t>Hello {{absent}}</w:t></w:r></w:p></w:body></w:document>";
    const result = fillDocxTemplate(buildDocxFixture(xml), { autre: "X" });
    expect(result.substitutionCount).toBe(0);
    expect(result.unknownTokens).toEqual(["absent"]);
    expect(extractDocumentXml(result.buffer)).toContain("{{absent}}");
  });

  it("traite null/undefined comme chaîne vide", () => {
    const xml =
      "<w:document><w:body><w:p><w:r><w:t>[{{a}}][{{b}}]</w:t></w:r></w:p></w:body></w:document>";
    const result = fillDocxTemplate(buildDocxFixture(xml), { a: null, b: undefined });
    expect(result.substitutionCount).toBe(2);
    expect(extractDocumentXml(result.buffer)).toContain("[][]");
  });

  it("sérialise number et boolean", () => {
    const xml =
      "<w:document><w:body><w:p><w:r><w:t>n={{n}} b={{b}}</w:t></w:r></w:p></w:body></w:document>";
    const result = fillDocxTemplate(buildDocxFixture(xml), { n: 42, b: true });
    expect(result.substitutionCount).toBe(2);
    expect(extractDocumentXml(result.buffer)).toContain("n=42 b=true");
  });

  it("échappe les caractères XML dans les valeurs", () => {
    const xml = "<w:document><w:body><w:p><w:r><w:t>{{v}}</w:t></w:r></w:p></w:body></w:document>";
    const result = fillDocxTemplate(buildDocxFixture(xml), { v: "Tom & Jerry <test>" });
    const out = extractDocumentXml(result.buffer);
    expect(out).toContain("Tom &amp; Jerry &lt;test&gt;");
  });

  it("traite headers et footers", () => {
    const docXml =
      "<w:document><w:body><w:p><w:r><w:t>Body : {{cabinet}}</w:t></w:r></w:p></w:body></w:document>";
    const headerXml =
      '<?xml version="1.0"?><w:hdr><w:p><w:r><w:t>Header : {{cabinet}}</w:t></w:r></w:p></w:hdr>';
    const footerXml =
      '<?xml version="1.0"?><w:ftr><w:p><w:r><w:t>Footer : {{cabinet}}</w:t></w:r></w:p></w:ftr>';
    // Construit un .docx manuel avec header + footer.
    const docx = zipSync({
      "[Content_Types].xml": strToU8(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      ),
      "_rels/.rels": strToU8(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      ),
      "word/document.xml": strToU8(docXml),
      "word/header1.xml": strToU8(headerXml),
      "word/footer1.xml": strToU8(footerXml),
    });
    const result = fillDocxTemplate(docx, { cabinet: "AlyoS" });
    expect(result.substitutionCount).toBe(3);
    const filled = unzipSync(result.buffer);
    expect(strFromU8(filled["word/document.xml"]!)).toContain("Body : AlyoS");
    expect(strFromU8(filled["word/header1.xml"]!)).toContain("Header : AlyoS");
    expect(strFromU8(filled["word/footer1.xml"]!)).toContain("Footer : AlyoS");
  });

  it("throw si word/document.xml absent", () => {
    const noDocXml = zipSync({
      "[Content_Types].xml": strToU8("<x/>"),
    });
    expect(() => fillDocxTemplate(noDocXml, {})).toThrow(/word\/document\.xml/);
  });
});
