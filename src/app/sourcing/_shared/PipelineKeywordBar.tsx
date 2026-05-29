"use client";

/**
 * PipelineKeywordBar — barre de recherche par mots-clés pour les pages pipeline.
 *
 * Deux modes :
 *   1. Mode URL (défaut, `onSearch` absent) — pour Sélectionnés + Reportés :
 *      push `?keyword=...` dans l'URL, ce qui déclenche le re-fetch Server Component.
 *   2. Mode local (`onSearch` fourni) — pour Cotraitance, Mandataire, C/R :
 *      appel callback, pas de router push (les données sont déjà en mémoire).
 *
 * Dans le mode URL, `onClear` est géré en interne (reset URL).
 * Dans le mode local, `onClear` peut être fourni ou sera déduit du callback
 * avec une chaîne vide.
 *
 * Pattern UI identique à TenderFilterToolbar (keyword block uniquement).
 */

import { useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

interface PipelineKeywordBarProps {
  /** Valeur initiale du champ (keyword actif). */
  currentKeyword: string;
  /**
   * Si fourni : mode local (callback). L'appelant gère le filtrage en mémoire.
   * Si absent : mode URL — push `?keyword=...` via useRouter.
   */
  onSearch?: (keyword: string) => void;
  /** Appelé quand l'utilisateur efface le filtre. Ignoré en mode URL (géré en interne). */
  onClear?: () => void;
}

/**
 * Composant interne utilisé en mode URL (nécessite useSearchParams).
 * Séparé pour éviter l'import conditionnel des hooks Next.js.
 */
function PipelineKeywordBarUrl({ currentKeyword }: { currentKeyword: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [keywordDraft, setKeywordDraft] = useState(currentKeyword);

  const handleSearch = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    const trimmed = keywordDraft.trim();
    if (trimmed) {
      params.set("keyword", trimmed);
    } else {
      params.delete("keyword");
    }
    router.push(`${pathname}${params.toString() ? `?${params.toString()}` : ""}`);
  }, [keywordDraft, pathname, router, searchParams]);

  const handleClear = useCallback(() => {
    setKeywordDraft("");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("keyword");
    router.push(`${pathname}${params.toString() ? `?${params.toString()}` : ""}`);
  }, [pathname, router, searchParams]);

  return (
    <KeywordBarUI
      keywordDraft={keywordDraft}
      onChange={setKeywordDraft}
      onSearch={handleSearch}
      onClear={handleClear}
      hasActiveKeyword={!!currentKeyword}
    />
  );
}

/**
 * Composant interne utilisé en mode local (callback).
 */
function PipelineKeywordBarLocal({
  currentKeyword,
  onSearch,
  onClear,
}: Required<Pick<PipelineKeywordBarProps, "currentKeyword" | "onSearch">> & {
  onClear?: () => void;
}) {
  const [keywordDraft, setKeywordDraft] = useState(currentKeyword);

  const handleSearch = useCallback(() => {
    onSearch(keywordDraft.trim());
  }, [keywordDraft, onSearch]);

  const handleClear = useCallback(() => {
    setKeywordDraft("");
    if (onClear) {
      onClear();
    } else {
      onSearch("");
    }
  }, [onClear, onSearch]);

  return (
    <KeywordBarUI
      keywordDraft={keywordDraft}
      onChange={setKeywordDraft}
      onSearch={handleSearch}
      onClear={handleClear}
      hasActiveKeyword={!!currentKeyword}
    />
  );
}

/**
 * UI partagée — rendu de la barre keyword.
 */
function KeywordBarUI({
  keywordDraft,
  onChange,
  onSearch,
  onClear,
  hasActiveKeyword,
}: {
  keywordDraft: string;
  onChange: (v: string) => void;
  onSearch: () => void;
  onClear: () => void;
  hasActiveKeyword: boolean;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-line bg-paper p-3 text-sm">
      <div className="flex items-center gap-1.5">
        <label className="text-xs text-muted">Mots-clés&nbsp;:</label>
        <input
          type="search"
          value={keywordDraft}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSearch();
          }}
          placeholder="Titre ou acheteur…"
          className="w-44 rounded-sm border border-line bg-white px-2 py-1 text-xs text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-brand-red"
          aria-label="Filtrer par mots-clés"
        />
        <button
          type="button"
          onClick={onSearch}
          className="hover:bg-ink/80 rounded-sm bg-ink px-2 py-1 text-[11px] font-medium text-white"
          aria-label="Lancer la recherche"
        >
          OK
        </button>
        {hasActiveKeyword ? (
          <button
            type="button"
            onClick={onClear}
            className="text-[10px] text-muted underline-offset-2 hover:underline"
            aria-label="Effacer le filtre mots-clés"
          >
            Effacer
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Composant principal — dispatch vers le mode URL ou local selon la présence
 * de la prop `onSearch`.
 */
export function PipelineKeywordBar({ currentKeyword, onSearch, onClear }: PipelineKeywordBarProps) {
  if (onSearch) {
    return (
      <PipelineKeywordBarLocal
        currentKeyword={currentKeyword}
        onSearch={onSearch}
        onClear={onClear}
      />
    );
  }
  return <PipelineKeywordBarUrl currentKeyword={currentKeyword} />;
}
