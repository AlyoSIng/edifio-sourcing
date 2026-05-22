/**
 * Tests unitaires du helper `normalizeForMatching` — edifio Sourcing.
 *
 * Module pur, pas de mock requis. On couvre :
 *  - accents français courants (é, è, ê, ë, à, â, ô, û, ï, ç)
 *  - combinaison casse + accents (`BÂTIMENT`, `Réhabilitation Énergétique`)
 *  - strings sans accents (no-op)
 *  - idempotence : `f(f(s)) === f(s)`
 *  - edge cases : string vide, espaces seulement, caractères non-latins
 *  - cas BTP réels (titre AO type cron BOAMP)
 */

import { describe, expect, it } from "vitest";

import { normalizeForMatching } from "./normalize";

describe("normalizeForMatching — accents français courants", () => {
  it("retire le circonflexe (â → a)", () => {
    expect(normalizeForMatching("Bâtiment")).toBe("batiment");
  });

  it("retire l'aigu majuscule (É → e)", () => {
    expect(normalizeForMatching("ÉCOLE")).toBe("ecole");
  });

  it("retire l'aigu minuscule dans un mot composé", () => {
    expect(normalizeForMatching("réhabilitation")).toBe("rehabilitation");
  });

  it("retire l'aigu + casse mixte sur expression multi-mots", () => {
    expect(normalizeForMatching("Équipement public")).toBe("equipement public");
  });

  it("retire grave + circonflexe + tréma + cédille dans une même string", () => {
    // à, ê, ï, ç → a, e, i, c
    expect(normalizeForMatching("Crèche à Noël maïs façade")).toBe("creche a noel mais facade");
  });
});

describe("normalizeForMatching — combinaison casse + accents", () => {
  it("majuscule accentuée + minuscule accentuée dans la même string", () => {
    expect(normalizeForMatching("Réhabilitation Énergétique")).toBe("rehabilitation energetique");
  });

  it("tout majuscules accentuées", () => {
    expect(normalizeForMatching("BÂTIMENT RÉNOVÉ")).toBe("batiment renove");
  });
});

describe("normalizeForMatching — no-op cases", () => {
  it("string sans accent reste identique (lowercase uniquement)", () => {
    expect(normalizeForMatching("travaux")).toBe("travaux");
  });

  it("string ASCII en majuscules → lowercase", () => {
    expect(normalizeForMatching("BTP")).toBe("btp");
  });

  it("idempotence : f(f(s)) === f(s)", () => {
    const inputs = [
      "Bâtiment réhabilitation école",
      "Équipement public",
      "travaux",
      "",
      "Côte d'Azur",
    ];
    for (const s of inputs) {
      const once = normalizeForMatching(s);
      const twice = normalizeForMatching(once);
      expect(twice).toBe(once);
    }
  });
});

describe("normalizeForMatching — edge cases", () => {
  it("string vide → string vide", () => {
    expect(normalizeForMatching("")).toBe("");
  });

  it("espaces seulement → espaces préservés (pas de trim)", () => {
    expect(normalizeForMatching("   ")).toBe("   ");
  });

  it("caractères non-latins passent sans erreur (pas de diacritiques à retirer)", () => {
    expect(normalizeForMatching("日本語")).toBe("日本語");
  });

  it("apostrophe préservée (pas de remove punctuation)", () => {
    expect(normalizeForMatching("Côte d'Azur")).toBe("cote d'azur");
  });
});

describe("normalizeForMatching — cas BTP réels (titre AO BOAMP)", () => {
  it("titre rénovation thermique école avec accents multiples", () => {
    expect(normalizeForMatching("Marché de réhabilitation thermique École Jean Moulin")).toBe(
      "marche de rehabilitation thermique ecole jean moulin",
    );
  });

  it("titre démolition + désamiantage (cas négatif typique)", () => {
    expect(normalizeForMatching("DÉMOLITION et désamiantage")).toBe("demolition et desamiantage");
  });
});
