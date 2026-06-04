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

export type RangeOption = "7" | "30" | "90";

export function parseRange(input: string | string[] | undefined): RangeOption {
  const v = Array.isArray(input) ? input[0] : input;
  if (v === "7" || v === "30" || v === "90") return v;
  return "30";
}

export function rangeDaysAgo(range: RangeOption, now: Date = new Date()): Date {
  const d = new Date(now.getTime());
  d.setDate(d.getDate() - Number(range));
  return d;
}
