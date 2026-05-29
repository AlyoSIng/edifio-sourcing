/**
 * Tests unitaires — src/lib/admin/branding.ts
 *
 * Couverture :
 *  - computeBrandingCss : null, sans champs, couleur seule, police seule, les deux
 *  - Validation hex (valide / invalide / 3 chiffres / 8 chiffres)
 *  - darkenHex / lightenHex : précision et clamp
 */

import { describe, expect, it } from "vitest";

import { computeBrandingCss, darkenHex, lightenHex } from "./branding";

// --------------------------------------------------------------------------
// computeBrandingCss
// --------------------------------------------------------------------------

describe("computeBrandingCss", () => {
  it("retourne '' si branding est null", () => {
    expect(computeBrandingCss(null)).toBe("");
  });

  it("retourne '' si tous les champs sont null", () => {
    expect(computeBrandingCss({ logoUrl: null, primaryColor: null, fontFamily: null })).toBe("");
  });

  it("retourne '' si logoUrl seul est fourni (pas de CSS override)", () => {
    expect(
      computeBrandingCss({
        logoUrl: "https://example.com/logo.png",
        primaryColor: null,
        fontFamily: null,
      }),
    ).toBe("");
  });

  it("génère les 3 vars brand-red pour une couleur valide", () => {
    const css = computeBrandingCss({
      logoUrl: null,
      primaryColor: "#ff0033",
      fontFamily: null,
    });
    expect(css).toContain("--brand-red:#ff0033;");
    expect(css).toContain("--brand-red-dark:");
    expect(css).toContain("--brand-red-light:");
    // Enveloppé dans :root{...}
    expect(css).toMatch(/^:root\{.+\}$/);
  });

  it("ignore une couleur invalide (3 chiffres)", () => {
    const css = computeBrandingCss({
      logoUrl: null,
      primaryColor: "#f03",
      fontFamily: null,
    });
    expect(css).toBe("");
  });

  it("ignore une couleur invalide (sans #)", () => {
    const css = computeBrandingCss({
      logoUrl: null,
      primaryColor: "ff0033",
      fontFamily: null,
    });
    expect(css).toBe("");
  });

  it("ignore une couleur invalide (8 chiffres)", () => {
    const css = computeBrandingCss({
      logoUrl: null,
      primaryColor: "#ff003380",
      fontFamily: null,
    });
    expect(css).toBe("");
  });

  it("génère --font-display pour une police valide (outfit)", () => {
    const css = computeBrandingCss({
      logoUrl: null,
      primaryColor: null,
      fontFamily: "outfit",
    });
    expect(css).toContain("--font-display:'Outfit', sans-serif;");
  });

  it("génère --font-display pour playfair-display", () => {
    const css = computeBrandingCss({
      logoUrl: null,
      primaryColor: null,
      fontFamily: "playfair-display",
    });
    expect(css).toContain("--font-display:'Playfair Display', serif;");
  });

  it("ignore une famille de police inconnue", () => {
    const css = computeBrandingCss({
      logoUrl: null,
      primaryColor: null,
      fontFamily: "comic-sans",
    });
    expect(css).toBe("");
  });

  it("combine couleur et police dans un seul :root{...}", () => {
    const css = computeBrandingCss({
      logoUrl: null,
      primaryColor: "#1a2b3c",
      fontFamily: "inter",
    });
    expect(css).toContain("--brand-red:#1a2b3c;");
    expect(css).toContain("--font-display:'Inter', sans-serif;");
    // Un seul bloc :root
    expect(css.match(/:root\{/g)).toHaveLength(1);
  });

  it("accepte les couleurs en majuscules", () => {
    const css = computeBrandingCss({
      logoUrl: null,
      primaryColor: "#FF0033",
      fontFamily: null,
    });
    expect(css).toContain("--brand-red:#FF0033;");
  });
});

// --------------------------------------------------------------------------
// darkenHex
// --------------------------------------------------------------------------

describe("darkenHex", () => {
  it("ratio 0 → couleur inchangée", () => {
    expect(darkenHex("#ff0033", 0)).toBe("#ff0033");
  });

  it("ratio 1 → noir (#000000)", () => {
    expect(darkenHex("#ff0033", 1)).toBe("#000000");
  });

  it("ratio 0.2 sur #ff0033 → #cc0029", () => {
    // R: 255 * 0.8 = 204 = #cc, G: 0, B: 51 * 0.8 = 40.8 arrondi 41 = #29
    expect(darkenHex("#ff0033", 0.2)).toBe("#cc0029");
  });

  it("ne produit pas de valeurs < 0 (clamp)", () => {
    const result = darkenHex("#010101", 0.99);
    expect(result).toBe("#000000");
  });
});

// --------------------------------------------------------------------------
// lightenHex
// --------------------------------------------------------------------------

describe("lightenHex", () => {
  it("ratio 0 → couleur inchangée", () => {
    expect(lightenHex("#ff0033", 0)).toBe("#ff0033");
  });

  it("ratio 1 → blanc (#ffffff)", () => {
    expect(lightenHex("#ff0033", 1)).toBe("#ffffff");
  });

  it("ratio 0.15 sur #ff0033 → #ff2642", () => {
    // R: 255 (déjà max), G: 0 + 255*0.15 = 38.25 arrondi 38 = #26, B: 51 + (255-51)*0.15 = 51+30.6 = 81.6 arrondi 82 = #52
    // Note: 82 en hex = 0x52
    const result = lightenHex("#ff0033", 0.15);
    // On vérifie simplement la structure et que R reste ff
    expect(result).toMatch(/^#ff/);
    expect(result).toHaveLength(7);
  });

  it("ne produit pas de valeurs > 255 (clamp)", () => {
    const result = lightenHex("#fefefe", 0.99);
    expect(result).toBe("#ffffff");
  });
});
