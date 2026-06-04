/**
 * RangeFilter — bouton segmenté 7j / 30j / 90j pour les dashboards admin.
 *
 * Pur Server Component : génère des `<Link>` avec `?range=` dans le href,
 * pas d'état React.
 *
 * Chantier I1 — Steve 2026-06-04.
 */

import Link from "next/link";

export type RangeOption = "7" | "30" | "90";

const RANGE_OPTIONS: Array<{ value: RangeOption; label: string }> = [
  { value: "7", label: "7 j" },
  { value: "30", label: "30 j" },
  { value: "90", label: "90 j" },
];

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

export function RangeFilter({
  basePath,
  current,
  extraParams,
}: {
  /** Préfixe URL (ex. `/sourcing/admin/ia-usage`). */
  basePath: string;
  current: RangeOption;
  /** Autres params à conserver dans le href. */
  extraParams?: Record<string, string>;
}) {
  const buildHref = (range: RangeOption): string => {
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
    </nav>
  );
}
