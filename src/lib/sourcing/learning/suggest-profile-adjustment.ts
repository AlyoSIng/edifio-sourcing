/**
 * Calcul des suggestions d'ajustement du profil de recherche à partir des
 * événements d'écartement (Salve U, branche feat/learning-ecartement).
 *
 * Fonction PURE (aucune I/O) : prend des events `learning_events` déjà chargés
 * + le profil de recherche actif + l'horloge `now`, et retourne la liste des
 * suggestions à proposer à l'admin. Human-in-the-loop : ces suggestions ne
 * modifient RIEN par elles-mêmes, elles sont affichées et l'admin valide.
 *
 * Règle (décidée par Steve) :
 *  - on ne regarde que les events `rejected` AVEC un `reasonCode` ACTIONNABLE,
 *  - sur une fenêtre glissante de 30 jours (occurredAt > now - 30 j),
 *  - non encore traités (appliedAt ET dismissedAt NULL),
 *  - regroupés par `reasonCode` ; si count >= SUGGESTION_THRESHOLD (3) → on
 *    génère une suggestion.
 *
 * Cible par motif :
 *  - out_of_area     → départements (payload.geo_zone) les + fréquents parmi les
 *                      écartés ET présents dans `profile.geoZones` → suggère retrait.
 *  - budget_too_low  → max des montants écartés (payload.amount) → suggère
 *                      amountMin = max + marge (10 %, arrondi).
 *  - out_of_scope    → mots récurrents extraits du verbatim → suggère ajout en
 *                      keywords.negative (prudent : on PROPOSE les termes, l'admin
 *                      décide). Pas d'auto-add.
 *  - not_moe_travaux → mot-clé HARDCODÉ « travaux » (intrinsèque au motif :
 *                      l'utilisateur dit explicitement « cet AO est un marché
 *                      travaux, pas un marché MOE »). Pas d'extraction verbatim.
 *                      Skippé si déjà présent dans keywords.negative.
 *
 * Distinction sémantique : alimenté UNIQUEMENT par « Écarter ». « Exclure » ne
 * produit aucun event `learning_events` (zéro effet algo).
 */

import {
  isActionableReason,
  rejectionReasonLabel,
  type RejectionReasonCode,
} from "./rejection-reasons";

// ============================================================================
// Constantes
// ============================================================================

/** Seuil de suggestion : 3 AO écartés avec le même motif actionnable (Steve). */
export const SUGGESTION_THRESHOLD = 3;

/** Fenêtre glissante d'analyse en jours (Steve : 30 derniers jours). */
export const SUGGESTION_WINDOW_DAYS = 30;

/** Marge appliquée au max des montants écartés pour suggérer amountMin (+10 %). */
const BUDGET_MARGIN_RATIO = 0.1;

/** Nombre max de termes proposés en negative pour out_of_scope. */
const MAX_SUGGESTED_NEGATIVE_TERMS = 5;

/** Occurrences minimales d'un mot du verbatim pour être proposé en negative. */
const MIN_TERM_OCCURRENCES = 2;

/** Longueur minimale d'un mot du verbatim pour être candidat negative. */
const MIN_TERM_LENGTH = 4;

/**
 * Stopwords FR courants — exclus de l'extraction de termes récurrents pour
 * out_of_scope (on ne veut pas proposer « pour », « avec », « marché » en
 * mot-clé négatif). Liste volontairement courte et conservatrice.
 */
const FR_STOPWORDS: ReadonlySet<string> = new Set([
  "avec",
  "pour",
  "dans",
  "cette",
  "cet",
  "les",
  "des",
  "une",
  "que",
  "qui",
  "pas",
  "sur",
  "trop",
  "sont",
  "est",
  "marche",
  "marché",
  "appel",
  "offre",
  "offres",
  "lot",
  "lots",
  "this",
  "the",
  "and",
]);

// ============================================================================
// Types
// ============================================================================

/** Vue minimale d'un `learning_events` consommée par le calcul (mock-friendly). */
export interface LearningEventLite {
  eventType: "selected" | "rejected";
  reasonCode: string | null;
  verbatim: string | null;
  occurredAt: Date;
  /** Non-null = déjà appliqué (exclu du calcul). */
  appliedAt?: Date | null;
  /** Non-null = déjà ignoré (exclu du calcul). */
  dismissedAt?: Date | null;
  /** Snapshot du tender (cf. LearningEventPayload). */
  payload?: {
    buyer?: string;
    cpv_codes?: string[];
    geo_zone?: string | null;
    amount?: number | null;
  } | null;
}

