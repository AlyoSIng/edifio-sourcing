"use client";

/**
 * GuidedTestCard — carte de gestion d'un test guidé (superadmin).
 *
 * Client Component utilisé dans la page Tests guidés superadmin.
 * Affiche les métadonnées du test, les boutons d'action,
 * et deux accordéons dépliables : éditeur d'étapes + liste des soumissions.
 *
 * Props :
 *   - `test`             : données du test depuis `guided_tests`
 *   - `submissionsCount` : nombre de soumissions (comptage SQL)
 *   - `avgScore`         : score moyen (0-100) ou null si pas de soumissions
 *
 * Actions :
 *   - Activer / désactiver le test (`toggleGuidedTestAction`)
 *   - Supprimer le test (`deleteGuidedTestAction`) — uniquement si 0 soumissions
 *   - Voir + éditer les étapes via `StepEditor`
 *   - Voir les soumissions via `listGuidedTestSubmissionsAction`
 *
 * Décision Board 2026-05-27 — module superadmin éditeur edifio.
 */

import { useState, useTransition } from "react";

import type { GuidedTest } from "@/db/schema/superadmin";

import {
  deleteGuidedTestAction,
  listGuidedTestSubmissionsAction,
  toggleGuidedTestAction,
} from "./actions";
import { StepEditor } from "./StepEditor";

interface GuidedTestCardProps {
  test: GuidedTest;
  submissionsCount: number;
  avgScore: number | null;
}

type Submission = {
  id: string;
  userId: string;
  score: number | null;
  submittedAt: Date;
};

/**
 * Carte de gestion d'un test guidé.
 * Deux accordéons indépendants : "Étapes" et "Soumissions".
 */
