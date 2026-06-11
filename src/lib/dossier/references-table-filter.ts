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
 *   - 1 feuille Excel à scanner (la première — `SheetNames[0]`).
 *   - 1ère ligne = en-têtes des colonnes (texte).
 *   - Les lignes suivantes = données (1 ligne = 1 référence).
 *
 * Si la colonne « Mots-clés » est absente → throw avec message explicite.
 * Si aucune ligne ne matche → retourne `null` (le caller décide de ne pas
 * inclure le fichier dans le ZIP plutôt que d'inclure un tableau vide).
 *
 * Module pur (pas de Storage / BDD). Testable avec Vitest en injectant un
 * buffer .xlsx fabriqué à la volée avec SheetJS.
 *
 * MIGRATION MONOREPO (Lot 3, 2026-06-11) : réécrit de `exceljs` vers
 * `xlsx` (SheetJS 0.20.3, tarball CDN — même version que le monorepo
 * alyos-suivi-chantier). Iso-fonctionnel, mêmes signatures publiques,
 * mêmes colonnes/format de sortie. Seule perte (cosmétique) : l'en-tête
 * du fichier de sortie n'est plus en gras — SheetJS Community Edition
 * n'écrit pas les styles de police. Assumé : « les acheteurs lisent les
 * données, pas le maquillage » (commentaire historique du module).
 */

import * as XLSX from "xlsx";

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

  // `type: "array"` = ArrayBuffer / Uint8Array (compatible Node + Edge).
  const workbook = XLSX.read(sourceXlsx, { type: "array" });

  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) {
    throw new Error(
      "[references-table-filter] Le fichier Excel ne contient aucune feuille. " +
        "Ajoute au moins une feuille avec une colonne « Mots-clés ».",
    );
  }

  // Matrice de strings : `raw: false` rend le texte formaté des cellules
  // (couvre formules → valeur cache, richText → concat, dates → formatées),
  // `defval: ""` remplit les trous, `blankrows: false` saute les lignes
  // complètement vides (iso comportement historique : non comptées dans
  // totalRows). `dateNF` aligne les dates sur l'ISO court historique.
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
    dateNF: "yyyy-mm-dd",
  });

  const headerRow = (matrix[0] ?? []).map((c) => String(c ?? ""));

  // -- Repérage de la colonne « Mots-clés » dans la 1ère ligne
  const targetNormalized = normalizeHeader("Mots-clés");
  let keywordsColIndex = -1;
  let keywordsColName = "";
  for (let c = 0; c < headerRow.length; c++) {
    const text = headerRow[c]!.trim();
    if (!text) continue;
    if (normalizeHeader(text) === targetNormalized) {
      keywordsColIndex = c;
      keywordsColName = text;
    }
  }

  if (keywordsColIndex === -1) {
    throw new Error(
      "[references-table-filter] Colonne « Mots-clés » introuvable dans la 1ère ligne " +
        "du tableau Excel. Ajoute une colonne d'en-tête « Mots-clés » et remplis-la pour " +
        "chaque référence (séparateurs acceptés : virgule, point-virgule, retour à la ligne).",
    );
  }

  const maxCol = headerRow.length;

  // -- Itération sur les lignes de données et filtrage
  //    (blankrows: false → les lignes vides sont déjà absentes de la matrice).
  let totalRows = 0;
  let keptRows = 0;
  const keptData: string[][] = [];

  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r] ?? [];
    totalRows++;

    const rawKeywords = String(row[keywordsColIndex] ?? "");
    const cellKeywords = parseKeywordsCell(rawKeywords);

    const matches = cellKeywords.some((k) => normalizedPositives.has(k));
    if (!matches) continue;
    keptRows++;

    // Recopie de la ligne complète, en texte, padée à la largeur de l'en-tête.
    const outRow: string[] = [];
    for (let c = 0; c < maxCol; c++) {
      outRow.push(String(row[c] ?? ""));
    }
    keptData.push(outRow);
  }

  if (keptRows === 0) {
    return {
      buffer: null,
      totalRows,
      keptRows: 0,
      keywordsColumnName: keywordsColName,
    };
  }

  // -- Workbook de sortie : en-tête + lignes matchantes, données texte
  //    uniquement (pas de styles complexes — graphes, images… — pour rester
  //    rapide ; les acheteurs lisent les données, pas le maquillage).
  const outSheet = XLSX.utils.aoa_to_sheet([headerRow, ...keptData]);

  // Largeurs de colonnes raisonnables (autofit léger) : longueur de
  // l'en-tête + marge, bornée [12, 60] pour éviter colonnes microscopiques
  // ou démesurées.
  outSheet["!cols"] = headerRow.map((h) => ({
    wch: Math.max(12, Math.min(60, h.length + 4)),
  }));

  const outWorkbook = XLSX.utils.book_new();
  // Noms de feuille Excel : 31 caractères max — on tronque par sécurité.
  XLSX.utils.book_append_sheet(outWorkbook, outSheet, (sheetName || "Références").slice(0, 31));
  outWorkbook.Props = {
    Author: "edifio Sourcing",
    CreatedDate: new Date(0), // timestamp neutre pour reproductibilité tests
  };

  const outBuffer = XLSX.write(outWorkbook, {
    type: "array",
    bookType: "xlsx",
    compression: true,
  }) as ArrayBuffer;

  return {
    buffer: new Uint8Array(outBuffer),
    totalRows,
    keptRows,
    keywordsColumnName: keywordsColName,
  };
}
