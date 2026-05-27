"use client";

/**
 * StepEditor — éditeur d'étapes d'un test guidé (QCM + questions ouvertes).
 *
 * Client Component utilisé dans GuidedTestCard.
 * Gère la liste des étapes en state local et appelle
 * `updateGuidedTestStepsAction` pour persister les modifications.
 *
 * Fonctionnalités MVP :
 *   - Ajouter une étape QCM (question + 4 options + correctIndex)
 *   - Ajouter une question ouverte (question seulement)
 *   - Modifier chaque étape inline
 *   - Supprimer une étape
 *   - Enregistrer l'ensemble des étapes
 *
 * Pas de drag & drop au MVP (liste verticale simple).
 *
 * Props :
 *   - `testId`       : UUID du test guidé parent
 *   - `initialSteps` : étapes actuelles sérialisées depuis la BDD
 *
 * Décision Board 2026-05-27 — module superadmin éditeur edifio.
 */

import { useState, useTransition } from "react";

import type { GuidedTestStep } from "@/db/schema/superadmin";

import { updateGuidedTestStepsAction } from "./actions";

interface StepEditorProps {
  /** UUID du test guidé parent. */
  testId: string;
  /** Étapes actuelles chargées depuis la BDD. */
  initialSteps: GuidedTestStep[];
}

type FeedbackState = "idle" | "saving" | "saved" | "error";

/**
 * Éditeur d'étapes en liste verticale.
 * Chaque étape est rendue dans un bloc avec border.
 * Feedback visuel (badge vert / rouge) après enregistrement.
 */