export function GuidedTestCard({ test, submissionsCount, avgScore }: GuidedTestCardProps) {
  const [isActive, setIsActive] = useState(test.isActive);
  const [isDeleted, setIsDeleted] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [showSubmissions, setShowSubmissions] = useState(false);
  const [submissions, setSubmissions] = useState<Submission[] | null>(null);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [submissionsError, setSubmissionsError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Si le test a été supprimé, ne plus l'afficher
  if (isDeleted) return null;

  // ─── Toggle actif/inactif ────────────────────────────────────────────────────
  function handleToggle() {
    setActionError(null);
    startTransition(async () => {
      const result = await toggleGuidedTestAction(test.id, !isActive);
      if (!result.ok) {
        setActionError(result.error ?? "Erreur lors du changement de statut.");
      } else {
        setIsActive((prev) => !prev);
      }
    });
  }

  // ─── Suppression ─────────────────────────────────────────────────────────────
  function handleDelete() {
    if (!window.confirm(`Supprimer définitivement le test « ${test.title} » ?`)) return;
    setActionError(null);
    startTransition(async () => {
      const result = await deleteGuidedTestAction(test.id);
      if (!result.ok) {
        if (result.error === "has_submissions") {
          setActionError("Impossible : des soumissions existent pour ce test.");
        } else {
          setActionError(result.error ?? "Erreur lors de la suppression.");
        }
      } else {
        setIsDeleted(true);
      }
    });
  }

  // ─── Chargement des soumissions ──────────────────────────────────────────────
  async function handleShowSubmissions() {
    if (showSubmissions) {
      setShowSubmissions(false);
      return;
    }
    setShowSubmissions(true);
    if (submissions !== null) return; // Déjà chargées

    setSubmissionsLoading(true);
    setSubmissionsError(null);
    const result = await listGuidedTestSubmissionsAction(test.id);
    setSubmissionsLoading(false);
    if (!result.ok) {
      setSubmissionsError(result.error ?? "Erreur lors du chargement.");
    } else {
      setSubmissions(result.submissions ?? []);
    }
  }

  // ─── Formatage du score ──────────────────────────────────────────────────────
  const avgScoreDisplay = avgScore !== null ? `${Math.round(avgScore)} %` : "—";

  return (
    <div className="rounded-md border border-line bg-white shadow-sm">
      {/* En-tête de la carte */}
      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-ink">{test.title}</h3>
            <span
              className={[
                "inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider",
                isActive ? "bg-green-100 text-green-700" : "bg-paper-3 text-muted",
              ].join(" ")}
            >
              {isActive ? "Actif" : "Inactif"}
            </span>
          </div>
          <p className="mt-0.5 font-mono text-[10px] text-muted">
            {test.steps.length} étape{test.steps.length !== 1 ? "s" : ""} · {submissionsCount}{" "}
            soumission{submissionsCount !== 1 ? "s" : ""} · Score moyen : {avgScoreDisplay}
          </p>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleToggle}
            disabled={isPending}
            className={[
              "inline-flex items-center rounded-md border px-3 py-1.5 text-xs font-medium",
              isActive
                ? "border-line bg-paper-2 text-ink-2 hover:bg-paper-3"
                : "border-green-300 bg-green-50 text-green-700 hover:bg-green-100",
              "disabled:cursor-not-allowed disabled:opacity-50",
            ].join(" ")}
          >
            {isActive ? "Désactiver" : "Activer"}
          </button>

          {/* Bouton Supprimer uniquement si 0 soumissions */}
          {submissionsCount === 0 && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className={[
                "inline-flex items-center rounded-md border border-error px-3 py-1.5",
                "text-xs font-medium text-error hover:bg-error-bg",
                "disabled:cursor-not-allowed disabled:opacity-50",
              ].join(" ")}
            >
              Supprimer
            </button>
          )}
        </div>
      </div>

      {/* Erreur d'action */}
      {actionError && (
        <div
          role="alert"
          className={[
            "mx-4 mb-3 rounded-md border border-l-4 border-line border-l-error",
            "bg-error-bg px-4 py-3 text-sm text-error",
          ].join(" ")}
        >
          {actionError}
        </div>
      )}

      {/* Accordéons */}
      <div className="border-t border-line">
        {/* ─── Accordéon Étapes ─────────────────────────────────────────────── */}
        <button
          type="button"
          onClick={() => setShowSteps((prev) => !prev)}
          className={[
            "flex w-full items-center justify-between px-4 py-2.5",
            "text-xs font-medium text-ink-2 hover:bg-paper-2",
            showSteps ? "bg-paper-2" : "",
          ].join(" ")}
        >
          <span>Voir les étapes</span>
          <span className="font-mono text-muted">{showSteps ? "▲" : "▼"}</span>
        </button>

        {showSteps && (
          <div className="border-t border-line px-4 py-4">
            <StepEditor testId={test.id} initialSteps={test.steps} />
          </div>
        )}

        {/* ─── Accordéon Soumissions ────────────────────────────────────────── */}
        <button
          type="button"
          onClick={handleShowSubmissions}
          className={[
            "flex w-full items-center justify-between border-t border-line px-4 py-2.5",
            "text-xs font-medium text-ink-2 hover:bg-paper-2",
            showSubmissions ? "bg-paper-2" : "",
          ].join(" ")}
        >
          <span>Soumissions ({submissionsCount})</span>
          <span className="font-mono text-muted">{showSubmissions ? "▲" : "▼"}</span>
        </button>

        {showSubmissions && (
          <div className="border-t border-line px-4 py-4">
            {submissionsLoading && <p className="text-xs text-muted">Chargement…</p>}
            {submissionsError && (
              <p role="alert" className="text-xs text-error">
                {submissionsError}
              </p>
            )}
            {submissions !== null && submissions.length === 0 && (
              <p className="text-xs text-muted">Aucune soumission pour ce test.</p>
            )}
            {submissions !== null && submissions.length > 0 && (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-line text-left font-mono text-[10px] uppercase tracking-wider text-muted">
                    <th className="pb-2 pr-4">Utilisateur</th>
                    <th className="pb-2 pr-4">Score</th>
                    <th className="pb-2">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {submissions.map((sub) => (
                    <tr key={sub.id}>
                      <td className="py-2 pr-4 font-mono text-[10px] text-muted">
                        {sub.userId.slice(0, 8)}…
                      </td>
                      <td className="py-2 pr-4 text-ink">
                        {sub.score !== null ? `${sub.score} %` : "—"}
                      </td>
                      <td className="py-2 text-muted">
                        {new Date(sub.submittedAt).toLocaleDateString("fr-FR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
