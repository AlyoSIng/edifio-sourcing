/**
 * Helpers de formatage pour la page AO du jour V1.
 *
 * Sortie strictement FR-FR :
 *  - montants en euros avec séparateur d'unité (« 850 000 € »)
 *  - dates en format court FR (« 28 mai » pour `formatDeadline`)
 *
 * Fonctions pures, testables hors React. Pas d'effets de bord (`Intl` est
 * déterministe sur une stack Node ≥ 16 / V8 récent — ICU bundlé Vercel).
 */

/**
 * Formate un montant en euros à partir de la valeur brute Drizzle (`string`
 * pour le type Postgres `numeric`). Retourne « — » pour les valeurs falsy.
 *
 * Exemples :
 *   formatAmount("850000.00")  → "850 000 €"
 *   formatAmount("1200000")    → "1 200 000 €"
 *   formatAmount(null)         → "—"
 *
 * On utilise `style: "currency"` avec `maximumFractionDigits: 0` : les
 * montants AO sont des estimations grossières, les centimes ne portent pas
 * d'information utile pour la décision de sélection en V1.
 */
export function formatAmount(amount: string | null): string {
  if (!amount) return "—";
  const parsed = Number(amount);
  if (Number.isNaN(parsed)) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(parsed);
}

/**
 * Formate une deadline en format court FR (« 28 mai », « 14 juin »). Utilisé
 * dans la ligne meta de la TenderCard pour rester concis sur mobile.
 *
 * Retourne « — » si null. On affiche jour + mois sans année car la deadline
 * est filtrée `> now()` côté SQL : pas de risque d'ambiguïté d'année à
 * l'horizon visible.
 */
export function formatDeadline(deadline: Date | null): string {
  if (!deadline) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
  }).format(deadline);
}

/**
 * Formate la date du jour en format long FR (« jeudi 21 mai 2026 ») — utilisée
 * dans le header de la page « AO du jour ». Le paramètre `now` est injectable
 * pour les tests (défaut : `new Date()`).
 */
export function formatTodayLongFr(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "full" }).format(now);
}
