/**
 * Matching V1 architecte ↔ AO — module Tandem.
 *
 * Source de vérité :
 *  - `specs/module_tandem_engine_v1.md` §3.1 (algorithme V1)
 *  - `specs/architects_data_and_admin_v1.md` §4 + §7 (constats données pauvres)
 *  - `specs/architects_specialty_mapping_v1.md` (vocabulaire 16 codes)
 *  - `DECISIONS.md` 2026-05-22 (d) — normalisation OBLIGATOIRE des deux côtés
 *  - Décision Q1 Board 2026-05-24 — pondération `30/15/35/15/5` (profil
 *    `sparse_data`) avec flag config `MATCHING_WEIGHTS_PROFILE` qui bascule
 *    sur la pondération spec stricte (`30/20/25/15/10` → renommée
 *    `mature` ici) dès que la couverture spécialité dépasse 60 %.
 *
 * Filtre d'entrée : l'architecte doit être `solicitable = TRUE`
 * (email NOT NULL — colonne GENERATED) ET `active = TRUE` (pas opposé RGPD).
 *
 * Pondération (total 100) :
 *   profile=sparse_data (DÉFAUT MVP — base à 16 % de spécialité)
 *     geo 30 / specialty 15 / history 35 / availability 15 / preference 5
 *   profile=mature (à activer post-enrichissement)
 *     specialty 30 / geo 20 / history 25 / availability 15 / preference 10
 *
 * Géo : on extrait le département (FR) depuis `tender.buyer` OU
 * `tender.rawData.record.departement` (BOAMP) si dispo.
 *   - match exact département dans `architect.geo_zones` → 100% du poids géo
 *   - département limitrophe → 50 % du poids géo
 *   - sinon → 0
 *
 * Spécialité : on infère un code (parmi les 16 du vocabulaire) depuis le titre
 * AO + les CPV. Mapping mots-clés normalisés → code.
 *   - match exact dans `architect.specialty_codes` → 100% du poids
 *   - spécialité « connexe » (table de proximité) → 50 %
 *   - sinon → 0
 *
 * Historique : `architect.past_collabs_count` × 5, capé au poids `history`.
 * Availability : 100% si 0 sollicitation, dégressif si > 0 sur 30 j.
 * Preference : flag `architect.preferred` → 100% du poids, sinon 0.
 *
 * Pas d'I/O ici — module pur. Les requêtes BDD (`getActiveArchitects`,
 * `countSolicitationsLast30Days`) sont injectées via une interface
 * `MatchingInputs` pour rester testable sans Drizzle.
 */

import type { Architect } from "@/db/schema/architects";
import type { Tender } from "@/db/schema/tenders";

import { normalizeForMatching } from "@/lib/text/normalize";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export type MatchingWeightsProfile = "sparse_data" | "mature";

export interface MatchingWeights {
  specialty: number;
  geo: number;
  history: number;
  availability: number;
  preference: number;
}

export const WEIGHTS_BY_PROFILE: Record<MatchingWeightsProfile, MatchingWeights> = {
  sparse_data: { geo: 30, specialty: 15, history: 35, availability: 15, preference: 5 },
  mature: { specialty: 30, geo: 20, history: 25, availability: 15, preference: 10 },
};

export interface MatchBreakdown {
  specialty: number;
  geo: number;
  history: number;
  availability: number;
  preference: number;
}

export interface MatchScore {
  architectId: string;
  score: number;
  rationale: string; // rempli par P5 Haiku (cf. ai-rationale.ts)
  breakdown: MatchBreakdown;
}

/**
 * Inputs nécessaires au matching — fournis par le caller (Server Action) à
 * partir de la BDD. Module pur, pas de couplage Drizzle.
 */
export interface MatchingInputs {
  /** Architectes filtrés `solicitable = TRUE AND active = TRUE` côté caller. */
  architects: Architect[];
  /**
   * Nombre de sollicitations envoyées à chaque architecte dans les 30 derniers
   * jours (clé = architectId). Absence = 0.
   */
  recentSolicitationsByArchitect: Map<string, number>;
}

/* -------------------------------------------------------------------------- */
/*  Spécialités — vocabulaire et inférence depuis AO                          */
/* -------------------------------------------------------------------------- */

