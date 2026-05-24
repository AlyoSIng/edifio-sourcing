"use client";

/**
 * Modale « Écarter cet AO » — Arbitrage Board C (2026-05-21) : motif
 * optionnel (textarea max 280 chars). Pas dans la maquette officielle Gate 3,
 * design tokens-based aligné sur SoloTandemModal.
 *
 * Wording verbatim (Addendum spec 2026-05-24 §Exigence 1) :
 *  - Titre eyebrow : « Écarter AO »
 *  - Titre h2     : « Pourquoi écarter cet AO ? »
 *  - Bouton CTA   : « Écarter »
 *  - Identifiant technique côté server action `rejectTenderAction` inchangé.
 *
 * ARIA :
 *  - `role="dialog"` + `aria-modal="true"`
 *  - `aria-labelledby` sur le title
 *  - focus initial sur la textarea (autoFocus)
 *  - Escape ferme (onCancel) ; click outside backdrop ferme aussi.
 *
 * UX :
 *  - Compteur live `{n}/280` sous la textarea
 *  - Compteur devient rouge à partir de 250 caractères (alerte visuelle
 *    avant la borne)
 *  - Bouton « Écarter » toujours actif (motif optionnel)
 *  - Le texte saisi est transmis tel quel (chaîne vide → null géré au call-site)
 */

import { useCallback, useEffect, useId, useState } from "react";

const MAX_LENGTH = 280;
const WARN_LENGTH = 250;

export interface RejectReasonModalProps {
  tenderTitle: string;
  /**
   * `reason` : null si textarea vide. Évite de logger `""` côté audit log
   * pour des raisons de propreté analytics.
   */
  onConfirm: (reason: string | null) => void;
  onCancel: () => void;
}

export function RejectReasonModal({ tenderTitle, onConfirm, onCancel }: RejectReasonModalProps) {
  const titleId = useId();
  const [reason, setReason] = useState("");

  // Escape ferme
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const onBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onCancel();
    },
    [onCancel],
  );

  function handleConfirm() {
    const trimmed = reason.trim();
    onConfirm(trimmed === "" ? null : trimmed);
  }

  const counterColor = reason.length >= WARN_LENGTH ? "text-red-600" : "text-neutral-500";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F1A2E]/45 p-6"
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        {/* Header */}
        <div className="mb-4">
          <div className="font-mono text-[11px] uppercase tracking-wider text-[#FF0033]">
            Écarter AO
          </div>
          <h2
            id={titleId}
            className="mt-1 font-display text-[20px] font-bold leading-snug text-neutral-900"
          >
            Pourquoi écarter cet AO ?
          </h2>
          <p className="mt-1 text-sm text-neutral-500">{tenderTitle}</p>
        </div>

        {/* Textarea */}
        <div className="mb-4">
          <textarea
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={MAX_LENGTH}
            rows={4}
            placeholder="Optionnel — quelques mots aident l'IA à affiner le scoring (max 280 caractères)"
            aria-label="Motif (optionnel, 280 caractères max)"
            className="w-full resize-none rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-[#FF0033] focus:outline-none focus:ring-1 focus:ring-[#FF0033]"
          />
          <p className={`mt-1 text-right font-mono text-[11px] ${counterColor}`} aria-live="polite">
            {reason.length}/{MAX_LENGTH}
          </p>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="rounded-md border border-red-300 bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-1"
          >
            Écarter
          </button>
        </div>
      </div>
    </div>
  );
}
