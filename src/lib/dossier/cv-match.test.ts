/**
 * Tests shouldIncludeCv — jumeau de fiche-metier-match (Steve 2026-06-05).
 */

import { describe, expect, it } from "vitest";

import { shouldIncludeCv } from "./cv-match";

describe("shouldIncludeCv", () => {
  it("inclut si intersection non vide", () => {
    expect(shouldIncludeCv(["patrimoine", "abf"], ["patrimoine", "scolaire"])).toBe(true);
  });

  it("inclut un archi BIM si le profil cherche BIM", () => {
    expect(shouldIncludeCv(["BIM", "REVIT", "IFC"], ["patrimoine", "BIM"])).toBe(true);
  });

  it("exclut un CV scolaire neuf si l'AO porte sur du patrimoine", () => {
    expect(shouldIncludeCv(["scolaire", "neuf", "crèche"], ["patrimoine", "abf"])).toBe(false);
  });

  it("exclut si matching_keywords null", () => {
    expect(shouldIncludeCv(null, ["patrimoine"])).toBe(false);
  });

  it("exclut si matching_keywords vide", () => {
    expect(shouldIncludeCv([], ["patrimoine"])).toBe(false);
  });

  it("exclut si profilePositives null", () => {
    expect(shouldIncludeCv(["patrimoine"], null)).toBe(false);
  });

  it("exclut si profilePositives vide", () => {
    expect(shouldIncludeCv(["patrimoine"], [])).toBe(false);
  });

  it("match insensible à la casse", () => {
    expect(shouldIncludeCv(["Patrimoine"], ["PATRIMOINE"])).toBe(true);
  });

  it("match insensible aux espaces autour", () => {
    expect(shouldIncludeCv(["  patrimoine  "], ["patrimoine"])).toBe(true);
  });
});
