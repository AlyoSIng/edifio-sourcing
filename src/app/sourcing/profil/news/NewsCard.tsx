"use client";

/**
 * NewsCard — carte article d'actualité produit (Client Component).
 *
 * Affiche le titre, un extrait tronqué à 150 caractères (extensible),
 * la date de publication et un badge "Nouveau" si l'article n'est pas encore lu.
 * Le bouton "Marquer comme lu" déclenche `markNewsReadAction` avec mise à jour
 * optimiste de l'état local.
 *
 * Décision Board 2026-05-27 — module profil utilisateur edifio Sourcing.
 */

import { useState, useTransition } from "react";

import { markNewsReadAction } from "./actions";

interface NewsCardProps {
  id: string;
  title: string;
  content: string;
  publishedAt: Date | null;
  isRead: boolean;
}

export function NewsCard({
  id,
  title,
  content,
  publishedAt,
  isRead: initialIsRead,
}: NewsCardProps) {
  const [isRead, setIsRead] = useState(initialIsRead);
  const [expanded, setExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();

  const excerpt = content.length > 150 ? content.slice(0, 150) + "…" : content;

  const formattedDate = publishedAt
    ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(
        new Date(publishedAt),
      )
    : null;

  function handleMarkRead() {
    if (isRead) return;
    setIsRead(true); // optimiste
    startTransition(async () => {
      const result = await markNewsReadAction(id);
      if (!result.ok) {
        // rollback optimiste si erreur
        setIsRead(false);
      }
    });
  }

  return (
    <article className="rounded-md border border-line bg-white p-5 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-3">
        <h3 className="font-display text-base font-semibold text-ink">{title}</h3>
        {!isRead && (
          <span className="shrink-0 rounded-full bg-brand-red px-2 py-0.5 text-[10px] font-semibold text-white">
            Nouveau
          </span>
        )}
      </div>

      {formattedDate && <p className="mb-3 text-xs text-muted">{formattedDate}</p>}

      <p className="mb-4 text-sm text-ink">{expanded ? content : excerpt}</p>

      <div className="flex items-center gap-3">
        {content.length > 150 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-violet-700 underline underline-offset-2 hover:no-underline"
          >
            {expanded ? "Réduire" : "Lire la suite"}
          </button>
        )}
        {!isRead && (
          <button
            type="button"
            onClick={handleMarkRead}
            disabled={isPending}
            className="text-xs text-muted hover:text-ink disabled:opacity-50"
          >
            {isPending ? "Marquage…" : "Marquer comme lu"}
          </button>
        )}
        {isRead && <span className="text-xs text-muted">Lu</span>}
      </div>
    </article>
  );
}
