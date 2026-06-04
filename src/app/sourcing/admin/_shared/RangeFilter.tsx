/**
 * RangeFilter — bouton segmenté 7j / 30j / 90j pour les dashboards admin.
 *
 * Pur Server Component : génère des `<Link>` avec `?range=` dans le href,
 * pas d'état React.
 *
 * Chantier I1 — Steve 2026-06-04.
 */

import Link from "next/link";

// I4 — helpers extraits dans `./range.ts` pour être testables sans JSX.
// On les ré-exporte ici pour préserver l'API publique côté pages.
export {
  parseRange,
  rangeDaysAgo,
  parseCustomRange,
  formatDateLocal,
  type RangeOption,
} from "./range";
import type { RangeOption } from "./range";
import { CustomRangePopover } from "./CustomRangePopover";

const RANGE_OPTIONS: Array<{ value: Exclude<RangeOption, "custom">; label: string }> = [
  { value: "7", label: "7 j" },
  { value: "30", label: "30 j" },
  { value: "90", label: "90 j" },
];

export function RangeFilter({
  basePath,
  current,
  extraParams,
  customFrom,
  customTo,
}: {
  /** Préfixe URL (ex. `/sourcing/admin/ia-usage`). */
  basePath: string;
  current: RangeOption;
  /** Autres params à conserver dans le href. */
  extraParams?: Record<string, string>;
  /** Pré-remplir le popover si on est déjà en mode custom (YYYY-MM-DD). */
  customFrom?: string;
  customTo?: string;
}) {
  const buildHref = (range: Exclude<RangeOption, "custom">): string => {
    const params = new URLSearchParams({ range });
    if (extraParams) {
      for (const [k, v] of Object.entries(extraParams)) {
        if (v) params.set(k, v);
      }
    }
    return `${basePath}?${params.toString()}`;
  };

  return (
    <nav
      className="inline-flex items-center rounded-full border border-line bg-white p-0.5"
      aria-label="Filtrer par période"
    >
      {RANGE_OPTIONS.map((opt) => {
        const active = opt.value === current;
        return (
          <Link
            key={opt.value}
            href={buildHref(opt.value)}
            className={[
              "rounded-full px-3 py-1 text-xs font-medium transition",
              active ? "bg-ink text-white" : "text-ink-2 hover:bg-paper-2",
            ].join(" ")}
            aria-current={active ? "page" : undefined}
          >
            {opt.label}
          </Link>
        );
      })}
      {/* J1 — option personnalisée avec date pickers (Client Component séparé). */}
      <CustomRangePopover
        basePath={basePath}
        current={current}
        initialFrom={customFrom}
        initialTo={customTo}
        extraParams={extraParams}
      />
    </nav>
  );
}
