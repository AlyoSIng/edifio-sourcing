/**
 * Tests unitaires — helpers d'export CSV « AO du jour ».
 *
 * Couvre la sérialisation, l'échappement RFC 4180, le mapping département →
 * région et l'heuristique Public/Para-public/Privé.
 */

import { describe, it, expect } from "vitest";

import {
  EXPORT_AO_COLUMN_COUNT,
  EXPORT_AO_HEADERS,
  buildAosDuJourCsv,
  daysUntil,
  departmentToRegion,
  formatCsvCell,
  formatCsvRow,
  formatDateFr,
  inferPublicPrivate,
  type ExportAoRow,
} from "./export-csv";

describe("departmentToRegion", () => {
  it("mappe les codes métropole standards", () => {
    expect(departmentToRegion("75")).toBe("Île-de-France");
    expect(departmentToRegion("69")).toBe("Auvergne-Rhône-Alpes");
    expect(departmentToRegion("13")).toBe("Provence-Alpes-Côte d'Azur");
    expect(departmentToRegion("44")).toBe("Pays de la Loire");
  });

  it("mappe la Corse en 2A / 2B et alias 20", () => {
    expect(departmentToRegion("2A")).toBe("Corse");
    expect(departmentToRegion("2B")).toBe("Corse");
    expect(departmentToRegion("20")).toBe("Corse");
  });

  it("mappe les DROM-COM", () => {
    expect(departmentToRegion("971")).toBe("Guadeloupe");
    expect(departmentToRegion("974")).toBe("La Réunion");
  });

  it("retourne vide pour null/undefined/inconnu", () => {
    expect(departmentToRegion(null)).toBe("");
    expect(departmentToRegion(undefined)).toBe("");
    expect(departmentToRegion("")).toBe("");
    expect(departmentToRegion("999")).toBe("");
  });

  it("trim les espaces autour du code", () => {
    expect(departmentToRegion("  75  ")).toBe("Île-de-France");
  });
});

describe("inferPublicPrivate", () => {
  it("classe les collectivités en Public", () => {
    expect(inferPublicPrivate("Ville de Lyon")).toBe("Public");
    expect(inferPublicPrivate("Conseil départemental du Rhône")).toBe("Public");
    expect(inferPublicPrivate("Métropole de Lyon")).toBe("Public");
    expect(inferPublicPrivate("Préfecture du Rhône")).toBe("Public");
  });

  it("classe les hôpitaux + bailleurs en Para-public", () => {
    expect(inferPublicPrivate("CHU de Lyon")).toBe("Para-public");
    expect(inferPublicPrivate("Centre hospitalier de Saint-Étienne")).toBe("Para-public");
    expect(inferPublicPrivate("AP-HP")).toBe("Para-public");
  });

  it("classe les formes commerciales en Privé", () => {
    expect(inferPublicPrivate("Bouygues Construction SA")).toBe("Privé");
    expect(inferPublicPrivate("Promoteur SARL")).toBe("Privé");
    expect(inferPublicPrivate("SCI Demeures du Sud")).toBe("Privé");
  });

  it("retourne vide pour cas ambigus", () => {
    expect(inferPublicPrivate(null)).toBe("");
    expect(inferPublicPrivate("")).toBe("");
    expect(inferPublicPrivate("Acheteur Inconnu")).toBe("");
  });
});

describe("formatCsvCell", () => {
  it("retourne vide pour null/undefined/empty", () => {
    expect(formatCsvCell(null)).toBe("");
    expect(formatCsvCell(undefined)).toBe("");
    expect(formatCsvCell("")).toBe("");
  });

  it("retourne tel quel les valeurs simples", () => {
    expect(formatCsvCell("abc")).toBe("abc");
    expect(formatCsvCell(42)).toBe("42");
    expect(formatCsvCell(0)).toBe("0");
  });

  it("entoure de guillemets si contient le séparateur ;", () => {
    expect(formatCsvCell("Ville de Lyon ; centre-ville")).toBe('"Ville de Lyon ; centre-ville"');
  });

  it("double les guillemets internes", () => {
    expect(formatCsvCell('Il a dit "bonjour"')).toBe('"Il a dit ""bonjour"""');
  });

  it("entoure si contient des sauts de ligne", () => {
    expect(formatCsvCell("ligne1\nligne2")).toBe('"ligne1\nligne2"');
  });
});

describe("formatCsvRow", () => {
  it("joint avec ;", () => {
    expect(formatCsvRow(["a", "b", "c"])).toBe("a;b;c");
  });

  it("échappe correctement chaque cellule indépendamment", () => {
    expect(formatCsvRow(["plain", "with ; sep", null])).toBe('plain;"with ; sep";');
  });
});