export function StepEditor({ testId, initialSteps }: StepEditorProps) {
  const [steps, setSteps] = useState<GuidedTestStep[]>(initialSteps);
  const [feedback, setFeedback] = useState<FeedbackState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // ─── Ajout d'une étape QCM ──────────────────────────────────────────────────
  function addQcmStep() {
    const newStep: GuidedTestStep = {
      id: crypto.randomUUID(),
      type: "qcm",
      question: "",
      options: ["", "", "", ""],
      correctIndex: 0,
    };
    setSteps((prev) => [...prev, newStep]);
  }

  // ─── Ajout d'une question ouverte ───────────────────────────────────────────
  function addOpenStep() {
    const newStep: GuidedTestStep = {
      id: crypto.randomUUID(),
      type: "open",
      question: "",
    };
    setSteps((prev) => [...prev, newStep]);
  }

  // ─── Suppression d'une étape ────────────────────────────────────────────────
  function removeStep(id: string) {
    setSteps((prev) => prev.filter((s) => s.id !== id));
  }

  // ─── Mise à jour de la question d'une étape ─────────────────────────────────
  function updateQuestion(id: string, question: string) {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, question } : s)));
  }

  // ─── Mise à jour d'une option QCM ───────────────────────────────────────────
  function updateOption(stepId: string, optionIndex: number, value: string) {
    setSteps((prev) =>
      prev.map((s) => {
        if (s.id !== stepId || s.type !== "qcm") return s;
        const newOptions = [...(s.options ?? ["", "", "", ""])];
        newOptions[optionIndex] = value;
        return { ...s, options: newOptions };
      }),
    );
  }

  // ─── Mise à jour de la bonne réponse QCM ────────────────────────────────────
  function updateCorrectIndex(stepId: string, correctIndex: number) {
    setSteps((prev) =>
      prev.map((s) => (s.id === stepId && s.type === "qcm" ? { ...s, correctIndex } : s)),
    );
  }

  // ─── Enregistrement ─────────────────────────────────────────────────────────
  function handleSave() {
    setFeedback("saving");
    setErrorMsg(null);

    startTransition(async () => {
      const result = await updateGuidedTestStepsAction(testId, steps);
      if (!result.ok) {
        setFeedback("error");
        setErrorMsg(result.error ?? "Erreur lors de la sauvegarde.");
        // Réinitialise le feedback après 4s
        setTimeout(() => setFeedback("idle"), 4000);
      } else {
        setFeedback("saved");
        // Réinitialise le badge vert après 2s
        setTimeout(() => setFeedback("idle"), 2000);
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Étapes */}
      {steps.length === 0 && (
        <p className="text-xs text-muted">
          Aucune étape. Ajoutez un QCM ou une question ouverte ci-dessous.
        </p>
      )}

      {steps.map((step, index) => (
        <div key={step.id} className="space-y-3 rounded-md border border-line bg-paper-2 p-4">
          {/* En-tête de l'étape */}
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">
              Étape {index + 1} · {step.type === "qcm" ? "QCM" : "Question ouverte"}
            </span>
            <button
              type="button"
              onClick={() => removeStep(step.id)}
              className="rounded px-2 py-0.5 text-xs text-error hover:bg-error-bg"
              aria-label={`Supprimer l'étape ${index + 1}`}
            >
              ✕ Supprimer
            </button>
          </div>

          {/* Champ question */}
          <div>
            <label
              htmlFor={`step-question-${step.id}`}
              className="mb-1 block text-xs font-medium text-ink-2"
            >
              Question <span className="text-error">*</span>
            </label>
            <input
              id={`step-question-${step.id}`}
              type="text"
              value={step.question}
              onChange={(e) => updateQuestion(step.id, e.target.value)}
              placeholder="Saisissez la question…"
              disabled={isPending}
              className={[
                "w-full rounded-md border px-3 py-2 text-sm text-ink placeholder:text-muted",
                "focus:border-brand-red focus:outline-none focus:ring-1 focus:ring-brand-red",
                "border-line bg-white disabled:opacity-50",
              ].join(" ")}
            />
          </div>

          {/* Options QCM */}
          {step.type === "qcm" && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-ink-2">Options (cochez la bonne réponse)</p>
              {(step.options ?? ["", "", "", ""]).map((option, optIdx) => (
                <div key={optIdx} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`correct-${step.id}`}
                    checked={step.correctIndex === optIdx}
                    onChange={() => updateCorrectIndex(step.id, optIdx)}
                    disabled={isPending}
                    className="h-3.5 w-3.5 accent-brand-red"
                    aria-label={`Bonne réponse : option ${optIdx + 1}`}
                  />
                  <input
                    type="text"
                    value={option}
                    onChange={(e) => updateOption(step.id, optIdx, e.target.value)}
                    placeholder={`Option ${optIdx + 1}`}
                    disabled={isPending}
                    className={[
                      "flex-1 rounded-md border px-3 py-1.5 text-sm text-ink placeholder:text-muted",
                      "focus:border-brand-red focus:outline-none focus:ring-1 focus:ring-brand-red",
                      "border-line bg-white disabled:opacity-50",
                      step.correctIndex === optIdx ? "border-green-400 bg-green-50" : "",
                    ].join(" ")}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Boutons d'ajout */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={addQcmStep}
          disabled={isPending || steps.length >= 50}
          className={[
            "inline-flex items-center rounded-md border border-line bg-paper-2 px-3 py-1.5",
            "text-xs font-medium text-ink-2 hover:bg-paper-3 hover:text-ink",
            "disabled:cursor-not-allowed disabled:opacity-50",
          ].join(" ")}
        >
          + Ajouter QCM
        </button>
        <button
          type="button"
          onClick={addOpenStep}
          disabled={isPending || steps.length >= 50}
          className={[
            "inline-flex items-center rounded-md border border-line bg-paper-2 px-3 py-1.5",
            "text-xs font-medium text-ink-2 hover:bg-paper-3 hover:text-ink",
            "disabled:cursor-not-allowed disabled:opacity-50",
          ].join(" ")}
        >
          + Ajouter question ouverte
        </button>
        <span className="font-mono text-[10px] text-muted">{steps.length}/50 étapes</span>
      </div>

      {/* Feedback erreur */}
      {feedback === "error" && errorMsg && (
        <div
          role="alert"
          className={[
            "rounded-md border border-l-4 border-line border-l-error",
            "bg-error-bg px-4 py-3 text-sm text-error",
          ].join(" ")}
        >
          {errorMsg}
        </div>
      )}

      {/* Bouton Enregistrer + badge feedback */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending || feedback === "saving"}
          className={[
            "inline-flex items-center rounded-md bg-brand-red px-3 py-1.5",
            "text-xs font-medium text-white hover:brightness-110",
            "disabled:cursor-not-allowed disabled:opacity-50",
          ].join(" ")}
        >
          {feedback === "saving" ? "Enregistrement…" : "Enregistrer les étapes"}
        </button>

        {/* Badge succès */}
        {feedback === "saved" && (
          <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-1 font-mono text-[10px] font-semibold text-green-700">
            Enregistré
          </span>
        )}
      </div>
    </div>
  );
}
