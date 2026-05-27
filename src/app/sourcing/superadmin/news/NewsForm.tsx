"use client";

/**
 * NewsForm — formulaire de création d'un article d'actualité produit
 *
 * Client Component utilisé dans la page Actualités produit superadmin.
 * Appelle `createNewsAction` via useTransition pour rester non bloquant.
 * Se replie automatiquement après une création réussie.
 *
 * Décision Board 2026-05-27 — module superadmin éditeur edifio.
 */

import { useState, useTransition } from "react";

import { createNewsAction } from "./actions";

interface NewsFormProps {
  /** Callback appelé quand le formulaire doit être masqué (annulation ou succès). */
  onClose: () => void;
}

/**
 * Formulaire inline de création d'un article d'actualité.
 * Champs : titre (texte court) + contenu (textarea).
 * L'article est créé en brouillon ; la publication est séparée.
 */
export function NewsForm({ onClose }: NewsFormProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const trimTitle = title.trim();
    const trimContent = content.trim();

    if (!trimTitle) {
      setError("Le titre est obligatoire.");
      return;
    }
    if (!trimContent) {
      setError("Le contenu est obligatoire.");
      return;
    }

    startTransition(async () => {
      const result = await createNewsAction(trimTitle, trimContent);
      if (!result.ok) {
        setError(result.error ?? "Une erreur est survenue.");
      } else {
        // Réinitialisation + fermeture du formulaire
        setTitle("");
        setContent("");
        onClose();
      }
    });
  }

  return (
    <div className="mb-6 rounded-md border border-line bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-ink">Nouvelle actualité</h3>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Titre */}
        <div>
          <label htmlFor="news-title" className="mb-1 block text-xs font-medium text-ink-2">
            Titre <span className="text-error">*</span>
          </label>
          <input
            id="news-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            placeholder="Ex. : Nouvelle fonctionnalité de scoring…"
            disabled={isPending}
            className={[
              "w-full rounded-md border px-3 py-2 text-sm text-ink placeholder:text-muted",
              "focus:border-brand-red focus:outline-none focus:ring-1 focus:ring-brand-red",
              "disabled:opacity-50",
              "border-line bg-white",
            ].join(" ")}
          />
          <p className="mt-0.5 text-right font-mono text-[10px] text-muted">{title.length} / 200</p>
        </div>

        {/* Contenu */}
        <div>
          <label htmlFor="news-content" className="mb-1 block text-xs font-medium text-ink-2">
            Contenu <span className="text-error">*</span>
          </label>
          <textarea
            id="news-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={6}
            maxLength={10000}
            placeholder="Décrivez la nouveauté, la correction ou l'information importante…"
            disabled={isPending}
            className={[
              "w-full resize-y rounded-md border px-3 py-2 text-sm text-ink placeholder:text-muted",
              "focus:border-brand-red focus:outline-none focus:ring-1 focus:ring-brand-red",
              "disabled:opacity-50",
              "border-line bg-white",
            ].join(" ")}
          />
          <p className="mt-0.5 text-right font-mono text-[10px] text-muted">
            {content.length} / 10 000
          </p>
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
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className={[
              "inline-flex items-center rounded-md border border-line bg-paper-2 px-3 py-1.5",
              "text-xs font-medium text-ink-2 hover:bg-paper-3 hover:text-ink disabled:opacity-50",
            ].join(" ")}
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={!title.trim() || !content.trim() || isPending}
            className={[
              "inline-flex items-center rounded-md bg-brand-red px-3 py-1.5",
              "text-xs font-medium text-white hover:brightness-110",
              "disabled:cursor-not-allowed disabled:opacity-50",
            ].join(" ")}
          >
            {isPending ? "Création…" : "Créer en brouillon"}
          </button>
        </div>
      </form>
    </div>
  );
}
