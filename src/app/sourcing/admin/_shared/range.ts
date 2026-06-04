/**
 * Helpers parseRange / rangeDaysAgo pour les filtres temporels dashboards admin.
 *
 * Extraits du composant `RangeFilter.tsx` dans un fichier `.ts` pur pour
 * pouvoir être testés sans devoir parser le JSX du composant React
 * (chantier I4 — Steve 2026-06-04).
 *
 * Le composant `RangeFilter` ré-exporte ces symboles pour préserver l'API
 * publique côté pages.
 */

export type RangeOption = "7" | "30" | "90" | "custom";

export function parseRange(input: string | string[] | undefined): RangeOption {
  const v = Array.isArray(input) ? input[0] : input;
  if (v === "7" || v === "30" || v === "90" || v === "custom") return v;
  return "30";
}

export function rangeDaysAgo(range: RangeOption, now: Date = new Date()): Date {
  const d = new Date(now.getTime());
  if (range === "custom") return d; // utilisé seulement comme défaut, voir parseCustomRange
  d.setDate(d.getDate() - Number(range));
  return d;
}

/**
 * Parse les bornes ISO `YYYY-MM-DD` depuis les query params Next.js. Le filtre
 * « personnalisé » du RangeFilter passe `?range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD`.
 * Retourne `null` si invalide ou hors d'un range raisonnable (1 an max pour
 * borner les coûts BDD).
 *
 * Convention : `from` est inclusif minuit (00:00:00 local), `to` est
 * exclusif minuit du lendemain (23:59:59.999 local) — pratique pour des
 * comparaisons `>= from AND < to`.
 */
export function parseCustomRange(
  fromInput: string | string[] | undefined,
  toInput: string | string[] | undefined,
): { from: Date; to: Date } | null {
  const fromStr = Array.isArray(fromInput) ? fromInput[0] : fromInput;
  const toStr = Array.isArray(toInput) ? toInput[0] : toInput;
  if (!fromStr || !toStr) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromStr) || !/^\d{4}-\d{2}-\d{2}$/.test(toStr)) return null;
  const from = new Date(fromStr + "T00:00:00");
  const to = new Date(toStr + "T23:59:59.999");
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  if (from > to) return null;
  // Borne à 366 jours max pour limiter les coûts BDD.
  const maxRangeMs = 366 * 24 * 60 * 60 * 1000;
  if (to.getTime() - from.getTime() > maxRangeMs) return null;
  return { from, to };
}

/**
 * Formatte une Date en YYYY-MM-DD pour les inputs `<input type="date">`.
 * Évite le décalage UTC du `.toISOString().slice(0,10)` en utilisant les
 * accessors locaux.
 */
export function formatDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
