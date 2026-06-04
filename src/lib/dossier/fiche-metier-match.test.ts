/**
 * Tests shouldIncludeFicheMetier (Steve 2026-06-04).
 *
 * Verrouille la matrice de décision pour ne pas inclure des fiches métiers
 * inattendues dans le ZIP ou en exclure à tort.
 */

import { describe, expect, it } from "vitest";

import { shouldIncludeFicheMetier } from "./fiche-metier-match";

describe("shouldIncludeFicheMetier", () => {
  it("inclut si intersection non vide", () => {
    expect(shouldIncludeFicheMetier(["patrimoine", "abf"], ["patrimoine", "rénovation"])).toBe(
      true,
    );
  });

  it("inclut sur intersection mono-mot", () => {
    expect(shouldIncludeFicheMetier(["patrimoine"], ["patrimoine"])).toBe(true);
  });

  it("exclut si intersection vide", () => {
    expect(shouldIncludeFicheMetier(["patrimoine", "abf"], ["école", "gymnase"])).toBe(false);
  });

  it("exclut si matching_keywords vide (signal de config absente)", () => {
    expect(shouldIncludeFicheMetier([], ["patrimoine"])).toBe(false);
  });

  it("exclut si matching_keywords null", () => {
    expect(shouldIncludeFicheMetier(null, ["patrimoine"])).toBe(false);
  });

  it("exclut si profil sans positives", () => {
    expect(shouldIncludeFicheMetier(["patrimoine"], [])).toBe(false);
  });

  it("exclut si profil null", () => {
    expect(shouldIncludeFicheMetier(["patrimoine"], null)).toBe(false);
  });

  it("matching insensible à la casse", () => {
    expect(shouldIncludeFicheMetier(["Patrimoine"], ["patrimoine"])).toBe(true);
    expect(shouldIncludeFicheMetier(["PATRIMOINE"], ["patrimoine"])).toBe(true);
  });

  it("matching insensible aux espaces autour", () => {
    expect(shouldIncludeFicheMetier(["  patrimoine  "], ["patrimoine"])).toBe(true);
    expect(shouldIncludeFicheMetier(["patrimoine"], ["  patrimoine  "])).toBe(true);
  });

  it("ne match pas un mot-clé partiel (= ne sous-chaîne pas)", () => {
    // « patri » ne doit PAS matcher « patrimoine » (le matching est exact)
    expect(shouldIncludeFicheMetier(["patri"], ["patrimoine"])).toBe(false);
  });
});
