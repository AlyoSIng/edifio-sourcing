/**
 * Helpers purs pour l'export CSV « AO du jour ».
 *
 * Aligné sur le modèle Excel `Veille_AO_03_06_2026.xlsx` fourni par Steve
 * (2026-06-03) — 38 colonnes, séparateur `;`, encodage UTF-8 BOM (Excel
 * français reconnaît natif).
 *
 * Pas d'I/O, pas de BDD — fonctions pures testables côté Vitest.
 */

// ---------------------------------------------------------------------------
// En-têtes Excel (ordre strict)
// ---------------------------------------------------------------------------

/**
 * 38 colonnes du tableau « AOs du jour » de Steve. Ordre préservé pour permettre
 * un copier-coller direct dans son xlsx existant.
 */
export const EXPORT_AO_HEADERS = [
  "#",
  "Métier",
  "Référence AO",
  "MOA",
  "Intitulé",
  "Région",
  "Département",
  "Ville",
  "Date publication",
  "Date limite",
  "Jours restants",
  "Montant estimé travaux",
  "Type procédure",
  "Source",
  "URL fiche",
  "Statut vérification URL",
  "Public/Privé",
  "Priorité",
  "Notes",
  "Architecte 1",
  "Architecte 2",
  "Architectes 3-5",
  "Réponse mandataire",
  "Réponse Cotraitant",
  "Commentaire",
  "ARCHI",
  "ECO",
  "B",
  "AC",
  "RT",
  "EL",
  "SSI",
  "PROTECT",
  "PEMD",
  "BIM",
  "PBCVC",
  "ADAP",
  "Plateforme DCE",
] as const;

export const EXPORT_AO_COLUMN_COUNT = EXPORT_AO_HEADERS.length;

// ---------------------------------------------------------------------------
// Mapping département → région (France 2016)
// ---------------------------------------------------------------------------

/**
 * Table de mapping département (code 2-3 char) → libellé région.
 *
 * Source : découpage régional France 2016 (loi NOTRe — 13 régions métropole
 * + 5 DROM-COM). 101 départements couverts.
 *
 * Code Corse traité en 2A / 2B + alias historique "20".
 */
const REGION_BY_DEPARTMENT: Record<string, string> = {
  // Auvergne-Rhône-Alpes
  "01": "Auvergne-Rhône-Alpes",
  "03": "Auvergne-Rhône-Alpes",
  "07": "Auvergne-Rhône-Alpes",
  "15": "Auvergne-Rhône-Alpes",
  "26": "Auvergne-Rhône-Alpes",
  "38": "Auvergne-Rhône-Alpes",
  "42": "Auvergne-Rhône-Alpes",
  "43": "Auvergne-Rhône-Alpes",
  "63": "Auvergne-Rhône-Alpes",
  "69": "Auvergne-Rhône-Alpes",
  "73": "Auvergne-Rhône-Alpes",
  "74": "Auvergne-Rhône-Alpes",
  // Bourgogne-Franche-Comté
  "21": "Bourgogne-Franche-Comté",
  "25": "Bourgogne-Franche-Comté",
  "39": "Bourgogne-Franche-Comté",
  "58": "Bourgogne-Franche-Comté",
  "70": "Bourgogne-Franche-Comté",
  "71": "Bourgogne-Franche-Comté",
  "89": "Bourgogne-Franche-Comté",
  "90": "Bourgogne-Franche-Comté",
  // Bretagne
  "22": "Bretagne",
  "29": "Bretagne",
  "35": "Bretagne",
  "56": "Bretagne",
  // Centre-Val de Loire
  "18": "Centre-Val de Loire",
  "28": "Centre-Val de Loire",
  "36": "Centre-Val de Loire",
  "37": "Centre-Val de Loire",
  "41": "Centre-Val de Loire",
  "45": "Centre-Val de Loire",
  // Corse
  "20": "Corse",
  "2A": "Corse",
  "2B": "Corse",
  // Grand Est
  "08": "Grand Est",
  "10": "Grand Est",
  "51": "Grand Est",
  "52": "Grand Est",
  "54": "Grand Est",
  "55": "Grand Est",
  "57": "Grand Est",
  "67": "Grand Est",
  "68": "Grand Est",
  "88": "Grand Est",
  // Hauts-de-France
  "02": "Hauts-de-France",
  "59": "Hauts-de-France",
  "60": "Hauts-de-France",
  "62": "Hauts-de-France",
  "80": "Hauts-de-France",
  // Île-de-France
  "75": "Île-de-France",
  "77": "Île-de-France",
  "78": "Île-de-France",
  "91": "Île-de-France",
  "92": "Île-de-France",
  "93": "Île-de-France",
  "94": "Île-de-France",
  "95": "Île-de-France",
  // Normandie
  "14": "Normandie",
  "27": "Normandie",
  "50": "Normandie",
  "61": "Normandie",
  "76": "Normandie",
  // Nouvelle-Aquitaine
  "16": "Nouvelle-Aquitaine",
  "17": "Nouvelle-Aquitaine",
  "19": "Nouvelle-Aquitaine",
  "23": "Nouvelle-Aquitaine",
  "24": "Nouvelle-Aquitaine",
  "33": "Nouvelle-Aquitaine",
  "40": "Nouvelle-Aquitaine",
  "47": "Nouvelle-Aquitaine",
  "64": "Nouvelle-Aquitaine",
  "79": "Nouvelle-Aquitaine",
  "86": "Nouvelle-Aquitaine",
  "87": "Nouvelle-Aquitaine",
  // Occitanie
  "09": "Occitanie",
  "11": "Occitanie",
  "12": "Occitanie",
  "30": "Occitanie",
  "31": "Occitanie",
  "32": "Occitanie",
  "34": "Occitanie",
  "46": "Occitanie",
  "48": "Occitanie",
  "65": "Occitanie",
  "66": "Occitanie",
  "81": "Occitanie",
  "82": "Occitanie",
  // Pays de la Loire
  "44": "Pays de la Loire",
  "49": "Pays de la Loire",
  "53": "Pays de la Loire",
  "72": "Pays de la Loire",
  "85": "Pays de la Loire",
  // Provence-Alpes-Côte d'Azur
  "04": "Provence-Alpes-Côte d'Azur",
  "05": "Provence-Alpes-Côte d'Azur",
  "06": "Provence-Alpes-Côte d'Azur",
  "13": "Provence-Alpes-Côte d'Azur",
  "83": "Provence-Alpes-Côte d'Azur",
  "84": "Provence-Alpes-Côte d'Azur",
  // DROM-COM
  "971": "Guadeloupe",
  "972": "Martinique",
  "973": "Guyane",
  "974": "La Réunion",
  "976": "Mayotte",
};