/**
 * Mots-clés (normalisés via `normalizeForMatching`) → code spécialité.
 * Le matching scanne le titre AO normalisé pour chaque entrée.
 *
 * Source : `specs/architects_specialty_mapping_v1.md` §1 (16 codes) +
 * mots-clés métier observés sur le sourcing BOAMP.
 */
const SPECIALTY_KEYWORDS: Array<{ code: string; keywords: string[] }> = [
  { code: "habitat_individuel", keywords: ["villa", "maison individuelle", "habitat individuel"] },
  {
    code: "logements_collectifs",
    keywords: ["logements", "logement collectif", "habitat collectif", "residence"],
  },
  { code: "tertiaire", keywords: ["bureaux", "tertiaire", "siege"] },
  { code: "commerces", keywords: ["commerce", "hotel", "hotellerie", "restaurant"] },
  { code: "equipement_public", keywords: ["equipement public", "mairie", "hotel de ville"] },
  { code: "sante", keywords: ["hopital", "hopitaux", "clinique", "ehpad", "sante", "medico"] },
  {
    code: "petite_enfance",
    keywords: ["creche", "creches", "petite enfance", "halte garderie"],
  },
  { code: "enseignement", keywords: ["ecole", "college", "lycee", "universite", "enseignement"] },
  { code: "culture", keywords: ["mediatheque", "bibliotheque", "musee", "theatre", "culture"] },
  { code: "sport", keywords: ["gymnase", "piscine", "stade", "salle de sport", "sport"] },
  { code: "patrimoine", keywords: ["patrimoine", "monument historique", "classe"] },
  {
    code: "rehabilitation",
    keywords: ["rehabilitation", "renovation", "restructuration", "extension"],
  },
  { code: "industriel", keywords: ["industriel", "usine", "atelier", "logistique"] },
  {
    code: "amenagement_paysage",
    keywords: ["paysage", "amenagement exterieur", "parc", "espace vert"],
  },
  { code: "urbanisme", keywords: ["urbanisme", "plu", "zac", "amenagement urbain"] },
  { code: "interieur", keywords: ["amenagement interieur", "decoration", "design interieur"] },
];

/**
 * Proximités sémantiques — pour le bonus « connexe » à 50 % du poids.
 * Symétrique : si A→B alors B→A.
 */
const SPECIALTY_RELATED: Record<string, string[]> = {
  logements_collectifs: ["habitat_individuel", "rehabilitation"],
  habitat_individuel: ["logements_collectifs"],
  tertiaire: ["commerces", "rehabilitation"],
  commerces: ["tertiaire"],
  equipement_public: ["culture", "sport", "enseignement", "petite_enfance"],
  sante: ["equipement_public", "petite_enfance"],
  petite_enfance: ["enseignement", "equipement_public", "sante"],
  enseignement: ["equipement_public", "petite_enfance", "culture"],
  culture: ["equipement_public", "enseignement"],
  sport: ["equipement_public"],
  patrimoine: ["rehabilitation"],
  rehabilitation: ["patrimoine", "logements_collectifs", "tertiaire"],
  industriel: ["tertiaire"],
  amenagement_paysage: ["urbanisme"],
  urbanisme: ["amenagement_paysage"],
  interieur: ["tertiaire", "commerces"],
};

/**
 * Infère la liste des codes spécialité d'un AO depuis son titre.
 * Multi-codes possibles (ex. « extension d'un gymnase » → sport + rehabilitation).
 *
 * Normalisation des deux côtés (DÉCISION Board 2026-05-22 (d)).
 *
 * @returns set de codes (ordre non garanti)
 */
export function inferCategoriesFromTender(tender: Pick<Tender, "title">): Set<string> {
  const titleNorm = normalizeForMatching(tender.title);
  const codes = new Set<string>();
  for (const { code, keywords } of SPECIALTY_KEYWORDS) {
    for (const kw of keywords) {
      const kwNorm = normalizeForMatching(kw);
      if (titleNorm.includes(kwNorm)) {
        codes.add(code);
        break;
      }
    }
  }
  return codes;
}

/**
 * `true` si `code` et `target` sont liés via SPECIALTY_RELATED.
 */
export function relatedSpecialty(code: string, target: string): boolean {
  return SPECIALTY_RELATED[code]?.includes(target) ?? false;
}

