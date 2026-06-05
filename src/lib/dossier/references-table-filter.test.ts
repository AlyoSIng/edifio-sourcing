/**
 * Tests filterReferencesTableXlsx — Steve 2026-06-05 (chantier R).
 *
 * Stratégie : on fabrique un .xlsx en mémoire avec ExcelJS, on appelle la
 * fonction, on relit le .xlsx résultant pour valider les lignes conservées.
 */

import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";

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
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Références");
  sheet.addRow(["Référence", "Acheteur", headerOverride, "Montant"]);
  for (const r of rows) {
    sheet.addRow([r.ref, r.buyer, r.keywords, "100000"]);
  }
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf);
}

/**
 * Construit un .xlsx sans colonne keywords pour tester le throw.
 */
async function buildXlsxWithoutKeywordsColumn(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Références");
  sheet.addRow(["Référence", "Acheteur", "Montant"]);
  sheet.addRow(["R001", "Mairie X", "100000"]);
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf);
}

/**
 * Relit le buffer .xlsx résultant et retourne les lignes (hors en-tête)
 * comme tableaux de string pour assertion.
 */
async function readBackRows(buffer: Uint8Array): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer.buffer as ArrayBuffer);
  const sheet = wb.worksheets[0];
  if (!sheet) return [];
  const out: string[][] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // skip header
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      cells.push(String(cell.value ?? ""));
    });
    out.push(cells);
  });
  return out;
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
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("Références");
    sheet.addRow(["Référence", "Acheteur", "Mots-clés"]);
    sheet.addRow(["R001", "A", "patrimoine"]);
    sheet.addRow([]); // ligne vide volontaire
    sheet.addRow(["R002", "B", "patrimoine"]);
    const buf = new Uint8Array(await wb.xlsx.writeBuffer());

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
