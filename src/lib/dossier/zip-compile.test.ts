/**
 * Tests vitest — compileDossierZip (H2 Steve 2026-06-04).
 *
 * Stratégie : mock Supabase Storage via un objet local `{ from(bucket) →
 * { download(path) → Blob } }`. On contrôle exactement quels paths
 * répondent quoi, et on parse le ZIP résultat via fflate.
 */

import { describe, expect, it } from "vitest";
import { strToU8, unzipSync } from "fflate";

import { compileDossierZip } from "./zip-compile";
import type { PresentationLibraryItem } from "@/db/schema/library";
import type { PieceMatch } from "@/lib/dossier/pieces-match";

// ---------------------------------------------------------------------------
// Mock Supabase Storage
// ---------------------------------------------------------------------------

/**
 * Construit un client Supabase storage mocké à partir d'une table
 * `{ "bucket/path" → string content | null (= échec) }`.
 *
 * Type erasure avec `unknown as SupabaseClient` — on n'utilise QUE la
 * méthode `storage.from(bucket).download(path)` dans compileDossierZip.
 */
function makeStorageMock(table: Record<string, string | null>) {
  const downloads: string[] = [];
  const client = {
    storage: {
      from(bucket: string) {
        return {
          async download(path: string) {
            const key = `${bucket}/${path}`;
            downloads.push(key);
            const value = table[key];
            if (value === undefined) {
              return { data: null, error: { message: `not found: ${key}` } };
            }
            if (value === null) {
              return { data: null, error: { message: `simulated failure: ${key}` } };
            }
            // Blob avec .arrayBuffer() — c'est ce que compileDossierZip consomme.
            return {
              data: {
                arrayBuffer: async () => {
                  const u8 = strToU8(value);
                  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
                },
              },
              error: null,
            };
          },
        };
      },
    },
  };
  return { client: client as unknown as Parameters<typeof compileDossierZip>[0], downloads };
}

function makeLibItem(id: string, name: string, kind = "autre"): PresentationLibraryItem {
  return {
    id,
    organizationId: "org-1",
    kind,
    name,
    storagePath: `org-1/${id}.pdf`,
    sizeBytes: null,
    validUntil: null,
    notes: null,
    matchingKeywords: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  };
}

