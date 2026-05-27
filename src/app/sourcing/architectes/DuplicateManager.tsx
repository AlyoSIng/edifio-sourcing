"use client";

import { useState, useTransition } from "react";

import type { DuplicateGroup } from "./duplicate-actions";
import { deleteArchitectDuplicateAction } from "./duplicate-actions";

interface Props {
  duplicateGroups: DuplicateGroup[];
}

/**
 * Bandeau de gestion des doublons architectes — Client Component.
 *
 * Visible uniquement si l'appelant le conditionne à `isAdmin(profile)`.
 * Logique d'affichage :
 *   - 0 groupes → null (rien affiché)
 *   - N groupes → bandeau d'alerte warn avec compteur + bouton "Voir les doublons"
 *   - Bouton "Supprimer" sur chaque entrée (sauf la dernière du groupe, qu'on
 *     ne peut pas supprimer seule — le groupe disparaîtra naturellement).
 *
 * @param duplicateGroups - Groupes de doublons détectés côté serveur.
 */
export function DuplicateManager({ duplicateGroups: initialGroups }: Props) {
  const [groups, setGroups] = useState<DuplicateGroup[]>(initialGroups);
  const [expanded, setExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();
  // Map id → message d'erreur affiché sous le bouton "Supprimer"
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Aucun doublon : ne rien rendre
  if (groups.length === 0) return null;

  const totalGroups = groups.length;
  const totalEntries = groups.reduce((sum, g) => sum + g.entries.length, 0);

  function handleDelete(id: string) {
    // Effacer une erreur précédente sur cet id
    setErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

    startTransition(async () => {
      const result = await deleteArchitectDuplicateAction(id);

      if (!result.ok) {
        setErrors((prev) => ({
          ...prev,
          [id]: formatError(result.error),
        }));
        return;
      }

      // Mise à jour optimiste : retirer l'entrée supprimée du state local
      setGroups((prev) => {
        const updated = prev
          .map((g) => ({
            ...g,
            entries: g.entries.filter((e) => e.id !== id),
          }))
          // Supprimer les groupes qui n'ont plus qu'une entrée (plus de doublon)
          .filter((g) => g.entries.length >= 2);
        return updated;
      });
    });
  }

  return (
    <div
      className="mb-4 rounded-md border border-warn bg-warn-bg px-4 py-3"
      role="region"
      aria-label="Doublons détectés"
    >
      {/* Ligne résumé */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-warn">
          {totalGroups} groupe{totalGroups !== 1 ? "s" : ""} de doublons détecté
          {totalGroups !== 1 ? "s" : ""} ({totalEntries} entrées au total)
        </p>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="focus:ring-warn/40 inline-flex items-center gap-1 rounded-md border border-warn bg-white px-3 py-1 text-xs font-medium text-warn hover:bg-warn-bg focus:outline-none focus:ring-2"
          aria-expanded={expanded}
        >
          {expanded ? "Masquer" : "Voir les doublons"}
        </button>
      </div>

      {/* Détail des groupes */}
      {expanded && (
        <div className="mt-3 space-y-4">
          {groups.map((group) => (
            <DuplicateGroupPanel
              key={group.key}
              group={group}
              isPending={isPending}
              errors={errors}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Sous-composant : panneau d'un groupe
// ============================================================================

interface PanelProps {
  group: DuplicateGroup;
  isPending: boolean;
  errors: Record<string, string>;
  onDelete: (id: string) => void;
}

function DuplicateGroupPanel({ group, isPending, errors, onDelete }: PanelProps) {
  return (
    <div className="rounded-md border border-line bg-white">
      {/* En-tête du groupe */}
      <div className="bg-surface border-b border-line px-4 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-2">
          {group.entries[0]?.cabinet ?? group.key}
        </span>
        <span className="ml-2 text-xs text-muted">({group.entries.length} entrées)</span>
      </div>

      {/* Liste des entrées */}
      <ul className="divide-y divide-line">
        {group.entries.map((entry, idx) => {
          // La dernière entrée du groupe ne peut pas être supprimée
          // (il faut qu'il en reste au moins une, et on ne force pas la suppression totale)
          const isLast = idx === group.entries.length - 1;
          const isFirst = idx === 0;
          const errorMsg = errors[entry.id];

          return (
            <li key={entry.id} className="flex flex-wrap items-start gap-3 px-4 py-2.5">
              {/* Indicateur canonique */}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium text-ink">{entry.cabinet}</span>
                  {isFirst && (
                    <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700">
                      A conserver
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-muted">
                  {entry.email && <span>Email : {entry.email}</span>}
                  {entry.siren && <span>SIREN : {entry.siren}</span>}
                  {entry.city && <span>Ville : {entry.city}</span>}
                  <span>Créé le : {entry.createdAt.toLocaleDateString("fr-FR")}</span>
                </div>
                {/* Erreur de suppression */}
                {errorMsg && (
                  <p className="mt-0.5 text-xs text-error" role="alert">
                    {errorMsg}
                  </p>
                )}
              </div>

              {/* Bouton suppression */}
              {!isLast && (
                <button
                  type="button"
                  onClick={() => onDelete(entry.id)}
                  disabled={isPending}
                  className="focus:ring-error/40 border-error/30 shrink-0 rounded-md border bg-error-bg px-2.5 py-1 text-xs font-medium text-error hover:border-error focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={`Supprimer l'entrée ${entry.cabinet}`}
                >
                  Supprimer
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ============================================================================
// Utilitaire : formatage des erreurs retour serveur
// ============================================================================

function formatError(error: string): string {
  switch (error) {
    case "has_active_solicitations":
      return "Impossible de supprimer : cet architecte a des sollicitations ou propositions de matching en cours.";
    case "not_found":
      return "Entrée introuvable (déjà supprimée ?).";
    case "forbidden":
      return "Action non autorisée.";
    case "unauthenticated":
      return "Session expirée. Rechargez la page.";
    default:
      return `Erreur inattendue : ${error}`;
  }
}
