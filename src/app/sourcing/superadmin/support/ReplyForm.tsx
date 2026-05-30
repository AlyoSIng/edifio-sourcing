/**
 * ReplyForm — formulaire de réponse inline à un ticket de support
 *
 * Client Component utilisé dans la page Support superadmin.
 * Appelle `replyToTicketAction` via useTransition pour rester non bloquant.
 *
 * Décision Board 2026-05-27 — module superadmin éditeur edifio.
 */
"use client";

import { useTransition, useState } from "react";

import { replyToTicketAction } from "./actions";

interface ReplyFormProps {
  /** UUID du ticket à traiter. */
  ticketId: string;
}

/**
 * Formulaire inline de réponse à un ticket.
 * Affiche un textarea + bouton d'envoi.
 * La soumission appelle la Server Action et affiche les erreurs éventuelles.
 */
export function ReplyForm({ ticketId }: ReplyFormProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const trimmed = value.trim();
    if (!trimmed) {
      setError("La réponse ne peut pas être vide.");
      return;
    }

    startTransition(async () => {
      const result = await replyToTicketAction(ticketId, trimmed);
      if (!result.ok) {
        setError(result.error ?? "Une erreur est survenue.");
      } else {
        setValue("");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-2">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={4}
        maxLength={2000}
        placeholder="Votre réponse…"
        disabled={isPending}
        className="w-full resize-none rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-red focus:outline-none focus:ring-1 focus:ring-brand-red disabled:opacity-50"
      />

      {/* Compteur de caractères */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] text-muted">{value.length} / 2000</span>
        <button
          type="submit"
          disabled={!value.trim() || isPending}
          className="inline-flex items-center rounded-full bg-brand-red px-3 py-1.5 text-xs font-medium text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Envoi…" : "Envoyer la réponse"}
        </button>
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
    </form>
  );
}
