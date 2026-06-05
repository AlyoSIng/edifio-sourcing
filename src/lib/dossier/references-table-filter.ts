/**
 * Filtre du tableau Excel maître des références (Steve 2026-06-05).
 *
 * Pendant Excel du système « fiches référence A4 + matching keywords » : à la
 * place d'un fichier par référence, Steve dépose UN tableau Excel maître
 * (catégorie biblio `references_table`) où chaque ligne est une référence
 * avec une colonne « Mots-clés ». À la compile dossier, on ne garde que les
 * lignes dont l'intersection avec les keywords du profil actif est non vide.
 *
 * Conventions actées avec Steve (cf. session du 2026-06-05) :
 *   - **Nom de la colonne keywords** : exactement « Mots-clés » (avec tiret +
 *     accent). Recherche case + accents insensibles à la lecture (normalize
 *     NFD lowercase trim), donc « MOTS-CLES » ou « Mots cles » fonctionnent.
 *   - **Séparateur** dans une cellule keywords : virgule, point-virgule, ou
 *     retour à la ligne — tous acceptés. Split sur `[,;\n\r]+`.
 *   - **Sortie ZIP** : le tableau filtré uniquement (en-tête + lignes
 *     matchantes). L'original n'est pas livré à l'acheteur.
 *
 * Hypothèses de format :
 *   - 1 feuille Excel à scanner (la première — `worksheets[0]`).
 *   - 1ère ligne = en-têtes des colonnes (texte).
 *   - Les lignes suivantes = données (1 ligne = 1 référence).
 *
 * Si la colonne « Mots-clés » est absente → throw avec message explicite.
 * Si aucune ligne ne matche → retourne `null` (le caller décide de ne pas
 * inclure le fichier dans le ZIP plutôt que d'inclure un tableau vide).
 *
 * Module pur (pas de Storage / BDD). Testable avec Vitest en injectant un
 * buffer .xlsx fabriqué à la volée avec ExcelJS.
 */

import ExcelJS from "exceljs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FilterReferencesResult {
  /** Buffer du .xlsx filtré, ou null si aucune ligne ne matche. */
  buffer: Uint8Array | null;
  /** Nombre de lignes du tableau original (hors en-tête). */
  totalRows: number;
  /** Nombre de lignes conservées après filtrage. */
  keptRows: number;
  /** Nom EXACT de la colonne keywords trouvée dans l'en-tête (pour debug). */
  keywordsColumnName: string;
}

// ---------------------------------------------------------------------------
// Helpers de normalisation
// ---------------------------------------------------------------------------

/**
 * Normalise un mot-clé pour la comparaison (lowercase + NFD + trim).
 * Cohérent avec la normalisation profil de recherche.
 */
function normalizeKeyword(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * Normalise le nom d'une colonne d'en-tête pour matcher tolérant :
 *  - lowercase + NFD (sans accents)
 *  - suppression de [espace, tiret, underscore] pour que « Mots-clés »,
 *    « Mots cles », « mots_cles » et « MotsCles » se reconnaissent
 *    comme la même colonne.
 * Utilisé UNIQUEMENT pour repérer l'en-tête — la normalisation des
 * keywords eux-mêmes garde tirets et espaces (signifiants).
 */
function normalizeHeader(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\s\-_]+/g, "")
    .trim();
}

/**
 * Split une cellule keywords sur virgule + point-virgule + retours ligne,
 * normalise chaque token, drop les vides, dédup.
 */
function parseKeywordsCell(raw: string): string[] {
  const tokens = raw
    .split(/[,;\n\r]+/)
    .map(normalizeKeyword)
    .filter((s) => s.length > 0);
  return Array.from(new Set(tokens));
}

/**
 * Récupère la valeur texte d'une cellule ExcelJS, robuste aux objets riches
 * (formule, hyperlien, richText…).
 */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  // RichText
  if (typeof value === "object" && "richText" in value && Array.isArray(value.richText)) {
    return value.richText.map((rt) => rt.text ?? "").join("");
  }
  // Formule
  if (typeof value === "object" && "result" in value) {
    return cellText(value.result as ExcelJS.CellValue);
  }
  // Hyperlien
  if (typeof value === "object" && "text" in value) {
    return cellText((value as { text: ExcelJS.CellValue }).text);
  }
  // Date
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return "";
}

// ---------------------------------------------------------------------------
// Fonction principale
// ---------------------------------------------------------------------------

/**
 * Lit le buffer .xlsx du tableau maître, filtre les lignes dont la cellule
 * « Mots-clés » intersecte les positives du profil, et retourne un nouveau
 * buffer .xlsx avec uniquement les lignes filtrées (+ en-tête).
 *
 * @param sourceXlsx       Buffer du .xlsx maître (chargé depuis Storage).
 * @param profilePositives Liste des mots-clés positifs du profil de recherche
 *                         actif. Si vide ou null → retourne null (le ZIP
 *                         n'inclura pas de tableau).
 *
 * @throws Si la colonne « Mots-clés » n'existe pas dans la 1ère ligne, ou si
 *         le buffer n'est pas un xlsx valide.
 */