/** Vue minimale du profil de recherche consommée par le calcul. */
export interface SearchProfileLite {
  geoZones: string[];
  /** amountMin Postgres numeric → string | null (ex. "850000.00"). */
  amountMin: string | null;
  keywords: { positive: string[]; negative: string[]; exact: string[] };
}

/**
 * Changement suggéré, sérialisable tel quel et consommable par
 * `applyProfileSuggestionAction` (U6). Discriminé par `kind`.
 */
export type SuggestedChange =
  | {
      kind: "remove_geo_zones";
      /** Départements à retirer de profile.geoZones. */
      values: string[];
    }
  | {
      kind: "set_amount_min";
      /** Nouvelle valeur amountMin proposée (number, marge incluse). */
      value: number;
    }
  | {
      kind: "add_negative_keywords";
      /** Termes proposés à ajouter en keywords.negative. */
      values: string[];
    };

export interface ProfileSuggestion {
  reasonCode: RejectionReasonCode;
  /** Libellé FR du motif (ex. « Hors zone géographique »). */
  label: string;
  /** Nombre d'AO écartés actionnables sur la fenêtre pour ce motif. */
  count: number;
  /** Phrase prête à afficher (ex. « 3 AO écartés pour 'hors zone' — dép. 13, 83. »). */
  description: string;
  /** Changement concret à appliquer si l'admin valide. */
  suggestedChange: SuggestedChange;
}

// ============================================================================
// Helpers internes
// ============================================================================

/** Normalise une valeur Postgres numeric (string) en number, ou null. */
function parseAmount(raw: string | null): number | null {
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Compte les occurrences puis trie par fréquence décroissante (puis ordre
 * d'apparition stable pour déterminisme des tests).
 */
function rankByFrequency<T extends string>(items: T[]): Array<{ value: T; count: number }> {
  const counts = new Map<T, number>();
  const firstSeen = new Map<T, number>();
  items.forEach((item, idx) => {
    counts.set(item, (counts.get(item) ?? 0) + 1);
    if (!firstSeen.has(item)) firstSeen.set(item, idx);
  });
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return (firstSeen.get(a.value) ?? 0) - (firstSeen.get(b.value) ?? 0);
    });
}

/**
 * Extrait les mots significatifs d'un ensemble de verbatims (lowercase,
 * dédup par occurrence, hors stopwords, longueur >= MIN_TERM_LENGTH).
 */
function extractRecurrentTerms(verbatims: string[]): string[] {
  const tokens: string[] = [];
  for (const v of verbatims) {
    if (!v) continue;
    // Découpe sur tout ce qui n'est pas lettre (FR accents inclus) ni chiffre.
    const words = v
      .toLowerCase()
      .split(/[^a-zà-ÿ0-9]+/i)
      .map((w) => w.trim())
      .filter((w) => w.length >= MIN_TERM_LENGTH && !FR_STOPWORDS.has(w));
    tokens.push(...words);
  }
  return rankByFrequency(tokens)
    .filter((t) => t.count >= MIN_TERM_OCCURRENCES)
    .slice(0, MAX_SUGGESTED_NEGATIVE_TERMS)
    .map((t) => t.value);
}

// ============================================================================
// Fonction principale
// ============================================================================

/**
 * Calcule les suggestions d'ajustement du profil à partir des events.
 *
 * @param events  Events `learning_events` de l'org (tous types — filtrés ici).
 * @param profile Profil de recherche actif (le défaut de l'org en pratique).
 * @param now     Horloge de référence (injectée pour testabilité déterministe).
 * @returns       Liste de suggestions (vide si aucun motif n'atteint le seuil).
 */