/* -------------------------------------------------------------------------- */
/*  Géographie — département + adjacence                                       */
/* -------------------------------------------------------------------------- */

/**
 * Extrait le département (chaîne 2 chars FR métropole, 3 chars DOM/Corse).
 * Sources possibles, par ordre de priorité :
 *  1. `tender.rawData?.record?.departement` (BOAMP — fiable)
 *  2. Premier nombre 2-3 chars en début de `tender.buyer` (heuristique)
 *  3. Code postal 5 chars dans `tender.buyer` → 2 premiers digits
 *
 * Retourne `null` si aucune source ne donne un département valide.
 */
export function extractDepartment(tender: Pick<Tender, "buyer" | "rawData">): string | null {
  // 1. rawData BOAMP
  const raw = tender.rawData as { record?: { departement?: unknown } } | null | undefined;
  const rawDept = raw?.record?.departement;
  if (typeof rawDept === "string" && /^(\d{2,3}|2[AB])$/i.test(rawDept.trim())) {
    return rawDept.trim().toUpperCase();
  }
  if (Array.isArray(rawDept) && rawDept.length > 0) {
    const first = String(rawDept[0]).trim();
    if (/^(\d{2,3}|2[AB])$/i.test(first)) return first.toUpperCase();
  }
  // 2. Code postal dans buyer
  const cpMatch = tender.buyer.match(/\b(\d{5})\b/);
  if (cpMatch && cpMatch[1]) {
    const cp = cpMatch[1];
    // Corse : 20XXX → 2A ou 2B (heuristique 200-201 = 2A, 202-209 = 2B)
    if (cp.startsWith("20")) {
      const sub = parseInt(cp.substring(2, 5), 10);
      return sub < 200 ? "2A" : "2B";
    }
    return cp.substring(0, 2);
  }
  return null;
}

/**
 * Table d'adjacence des départements métropole (extrait — pour MVP) — un sous-
 * ensemble suffisant pour le matching V1, à étendre au fil de l'eau.
 *
 * Source : carte INSEE des départements limitrophes (métropole + Corse).
 */
const ADJACENT_DEPARTMENTS: Record<string, string[]> = {
  "01": ["38", "39", "69", "71", "73", "74"],
  "02": ["08", "51", "59", "60", "77", "80"],
  "06": ["04", "83"],
  "13": ["04", "30", "83", "84"],
  "21": ["10", "39", "52", "58", "70", "71", "89"],
  "33": ["17", "24", "40", "47"],
  "34": ["11", "12", "30", "81"],
  "35": ["22", "44", "49", "50", "53", "56"],
  "44": ["35", "49", "56", "85"],
  "59": ["02", "62", "80"],
  "62": ["59", "80"],
  "67": ["54", "57", "68", "88"],
  "68": ["67", "70", "88", "90"],
  "69": ["01", "38", "42", "71"],
  "75": ["92", "93", "94"],
  "77": ["02", "10", "45", "51", "60", "89", "91", "93", "94"],
  "78": ["27", "28", "60", "91", "92", "95"],
  "91": ["28", "45", "77", "78", "92", "94"],
  "92": ["75", "78", "91", "93", "94", "95"],
  "93": ["75", "77", "92", "94", "95"],
  "94": ["75", "77", "91", "92", "93"],
  "95": ["60", "78", "92", "93"],
};

export function adjacentDepartment(a: string, b: string): boolean {
  const A = a.toUpperCase();
  const B = b.toUpperCase();
  return ADJACENT_DEPARTMENTS[A]?.includes(B) ?? ADJACENT_DEPARTMENTS[B]?.includes(A) ?? false;
}

/* -------------------------------------------------------------------------- */
/*  Scoring per-architect                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Calcule le breakdown de score pour UN architecte sur UN tender.
 * Module pur — toutes les données (collabs, sollicitations) injectées.
 */