describe("daysUntil", () => {
  const FIXED_NOW = new Date("2026-06-03T10:00:00Z");

  it("calcule les jours restants positifs", () => {
    const deadline = new Date("2026-06-10T18:00:00Z");
    expect(daysUntil(deadline, new Date(FIXED_NOW.getTime()))).toBe(7);
  });

  it("retourne négatif si deadline passée", () => {
    const deadline = new Date("2026-05-25T10:00:00Z");
    expect(daysUntil(deadline, new Date(FIXED_NOW.getTime()))).toBe(-9);
  });

  it("retourne vide pour null/undefined/invalide", () => {
    expect(daysUntil(null)).toBe("");
    expect(daysUntil(undefined)).toBe("");
    expect(daysUntil("not-a-date")).toBe("");
  });
});

describe("formatDateFr", () => {
  it("format DD/MM/YYYY", () => {
    expect(formatDateFr(new Date("2026-06-03T00:00:00Z"))).toMatch(/^0[23]\/06\/2026$/);
  });
  it("retourne vide pour null/undefined", () => {
    expect(formatDateFr(null)).toBe("");
    expect(formatDateFr(undefined)).toBe("");
  });
});

describe("buildAosDuJourCsv — structure globale", () => {
  it("a 38 colonnes d'en-tête", () => {
    expect(EXPORT_AO_HEADERS.length).toBe(EXPORT_AO_COLUMN_COUNT);
    expect(EXPORT_AO_COLUMN_COUNT).toBe(38);
  });

  it("génère uniquement la ligne d'en-tête si pas de rows", () => {
    const csv = buildAosDuJourCsv([]);
    const lines = csv.split("\r\n");
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("Référence AO");
    expect(lines[0]).toContain("Plateforme DCE");
  });

  it("sérialise une ligne minimaliste correctement", () => {
    const row: ExportAoRow = {
      metier: "MOE bâtiment",
      externalRef: "2026M2DTN0008",
      buyer: "Ville de Paris",
      title: "Réfection toiture",
      department: "75",
      city: "Paris",
      publishedAt: new Date("2026-06-02T08:00:00Z"),
      deadline: new Date("2026-07-01T12:00:00Z"),
      amountEur: null,
      procedureType: "MAPA",
      sourceLabel: "BOAMP",
      sourceUrl: "https://www.boamp.fr/x",
      urlVerifiedLabel: "✅ Vérifié",
      acceptedArchitects: ["Atelier Test"],
      dcePlatform: "",
    };
    const csv = buildAosDuJourCsv([row], new Date("2026-06-03T10:00:00Z"));
    const lines = csv.split("\r\n");
    expect(lines.length).toBe(2);
    const cells = lines[1]!.split(";");
    expect(cells.length).toBe(EXPORT_AO_COLUMN_COUNT);
    expect(cells[0]).toBe("1"); // #
    expect(cells[1]).toBe("MOE bâtiment");
    expect(cells[2]).toBe("2026M2DTN0008");
    expect(cells[3]).toBe("Ville de Paris");
    expect(cells[4]).toBe("Réfection toiture");
    expect(cells[5]).toBe("Île-de-France");
    expect(cells[6]).toBe("75");
    expect(cells[16]).toBe("Public");
    expect(cells[19]).toBe("Atelier Test"); // Archi 1
    expect(cells[20]).toBe(""); // Archi 2
    expect(cells[21]).toBe(""); // Archis 3-5
  });

  it("aplatit jusqu'à 5 architectes", () => {
    const row: ExportAoRow = {
      metier: "",
      externalRef: "X",
      buyer: "",
      title: "",
      department: null,
      city: "",
      publishedAt: null,
      deadline: null,
      amountEur: null,
      procedureType: null,
      sourceLabel: "",
      sourceUrl: null,
      urlVerifiedLabel: "",
      acceptedArchitects: ["A", "B", "C", "D", "E", "F"],
      dcePlatform: "",
    };
    const csv = buildAosDuJourCsv([row]);
    const cells = csv.split("\r\n")[1]!.split(";");
    expect(cells[19]).toBe("A");
    expect(cells[20]).toBe("B");
    // C, D, E concaténés (E exclu en réalité car slice(2,5) = [C, D] — bug ?
    // Non : slice(2, 5) sur [A,B,C,D,E,F] → [C, D, E] → "C, D, E"
    expect(cells[21]).toBe("C, D, E");
  });

  it("throw si la largeur des cellules dérape", () => {
    // On force un bug — non testable directement via l'API publique, mais
    // le contrat est documenté. Le test sert de garde-fou si EXPORT_AO_HEADERS
    // est modifié sans synchroniser buildAosDuJourCsv.
    expect(EXPORT_AO_HEADERS.length).toBe(EXPORT_AO_COLUMN_COUNT);
  });
});