function makePieceMatch(libItem: PresentationLibraryItem | null): PieceMatch {
  return {
    piece: {
      nom: "Attestation URSSAF",
      format: null,
      signature_requise: false,
      obligatoire: true,
      provenance: { page: 1, citation: "extrait" },
    },
    status: libItem ? "available" : "missing",
    libraryItem: libItem,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("compileDossierZip — sections principales", () => {
  it("inclut DC1 et DC2 dans dossier_candidature/CERFA/", async () => {
    const { client } = makeStorageMock({
      "response_files/org-1/dc1.pdf": "DC1 CONTENT",
      "response_files/org-1/dc2.pdf": "DC2 CONTENT",
    });
    const result = await compileDossierZip(client, {
      dc1: {
        id: "1",
        kind: "dc1",
        name: "DC1",
        storagePath: "org-1/dc1.pdf",
        createdAt: new Date(),
      },
      dc2: {
        id: "2",
        kind: "dc2",
        name: "DC2",
        storagePath: "org-1/dc2.pdf",
        createdAt: new Date(),
      },
      pieceMatches: [],
    });
    expect(result.fileCount).toBe(2);
    expect(result.hadDownloadFailures).toBe(false);
    const files = unzipSync(result.buffer);
    expect(Object.keys(files).sort()).toEqual([
      "dossier_candidature/CERFA/DC1.pdf",
      "dossier_candidature/CERFA/DC2.pdf",
    ]);
  });

  it("inclut le Pouvoir forcé dans dossier_candidature/", async () => {
    const pouvoir = makeLibItem("pouv-1", "pouvoir.docx", "pouvoir_mandataire");
    const { client } = makeStorageMock({
      [`company_library/${pouvoir.storagePath}`]: "POUVOIR CONTENT",
    });
    const result = await compileDossierZip(client, {
      dc1: null,
      dc2: null,
      pieceMatches: [],
      forcedLibraryItems: [{ item: pouvoir, targetFilename: "pouvoir_mandataire.docx" }],
    });
    expect(result.fileCount).toBe(1);
    const files = unzipSync(result.buffer);
    expect(Object.keys(files)).toEqual(["dossier_candidature/pouvoir_mandataire.docx"]);
  });

  it("inclut un tender document (ex: RC) à la racine du dossier", async () => {
    const { client } = makeStorageMock({
      "tender_documents/tenders/abc/rc.pdf": "RC SOURCE",
    });
    const result = await compileDossierZip(client, {
      dc1: null,
      dc2: null,
      pieceMatches: [],
      tenderDocuments: [{ storagePath: "tenders/abc/rc.pdf", targetFilename: "RC.pdf" }],
    });
    expect(result.fileCount).toBe(1);
    const files = unzipSync(result.buffer);
    expect(Object.keys(files)).toEqual(["dossier_candidature/RC.pdf"]);
  });

  it("inclut les pièces matchées available dans dossier_candidature/pieces/", async () => {
    const lib1 = makeLibItem("lib-1", "Attestation URSSAF.pdf");
    const { client } = makeStorageMock({
      [`company_library/${lib1.storagePath}`]: "URSSAF CONTENT",
    });
    const result = await compileDossierZip(client, {
      dc1: null,
      dc2: null,
      pieceMatches: [makePieceMatch(lib1)],
    });
    expect(result.fileCount).toBe(1);
    const files = unzipSync(result.buffer);
    expect(Object.keys(files)).toEqual(["dossier_candidature/pieces/Attestation_URSSAF.pdf"]);
  });

  it("inclut les extra library items dans pieces/ aussi", async () => {
    const extra = makeLibItem("extra-1", "Référence.pdf", "references");
    const { client } = makeStorageMock({
      [`company_library/${extra.storagePath}`]: "REF CONTENT",
    });
    const result = await compileDossierZip(client, {
      dc1: null,
      dc2: null,
      pieceMatches: [],
      extraLibraryItems: [extra],
    });
    expect(result.fileCount).toBe(1);
    const files = unzipSync(result.buffer);
    expect(Object.keys(files)).toEqual(["dossier_candidature/pieces/R_f_rence.pdf"]);
  });
});

describe("compileDossierZip — dédoublonnage", () => {
  it("ne réinclut PAS un item déjà forcé dans les extra", async () => {
    const pouvoir = makeLibItem("pouv-1", "Pouvoir.docx", "pouvoir_mandataire");
    const { client, downloads } = makeStorageMock({
      [`company_library/${pouvoir.storagePath}`]: "CONTENT",
    });
    const result = await compileDossierZip(client, {
      dc1: null,
      dc2: null,
      pieceMatches: [],
      forcedLibraryItems: [{ item: pouvoir, targetFilename: "pouvoir.docx" }],
      extraLibraryItems: [pouvoir], // même item présent en extra
    });
    expect(result.fileCount).toBe(1);
    // Le download n'a été fait QU'UNE FOIS — la branche extra a skipé via seenLibraryIds.
    expect(downloads.filter((d) => d.includes(pouvoir.storagePath))).toHaveLength(1);
  });

  it("ne réinclut PAS un item déjà matché dans les extra", async () => {
    const lib1 = makeLibItem("lib-1", "URSSAF.pdf");
    const { client, downloads } = makeStorageMock({
      [`company_library/${lib1.storagePath}`]: "URSSAF",
    });
    const result = await compileDossierZip(client, {
      dc1: null,
      dc2: null,
      pieceMatches: [makePieceMatch(lib1)],
      extraLibraryItems: [lib1],
    });
    expect(result.fileCount).toBe(1);
    expect(downloads.filter((d) => d.includes(lib1.storagePath))).toHaveLength(1);
  });

  it("dédup deux matched qui pointent sur le même libItem", async () => {
    const lib1 = makeLibItem("lib-1", "URSSAF.pdf");
    const { client } = makeStorageMock({
      [`company_library/${lib1.storagePath}`]: "URSSAF",
    });
    const result = await compileDossierZip(client, {
      dc1: null,
      dc2: null,
      pieceMatches: [makePieceMatch(lib1), makePieceMatch(lib1)],
    });
    expect(result.fileCount).toBe(1);
  });
});

describe("compileDossierZip — résilience téléchargements", () => {
  it("hadDownloadFailures=true si DC1 manque (table n'a pas la clef)", async () => {
    const { client } = makeStorageMock({});
    const result = await compileDossierZip(client, {
      dc1: {
        id: "1",
        kind: "dc1",
        name: "DC1",
        storagePath: "missing/dc1.pdf",
        createdAt: new Date(),
      },
      dc2: null,
      pieceMatches: [],
    });
    expect(result.fileCount).toBe(0);
    expect(result.hadDownloadFailures).toBe(true);
  });

  it("hadDownloadFailures=true si Storage retourne une error", async () => {
    const { client } = makeStorageMock({
      "response_files/x.pdf": null, // = échec simulé
    });
    const result = await compileDossierZip(client, {
      dc1: { id: "1", kind: "dc1", name: "DC1", storagePath: "x.pdf", createdAt: new Date() },
      dc2: null,
      pieceMatches: [],
    });
    expect(result.fileCount).toBe(0);
    expect(result.hadDownloadFailures).toBe(true);
  });

  it("continue avec les fichiers OK même si certains foirent", async () => {
    const lib1 = makeLibItem("lib-1", "URSSAF.pdf");
    const lib2 = makeLibItem("lib-2", "DGFIP.pdf");
    const { client } = makeStorageMock({
      [`company_library/${lib1.storagePath}`]: "OK1",
      // lib2 absent — failure
    });
    const result = await compileDossierZip(client, {
      dc1: null,
      dc2: null,
      pieceMatches: [makePieceMatch(lib1), makePieceMatch(lib2)],
    });
    expect(result.fileCount).toBe(1); // seul lib1 a marché
    expect(result.hadDownloadFailures).toBe(true);
  });
});

describe("compileDossierZip — cas de bord", () => {
  it("retourne buffer vide + fileCount=0 si rien n'est inclus", async () => {
    const { client } = makeStorageMock({});
    const result = await compileDossierZip(client, {
      dc1: null,
      dc2: null,
      pieceMatches: [],
    });
    expect(result.fileCount).toBe(0);
    expect(result.buffer.byteLength).toBe(0);
  });

  it("sanitize les caractères dangereux dans targetFilename", async () => {
    const pouvoir = makeLibItem("pouv-1", "x.docx", "pouvoir_mandataire");
    const { client } = makeStorageMock({
      [`company_library/${pouvoir.storagePath}`]: "CONTENT",
    });
    const result = await compileDossierZip(client, {
      dc1: null,
      dc2: null,
      pieceMatches: [],
      forcedLibraryItems: [{ item: pouvoir, targetFilename: "pouvoir/évil <>:.docx" }],
    });
    const files = unzipSync(result.buffer);
    const paths = Object.keys(files);
    expect(paths).toHaveLength(1);
    // Les caractères non-alphanum ont été remplacés par _.
    expect(paths[0]).toMatch(/^dossier_candidature\/pouvoir_.+\.docx$/);
    expect(paths[0]).not.toContain("/évil");
    expect(paths[0]).not.toContain("<");
  });

  it("ignore les piece matches status=missing (libraryItem null)", async () => {
    const { client } = makeStorageMock({});
    const result = await compileDossierZip(client, {
      dc1: null,
      dc2: null,
      pieceMatches: [makePieceMatch(null)],
    });
    expect(result.fileCount).toBe(0);
    expect(result.hadDownloadFailures).toBe(false);
  });

  it("conserve l'extension via extensionFromStoragePath", async () => {
    const { client } = makeStorageMock({
      "response_files/org-1/dc1.docx": "DC1 DOCX",
    });
    const result = await compileDossierZip(client, {
      dc1: {
        id: "1",
        kind: "dc1",
        name: "DC1",
        storagePath: "org-1/dc1.docx",
        createdAt: new Date(),
      },
      dc2: null,
      pieceMatches: [],
    });
    const files = unzipSync(result.buffer);
    expect(Object.keys(files)).toEqual(["dossier_candidature/CERFA/DC1.docx"]);
  });
});
