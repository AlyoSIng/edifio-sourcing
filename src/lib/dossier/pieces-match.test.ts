/**
 * Tests unitaires — pieces-match.ts
 *
 * Couvre :
 *   - `available` : 2+ mots communs significatifs
 *   - `partial`   : 1 mot commun significatif
 *   - `missing`   : 0 mot commun
 *   - Normalisation accents (référence → reference)
 *   - Mots courts ignorés (<= 3 chars)
 *   - Bibliothèque vide → tout missing
 *   - Pièces vides → tout missing
 */

import { describe, expect, it } from "vitest";

import { matchPiecesWithLibrary } from "./pieces-match";
import type { PresentationLibraryItem } from "@/db/schema/library";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeLibItem(id: string, kind: string, name: string): PresentationLibraryItem {
  return {
    id,
    organizationId: "org-1",
    kind,
    name,
    storagePath: `lib/${id}.pdf`,
    sizeBytes: null,
    validUntil: null,
    notes: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  };
}

function makePiece(nom: string) {
  return {
    nom,
    format: null,
    signature_requise: false,
    obligatoire: true,
    provenance: { page: 1, citation: "extrait test" },
  };
}

const library: PresentationLibraryItem[] = [
  makeLibItem("1", "attestation", "Attestation de vigilance URSSAF"),
  makeLibItem("2", "reference", "Références de maîtrise d'œuvre BTP"),
  makeLibItem("3", "presentation", "Présentation générale société AlyoS"),
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("matchPiecesWithLibrary", () => {
  it("retourne available quand 2 mots significatifs matchent", () => {
    const pieces = [makePiece("Attestation URSSAF vigilance")];
    const result = matchPiecesWithLibrary(pieces, library);
    expect(result[0]?.status).toBe("available");
    expect(result[0]?.libraryItem?.id).toBe("1");
  });

  it("retourne partial quand 1 seul mot significatif matche", () => {
    // "URSSAF" uniquement → 1 mot → partial
    const pieces = [makePiece("Document URSSAF")];
    const result = matchPiecesWithLibrary(pieces, library);
    expect(result[0]?.status).toBe("partial");
  });

  it("retourne missing quand aucun mot ne matche", () => {
    const pieces = [makePiece("Formulaire kbis extrait")];
    const result = matchPiecesWithLibrary(pieces, library);
    expect(result[0]?.status).toBe("missing");
    expect(result[0]?.libraryItem).toBeNull();
  });

  it("normalise les accents (référence → reference)", () => {
    const pieces = [makePiece("Références maîtrise œuvre")];
    const result = matchPiecesWithLibrary(pieces, library);
    // "references" "maitrise" "oeuvre" peuvent matcher "reference" "maitrise" "oeuvre"
    expect(result[0]?.status).not.toBe("missing");
  });

  it("ignore les mots de 3 caractères ou moins", () => {
    // "DC1" est ignoré (longueur 3), "bon" est ignoré (longueur 3)
    const pieces = [makePiece("DC1 bon AO")];
    const result = matchPiecesWithLibrary(pieces, library);
    expect(result[0]?.status).toBe("missing");
  });

  it("retourne missing pour tout si la bibliothèque est vide", () => {
    const pieces = [makePiece("Attestation URSSAF"), makePiece("Références BTP maîtrise")];
    const result = matchPiecesWithLibrary(pieces, []);
    expect(result.every((r) => r.status === "missing")).toBe(true);
  });

  it("retourne un tableau de même longueur que pieces", () => {
    const pieces = [
      makePiece("Attestation URSSAF vigilance"),
      makePiece("Références maîtrise œuvre BTP"),
      makePiece("Formulaire kbis inexistant"),
    ];
    const result = matchPiecesWithLibrary(pieces, library);
    expect(result).toHaveLength(3);
  });

  it("préserve l'ordre des pièces en entrée", () => {
    const pieces = [
      makePiece("Formulaire kbis inexistant"),
      makePiece("Attestation URSSAF vigilance"),
    ];
    const result = matchPiecesWithLibrary(pieces, library);
    expect(result[0]?.status).toBe("missing");
    expect(result[1]?.status).toBe("available");
  });

  it("pièce avec nom vide (0 tokens) → missing", () => {
    const pieces = [makePiece("DC1")]; // trop court, 0 tokens significatifs
    const result = matchPiecesWithLibrary(pieces, library);
    expect(result[0]?.status).toBe("missing");
  });
});
