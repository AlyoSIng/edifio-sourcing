/**
 * Helpers purs — classification des items bibliothèque par état d'expiration.
 *
 * Décision Steve 2026-06-03 (chantier G2). Trois buckets :
 *
 *   - `expired`        : `valid_until < today` → exclus automatiquement du ZIP
 *                        (cf. filtre dans compileDossierAction). À renouveler
 *                        d'urgence si on veut les inclure de nouveau.
 *   - `expiringSoon`   : `today <= valid_until < today + 30 j` → encore inclus
 *                        dans le ZIP mais à surveiller. Si l'AO se conclut
 *                        après la deadline d'expiration, l'attestation sera
 *                        périmée au moment de l'analyse par l'acheteur.
 *   - `validLong`      : `valid_until` null OU > today + 30 j → safe.
 *
 * Pure : pas d'I/O ni de BDD. Testable seul.
 */

import type { PresentationLibraryItem } from "@/db/schema/library";

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Fenêtre d'alerte « bientôt expiré » en jours (Steve 2026-06-03). */
export const EXPIRING_SOON_WINDOW_DAYS = 30;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LibraryExpiryClassification {
  /** Items expirés — exclus du ZIP par la pipeline de compilation. */
  expired: PresentationLibraryItem[];
  /** Items qui expirent dans les EXPIRING_SOON_WINDOW_DAYS prochains jours. */
  expiringSoon: PresentationLibraryItem[];
  /**
   * Items dont `valid_until` est null ou > seuil → safe.
   * Non exposés au caller — calculés mais omis de la sortie (juste pour la
   * complétude logique de la classification).
   */
  validLong: PresentationLibraryItem[];
}

// ---------------------------------------------------------------------------
// Fonction principale
// ---------------------------------------------------------------------------

/**
 * Classifie les items biblio selon leur date d'expiration.
 *
 * @param items  Liste presentation_library de l'org.
 * @param now    Date de référence (défaut `new Date()`).
 * @param windowDays  Seuil « bientôt expiré » en jours (défaut 30).
 */
export function classifyLibraryExpiry(
  items: readonly PresentationLibraryItem[],
  now: Date = new Date(),
  windowDays: number = EXPIRING_SOON_WINDOW_DAYS,
): LibraryExpiryClassification {
  // On normalise les bornes en YYYY-MM-DD pour comparer aux strings Drizzle
  // (la colonne `valid_until` est typée `date` → string).
  const today = new Date(now.getTime());
  today.setHours(0, 0, 0, 0);
  const todayIso = isoDate(today);

  const soonLimit = new Date(today.getTime() + windowDays * 24 * 60 * 60 * 1000);
  const soonIso = isoDate(soonLimit);

  const expired: PresentationLibraryItem[] = [];
  const expiringSoon: PresentationLibraryItem[] = [];
  const validLong: PresentationLibraryItem[] = [];

  for (const item of items) {
    if (!item.validUntil) {
      // Pas de date d'expiration → safe (présentation société, références…).
      validLong.push(item);
      continue;
    }
    const validIso = String(item.validUntil).slice(0, 10);
    if (validIso < todayIso) {
      expired.push(item);
    } else if (validIso < soonIso) {
      expiringSoon.push(item);
    } else {
      validLong.push(item);
    }
  }

  return { expired, expiringSoon, validLong };
}

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

/**
 * Format `YYYY-MM-DD` en timezone LOCALE (pas UTC). On évite `toISOString()`
 * qui shifte d'un jour aux frontières (UTC vs Paris UTC+1/+2).
 */
function isoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
