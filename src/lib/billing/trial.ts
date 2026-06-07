/**
 * Logique de cycle de vie du trial / abonnement (Steve 2026-06-05).
 *
 * Lib pure (pas d'I/O BDD) — testable unitairement. Le caller fournit l'org
 * en mémoire et la date courante.
 *
 * Stratégie Stripe minimal MVP (Option C du plan hybride) :
 *   - Pas de webhook Stripe, pas de SDK serveur.
 *   - Les transitions de statut sont déclenchées manuellement par le
 *     superadmin via `/sourcing/superadmin/organizations/[id]/billing`.
 *   - Le décompte du trial est calculé à chaque page-load à partir de
 *     `trial_ends_at` (timestamptz BDD).
 *   - À la migration vers le monorepo `alyos-suivi-chantier` (T3 2026),
 *     cette lib sera remplacée par le module `common/stripe/` déjà câblé
 *     (webhooks, checkout, gestion automatique du trial → active).
 */

/**
 * Statuts BDD de l'organisation.
 * Cohérent avec la migration 0049.
 */
export type SubscriptionStatus = "none" | "trial" | "active" | "expired" | "cancelled";

/**
 * État dérivé pour l'UI : combinaison statut + jours restants + sévérité.
 */
export interface TrialState {
  status: SubscriptionStatus;
  /** Jours restants avant `trial_ends_at` (négatif si déjà expiré). NULL si pas en trial. */
  daysLeft: number | null;
  /** Vrai si l'utilisateur doit voir un bandeau d'alerte. */
  shouldShowBanner: boolean;
  /** Sévérité du bandeau si `shouldShowBanner` : null si rien à afficher. */
  bannerSeverity: "info" | "warning" | "danger" | null;
  /** Vrai si l'app doit être verrouillée (sauf pour le superadmin). */
  isLocked: boolean;
}

/**
 * Snapshot minimal de l'organisation utilisé par cette lib.
 * Type relâché pour pouvoir tester sans passer toute la table.
 */
export interface OrgBillingSnapshot {
  subscriptionStatus: SubscriptionStatus | string;
  trialEndsAt: Date | string | null;
}

/**
 * Calcule l'état d'abonnement d'une organisation à un instant donné.
 *
 * Règles :
 *   - `none`      → pas de bannière, pas de verrou (org créée mais pas démarrée)
 *   - `active`    → pas de bannière, pas de verrou (client payant)
 *   - `trial`     → bannière selon `daysLeft` :
 *       > 15 j   : pas de bannière (essai serein)
 *       3-15 j   : bannière `info` (orange clair) « Essai jusqu'au X »
 *       0-3 j    : bannière `warning` (rouge orangé) « Plus que X jours »
 *       ≤ 0 j    : bannière `danger` + verrou (trial expiré, redirection /trial-expired)
 *   - `expired`   → verrou strict, bannière danger
 *   - `cancelled` → verrou strict, bannière danger
 */
export function computeTrialState(org: OrgBillingSnapshot, now: Date = new Date()): TrialState {
  const status = (org.subscriptionStatus ?? "none") as SubscriptionStatus;
  const trialEndsAt = parseDate(org.trialEndsAt);

  if (status === "active" || status === "none") {
    return {
      status,
      daysLeft: null,
      shouldShowBanner: false,
      bannerSeverity: null,
      isLocked: false,
    };
  }

  if (status === "expired" || status === "cancelled") {
    return {
      status,
      daysLeft: null,
      shouldShowBanner: true,
      bannerSeverity: "danger",
      isLocked: true,
    };
  }

  // status === 'trial'
  const daysLeft = trialEndsAt ? daysBetween(now, trialEndsAt) : null;

  if (daysLeft === null) {
    // Edge case : status='trial' mais pas de trial_ends_at → traité comme info
    return {
      status,
      daysLeft: null,
      shouldShowBanner: false,
      bannerSeverity: null,
      isLocked: false,
    };
  }

  if (daysLeft <= 0) {
    return {
      status,
      daysLeft,
      shouldShowBanner: true,
      bannerSeverity: "danger",
      isLocked: true,
    };
  }

  if (daysLeft <= 3) {
    return {
      status,
      daysLeft,
      shouldShowBanner: true,
      bannerSeverity: "warning",
      isLocked: false,
    };
  }

  if (daysLeft <= 15) {
    return {
      status,
      daysLeft,
      shouldShowBanner: true,
      bannerSeverity: "info",
      isLocked: false,
    };
  }

  // > 15 jours : essai serein, on ne dit rien
  return {
    status,
    daysLeft,
    shouldShowBanner: false,
    bannerSeverity: null,
    isLocked: false,
  };
}

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

function parseDate(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Jours entiers entre `from` et `to` (peut être négatif).
 * Compte les jours civils (minuit à minuit), pas les 24h glissantes.
 */
function daysBetween(from: Date, to: Date): number {
  const dayMs = 1000 * 60 * 60 * 24;
  const fromMidnight = new Date(from);
  fromMidnight.setHours(0, 0, 0, 0);
  const toMidnight = new Date(to);
  toMidnight.setHours(0, 0, 0, 0);
  return Math.round((toMidnight.getTime() - fromMidnight.getTime()) / dayMs);
}
