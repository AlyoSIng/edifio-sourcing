/**
 * Tests filterReferencesTableXlsx — Steve 2026-06-05 (chantier R).
 *
 * Stratégie : on fabrique un .xlsx en mémoire avec SheetJS, on appelle la
 * fonction, on relit le .xlsx résultant pour valider les lignes conservées.
 *
 * MIGRATION MONOREPO (Lot 3, 2026-06-11) : fixtures réécrites de `exceljs`
 * vers `xlsx` (SheetJS) — mêmes scénarios, mêmes assertions.
 */

import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { filterReferencesTableXlsx } from "./references-table-filter";

// ---------------------------------------------------------------------------
// Helpers de fabrication
// ---------------------------------------------------------------------------

interface FixtureRow {
  /** Référence (n° de marché, titre…). */
  ref: string;
  /** Acheteur. */
  buyer: string;
  /** Cellule mots-clés (string brute, séparateurs au choix). */
  keywords: string;
}

/** Sérialise un workbook SheetJS en Uint8Array (.xlsx). */
function writeWorkbook(wb: XLSX.WorkBook): Uint8Array {
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

/** Construit un workbook 1 feuille « Références » depuis une matrice. */
function buildWorkbook(aoa: unknown[][]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Références");
  return wb;
}

/**
 * Construit un buffer .xlsx avec colonnes
 *   `Référence | Acheteur | Mots-clés | Montant`
 * et les lignes fournies. Utilisé pour les tests positifs.
 *
 * `headerOverride` permet de tester un en-tête personnalisé pour la colonne
 * keywords (accents, casse, etc.).
 */
async function buildFixtureXlsx(
  rows: FixtureRow[],
  headerOverride = "Mots-clés",
): Promise<Uint8Array> {
  const aoa: unknown[][] = [
    ["Référence", "Acheteur", headerOverride, "Montant"],
    ...rows.map((r) => [r.ref, r.buyer, r.keywords, "100000"]),
  ];
  return writeWorkbook(buildWorkbook(aoa));
}

/**
 * Construit un .xlsx sans colonne keywords pour tester le throw.
 */
async function buildXlsxWithoutKeywordsColumn(): Promise<Uint8Array> {
  return writeWorkbook(
    buildWorkbook([
      ["Référence", "Acheteur", "Montant"],
      ["R001", "Mairie X", "100000"],
    ]),
  );
}

/**
 * Relit le buffer .xlsx résultant et retourne les lignes (hors en-tête)
 * comme tableaux de string pour assertion.
 */
async function readBackRows(buffer: Uint8Array): Promise<string[][]> {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName = wb.SheetNames[0];
  const sheet = sheetName ? wb.Sheets[sheetName] : undefined;
  if (!sheet) return [];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  });
  return matrix.slice(1).map((row) => row.map((cell) => String(cell ?? "")));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("filterReferencesTableXlsx", () => {
  it("garde uniquement les lignes dont la cellule keywords matche le profil", async () => {
    const buffer = await buildFixtureXlsx([
      { ref: "R001", buyer: "Mairie de Lyon", keywords: "patrimoine, restauration" },
      { ref: "R002", buyer: "CC Sud", keywords: "scolaire" },
      { ref: "R003", buyer: "Mairie de Bron", keywords: "voirie, espaces verts" },
    ]);

    const result = await filterReferencesTableXlsx(buffer, ["patrimoine", "scolaire"]);

    expect(result.buffer).not.toBeNull();
    expect(result.totalRows).toBe(3);
    expect(result.keptRows).toBe(2);
    expect(result.keywordsColumnName).toBe("Mots-clés");

    const rows = await readBackRows(result.buffer!);
    expect(rows).toHaveLength(2);
    expect(rows[0]![0]).toBe("R001");
    expect(rows[1]![0]).toBe("R002");
  });

  it("accepte tous les séparateurs (virgule, point-virgule, retour ligne)", async () => {
    const buffer = await buildFixtureXlsx([
      { ref: "R001", buyer: "A", keywords: "patrimoine, abf" },
      { ref: "R002", buyer: "B", keywords: "scolaire; restauration" },
      { ref: "R003", buyer: "C", keywords: "voirie\nespaces verts" },
    ]);

    const result = await filterReferencesTableXlsx(buffer, ["abf", "voirie"]);

    expect(result.keptRows).toBe(2);
    const rows = await readBackRows(result.buffer!);
    expect(rows.map((r) => r[0])).toEqual(["R001", "R003"]);
  });

  it("matching insensible aux accents et à la casse", async () => {
    const buffer = await buildFixtureXlsx([
      { ref: "R001", buyer: "A", keywords: "Restauration de PATRIMOINE" },
    ]);

    const result = await filterReferencesTableXlsx(buffer, ["restauration de patrimoine"]);

    expect(result.keptRows).toBe(1);
  });

  it("accepte l'en-tête sans accent (« Mots cles »)", async () => {
    const buffer = await buildFixtureXlsx(
      [{ ref: "R001", buyer: "A", keywords: "patrimoine" }],
      "Mots cles",
    );

    const result = await filterReferencesTableXlsx(buffer, ["patrimoine"]);

    expect(result.keptRows).toBe(1);
    expect(result.keywordsColumnName).toBe("Mots cles");
  });

  it("accepte l'en-tête en majuscules (« MOTS-CLÉS »)", async () => {
    const buffer = await buildFixtureXlsx(
      [{ ref: "R001", buyer: "A", keywords: "patrimoine" }],
      "MOTS-CLÉS",
    );

    const result = await filterReferencesTableXlsx(buffer, ["patrimoine"]);

    expect(result.keptRows).toBe(1);
    expect(result.keywordsColumnName).toBe("MOTS-CLÉS");
  });

  it("retourne buffer=null si aucune ligne ne matche", async () => {
    const buffer = await buildFixtureXlsx([
      { ref: "R001", buyer: "A", keywords: "voirie" },
      { ref: "R002", buyer: "B", keywords: "scolaire" },
    ]);

    const result = await filterReferencesTableXlsx(buffer, ["patrimoine"]);

    expect(result.buffer).toBeNull();
    expect(result.totalRows).toBe(2);
    expect(result.keptRows).toBe(0);
  });

  it("retourne buffer=null si profilePositives est vide", async () => {
    const buffer = await buildFixtureXlsx([{ ref: "R001", buyer: "A", keywords: "patrimoine" }]);

    const result = await filterReferencesTableXlsx(buffer, []);

    expect(result.buffer).toBeNull();
    expect(result.keptRows).toBe(0);
  });

  it("retourne buffer=null si profilePositives est null", async () => {
    const buffer = await buildFixtureXlsx([{ ref: "R001", buyer: "A", keywords: "patrimoine" }]);

    const result = await filterReferencesTableXlsx(buffer, null);

    expect(result.buffer).toBeNull();
  });

  it("throw si la colonne « Mots-clés » est absente", async () => {
    const buffer = await buildXlsxWithoutKeywordsColumn();
    await expect(filterReferencesTableXlsx(buffer, ["patrimoine"])).rejects.toThrow(/Mots-cl/i);
  });

  it("ignore les lignes complètement vides", async () => {
    const buf = writeWorkbook(
      buildWorkbook([
        ["Référence", "Acheteur", "Mots-clés"],
        ["R001", "A", "patrimoine"],
        [], // ligne vide volontaire
        ["R002", "B", "patrimoine"],
      ]),
    );

    const result = await filterReferencesTableXlsx(buf, ["patrimoine"]);

    expect(result.totalRows).toBe(2);
    expect(result.keptRows).toBe(2);
  });

  it("conserve toutes les colonnes du tableau original (pas seulement keywords)", async () => {
    const buffer = await buildFixtureXlsx([
      { ref: "R001", buyer: "Mairie de Lyon", keywords: "patrimoine" },
    ]);

    const result = await filterReferencesTableXlsx(buffer, ["patrimoine"]);
    const rows = await readBackRows(result.buffer!);

    expect(rows).toHaveLength(1);
    // Référence | Acheteur | Mots-clés | Montant
    expect(rows[0]).toEqual(["R001", "Mairie de Lyon", "patrimoine", "100000"]);
  });
});
