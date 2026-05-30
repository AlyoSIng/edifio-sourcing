"use client";

/**
 * FaqItemForm — formulaire de création d'un item FAQ superadmin
 *
 * Client Component — appelle `createFaqItemAction` via useTransition.
 * Champs : question (obligatoire), answer (obligatoire), category, displayOrder.
 */

import { useState, useTransition } from "react";

import { createFaqItemAction } from "./actions";

interface FaqItemFormProps {
  /** Prochain rang d'affichage suggéré. */
  nextOrder: number;
  onClose: () => void;
}

const CATEGORY_OPTIONS = [
  { value: "general", label: "Général" },
  { value: "sourcing", label: "Sourcing" },
  { value: "cotraitance", label: "Cotraitance" },
  { value: "compte", label: "Compte" },
] as const;

export function FaqItemForm({ nextOrder, onClose }: FaqItemFormProps) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [category, setCategory] = useState("general");
  const [customCategory, setCustomCategory] = useState("");
  const [displayOrder, setDisplayOrder] = useState<string>(String(nextOrder));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isCustom = category === "__autre__";

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const trimQuestion = question.trim();
    const trimAnswer = answer.trim();
    const resolvedCategory = isCustom ? customCategory.trim() || "general" : category;

    if (!trimQuestion) {
      setError("La question est obligatoire.");
      return;
    }
    if (!trimAnswer) {
      setError("La réponse est obligatoire.");
      return;
    }

    const parsedOrder = parseInt(displayOrder, 10) || nextOrder;

    startTransition(async () => {
      const result = await createFaqItemAction({
        question: trimQuestion,
        answer: trimAnswer,
        category: resolvedCategory,
        displayOrder: parsedOrder,
      });
      if (!result.ok) {
        setError(result.error ?? "Une erreur est survenue.");
      } else {
        setQuestion("");
        setAnswer("");
        setCategory("general");
        setCustomCategory("");
        setDisplayOrder(String(nextOrder + 1));
        onClose();
      }
    });
  }

  const inputCls = [
    "w-full rounded-md border px-3 py-2 text-sm text-ink placeholder:text-muted",
    "focus:border-brand-red focus:outline-none focus:ring-1 focus:ring-brand-red",
    "disabled:opacity-50 border-line bg-white",
  ].join(" ");

  return (
    <div className="mb-6 rounded-md border border-line bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-ink">Nouvelle question FAQ</h3>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Question */}
        <div>
          <label htmlFor="faq-question" className="mb-1 block text-xs font-medium text-ink-2">
            Question <span className="text-error">*</span>
          </label>
          <input
            id="faq-question"
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={500}
            placeholder="Ex. : Comment ajouter un architecte ?"
            disabled={isPending}
            className={inputCls}
          />
          <p className="mt-0.5 text-right font-mono text-[10px] text-muted">
            {question.length} / 500
          </p>
        </div>

        {/* Réponse */}
        <div>
          <label htmlFor="faq-answer" className="mb-1 block text-xs font-medium text-ink-2">
            Réponse <span className="text-error">*</span>
          </label>
          <textarea
            id="faq-answer"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={5}
            maxLength={10000}
            placeholder="Réponse détaillée…"
            disabled={isPending}
            className={inputCls + " resize-y"}
          />
          <p className="mt-0.5 text-right font-mono text-[10px] text-muted">
            {answer.length} / 10 000
          </p>
        </div>

        {/* Catégorie + Ordre */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="faq-category" className="mb-1 block text-xs font-medium text-ink-2">
              Catégorie
            </label>
            <select
              id="faq-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={isPending}
              className={inputCls}
            >
              {CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
              <option value="__autre__">Autre (libre)</option>
            </select>
          </div>
          <div>
            <label htmlFor="faq-order" className="mb-1 block text-xs font-medium text-ink-2">
              Ordre d&apos;affichage
            </label>
            <input
              id="faq-order"
              type="number"
              min={1}
              value={displayOrder}
              onChange={(e) => setDisplayOrder(e.target.value)}
              disabled={isPending}
              className={inputCls}
            />
          </div>
        </div>

        {/* Catégorie libre */}
        {isCustom && (
          <div>
            <label
              htmlFor="faq-custom-category"
              className="mb-1 block text-xs font-medium text-ink-2"
            >
              Nom de catégorie libre
            </label>
            <input
              id="faq-custom-category"
              type="text"
              value={customCategory}
              onChange={(e) => setCustomCategory(e.target.value)}
              maxLength={100}
              placeholder="Ex. : tandem"
              disabled={isPending}
              className={inputCls}
            />
          </div>
        )}

        {/* Erreur */}
        {error && (
          <div
            role="alert"
            className="rounded-md border border-l-4 border-line border-l-error bg-error-bg px-4 py-3 text-sm text-error"
          >
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="inline-flex items-center rounded-full border border-line bg-paper-2 px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-paper-3 hover:text-ink disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={!question.trim() || !answer.trim() || isPending}
            className="inline-flex items-center rounded-full bg-brand-red px-3 py-1.5 text-xs font-medium text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Création…" : "Créer la question"}
          </button>
        </div>
      </form>
    </div>
  );
}
