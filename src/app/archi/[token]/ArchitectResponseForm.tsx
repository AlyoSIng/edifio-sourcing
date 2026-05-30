"use client";

/**
 * Formulaire de réponse architecte — page tokenisée `/archi/[token]`.
 *
 * Source de vérité :
 *  - `specs/module_tandem_engine_v1.md` §3.4 (3 actions)
 *  - Maquettes M4 (TU) / M4 v1.1 (VOUS) — boutons et copy
 *
 * 3 actions :
 *   - **Oui partant** → POST `{ status: 'accepted' }`
 *   - **Plus d'infos** → POST `{ status: 'info_requested', message? }`
 *   - **Non, pas cette fois** → POST `{ status: 'declined' }`
 *
 * Comportement UI :
 *   - Bouton actif → busy state (spinner) pendant le fetch
 *   - Succès → état « Merci ! » in-page (pas de redirect — l'archi est sans
 *     session, on n'a nulle part de pertinent où le rediriger)
 *   - Erreur → bandeau rouge inline avec message générique
 *   - Le bouton « Plus d'infos » révèle un textarea optionnel
 *
 * Pas d'attribute `csrf` — la route POST `/api/archi/[token]/respond` est
 * gated par le JWT lui-même (le token est dans le path). Un attaquant qui
 * peut POST le JWT a déjà l'autorisation de répondre.
 */

import { useState } from "react";

import type { BrevoRegister } from "@/lib/brevo/template-picker";

interface Props {
  token: string;
  register: BrevoRegister;
  /** Indique si une réponse non-pending est déjà enregistrée (read-only). */
  alreadyResponded: boolean;
  /** Statut déjà enregistré (si alreadyResponded). */
  existingStatus?: "pending" | "accepted" | "declined" | "info_requested";
}

type SubmitStatus = "accepted" | "declined" | "info_requested";

export function ArchitectResponseForm({
  token,
  register,
  alreadyResponded,
  existingStatus,
}: Props) {
  const [busy, setBusy] = useState<SubmitStatus | null>(null);
  const [submitted, setSubmitted] = useState<SubmitStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showInfoTextarea, setShowInfoTextarea] = useState(false);
  const [infoMessage, setInfoMessage] = useState("");

  const isTu = register === "tu";

  // Si l'archi a déjà répondu (non-pending), on bloque le form en read-only.
  if (alreadyResponded && existingStatus && existingStatus !== "pending") {
    return (
      <div className="rounded-md border border-line bg-white px-6 py-5 text-sm text-ink-2">
        <p>
          {existingStatus === "accepted"
            ? isTu
              ? "Tu as déjà accepté cet AO. Merci !"
              : "Vous avez déjà accepté cet AO. Merci !"
            : existingStatus === "declined"
              ? isTu
                ? "Tu as déjà décliné cet AO."
                : "Vous avez déjà décliné cet AO."
              : isTu
                ? "Tu as déjà demandé plus d'informations sur cet AO."
                : "Vous avez déjà demandé plus d'informations sur cet AO."}
        </p>
      </div>
    );
  }

  // Confirmation in-page après envoi.
  if (submitted) {
    return (
      <div
        className="rounded-md border border-l-4 border-line border-l-success bg-success-bg px-6 py-5 text-sm text-ink-2"
        role="status"
      >
        <p className="font-semibold text-success">
          {submitted === "accepted"
            ? "Réponse enregistrée — merci !"
            : submitted === "declined"
              ? "Réponse enregistrée. À une prochaine fois !"
              : "Demande envoyée. L'équipe AlyoS vous répondra rapidement."}
        </p>
        <p className="mt-2 text-xs text-muted">
          Vous pouvez fermer cette fenêtre. Un email vous parviendra à la prochaine étape.
        </p>
      </div>
    );
  }

  async function submit(status: SubmitStatus): Promise<void> {
    setBusy(status);
    setError(null);
    try {
      const body: { status: SubmitStatus; message?: string } = { status };
      if (status === "info_requested" && infoMessage.trim()) {
        body.message = infoMessage.trim();
      }
      const resp = await fetch(`/api/archi/${encodeURIComponent(token)}/respond`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const detail = await safeJsonError(resp);
        setError(detail);
        return;
      }
      setSubmitted(status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur réseau — veuillez réessayer.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <div
          role="alert"
          className="rounded-md border border-l-4 border-line border-l-error bg-error-bg px-4 py-3 text-sm text-error"
        >
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
        <button
          type="button"
          onClick={() => void submit("accepted")}
          disabled={busy !== null}
          className="rounded-full bg-brand-red px-5 py-3 text-base font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy === "accepted" ? "Envoi…" : isTu ? "Oui, je suis partant" : "Oui, je suis partant"}
        </button>
        <button
          type="button"
          onClick={() => setShowInfoTextarea((v) => !v)}
          disabled={busy !== null}
          className="hover:bg-bg-alt rounded-full border border-line bg-white px-5 py-3 text-base font-medium text-ink transition disabled:cursor-not-allowed disabled:opacity-60"
        >
          Plus d&rsquo;infos avant de décider
        </button>
        <button
          type="button"
          onClick={() => void submit("declined")}
          disabled={busy !== null}
          className="hover:bg-bg-alt rounded-full border border-line bg-white px-5 py-3 text-base font-medium text-ink-2 transition disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy === "declined" ? "Envoi…" : isTu ? "Non, pas cette fois" : "Non, pas cette fois"}
        </button>
      </div>

      {showInfoTextarea ? (
        <div className="bg-bg-alt flex flex-col gap-2 rounded-md border border-line p-4">
          <label htmlFor="archi-info-message" className="text-sm font-medium text-ink">
            {isTu ? "Quelle info te manque ?" : "Quelle information vous manque-t-il ?"}
          </label>
          <textarea
            id="archi-info-message"
            value={infoMessage}
            onChange={(e) => setInfoMessage(e.target.value)}
            rows={4}
            maxLength={1000}
            placeholder={
              isTu
                ? "Ex. budget précis, planning, type de marché…"
                : "Ex. budget précis, planning, type de marché…"
            }
            className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand-red focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void submit("info_requested")}
            disabled={busy !== null}
            className="self-start rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy === "info_requested" ? "Envoi…" : "Envoyer ma demande"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

async function safeJsonError(resp: Response): Promise<string> {
  try {
    const data = (await resp.json()) as { error?: string; message?: string };
    return data.message ?? data.error ?? `Erreur ${resp.status}`;
  } catch {
    return `Erreur ${resp.status} — veuillez réessayer.`;
  }
}
