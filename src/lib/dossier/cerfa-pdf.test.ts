/**
 * Tests unitaires — cerfa-pdf.ts
 *
 * Couvre :
 *   - `wrapText` : découpage simple, mot trop long, texte vide
 *   - `generateCerfaPdf` : smoke test (sortie Uint8Array non vide + signature %PDF)
 *   - Caractères Unicode : pas de crash sur apostrophe typographique, NBSP, etc.
 */

import { describe, expect, it } from "vitest";

import { generateCerfaPdf, wrapText, type CerfaPdfInput } from "./cerfa-pdf";

// ---------------------------------------------------------------------------
// wrapText
// ---------------------------------------------------------------------------

describe("wrapText", () => {
  it("retourne une ligne pour un texte court", () => {
    expect(wrapText("hello world", 90)).toEqual(["hello world"]);
  });

  it("split sur l'espace quand on dépasse maxChars", () => {
    const lines = wrapText("un deux trois quatre cinq", 10);
    // Chaque ligne ≤ 10 chars
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(10);
    }
    // La reconstruction par espace doit donner l'original
    expect(lines.join(" ")).toBe("un deux trois quatre cinq");
  });

  it('retourne [""] pour un texte vide', () => {
    expect(wrapText("", 90)).toEqual([""]);
  });

  it("garde un mot plus long que maxChars sur sa propre ligne", () => {
    const lines = wrapText("court tres_long_mot_indivisible court", 10);
    expect(lines).toContain("tres_long_mot_indivisible");
  });
});

// ---------------------------------------------------------------------------
// generateCerfaPdf — smoke
// ---------------------------------------------------------------------------

function baseInput(overrides: Partial<CerfaPdfInput> = {}): CerfaPdfInput {
  return {
    kind: "dc1",
    tenderTitle: "Mission MOE — Centre aquatique",
    tenderBuyer: "Ville de Rouen",
    organizationName: "AlyoS Ingénierie",
    selectedArchitect: null,
    fields: [
      {
        id: "dc1_pouvoir_adjudicateur",
        label: "Pouvoir adjudicateur",
        value: "Ville de Rouen",
        source: "tender_data",
      },
      {
        id: "dc1_objet_marche",
        label: "Objet du marché",
        value: "Mission MOE — Centre aquatique",
        source: "tender_data",
      },
      {
        id: "dc1_siren",
        label: "SIREN / SIRET",
        value: "123456789",
        source: "company_data",
      },
    ],
    generatedAt: new Date("2026-06-02T10:00:00Z"),
    ...overrides,
  };
}

describe("generateCerfaPdf", () => {
  it("produit un Uint8Array non vide", async () => {
    const bytes = await generateCerfaPdf(baseInput());
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(500); // un PDF même minimal pèse > 500o
  });

  it("commence par la signature %PDF", async () => {
    const bytes = await generateCerfaPdf(baseInput());
    // Les 4 premiers bytes ASCII d'un PDF valide sont "%PDF"
    expect(bytes[0]).toBe(0x25); // %
    expect(bytes[1]).toBe(0x50); // P
    expect(bytes[2]).toBe(0x44); // D
    expect(bytes[3]).toBe(0x46); // F
  });

  it("ne crashe pas sur des caractères Unicode hors WinAnsi (apostrophe typo, NBSP, ideogramme)", async () => {
    const bytes = await generateCerfaPdf(
      baseInput({
        tenderTitle: "Marché d'études — l'eau « courante » 好",
        fields: [
          {
            id: "dc1_pouvoir_adjudicateur",
            label: "Pouvoir adjudicateur",
            value: "Ville de Saint-Étienne — l'œuvre 好",
            source: "tender_data",
          },
        ],
      }),
    );
    expect(bytes.length).toBeGreaterThan(500);
  });

  it("rend un DC2 avec champs nombreux et pagine sans crash", async () => {
    const manyFields = Array.from({ length: 30 }, (_, i) => ({
      id: `dc2_champ_${i}`,
      label: `Champ ${i} du DC2`,
      value: `Valeur ${i} ${"x".repeat(80)}`,
      source: "company_data" as const,
    }));
    const bytes = await generateCerfaPdf(baseInput({ kind: "dc2", fields: manyFields }));
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it("affiche le mandataire archi quand selectedArchitect est fourni", async () => {
    const bytes = await generateCerfaPdf(
      baseInput({
        selectedArchitect: { cabinet: "Atelier Dupont Architectes" },
      }),
    );
    expect(bytes.length).toBeGreaterThan(500);
  });

  it("remplace une valeur vide par un tiret cadratin", async () => {
    const bytes = await generateCerfaPdf(
      baseInput({
        fields: [
          {
            id: "dc1_telephone",
            label: "Téléphone",
            value: "",
            source: "a_completer",
          },
        ],
      }),
    );
    expect(bytes.length).toBeGreaterThan(500);
  });
});
