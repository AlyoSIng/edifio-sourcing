"use client";

/**
 * Popover « Personnalisée » pour les filtres temporels dashboards.
 *
 * Chantier J1 — Steve 2026-06-04. Étend le RangeFilter (7/30/90j) avec
 * une 4e option « Personnalisée » qui révèle 2 date pickers from/to et
 * navigue vers `?range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD`.
 *
 * Pourquoi un Client Component séparé : RangeFilter reste Server (rendu
 * statique des 3 liens 7/30/90j), seul le popover personnalisé exige
 * du state React (open/close + valeurs des champs). Le bouton qui ouvre
 * est rendu côté Client et hydraté immédiatement.
 *
 * UX : le popover par défaut propose les 30 derniers jours, mais on peut
 * tirer jusqu'à 366j en arrière. Bouton « Appliquer » → navigation.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { formatDateLocal } from "./range";

export function CustomRangePopover({
  basePath,
  current,
  initialFrom,
  initialTo,
  extraParams,
}: {
  basePath: string;
  current: string;
  /** YYYY-MM-DD pour pré-remplir from si déjà custom. */
  initialFrom?: string;
  initialTo?: string;
  extraParams?: Record<string, string>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Valeurs par défaut : 30 derniers jours si rien de pré-rempli.
  const today = new Date();
  const thirtyAgo = new Date(today);
  thirtyAgo.setDate(thirtyAgo.getDate() - 30);
  const [from, setFrom] = useState(initialFrom ?? formatDateLocal(thirtyAgo));
  const [to, setTo] = useState(initialTo ?? formatDateLocal(today));

  function handleApply(e: React.FormEvent) {
    e.preventDefault();
    if (!from || !to) return;
    if (from > to) return;
    const params = new URLSearchParams({ range: "custom", from, to });
    if (extraParams) {
      for (const [k, v] of Object.entries(extraParams)) {
        if (v) params.set(k, v);
      }
    }
    router.push(`${basePath}?${params.toString()}`);
    setOpen(false);
  }

  const isActive = current === "custom";

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={[
          "rounded-full px-3 py-1 text-xs font-medium transition",
          isActive ? "bg-ink text-white" : "text-ink-2 hover:bg-paper-2",
        ].join(" ")}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        Personnalisée
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Plage personnalisée"
          className="absolute right-0 top-full z-20 mt-1 w-72 rounded-lg border border-line bg-white p-3 shadow-lg"
        >
          <form onSubmit={handleApply} className="flex flex-col gap-2">
            <label className="text-xs text-ink-2">
              Du
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                max={to || undefined}
                className="mt-0.5 w-full rounded border border-line px-2 py-1 text-sm"
                required
              />
            </label>
            <label className="text-xs text-ink-2">
              Au
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                min={from || undefined}
                max={formatDateLocal(new Date())}
                className="mt-0.5 w-full rounded border border-line px-2 py-1 text-sm"
                required
              />
            </label>
            <div className="mt-1 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full px-3 py-1 text-xs text-ink-2 hover:bg-paper-2"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="rounded-full bg-ink px-3 py-1 text-xs font-medium text-white hover:opacity-90"
              >
                Appliquer
              </button>
            </div>
            <p className="text-[10px] text-muted">
              Plage maximale : 366 jours. Le délai est calé en heure locale.
            </p>
          </form>
        </div>
      )}
    </span>
  );
}
