"use client";

/**
 * FormationForm — formulaire de création d'une formation superadmin
 *
 * Client Component — appelle `createFormationAction` via useTransition.
 * Champs : titre (obligatoire), description, url (obligatoire),
 *          type (vidéo/document/lien externe), durationMin, displayOrder.
 */

import { useState, useTransition } from "react";

import { createFormationAction } from "./actions";

interface FormationFormProps {
  /** Prochain rang d'affichage suggéré (formations.length + 1). */
  nextOrder: number;
  onClose: () => void;
}

const TYPE_OPTIONS = [
  { value: "video", label: "Vidéo" },
  { value: "doc", label: "Document" },
  { value: "external", label: "Lien externe" },
] as const;

export function FormationForm({ nextOrder, onClose }: FormationFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [type, setType] = useState<"video" | "doc" | "external">("video");
  const [durationMin, setDurationMin] = useState<string>("");
  const [displayOrder, setDisplayOrder] = useState<string>(String(nextOrder));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const trimTitle = title.trim();
    const trimUrl = url.trim();

    if (!trimTitle) {
      setError("Le titre est obligatoire.");
      return;
    }
    if (!trimUrl) {
      setError("L'URL est obligatoire.");
      return;
    }

    const parsedDuration = durationMin ? parseInt(durationMin, 10) : undefined;
    const parsedOrder = parseInt(displayOrder, 10) || nextOrder;

    startTransition(async () => {
      const result = await createFormationAction({
        title: trimTitle,
        description: description.trim() || undefined,
        url: trimUrl,
        type,
        durationMin: parsedDuration,
        displayOrder: parsedOrder,
      });
      if (!result.ok) {
        setError(result.error ?? "Une erreur est survenue.");
      } else {
        setTitle("");
        setDescription("");
        setUrl("");
        setType("video");
        setDurationMin("");
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
      <h3 className="mb-4 text-sm font-semibold text-ink">Nouvelle formation</h3>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Titre */}
        <div>
          <label htmlFor="form-title" className="mb-1 block text-xs font-medium text-ink-2">
            Titre <span className="text-error">*</span>
          </label>
          <input
            id="form-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={300}
            placeholder="Ex. : Introduction à edifio Sourcing"
            disabled={isPending}
            className={inputCls}
          />
        </div>

        {/* Description */}
        <div>
          <label htmlFor="form-description" className="mb-1 block text-xs font-medium text-ink-2">
            Description <span className="text-muted">(optionnel)</span>
          </label>
          <textarea
            id="form-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Résumé court du contenu…"
            disabled={isPending}
            className={inputCls + " resize-y"}
          />
        </div>

        {/* URL */}
        <div>
          <label htmlFor="form-url" className="mb-1 block text-xs font-medium text-ink-2">
            URL <span className="text-error">*</span>
          </label>
          <input
            id="form-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            disabled={isPending}
            className={inputCls}
          />
        </div>

        {/* Type + Durée */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="form-type" className="mb-1 block text-xs font-medium text-ink-2">
              Type
            </label>
            <select
              id="form-type"
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
              disabled={isPending}
              className={inputCls}
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="form-duration" className="mb-1 block text-xs font-medium text-ink-2">
              Durée (min) <span className="text-muted">(optionnel)</span>
            </label>
            <input
              id="form-duration"
              type="number"
              min={1}
              max={999}
              value={durationMin}
              onChange={(e) => setDurationMin(e.target.value)}
              placeholder="Ex. : 15"
              disabled={isPending}
              className={inputCls}
            />
          </div>
        </div>

        {/* Ordre */}
        <div className="w-32">
          <label htmlFor="form-order" className="mb-1 block text-xs font-medium text-ink-2">
            Ordre d&apos;affichage
          </label>
          <input
            id="form-order"
            type="number"
            min={1}
            value={displayOrder}
            onChange={(e) => setDisplayOrder(e.target.value)}
            disabled={isPending}
            className={inputCls}
          />
        </div>

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
            disabled={!title.trim() || !url.trim() || isPending}
            className="inline-flex items-center rounded-full bg-brand-red px-3 py-1.5 text-xs font-medium text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Création…" : "Créer la formation"}
          </button>
        </div>
      </form>
    </div>
  );
}
