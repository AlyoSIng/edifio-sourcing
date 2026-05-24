/**
 * Tests unitaires — bloc RGPD art.14 (`{{rgpd_block}}`).
 *
 * Couvre :
 *  - HTML contient cabinet + lien opposition + texte art.14 attendu
 *  - HTML échappe les caractères dangereux (XSS via cabinet)
 *  - Lien opposition non-http throw
 *  - Lien opposition vide throw
 *  - Fallback cabinet vide → "votre cabinet"
 *  - Version text contient les mêmes éléments
 */

import { describe, expect, it } from "vitest";

import { buildRgpdBlockHtml, buildRgpdBlockText } from "./rgpd-block";

describe("buildRgpdBlockHtml", () => {
  const validInput = {
    cabinet: "Atelier Dupont",
    lienOpposition: "https://sourcing.alyosingenierie.fr/archi/oppose/abc.def.ghi",
  };

  it("inclut le nom du cabinet", () => {
    const html = buildRgpdBlockHtml(validInput);
    expect(html).toContain("Atelier Dupont");
  });

  it("inclut un lien cliquable vers la page d'opposition", () => {
    const html = buildRgpdBlockHtml(validInput);
    expect(html).toContain('href="https://sourcing.alyosingenierie.fr/archi/oppose/abc.def.ghi"');
    expect(html).toContain("cliquez ici");
  });

  it("contient la mention art. 14 verbatim (intérêt légitime, SIRENE, UE)", () => {
    const html = buildRgpdBlockHtml(validInput);
    expect(html).toContain("intérêt légitime");
    expect(html).toContain("SIRENE");
    expect(html).toContain("Union européenne");
    expect(html).toContain("AlyoS Ingénierie");
    expect(html).toContain("edifio Sourcing");
  });

  it("échappe les caractères HTML dangereux dans le nom du cabinet (XSS)", () => {
    const html = buildRgpdBlockHtml({
      cabinet: "Cabinet <script>alert(1)</script>",
      lienOpposition: "https://example.com/oppose",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("throw si lienOpposition vide", () => {
    expect(() => buildRgpdBlockHtml({ cabinet: "X", lienOpposition: "" })).toThrow(
      /lienOpposition requis/,
    );
  });

  it("throw si lienOpposition non-http(s)", () => {
    expect(() =>
      buildRgpdBlockHtml({ cabinet: "X", lienOpposition: "javascript:alert(1)" }),
    ).toThrow(/URL absolue/);
  });

  it("fallback 'votre cabinet' si cabinet vide", () => {
    const html = buildRgpdBlockHtml({
      cabinet: "",
      lienOpposition: "https://example.com/oppose",
    });
    expect(html).toContain("votre cabinet");
  });
});

describe("buildRgpdBlockText", () => {
  it("inclut le lien en texte brut", () => {
    const text = buildRgpdBlockText({
      cabinet: "Cabinet X",
      lienOpposition: "https://example.com/oppose/xyz",
    });
    expect(text).toContain("https://example.com/oppose/xyz");
    expect(text).toContain("Cabinet X");
    expect(text).toContain("Union européenne");
  });

  it("throw si lienOpposition invalide", () => {
    expect(() => buildRgpdBlockText({ cabinet: "X", lienOpposition: "" })).toThrow();
  });
});
