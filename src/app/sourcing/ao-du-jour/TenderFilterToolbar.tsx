"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { TenderSortOrder } from "@/lib/sourcing/queries";

interface TenderFilterToolbarProps {
  /** Départements présents dans le backlog courant (triés A→Z). */
  availableDepts: string[];
  currentSort: TenderSortOrder;
  currentDepts: string[];
  currentClosingDays: 7 | 15 | 30 | null;
  currentKeyword: string;
}

/**
 * Barre de filtres + tri pour la liste « AO du jour ».
 *
 * Client Component (mise à jour URL sans rechargement complet).
 * Le Server Component parent re-fetche les données via les searchParams
 * mis à jour (export `dynamic = "force-dynamic"` déjà posé côté page).
 *
 * Tri :
 *   - Score (défaut)
 *   - Département A→Z
 *   - Clôture imminente
 *
 * Filtre département : select multiple — filtre la liste côté serveur.
 *
 * Filtre clôture : select simple — "Tous" / "≤ 7 j" / "≤ 15 j" / "≤ 30 j".
 */
export function TenderFilterToolbar({
  availableDepts,
  currentSort,
  currentDepts,
  currentClosingDays,
  currentKeyword,
}: TenderFilterToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  /**
   * Construit un nouvel objet URLSearchParams en partant des params courants
   * et en appliquant les modifications passées en argument.
   */
  const buildParams = useCallback(
    (overrides: Record<string, string | string[] | null>) => {
      const params = new URLSearchParams(searchParams.toString());

      for (const [key, value] of Object.entries(overrides)) {
        params.delete(key);
        if (value === null) continue;
        if (Array.isArray(value)) {
          for (const v of value) params.append(key, v);
        } else {
          params.set(key, value);
        }
      }

      return params.toString();
    },
    [searchParams],
  );

  // État local du draft keyword (évite un push URL à chaque frappe)
  const [keywordDraft, setKeywordDraft] = useState(currentKeyword);

  const handleKeywordSearch = useCallback(() => {
    const qs = buildParams({ keyword: keywordDraft.trim() || null });
    router.push(`${pathname}${qs ? `?${qs}` : ""}`);
  }, [buildParams, keywordDraft, pathname, router]);

  const clearKeyword = useCallback(() => {
    setKeywordDraft("");
    const qs = buildParams({ keyword: null });
    router.push(`${pathname}${qs ? `?${qs}` : ""}`);
  }, [buildParams, pathname, router]);

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as TenderSortOrder;
    const qs = buildParams({ sort: value === "score" ? null : value });
    router.push(`${pathname}${qs ? `?${qs}` : ""}`);
  };

  const handleDeptChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
    const qs = buildParams({ dept: selected.length > 0 ? selected : null });
    router.push(`${pathname}${qs ? `?${qs}` : ""}`);
  };

  const handleClosingChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    const qs = buildParams({ closing: value === "" ? null : value });
    router.push(`${pathname}${qs ? `?${qs}` : ""}`);
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-line bg-paper p-3 text-sm">
      {/* Filtre mots-clés */}
      <div className="flex items-center gap-1.5">
        <label htmlFor="ao-keyword" className="text-xs text-muted">
          Mots-clés&nbsp;:
        </label>
        <input
          id="ao-keyword"
          type="search"
          value={keywordDraft}
          onChange={(e) => setKeywordDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleKeywordSearch();
          }}
          placeholder="Titre ou acheteur…"
          className="w-44 rounded-sm border border-line bg-white px-2 py-1 text-xs text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-brand-red"
          aria-label="Filtrer les AO par mots-clés"
        />
        <button
          type="button"
          onClick={handleKeywordSearch}
          className="hover:bg-ink/80 rounded-sm bg-ink px-2 py-1 text-[11px] font-medium text-white"
          aria-label="Lancer la recherche"
        >
          OK
        </button>
        {currentKeyword ? (
          <button
            type="button"
            onClick={clearKeyword}
            className="text-[10px] text-muted underline-offset-2 hover:underline"
            aria-label="Effacer le filtre mots-clés"
          >
            Effacer
          </button>
        ) : null}
      </div>

      {/* Tri */}
      <div className="flex items-center gap-1.5">
        <label htmlFor="ao-sort" className="text-xs text-muted">
          Tri&nbsp;:
        </label>
        <select
          id="ao-sort"
          value={currentSort}
          onChange={handleSortChange}
          className="rounded-sm border border-line bg-white px-2 py-1 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-brand-red"
        >
          <option value="score">Score (défaut)</option>
          <option value="department">Département A→Z</option>
          <option value="deadline">Clôture imminente</option>
        </select>
      </div>

      {/* Filtre département (visible seulement si des départements sont disponibles) */}
      {availableDepts.length > 0 ? (
        <div className="flex items-center gap-1.5">
          <label htmlFor="ao-dept" className="text-xs text-muted">
            Département&nbsp;:
          </label>
          <select
            id="ao-dept"
            multiple
            size={Math.min(availableDepts.length, 5)}
            value={currentDepts}
            onChange={handleDeptChange}
            className="rounded-sm border border-line bg-white px-2 py-1 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-brand-red"
            aria-label="Filtrer par département (sélection multiple)"
          >
            {availableDepts.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
          {currentDepts.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                const qs = buildParams({ dept: null });
                router.push(`${pathname}${qs ? `?${qs}` : ""}`);
              }}
              className="text-[10px] text-muted underline-offset-2 hover:underline"
              aria-label="Effacer le filtre département"
            >
              Effacer
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Filtre clôture */}
      <div className="flex items-center gap-1.5">
        <label htmlFor="ao-closing" className="text-xs text-muted">
          Clôture&nbsp;:
        </label>
        <select
          id="ao-closing"
          value={currentClosingDays ?? ""}
          onChange={handleClosingChange}
          className="rounded-sm border border-line bg-white px-2 py-1 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-brand-red"
        >
          <option value="">Tous</option>
          <option value="7">≤ 7 jours</option>
          <option value="15">≤ 15 jours</option>
          <option value="30">≤ 30 jours</option>
        </select>
      </div>
    </div>
  );
}