export function scoreArchitect(
  architect: Architect,
  tender: Pick<Tender, "title" | "buyer" | "rawData">,
  recentSolicitations: number,
  weights: MatchingWeights,
  inferredCodes: Set<string>,
  tenderDept: string | null,
): MatchBreakdown {
  const breakdown: MatchBreakdown = {
    specialty: 0,
    geo: 0,
    history: 0,
    availability: 0,
    preference: 0,
  };

  // Spécialité — exact > connexe > rien
  if (inferredCodes.size > 0) {
    const archiCodes = new Set(architect.specialtyCodes);
    let bestMatch: "exact" | "related" | "none" = "none";
    for (const code of inferredCodes) {
      if (archiCodes.has(code)) {
        bestMatch = "exact";
        break;
      }
    }
    if (bestMatch === "none") {
      for (const code of inferredCodes) {
        for (const archCode of archiCodes) {
          if (relatedSpecialty(archCode, code)) {
            bestMatch = "related";
            break;
          }
        }
        if (bestMatch === "related") break;
      }
    }
    breakdown.specialty =
      bestMatch === "exact"
        ? weights.specialty
        : bestMatch === "related"
          ? Math.floor(weights.specialty / 2)
          : 0;
  }

  // Géo — exact > limitrophe > rien
  if (tenderDept) {
    const zones = architect.geoZones.map((z) => z.toUpperCase());
    if (zones.includes(tenderDept)) {
      breakdown.geo = weights.geo;
    } else if (zones.some((z) => adjacentDepartment(z, tenderDept))) {
      breakdown.geo = Math.floor(weights.geo / 2);
    }
  }

  // Historique — 5 pts par collab, capé au poids `history`.
  // Avec poids 35 → 7 collabs = score max (cf. spec §3.1 cap 25 hard, ici poids
  // configurable). Cap dynamique au poids.
  breakdown.history = Math.min(weights.history, architect.pastCollabsCount * 5);

  // Disponibilité — 100% si 0 sollic, dégressif sinon.
  // Spec : `recentSolicitations < 3 ? full : max(0, full - n*2)` adapté au poids.
  if (recentSolicitations < 3) {
    breakdown.availability = weights.availability;
  } else {
    breakdown.availability = Math.max(0, weights.availability - recentSolicitations * 2);
  }

  // Préférence — flag admin
  breakdown.preference = architect.preferred ? weights.preference : 0;

  return breakdown;
}

/**
 * Calcule le score total à partir d'un breakdown.
 */
export function totalScore(breakdown: MatchBreakdown): number {
  return (
    breakdown.specialty +
    breakdown.geo +
    breakdown.history +
    breakdown.availability +
    breakdown.preference
  );
}

/* -------------------------------------------------------------------------- */
/*  Ranking — top N architectes                                               */
/* -------------------------------------------------------------------------- */

export interface RankArchitectsOptions {
  /** Top N à retourner (défaut 3). */
  topN?: number;
  /** Profil de pondération (défaut lit `MATCHING_WEIGHTS_PROFILE` env ou 'sparse_data'). */
  profile?: MatchingWeightsProfile;
}

/**
 * Trie les architectes par score décroissant et retourne le top N. La rationale
 * IA P5 (Haiku) est laissée vide (`''`) — à remplir par le caller via
 * `ai-rationale.ts` pour ne pas bloquer le matching sur l'appel Anthropic.
 *
 * @param tender — AO (title, buyer, rawData utilisés)
 * @param inputs — architectes pré-filtrés + map des sollicitations récentes
 * @param options — topN + profile
 */
export function rankArchitects(
  tender: Pick<Tender, "title" | "buyer" | "rawData">,
  inputs: MatchingInputs,
  options: RankArchitectsOptions = {},
): MatchScore[] {
  const topN = options.topN ?? 3;
  const profile = options.profile ?? readWeightsProfileFromEnv();
  const weights = WEIGHTS_BY_PROFILE[profile];
  const inferredCodes = inferCategoriesFromTender(tender);
  const tenderDept = extractDepartment(tender);

  const scored: MatchScore[] = inputs.architects.map((a) => {
    const recentSolic = inputs.recentSolicitationsByArchitect.get(a.id) ?? 0;
    const breakdown = scoreArchitect(a, tender, recentSolic, weights, inferredCodes, tenderDept);
    return {
      architectId: a.id,
      score: totalScore(breakdown),
      rationale: "",
      breakdown,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN);
}

/**
 * Lit `MATCHING_WEIGHTS_PROFILE` depuis l'env. Défaut `sparse_data` (MVP).
 */
export function readWeightsProfileFromEnv(): MatchingWeightsProfile {
  const raw = process.env.MATCHING_WEIGHTS_PROFILE;
  if (raw === "mature") return "mature";
  return "sparse_data";
}
