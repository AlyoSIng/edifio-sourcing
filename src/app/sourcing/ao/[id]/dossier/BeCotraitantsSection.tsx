"use client";

/**
 * BeCotraitantsSection — gestion des BE cotraitants en mode Cotraitance BE.
 *
 * Affichage conditionnel : visible uniquement quand l'AO n'est PAS en mode
 * Tandem (= aucun architecte n'a accepté la sollicitation). En mode Tandem,
 * AlyoS est cotraitant et c'est l'archi qui est mandataire — la gestion des
 * BE cotraitants n'a pas de sens à ce moment-là.
 *
 * UI :
 *   - Liste des BE déjà ajoutés (cards : cabinet + contact + ville)
 *     avec :
 *       - bouton "Préparer le DC2 →" qui navigue vers
 *         `/dossier/cerfa?be=<uuid>`
 *       - bouton "Retirer" qui appelle `removeBeCotraitant`
 *   - Champ search-as-you-type pour ajouter un BE depuis la bibliothèque
 *     (`searchBureauxEtudes` + `addBeCotraitant`)
 *
 * Tokens DS uniquement (bg-paper-2, border-line, text-ink, brand-red…).
 *
 * Source : brief Board Lot B 2026-06-02.
 */

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import {
  addBeCotraitant,
  removeBeCotraitant,
  searchBureauxEtudes,
  type BureauEtudesSearchResult,
} from "./be-cotraitants/actions";
import type { BeCotraitantSnapshot } from "./page-data";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function errorLabel(code: string): string {
  switch (code) {
    case "not_authenticated":
      return "Session expirée — reconnectez-vous.";
    case "forbidden_domain":
      return "Accès refusé — domaine email non autorisé.";
    case "invalid_input":
      return "Identifiant invalide.";
    case "tender_not_found":
      return "AO introuvable — rechargez la page.";
    case "be_not_found":
      return "Bureau d'études introuvable dans votre bibliothèque.";
    default:
      return "Erreur inattendue — réessayez ou contactez l'administrateur.";
  }
}

// ---------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------

interface BeCotraitantsSectionProps {
  tenderId: string;
  beCotraitants: BeCotraitantSnapshot[];
}

export function BeCotraitantsSection({ tenderId, beCotraitants }: BeCotraitantsSectionProps) {
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BureauEtudesSearchResult[]>([]);
  const [isSearching, startSearch] = useTransition();
  const [isMutating, startMutation] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);

  // IDs des BE déjà ajoutés — filtre côté UI pour éviter le doublon visuel
  // (la Server Action retourne ok:true via ON CONFLICT DO NOTHING, mais on
  // veut surtout signaler à l'utilisateur que ce BE est déjà cotraitant).
  const existingBeIds = new Set(beCotraitants.map((be) => be.id));

  // Debounce simple sur la requête de recherche (300ms).
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  const triggerSearch = useCallback((q: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.trim().length === 0) {
      setResults([]);
      setShowResults(false);
      return;
    }
    searchTimer.current = setTimeout(() => {
      startSearch(async () => {
        const rows = await searchBureauxEtudes(q);
        setResults(rows);
        setShowResults(true);
      });
    }, 300);
  }, []);

  function handleQueryChange(value: string) {
    setQuery(value);
    setError(null);
    triggerSearch(value);
  }

  function handleAdd(beId: string) {
    setError(null);
    startMutation(async () => {
      const result = await addBeCotraitant(tenderId, beId);
      if (result.ok) {
        // Reset du champ recherche et refresh page (re-fetch beCotraitants côté server).
        setQuery("");
        setResults([]);
        setShowResults(false);
        router.refresh();
      } else {
        setError(errorLabel(result.error));
      }
    });
  }

  function handleRemove(beId: string) {
    setError(null);
    startMutation(async () => {
      const result = await removeBeCotraitant(tenderId, beId);
      if (result.ok) {
        router.refresh();
      } else {
        setError(errorLabel(result.error));
      }
    });
  }

  function handlePrepareDc2(beId: string) {
    router.push(`/sourcing/ao/${tenderId}/dossier/cerfa?be=${beId}`);
  }

  return (
    <section aria-labelledby="be-cotraitants-heading" className="mt-6">
      <div className="mb-3 flex items-center gap-2">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-red font-mono text-[11px] font-bold text-white"
          aria-hidden
        >
          BE
        </span>
        <h2 id="be-cotraitants-heading" className="text-sm font-semibold text-ink">
          Cotraitants BE
        </h2>
      </div>
      <p className="mb-3 text-xs text-ink-2">
        Mode Cotraitance BE — AlyoS est mandataire du groupement. Ajoutez les bureaux d&apos;études
        cotraitants depuis votre bibliothèque. Chaque BE devra produire son propre DC2.
      </p>

      {/* Liste des BE déjà cotraitants */}
      {beCotraitants.length > 0 && (
        <ul className="mb-4 grid gap-2 sm:grid-cols-2" role="list">
          {beCotraitants.map((be) => (
            <li
              key={be.id}
              className="flex flex-col gap-3 rounded-lg border border-line bg-white p-4"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{be.cabinet}</p>
                {be.contactName && (
                  <p className="mt-0.5 truncate text-xs text-ink-2">{be.contactName}</p>
                )}
                {be.city && (
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted">
                    {be.city}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => handleRemove(be.id)}
                  disabled={isMutating}
                  className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-paper-2 disabled:opacity-50"
                >
                  Retirer
                </button>
                <button
                  type="button"
                  onClick={() => handlePrepareDc2(be.id)}
                  disabled={isMutating}
                  className="rounded-full bg-brand-red px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  Préparer le DC2 <span aria-hidden>&rarr;</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Recherche pour ajouter un BE */}
      <div className="rounded-lg border border-dashed border-line bg-paper-2 p-4">
        <label
          htmlFor="be-cotraitants-search"
          className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted"
        >
          Ajouter un BE cotraitant
        </label>
        <input
          id="be-cotraitants-search"
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={() => results.length > 0 && setShowResults(true)}
          placeholder="Rechercher un BE par cabinet…"
          disabled={isMutating}
          autoComplete="off"
          className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-red focus:outline-none focus:ring-1 focus:ring-brand-red disabled:opacity-50"
        />

        {/* Indicateur recherche en cours */}
        {isSearching && (
          <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-muted">
            Recherche…
          </p>
        )}

        {/* Résultats — dropdown */}
        {showResults && !isSearching && results.length > 0 && (
          <ul
            className="mt-2 divide-y divide-line rounded-md border border-line bg-white"
            role="list"
          >
            {results.map((be) => {
              const alreadyAdded = existingBeIds.has(be.id);
              return (
                <li
                  key={be.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{be.cabinet}</p>
                    <p className="truncate text-xs text-ink-2">
                      {be.contactName ?? "—"}
                      {be.city ? ` · ${be.city}` : ""}
                    </p>
                  </div>
                  {alreadyAdded ? (
                    <span className="shrink-0 rounded-full bg-paper-2 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-muted">
                      Déjà ajouté
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleAdd(be.id)}
                      disabled={isMutating}
                      className="shrink-0 rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                    >
                      Ajouter
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* Aucun résultat */}
        {showResults && !isSearching && results.length === 0 && query.trim().length > 0 && (
          <p className="mt-2 text-xs text-ink-2">
            Aucun BE trouvé pour «&nbsp;{query.trim()}&nbsp;». Vérifiez votre bibliothèque BE.
          </p>
        )}

        {/* Erreur globale */}
        {error && (
          <p role="alert" className="mt-2 text-sm text-error">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
