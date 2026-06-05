/**
 * Tests shouldIncludeReferenceFiche — jumeau de fiche-metier-match (Steve 2026-06-05).
 */

import { describe, expect, it } from "vitest";

import { shouldIncludeReferenceFiche } from "./reference-fiche-match";

describe("shouldIncludeReferenceFiche", () => {
  it("inclut si intersection non vide", () => {
    expect(shouldIncludeReferenceFiche(["patrimoine", "abf"], ["patrimoine", "scolaire"])).toBe(
      true,
    );
  });

  it("exclut si intersection vide", () => {
    expect(shouldIncludeReferenceFiche(["abf"], ["patrimoine", "scolaire"])).toBe(false);
  });

  it("exclut si matching_keywords null", () => {
    expect(shouldIncludeReferenceFiche(null, ["patrimoine"])).toBe(false);
  });

  it("exclut si matching_keywords vide", () => {
    expect(shouldIncludeReferenceFiche([], ["patrimoine"])).toBe(false);
  });

  it("exclut si profilePositives null", () => {
    expect(shouldIncludeReferenceFiche(["patrimoine"], null)).toBe(false);
  });

  it("exclut si profilePositives vide", () => {
    expect(shouldIncludeReferenceFiche(["patrimoine"], [])).toBe(false);
  });

  it("match insensible à la casse", () => {
    expect(shouldIncludeReferenceFiche(["Patrimoine"], ["PATRIMOINE"])).toBe(true);
  });

  it("match insensible aux espaces autour", () => {
    expect(shouldIncludeReferenceFiche(["  patrimoine  "], ["patrimoine"])).toBe(true);
  });
});
