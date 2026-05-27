"use client";

/**
 * GuidedTestForm — formulaire de création d'un nouveau test guidé.
 *
 * Client Component utilisé dans la page Tests guidés superadmin.
 * Appelle `createGuidedTestAction` via useTransition.
 *
 * Props :
 *   - `onCreated` : callback appelé après une création réussie, reçoit l'ID du test créé
 *
 * Décision Board 2026-05-27 — module superadmin éditeur edifio.
 */

import { useState, useTransition } from "react";

import { createGuidedTestAction } from "./actions";

interface GuidedTestFormProps {
  /** Appelé après une création réussie, avec l'ID du nouveau test. */
  onCreated: (id: string) => void;
}

/**
 * Formulaire de création d'un test guidé.
 * Champ titre (max 200 chars) + bouton Créer.
 * Erreurs affichées inline sous le champ.
 */
export function GuidedTestForm({ onCreated }: GuidedTestFormProps) {
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const trimTitle = title.trim();
    if (!trimTitle) {
      setError("Le titre est obligatoire.");
      return;
    }
    if (trimTitle.length > 200) {
      setError("Le titre ne peut pas dépasser 200 caractères.");
      return;
    }

    startTransition(async () => {
      const result = await createGuidedTestAction(trimTitle);
      if (!result.ok) {
        setError(result.error ?? "Une erreur est survenue.");
      } else if (result.id) {
        setTitle("");
        onCreated(result.id);
      }
    });
  }

  return (
    <div className="rounded-md border border-line bg-white p-5 shadow-sm">
      <h3 className="mb-1 text-sm font-semibold text-ink">Créer un nouveau test</h3>
      <p className="mb-4 text-xs text-muted">
        Donnez un titre au test. Vous pourrez ensuite ajouter des étapes (QCM, question ouverte).
      </p>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="guided-test-title" className="mb-1 block text-xs font-medium text-ink-2">
            Titre du test <span className="text-error">*</span>
          </label>
          <input
            id="guided-test-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            placeholder="Ex. : Prise en main du module Sourcing"
            disabled={isPending}
            className={[
              "w-full rounded-md border px-3 py-2 text-sm text-ink placeholder:text-muted",
              "focus:border-brand-red focus:outline-none focus:ring-1 focus:ring-brand-red",
              "disabled:opacity-50",
              "border-line bg-white",
            ].join(" ")}
          />
          <p className="mt-1 text-right font-mono text-[10px] text-muted">{title.length}/200</p>
        </div>

        {/* Erreur */}
        {error && (
          <div
            role="alert"
            className={[
              "rounded-md border border-l-4 border-line border-l-error",
              "bg-error-bg px-4 py-3 text-sm text-error",
            ].join(" ")}
          >
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end">
          <button
            type="submit"
            disabled={!title.trim() || isPending}
            className={[
              "inline-flex items-center rounded-md bg-brand-red px-3 py-1.5",
              "text-xs font-medium text-white hover:brightness-110",
              "disabled:cursor-not-allowed disabled:opacity-50",
            ].join(" ")}
          >
            {isPending ? "Création…" : "Créer le test"}
          </button>
        </div>
      </form>
    </div>
  );
}