export function computeSuggestions(
  events: LearningEventLite[],
  profile: SearchProfileLite,
  now: Date,
): ProfileSuggestion[] {
  const windowStart = new Date(now.getTime() - SUGGESTION_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // 1. Filtre : rejected + motif actionnable + dans la fenêtre + non traité.
  const actionableEvents = events.filter(
    (e) =>
      e.eventType === "rejected" &&
      e.reasonCode !== null &&
      isActionableReason(e.reasonCode) &&
      e.occurredAt.getTime() > windowStart.getTime() &&
      e.occurredAt.getTime() <= now.getTime() &&
      !e.appliedAt &&
      !e.dismissedAt,
  );

  // 2. Regroupe par reasonCode.
  const byReason = new Map<string, LearningEventLite[]>();
  for (const e of actionableEvents) {
    const code = e.reasonCode as string;
    const bucket = byReason.get(code);
    if (bucket) bucket.push(e);
    else byReason.set(code, [e]);
  }

  const suggestions: ProfileSuggestion[] = [];

  for (const [code, bucket] of byReason) {
    if (bucket.length < SUGGESTION_THRESHOLD) continue;

    const reasonCode = code as RejectionReasonCode;
    const label = rejectionReasonLabel(code);
    const count = bucket.length;

    if (reasonCode === "out_of_area") {
      // Départements écartés présents dans le profil → candidats au retrait.
      const profileZones = new Set(profile.geoZones);
      const rejectedZones = bucket
        .map((e) => e.payload?.geo_zone ?? null)
        .filter((z): z is string => z !== null && profileZones.has(z));
      const ranked = rankByFrequency(rejectedZones).map((r) => r.value);
      if (ranked.length === 0) continue; // rien à retirer du profil
      suggestions.push({
        reasonCode,
        label,
        count,
        description: `${count} AO écartés pour « hors zone » — département(s) ${ranked.join(", ")}. Les retirer du profil ?`,
        suggestedChange: { kind: "remove_geo_zones", values: ranked },
      });
    } else if (reasonCode === "budget_too_low") {
      // Max des montants écartés + marge → nouveau amountMin proposé.
      const amounts = bucket
        .map((e) => parseAmount(e.payload?.amount != null ? String(e.payload.amount) : null))
        .filter((a): a is number => a !== null && a > 0);
      if (amounts.length === 0) continue; // pas de montant exploitable
      const maxAmount = Math.max(...amounts);
      const currentMin = parseAmount(profile.amountMin);
      const suggested = Math.round(maxAmount * (1 + BUDGET_MARGIN_RATIO));
      // Ne suggère que si ça relève réellement le plancher actuel.
      if (currentMin !== null && suggested <= currentMin) continue;
      suggestions.push({
        reasonCode,
        label,
        count,
        description: `${count} AO écartés pour « budget trop faible » — le plus élevé valait ${maxAmount.toLocaleString("fr-FR")} €. Relever le budget minimum à ${suggested.toLocaleString("fr-FR")} € ?`,
        suggestedChange: { kind: "set_amount_min", value: suggested },
      });
    } else if (reasonCode === "out_of_scope") {
      // Termes récurrents du verbatim → proposés en negative (prudent).
      const verbatims = bucket.map((e) => e.verbatim ?? "").filter((v) => v.length > 0);
      const existingNegative = new Set(profile.keywords.negative.map((k) => k.toLowerCase()));
      const terms = extractRecurrentTerms(verbatims).filter((t) => !existingNegative.has(t));
      if (terms.length === 0) continue; // rien de récurrent à proposer
      suggestions.push({
        reasonCode,
        label,
        count,
        description: `${count} AO écartés pour « hors métier ». Termes récurrents : ${terms.join(", ")}. Les ajouter aux mots-clés négatifs ?`,
        suggestedChange: { kind: "add_negative_keywords", values: terms },
      });
    } else if (reasonCode === "not_moe_travaux") {
      // Mot-clé HARDCODÉ intrinsèque au motif : l'utilisateur signale que l'AO
      // est un marché travaux, pas une mission MOE. Le terme « travaux » est
      // donc proposé directement, indépendamment du verbatim. Skip si déjà
      // présent dans le profil (rien de neuf à suggérer).
      const existingNegative = new Set(profile.keywords.negative.map((k) => k.toLowerCase()));
      if (existingNegative.has("travaux")) continue;
      suggestions.push({
        reasonCode,
        label,
        count,
        description: `${count} AO écartés car marché travaux (hors mission MOE). Ajouter « travaux » aux mots-clés négatifs du profil ?`,
        suggestedChange: { kind: "add_negative_keywords", values: ["travaux"] },
      });
    }
  }

  // Tri stable : par count décroissant pour mettre les motifs les + fréquents en tête.
  return suggestions.sort((a, b) => b.count - a.count);
}
