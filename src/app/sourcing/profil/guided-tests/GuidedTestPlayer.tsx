"use client";

/**
 * GuidedTestPlayer — lecteur de test guidé interactif (Client Component).
 *
 * Affiche les étapes une par une :
 *   - QCM    : radio buttons, bouton "Suivant"
 *   - Open   : textarea, bouton "Suivant"
 *   - Action : description de l'action à réaliser, bouton "Suivant"
 * Dernière étape : champ "Remarques (optionnel)" + bouton "Soumettre".
 *
 * Si déjà complété : affiche le score + bouton "Refaire le test".
 *
 * Décision Board 2026-05-27 — module profil utilisateur edifio Sourcing.
 */

import { useState, useTransition } from "react";

import type { GuidedTest } from "@/db/schema/superadmin";

import { submitGuidedTestAction } from "./actions";

interface PreviousSubmission {
  score: number | null;
  submittedAt: Date;
}

interface GuidedTestPlayerProps {
  test: GuidedTest;
  previousSubmission: PreviousSubmission | null;
}

export function GuidedTestPlayer({ test, previousSubmission }: GuidedTestPlayerProps) {
  const [mode, setMode] = useState<"summary" | "playing" | "done">(
    previousSubmission ? "summary" : "playing",
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [remarks, setRemarks] = useState("");
  const [finalScore, setFinalScore] = useState<number | null>(previousSubmission?.score ?? null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const steps = test.steps ?? [];

  function handleRestart() {
    setMode("playing");
    setStepIndex(0);
    setAnswers({});
    setRemarks("");
    setError(null);
  }

  function handleNext() {
    setStepIndex((i) => i + 1);
  }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await submitGuidedTestAction(test.id, answers, remarks || undefined);
      if (result.ok) {
        setFinalScore(result.score);
        setMode("done");
      } else {
        setError(result.error ?? "Une erreur est survenue.");
      }
    });
  }

  // ── Mode "résumé" (déjà complété) ──────────────────────────────────────────
  if (mode === "summary") {
    const formattedDate = previousSubmission?.submittedAt
      ? new Intl.DateTimeFormat("fr-FR", {
          day: "numeric",
          month: "long",
          year: "numeric",
        }).format(new Date(previousSubmission.submittedAt))
      : null;

    return (
      <div className="rounded-md border border-green-200 bg-green-50 px-5 py-4">
        <p className="mb-1 text-sm font-medium text-green-800">
          Déjà complété
          {finalScore !== null ? ` — Score : ${finalScore}%` : " — Score non calculé"}
        </p>
        {formattedDate && <p className="mb-3 text-xs text-green-700">Soumis le {formattedDate}</p>}
        <button
          type="button"
          onClick={handleRestart}
          className="rounded-md border border-green-600 px-3 py-1.5 text-sm font-semibold text-green-700 hover:bg-green-100"
        >
          Refaire le test
        </button>
      </div>
    );
  }

  // ── Mode "terminé" ──────────────────────────────────────────────────────────
  if (mode === "done") {
    return (
      <div className="rounded-md border border-violet-200 bg-violet-50 px-5 py-4">
        <p className="text-sm font-semibold text-violet-800">
          {finalScore !== null
            ? `Score obtenu : ${finalScore}% ✓`
            : "Test soumis ✓ (pas de QCM à corriger)"}
        </p>
        <button
          type="button"
          onClick={handleRestart}
          className="mt-3 text-xs text-violet-700 underline underline-offset-2 hover:no-underline"
        >
          Refaire le test
        </button>
      </div>
    );
  }

  // ── Mode "en cours" ─────────────────────────────────────────────────────────
  if (steps.length === 0) {
    return <p className="text-sm text-muted">Ce test ne contient aucune étape.</p>;
  }

  const isLastStep = stepIndex === steps.length - 1;
  const currentStep = steps[stepIndex];

  if (!currentStep) return null;

  const currentAnswer = answers[currentStep.id];
  const canProceed = currentStep.type === "action" || currentAnswer !== undefined;

  return (
    <div className="space-y-4">
      {error && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {/* Barre de progression */}
      <div className="space-y-1">
        <p className="text-xs text-muted">
          Étape {stepIndex + 1} sur {steps.length}
        </p>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-violet-600 transition-all duration-300"
            style={{ width: `${Math.round(((stepIndex + 1) / steps.length) * 100)}%` }}
          />
        </div>
      </div>

      <p className="text-sm font-medium text-ink">{currentStep.question}</p>

      {/* QCM */}
      {currentStep.type === "qcm" && currentStep.options && (
        <fieldset>
          <legend className="sr-only">Options de réponse</legend>
          <div className="space-y-2">
            {currentStep.options.map((option, optIdx) => (
              <label
                key={optIdx}
                className="flex cursor-pointer items-center gap-3 rounded-md border border-line bg-white px-3 py-2 text-sm hover:bg-paper-2"
              >
                <input
                  type="radio"
                  name={`step-${currentStep.id}`}
                  value={optIdx}
                  checked={currentAnswer === optIdx}
                  onChange={() => setAnswers((prev) => ({ ...prev, [currentStep.id]: optIdx }))}
                  className="accent-violet-700"
                />
                {option}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {/* Open */}
      {currentStep.type === "open" && (
        <textarea
          rows={4}
          value={(currentAnswer as string) ?? ""}
          onChange={(e) => setAnswers((prev) => ({ ...prev, [currentStep.id]: e.target.value }))}
          placeholder="Votre réponse…"
          className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
      )}

      {/* Action */}
      {currentStep.type === "action" && (
        <p className="rounded-md border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Réalisez l&apos;action décrite, puis cliquez sur &quot;Suivant&quot;.
        </p>
      )}

      {/* Remarques (dernière étape) */}
      {isLastStep && (
        <div>
          <label htmlFor={`remarks-${test.id}`} className="mb-1 block text-sm font-medium text-ink">
            Remarques <span className="font-normal text-muted">(optionnel)</span>
          </label>
          <textarea
            id={`remarks-${test.id}`}
            rows={3}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Commentaires libres…"
            className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
      )}

      <div className="flex justify-end">
        {isLastStep ? (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending || !canProceed}
            className="rounded-md bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
          >
            {isPending ? "Envoi en cours…" : "Soumettre"}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleNext}
            disabled={!canProceed}
            className="rounded-md bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
          >
            Suivant
          </button>
        )}
      </div>
    </div>
  );
}
