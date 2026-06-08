/**
 * Motifs structurés d'écartement d'un AO — apprentissage par écartement
 * (Salve U, Steve 2026-06-08, branche feat/learning-ecartement).
 *
 * Quand l'utilisateur écarte un AO via « Écarter » (`rejectTenderAction`), il
 * choisit l'un de ces 6 motifs. Les motifs `actionable: true` alimentent le
 * calcul de suggestions d'ajustement du profil de recherche
 * (`computeSuggestions`) — human-in-the-loop : la suggestion est toujours
 * validée par un admin, jamais d'auto-modification opaque.
 *
 * Distinction sémantique cruciale :
 *  - « Écarter » (rejectTenderAction, avec motif) → ALIMENTE l'apprentissage.
 *  - « Exclure » (excludeTenderAction)            → reste NEUTRE, zéro effet algo.
 *
 * Mapping motif → critère profil (cf. brief Salve U) :
 *  | Motif (label FR)        | code               | cible profil          | actionable |
 *  | Hors zone géographique  | out_of_area        | geoZones[]            | OUI        |
 *  | Budget / CA trop faible | budget_too_low     | amountMin             | OUI        |
 *  | Hors métier / compétence| out_of_scope       | keywords.negative[]   | OUI        |
 *  | Délai trop court        | deadline_too_short | —                     | non        |
 *  | Concurrence trop forte  | too_competitive    | —                     | non        |
 *  | Autre                   | other              | —                     | non        |
 */

/** Cible du profil de recherche modifiée par une suggestion actionnable. */
export type RejectionReasonTarget = "geoZones" | "amountMin" | "keywordsNegative" | null;

export interface RejectionReason {
  /** Code normalisé stocké dans `learning_events.reason_code`. */
  code: string;
  /** Libellé FR affiché dans la modale « Écarter » + les suggestions. */
  label: string;
  /**
   * Si `true`, ce motif peut générer une suggestion d'ajustement du profil
   * (au-delà du seuil de 3 AO sur 30 j glissants). Sinon, il est seulement
   * tracé dans `learning_events` (pas d'effet algo).
   */
  actionable: boolean;
  /** Critère du profil ciblé par la suggestion (null si non actionnable). */
  target: RejectionReasonTarget;
}

/**
 * Les 6 motifs structurés (ordre = ordre d'affichage des radios dans la modale).
 * `as const` pour dériver `RejectionReasonCode` du tableau (single source of truth).
 */
export const REJECTION_REASONS = [
  {
    code: "out_of_area",
    label: "Hors zone géographique",
    actionable: true,
    target: "geoZones",
  },
  {
    code: "budget_too_low",
    label: "Budget / CA trop faible",
    actionable: true,
    target: "amountMin",
  },
  {
    code: "out_of_scope",
    label: "Hors métier / compétence",
    actionable: true,
    target: "keywordsNegative",
  },
  {
    code: "deadline_too_short",
    label: "Délai trop court",
    actionable: false,
    target: null,
  },
  {
    code: "too_competitive",
    label: "Concurrence trop forte",
    actionable: false,
    target: null,
  },
  {
    code: "other",
    label: "Autre",
    actionable: false,
    target: null,
  },
] as const satisfies readonly RejectionReason[];

/** Union littérale des 6 codes de motif. */
export type RejectionReasonCode = (typeof REJECTION_REASONS)[number]["code"];

/** Set des codes valides — validation rapide côté server action. */
const REJECTION_REASON_CODES: ReadonlySet<string> = new Set(REJECTION_REASONS.map((r) => r.code));

/** Code de repli pour les appels rétrocompat (vieux call-sites sans motif). */
export const DEFAULT_REJECTION_REASON_CODE: RejectionReasonCode = "other";

/** Type guard : `value` est-il un `RejectionReasonCode` valide ? */
export function isRejectionReasonCode(value: unknown): value is RejectionReasonCode {
  return typeof value === "string" && REJECTION_REASON_CODES.has(value);
}

/** Retourne la définition d'un motif par son code, ou `undefined` si inconnu. */
export function getRejectionReason(code: string): RejectionReason | undefined {
  return REJECTION_REASONS.find((r) => r.code === code);
}

/** Libellé FR d'un code, ou le code brut si inconnu (jamais d'exception). */
export function rejectionReasonLabel(code: string): string {
  return getRejectionReason(code)?.label ?? code;
}

/** Un motif est-il actionnable (peut générer une suggestion) ? */
export function isActionableReason(code: string): boolean {
  return getRejectionReason(code)?.actionable ?? false;
}
