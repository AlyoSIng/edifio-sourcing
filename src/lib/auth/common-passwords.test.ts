import { describe, expect, it } from "vitest";

import { COMMON_PASSWORDS, isCommonPassword } from "./common-passwords";

/**
 * Tests — liste des mots de passe communs (Board Q2/B 2026-05-12).
 */

describe("isCommonPassword", () => {
  it("détecte les classiques en lowercase exact", () => {
    expect(isCommonPassword("password")).toBe(true);
    expect(isCommonPassword("123456")).toBe(true);
    expect(isCommonPassword("qwerty")).toBe(true);
    expect(isCommonPassword("admin")).toBe(true);
  });

  it("est insensible à la casse", () => {
    expect(isCommonPassword("Password")).toBe(true);
    expect(isCommonPassword("PASSWORD")).toBe(true);
    expect(isCommonPassword("QwErTy")).toBe(true);
  });

  it("tolère les espaces autour", () => {
    expect(isCommonPassword("  password  ")).toBe(true);
    expect(isCommonPassword("\tletmein\n")).toBe(true);
  });

  it("retourne false sur un mot de passe non listé", () => {
    expect(isCommonPassword("Xy7!azerty-bleu-montagne")).toBe(false);
    expect(isCommonPassword("CafeNoir2026-Stylo!")).toBe(false);
  });

  it("retourne false sur les valeurs vides / triviales non listées", () => {
    expect(isCommonPassword("")).toBe(false);
    expect(isCommonPassword("   ")).toBe(false);
  });

  it("couvre les variantes sectorielles AlyoS / edifio", () => {
    expect(isCommonPassword("alyos2026")).toBe(true);
    expect(isCommonPassword("Edifio2026")).toBe(true);
    expect(isCommonPassword("Sourcing")).toBe(true);
  });

  it("couvre les saisons + années récentes", () => {
    expect(isCommonPassword("ete2025")).toBe(true);
    expect(isCommonPassword("Hiver2026")).toBe(true);
    expect(isCommonPassword("Summer2024")).toBe(true);
  });

  it("le Set exporté contient toutes les entrées en lowercase", () => {
    for (const entry of COMMON_PASSWORDS) {
      expect(entry).toBe(entry.toLowerCase());
      expect(entry.trim()).toBe(entry);
    }
  });

  it("contient au moins 80 entrées (sanity check MVP)", () => {
    // Pas un seuil dur — juste un garde-fou anti-régression accidentelle si
    // quelqu'un vidait la liste.
    expect(COMMON_PASSWORDS.size).toBeGreaterThanOrEqual(80);
  });
});