/**
 * Retourne le libellé de région correspondant au département donné.
 * Format attendu : code département (2 chiffres ou 2A/2B pour Corse, 3 chiffres
 * pour DROM). Retourne `""` si introuvable.
 */
export function departmentToRegion(dept: string | null | undefined): string {
  if (!dept) return "";
  const trimmed = dept.trim();
  if (!trimmed) return "";
  return REGION_BY_DEPARTMENT[trimmed] ?? "";
}

// ---------------------------------------------------------------------------
// Heuristique Public / Para-public / Privé
// ---------------------------------------------------------------------------

/**
 * Classifie un acheteur en Public / Para-public / Privé à partir d'heuristiques
 * sur le libellé. Retourne `""` si aucune règle ne matche (Steve complétera).
 *
 * Ordre des règles : on teste d'abord les patterns para-public (santé / social)
 * car certains contiennent "hôpital" → public stricto-sensu mais classés à part
 * par les marchés publics. Puis public collectivité, puis privé (formes
 * juridiques).
 */
export function inferPublicPrivate(buyer: string | null | undefined): string {
  if (!buyer) return "";
  const b = buyer.toLowerCase();

  // Para-public — santé, social, organismes mixtes
  if (
    /\b(chu|chr|ch[ ,]|centre hospitalier|hôpital|ehpad|clinique|aphp|ap-hp|aphm|hcl)\b/.test(b) ||
    /\b(office public|bailleur social|sa hlm|sa d'hlm|opac|orh|aphp)\b/.test(b)
  ) {
    return "Para-public";
  }

  // Public — collectivités, État, écoles, universités, syndicats, métropoles
  if (
    /\b(ville de|commune de|mairie de|conseil départemental|conseil régional|conseil général|préfecture|région|département|métropole|communauté de communes|communauté d'agglomération|sdis|ccas|sivu|sivom|syndicat|établissement public|epic|epcc|epa|académie|université|ministère|école|collège|lycée|rectorat|dreal|driea|dirig|onf|cnrs|inserm)\b/.test(
      b,
    )
  ) {
    return "Public";
  }

  // Privé — formes juridiques commerciales.
  // Note : "SA" en fin de chaîne ou suivi de ponctuation (sans espace)
  // doit aussi matcher → on autorise EOL ou non-mot après.
  if (
    /\b(sarl|sasu|sas|sci|scop|eurl|gie|groupement|société)\b/.test(b) ||
    /\bsa\b/.test(b) // \b côté droit gère espace ET EOL
  ) {
    return "Privé";
  }

  return "";
}

// ---------------------------------------------------------------------------
// CSV — sérialisation
// ---------------------------------------------------------------------------

/**
 * Échappe une cellule pour le format CSV avec séparateur `;`.
 *
 * Règles RFC 4180 adaptées au séparateur point-virgule :
 *  - Si la valeur contient `;`, `"`, `\n` ou `\r`, on entoure de guillemets.
 *  - Les guillemets internes sont doublés.
 *  - `null` / `undefined` → chaîne vide.
 */
export function formatCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s === "") return "";
  if (s.includes(";") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Sérialise une ligne (array de cellules) en CSV `;`.
 */
export function formatCsvRow(cells: readonly unknown[]): string {
  return cells.map(formatCsvCell).join(";");
}

/**
 * Calcule le nombre de jours restants entre maintenant et une deadline.
 * Retourne `""` si pas de deadline, négatif accepté (= dépassé).
 */
export function daysUntil(
  deadline: Date | string | null | undefined,
  now: Date = new Date(),
): number | "" {
  if (!deadline) return "";
  const d = typeof deadline === "string" ? new Date(deadline) : deadline;
  if (Number.isNaN(d.getTime())) return "";
  const diffMs = d.setHours(0, 0, 0, 0) - now.setHours(0, 0, 0, 0);
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Formate une date en DD/MM/YYYY (locale fr).
 */
export function formatDateFr(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Assemblage du CSV complet
// ---------------------------------------------------------------------------

/**
 * Forme d'une ligne export — un par tender. Tous les champs sont sérialisables
 * en string ; l'appelant aplatit les architectes acceptés dans `architects`
 * (max 5, ordre stable). Les champs « manuels » (priorité, notes, commentaire,
 * compétences) restent `""` — Steve les remplit dans Excel.
 */
export interface ExportAoRow {
  metier: string; // ex. "MOE bâtiment" — vient du profil de recherche actif
  externalRef: string;
  buyer: string;
  title: string;
  department: string | null;
  city: string; // peut être vide (pas toujours détecté)
  publishedAt: Date | null;
  deadline: Date | null;
  amountEur: number | null;
  procedureType: string | null;
  sourceLabel: string; // ex. "BOAMP", "marches-publics.info"
  sourceUrl: string | null;
  urlVerifiedLabel: string; // ex. "✅ Vérifié" si sourceUrl !== null, sinon ""
  /** Cabinets des architectes acceptés (ordre stable). Max 5 affichés. */
  acceptedArchitects: string[];
  /** Plateforme DCE — déduite de sourceUrl si possible, sinon "". */
  dcePlatform: string;
}

/**
 * Construit le CSV complet (BOM exclu — l'appelant l'ajoute au moment du
 * download). 1 ligne d'en-tête + N lignes de données.
 *
 * @param rows  Liste des tenders à exporter, dans l'ordre voulu (déjà triés).
 * @param now   Date de référence pour `Jours restants` (par défaut `new Date()`).
 */
export function buildAosDuJourCsv(rows: readonly ExportAoRow[], now: Date = new Date()): string {
  const lines: string[] = [];
  lines.push(formatCsvRow(EXPORT_AO_HEADERS));

  rows.forEach((row, index) => {
    const region = departmentToRegion(row.department);
    const remaining = daysUntil(row.deadline, new Date(now.getTime()));
    const publicPrivate = inferPublicPrivate(row.buyer);

    // Architectes 1, 2, 3-5
    const archi1 = row.acceptedArchitects[0] ?? "";
    const archi2 = row.acceptedArchitects[1] ?? "";
    const archi3to5 = row.acceptedArchitects.slice(2, 5).join(", ");

    const cells: unknown[] = [
      index + 1, // #
      row.metier, // Métier
      row.externalRef, // Référence AO
      row.buyer, // MOA
      row.title, // Intitulé
      region, // Région
      row.department ?? "", // Département
      row.city, // Ville
      formatDateFr(row.publishedAt), // Date publication
      formatDateFr(row.deadline), // Date limite
      remaining, // Jours restants
      row.amountEur ?? "", // Montant estimé travaux
      row.procedureType ?? "", // Type procédure
      row.sourceLabel, // Source
      row.sourceUrl ?? "", // URL fiche
      row.urlVerifiedLabel, // Statut vérification URL
      publicPrivate, // Public/Privé
      "", // Priorité (manuel)
      "", // Notes (manuel)
      archi1, // Architecte 1
      archi2, // Architecte 2
      archi3to5, // Architectes 3-5
      "", // Réponse mandataire (manuel)
      "", // Réponse Cotraitant (manuel)
      "", // Commentaire (manuel)
      // 12 compétences (ARCHI, ECO, B, AC, RT, EL, SSI, PROTECT, PEMD, BIM, PBCVC, ADAP)
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      row.dcePlatform, // Plateforme DCE
    ];

    // Garde-fou : on doit avoir exactement EXPORT_AO_COLUMN_COUNT cellules.
    // Si la spec change un jour, ce throw lèvera en dev/CI avant prod.
    if (cells.length !== EXPORT_AO_COLUMN_COUNT) {
      throw new Error(
        `[export-csv] Row width mismatch: got ${cells.length}, expected ${EXPORT_AO_COLUMN_COUNT}`,
      );
    }

    lines.push(formatCsvRow(cells));
  });

  // CRLF — Excel français préfère CRLF pour les imports CSV.
  return lines.join("\r\n");
}
