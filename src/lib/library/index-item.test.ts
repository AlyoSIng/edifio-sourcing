/**
 * Tests unitaires — moteur d'indexation Claude pour items biblio.
 *
 * Stratégie : on mock le SDK Anthropic via vi.mock pour valider :
 *  - missing_api_key
 *  - extraction JSON (fences ```, sans fences)
 *  - parse_error (JSON invalide, schéma Zod non conforme)
 *  - succès happy path avec cost calculation
 *  - PDF natif vs metadata-only
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

import { libraryIndexOutputSchema } from "./index-item";

// ---------------------------------------------------------------------------
// Mock Anthropic SDK
// ---------------------------------------------------------------------------

const createMock = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: createMock };
  },
}));

// ---------------------------------------------------------------------------
// Import APRÈS le mock (sinon le module charge le vrai SDK).
// ---------------------------------------------------------------------------

import { indexLibraryItem } from "./index-item";

beforeEach(() => {
  createMock.mockReset();
  process.env.ANTHROPIC_API_KEY = "sk-test";
});

describe("libraryIndexOutputSchema", () => {
  it("accepte un payload complet conforme", () => {
    const result = libraryIndexOutputSchema.safeParse({
      extracted_title: "Attestation URSSAF",
      keywords: ["urssaf", "vigilance"],
      summary: "Attestation de vigilance valide 6 mois",
      doc_type: "urssaf",
      extracted_entities: { siret: "12345678901234" },
    });
    expect(result.success).toBe(true);
  });

  it("accepte les champs null/optionnels", () => {
    const result = libraryIndexOutputSchema.safeParse({
      keywords: [],
      extracted_entities: {},
    });
    expect(result.success).toBe(true);
  });

  it("refuse un doc_type hors liste", () => {
    const result = libraryIndexOutputSchema.safeParse({
      keywords: [],
      doc_type: "facture",
      extracted_entities: {},
    });
    expect(result.success).toBe(false);
  });

  it("refuse plus de 15 keywords", () => {
    const result = libraryIndexOutputSchema.safeParse({
      keywords: Array.from({ length: 16 }, (_, i) => `kw${i}`),
      extracted_entities: {},
    });
    expect(result.success).toBe(false);
  });
});

describe("indexLibraryItem — paths d'erreur", () => {
  it("retourne missing_api_key si ANTHROPIC_API_KEY absente", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const result = await indexLibraryItem({ itemName: "X.pdf", itemKind: "autre" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("missing_api_key");
  });

  it("retourne anthropic_error si l'API throw", async () => {
    createMock.mockRejectedValueOnce(new Error("network down"));
    const result = await indexLibraryItem({ itemName: "X.pdf", itemKind: "autre" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("anthropic_error");
      expect(result.message).toContain("network down");
    }
  });

  it("retourne anthropic_error si pas de text block", async () => {
    createMock.mockResolvedValueOnce({
      content: [],
      usage: { input_tokens: 100, output_tokens: 50 },
    });
    const result = await indexLibraryItem({ itemName: "X.pdf", itemKind: "autre" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("anthropic_error");
  });

  it("retourne parse_error si JSON invalide", async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: "text", text: "ce n'est pas du JSON" }],
      usage: { input_tokens: 100, output_tokens: 50 },
    });
    const result = await indexLibraryItem({ itemName: "X.pdf", itemKind: "autre" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("parse_error");
      expect(result.message).toContain("Invalid JSON");
    }
  });

  it("retourne parse_error si schéma Zod non conforme", async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: "text", text: JSON.stringify({ doc_type: "FACTURE_HORS_LISTE" }) }],
      usage: { input_tokens: 100, output_tokens: 50 },
    });
    const result = await indexLibraryItem({ itemName: "X.pdf", itemKind: "autre" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("parse_error");
      expect(result.message).toContain("Schema validation");
    }
  });
});

describe("indexLibraryItem — happy paths", () => {
  it("extrait correctement un payload JSON simple", async () => {
    createMock.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            extracted_title: "Attestation URSSAF valide",
            keywords: ["urssaf", "vigilance"],
            summary: "OK 6 mois",
            doc_type: "urssaf",
            extracted_entities: { siret: "12345678901234" },
          }),
        },
      ],
      usage: { input_tokens: 1000, output_tokens: 200 },
    });
    const result = await indexLibraryItem({ itemName: "URSSAF.pdf", itemKind: "urssaf" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output.extracted_title).toBe("Attestation URSSAF valide");
      expect(result.output.keywords).toEqual(["urssaf", "vigilance"]);
      expect(result.output.doc_type).toBe("urssaf");
      expect(result.tokensIn).toBe(1000);
      expect(result.tokensOut).toBe(200);
      expect(result.modelVersion).toBe("haiku-4-5");
      // Cost = (1000 × 0.8 + 200 × 4) / 1M = 0.0016$
      expect(result.costUsd).toBeCloseTo(0.0016, 5);
    }
  });

  it("extrait un JSON entouré de fences ```json", async () => {
    createMock.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: '```json\n{"keywords":[],"doc_type":"autre","extracted_entities":{}}\n```',
        },
      ],
      usage: { input_tokens: 500, output_tokens: 50 },
    });
    const result = await indexLibraryItem({ itemName: "X.pdf", itemKind: "autre" });
    expect(result.ok).toBe(true);
  });

  it("extrait un JSON entouré de fences ``` (sans 'json')", async () => {
    createMock.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: '```\n{"keywords":[],"doc_type":null,"extracted_entities":{}}\n```',
        },
      ],
      usage: { input_tokens: 500, output_tokens: 50 },
    });
    const result = await indexLibraryItem({ itemName: "X.pdf", itemKind: "autre" });
    expect(result.ok).toBe(true);
  });

  it("envoie un PDF natif quand pdfBytes fourni", async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: "text", text: JSON.stringify({ keywords: [], extracted_entities: {} }) }],
      usage: { input_tokens: 5000, output_tokens: 100 },
    });
    const fakePdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
    await indexLibraryItem({ itemName: "X.pdf", itemKind: "kbis", pdfBytes: fakePdf });
    const call = createMock.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    const userMsg = call.messages[0];
    expect(Array.isArray(userMsg.content)).toBe(true);
    const docBlock = userMsg.content.find((b: { type: string }) => b.type === "document");
    expect(docBlock).toBeDefined();
    expect(docBlock.source.media_type).toBe("application/pdf");
  });

  it("n'envoie PAS de PDF si pdfBytes absent", async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: "text", text: JSON.stringify({ keywords: [], extracted_entities: {} }) }],
      usage: { input_tokens: 100, output_tokens: 50 },
    });
    await indexLibraryItem({ itemName: "X.docx", itemKind: "references" });
    const call = createMock.mock.calls[0]?.[0];
    const userMsg = call.messages[0];
    const docBlock = userMsg.content.find((b: { type: string }) => b.type === "document");
    expect(docBlock).toBeUndefined();
  });
});
