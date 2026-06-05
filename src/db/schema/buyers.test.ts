/**
 * Tests normalizeBuyerName — clé du matching de l'annuaire acheteurs.
 * Steve 2026-06-04 (Q1).
 */

import { describe, expect, it } from "vitest";

import { normalizeBuyerName } from "./buyers";

describe("normalizeBuyerName", () => {
  it("lowercase", () => {
    expect(normalizeBuyerName("MAIRIE DE LYON")).toBe("mairie de lyon");
  });

  it("supprime les accents (NFD)", () => {
    expect(normalizeBuyerName("École Nationale d'Hôtellerie")).toBe("ecole nationale d'hotellerie");
  });

  it("compacte les espaces multiples", () => {
    expect(normalizeBuyerName("Mairie   de    Lyon")).toBe("mairie de lyon");
  });

  it("trim début et fin", () => {
    expect(normalizeBuyerName("  Mairie de Lyon  ")).toBe("mairie de lyon");
  });

  it("idempotent (normalisation x2 == x1)", () => {
    const once = normalizeBuyerName("Mairie de Saint-Étienne");
    expect(normalizeBuyerName(once)).toBe(once);
  });

  it("matche les variations courantes de la même entité", () => {
    expect(normalizeBuyerName("Mairie de Lyon")).toBe(normalizeBuyerName("MAIRIE DE LYON"));
    expect(normalizeBuyerName("Mairie  de Lyon")).toBe(normalizeBuyerName("Mairie de Lyon"));
    expect(normalizeBuyerName("École")).toBe(normalizeBuyerName("ecole"));
  });

  it("NE matche PAS deux entités vraiment différentes", () => {
    expect(normalizeBuyerName("Mairie de Lyon")).not.toBe(
      normalizeBuyerName("Mairie de Marseille"),
    );
    // Note : « Mairie de Lyon » et « Ville de Lyon » restent distincts
    // au MVP — Steve devra faire un merge manuel si besoin (V2).
    expect(normalizeBuyerName("Mairie de Lyon")).not.toBe(normalizeBuyerName("Ville de Lyon"));
  });
});
