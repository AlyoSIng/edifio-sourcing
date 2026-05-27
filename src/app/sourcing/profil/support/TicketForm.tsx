"use client";

/**
 * TicketForm — formulaire de création de ticket support (Client Component).
 *
 * Champs : sujet (max 200) + message (textarea, max 5000, 6 rows).
 * Compteur de caractères sur le message.
 * Soumission via `createTicketAction` en useTransition.
 *
 * Décision Board 2026-05-27 — module profil utilisateur edifio Sourcing.
 */

import { useState, useTransition } from "react";

import { createTicketAction } from "./actions";

interface TicketFormProps {
  onCreated: () => void;
}

export function TicketForm({ onCreated }: TicketFormProps) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const messageLength = message.length;
  const subjectLength = subject.length;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await createTicketAction(subject, message);
      if (result.ok) {
        onCreated();
      } else {
        setError(result.error ?? "Une erreur est survenue.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <div>
        <label htmlFor="ticket-subject" className="mb-1 block text-sm font-medium text-ink">
          Sujet <span className="text-red-500">*</span>
        </label>
        <input
          id="ticket-subject"
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={200}
          required
          placeholder="Décrivez brièvement votre problème…"
          className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
        <p className="mt-1 text-right text-xs text-muted">{subjectLength}/200</p>
      </div>

      <div>
        <label htmlFor="ticket-message" className="mb-1 block text-sm font-medium text-ink">
          Message <span className="text-red-500">*</span>
        </label>
        <textarea
          id="ticket-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={5000}
          required
          rows={6}
          placeholder="Décrivez votre problème en détail…"
          className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
        <p
          className={[
            "mt-1 text-right text-xs",
            messageLength > 4800 ? "text-amber-600" : "text-muted",
          ].join(" ")}
        >
          {messageLength}/5000
        </p>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
        >
          {isPending ? "Envoi en cours…" : "Envoyer le ticket"}
        </button>
      </div>
    </form>
  );
}