export async function filterReferencesTableXlsx(
  sourceXlsx: Uint8Array,
  profilePositives: string[] | null | undefined,
): Promise<FilterReferencesResult> {
  if (!profilePositives || profilePositives.length === 0) {
    return {
      buffer: null,
      totalRows: 0,
      keptRows: 0,
      keywordsColumnName: "",
    };
  }

  const normalizedPositives = new Set(profilePositives.map(normalizeKeyword).filter(Boolean));

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(sourceXlsx.buffer as ArrayBuffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error(
      "[references-table-filter] Le fichier Excel ne contient aucune feuille. " +
        "Ajoute au moins une feuille avec une colonne « Mots-clés ».",
    );
  }

  // -- Repérage de la colonne « Mots-clés » dans la 1ère ligne
  const headerRow = sheet.getRow(1);
  let keywordsColIndex = -1;
  let keywordsColName = "";

  const targetNormalized = normalizeHeader("Mots-clés");
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const text = cellText(cell.value).trim();
    if (!text) return;
    if (normalizeHeader(text) === targetNormalized) {
      keywordsColIndex = colNumber;
      keywordsColName = text;
    }
  });

  if (keywordsColIndex === -1) {
    throw new Error(
      "[references-table-filter] Colonne « Mots-clés » introuvable dans la 1ère ligne " +
        "du tableau Excel. Ajoute une colonne d'en-tête « Mots-clés » et remplis-la pour " +
        "chaque référence (séparateurs acceptés : virgule, point-virgule, retour à la ligne).",
    );
  }

  // -- Création du workbook de sortie : on clone l'en-tête + les lignes
  //    matchantes. On ne copie pas les styles complexes (graphes, images, …)
  //    pour rester rapide ; les acheteurs lisent les données, pas le maquillage.
  const outWorkbook = new ExcelJS.Workbook();
  outWorkbook.creator = "edifio Sourcing";
  outWorkbook.created = new Date(0); // timestamp neutre pour reproductibilité tests
  const outSheet = outWorkbook.addWorksheet(sheet.name || "Références");

  // Copie de l'en-tête (toutes les colonnes, pas seulement Mots-clés).
  const headerValues: ExcelJS.CellValue[] = [];
  let maxCol = 0;
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    if (colNumber > maxCol) maxCol = colNumber;
  });
  for (let c = 1; c <= maxCol; c++) {
    headerValues[c] = cellText(headerRow.getCell(c).value);
  }
  // ExcelJS attend un array commençant à index 1 (la 1ère cellule est [1]).
  // addRow accepte un Array où index 0 est ignoré si on passe un array-like.
  // Pour éviter ambiguïté on construit un objet { 1: ..., 2: ..., ... }.
  const headerRowData: Record<number, ExcelJS.CellValue> = {};
  for (let c = 1; c <= maxCol; c++) headerRowData[c] = headerValues[c] ?? "";
  const newHeader = outSheet.addRow([]);
  for (let c = 1; c <= maxCol; c++) {
    newHeader.getCell(c).value = headerValues[c] ?? "";
  }
  newHeader.font = { bold: true };

  // -- Itération sur les lignes de données et filtrage
  let totalRows = 0;
  let keptRows = 0;
  const lastRow = sheet.rowCount;

  for (let r = 2; r <= lastRow; r++) {
    const row = sheet.getRow(r);
    // Ligne complètement vide → on saute (mais on ne décompte pas dans totalRows)
    const hasAnyValue = (() => {
      let found = false;
      row.eachCell({ includeEmpty: false }, () => {
        found = true;
      });
      return found;
    })();
    if (!hasAnyValue) continue;
    totalRows++;

    const keywordsCell = row.getCell(keywordsColIndex);
    const rawKeywords = cellText(keywordsCell.value);
    const cellKeywords = parseKeywordsCell(rawKeywords);

    const matches = cellKeywords.some((k) => normalizedPositives.has(k));
    if (!matches) continue;
    keptRows++;

    // Recopie de la ligne complète.
    const newRow = outSheet.addRow([]);
    for (let c = 1; c <= maxCol; c++) {
      newRow.getCell(c).value = cellText(row.getCell(c).value);
    }
  }

  if (keptRows === 0) {
    return {
      buffer: null,
      totalRows,
      keptRows: 0,
      keywordsColumnName: keywordsColName,
    };
  }

  // -- Largeurs de colonnes raisonnables (autofit léger).
  for (let c = 1; c <= maxCol; c++) {
    const col = outSheet.getColumn(c);
    // Largeur basée sur la longueur de l'en-tête + un peu de marge,
    // bornée [12, 60] pour éviter colonnes microscopiques ou démesurées.
    const headerLen = String(headerValues[c] ?? "").length;
    col.width = Math.max(12, Math.min(60, headerLen + 4));
  }

  const outBuffer = await outWorkbook.xlsx.writeBuffer();
  return {
    buffer: new Uint8Array(outBuffer),
    totalRows,
    keptRows,
    keywordsColumnName: keywordsColName,
  };
}
