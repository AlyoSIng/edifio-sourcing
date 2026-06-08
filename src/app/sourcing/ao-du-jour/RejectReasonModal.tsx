"use client";

/**
 * Modale « Écarter cet AO » — refonte Salve U (apprentissage par écartement,
 * Steve 2026-06-08).
 *
 * Le motif n'est plus un simple texte libre : l'utilisateur choisit l'un des
 * 6 MOTIFS STRUCTURÉS (`REJECTION_REASONS`) via des radios, et peut compléter
 * par un verbatim libre (optionnel, max 280 chars). Les motifs actionnables
 * (hors zone / budget / hors métier) alimentent les suggestions d'ajustement
 * du profil de recherche — le motif sert donc concrètement à affiner l'algo
 * (après validation admin).
 *
 * Distinction sémantique : « Écarter » ALIMENTE l'apprentissage. « Exclure »
 * reste neutre (autre bouton, tooltip dédié).
 *
 * ARIA :
 *  - `role="dialog"` + `aria-modal="true"`
 *  - `aria-labelledby` sur le title
 *  - radiogroup avec `aria-label`
 *  - focus initial sur la première radio
 *  - Escape ferme (onCancel) ; click outside backdrop ferme aussi.
 *
 * UX :
 *  - 6 radios (un motif obligatoire — le premier est pré-sélectionné)
 *  - textarea libre en complément + compteur `{n}/280` (rouge dès 250)
 *  - Bouton « Écarter » toujours actif (un motif est toujours choisi)
 */

import { useCallback, useEffect, useId, useState } from "react";

import {
  REJECTION_REASONS,
  type RejectionReasonCode,
} from "@/lib/sourcing/learning/rejection-reasons";

const MAX_LENGTH = 280;
const WARN_LENGTH = 250;

export interface RejectReasonModalProps {
  tenderTitle: string;
  /**
   * Callback de confirmation : motif structuré obligatoire + verbatim optionnel
   * (null si textarea vide).
   */
  onConfirm: (reasonCode: RejectionReasonCode, verbatim: string | null) => void;
  onCancel: () => void;
}

export function RejectReasonModal({ tenderTitle, onConfirm, onCancel }: RejectReasonModalProps) {
  const titleId = useId();
  const helpId = useId();
  // Premier motif pré-sélectionné par défaut (un motif est toujours requis).
  const [reasonCode, setReasonCode] = useState<RejectionReasonCode>(REJECTION_REASONS[0].code);
  const [verbatim, setVerbatim] = useState("");

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
    const trimmed = verbatim.trim();
    onConfirm(reasonCode, trimmed === "" ? null : trimmed);
  }

  const counterColor = verbatim.length >= WARN_LENGTH ? "text-error" : "text-muted";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={helpId}
      onClick={onBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F1A2E]/45 p-6"
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        {/* Header */}
        <div className="mb-4">
          <div className="font-mono text-[11px] uppercase tracking-wider text-brand-red">
            Écarter AO
          </div>
          <h2
            id={titleId}
            className="mt-1 font-display text-[20px] font-bold leading-snug text-ink"
          >
            Pourquoi écarter cet AO ?
          </h2>
          <p className="mt-1 text-sm text-muted">{tenderTitle}</p>
          <p id={helpId} className="mt-2 text-[12px] leading-snug text-muted">
            Le motif aide edifio à te suggérer d&apos;affiner ton profil de recherche (ex. retirer
            un département, relever le budget minimum).
          </p>
        </div>

        {/* Radios motifs */}
        <fieldset className="mb-4">
          <legend className="sr-only">Motif d&apos;écartement</legend>
          <div role="radiogroup" aria-label="Motif d'écartement" className="flex flex-col gap-1.5">
            {REJECTION_REASONS.map((reason) => {
              const checked = reasonCode === reason.code;
              return (
                <label
                  key={reason.code}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-sm border px-3 py-2 text-sm transition ${
                    checked
                      ? "border-brand-red bg-error-bg text-ink"
                      : "border-line-2 bg-white text-ink hover:bg-paper-2"
                  }`}
                >
                  <input
                    type="radio"
                    name="reject-reason"
                    value={reason.code}
                    checked={checked}
                    onChange={() => setReasonCode(reason.code)}
                    className="h-4 w-4 accent-brand-red"
                  />
                  <span>{reason.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* Verbatim libre (complément) */}
        <div className="mb-4">
          <label className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-muted">
            Précision (optionnel)
          </label>
          <textarea
            value={verbatim}
            onChange={(e) => setVerbatim(e.target.value)}
            maxLength={MAX_LENGTH}
            rows={3}
            placeholder="Optionnel — détaille en quelques mots (max 280 caractères)"
            aria-label="Précision (optionnel, 280 caractères max)"
            className="w-full resize-none rounded-sm border border-line-2 px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-red focus:outline-none focus:ring-1 focus:ring-brand-red"
          />
          <p className={`mt-1 text-right font-mono text-[11px] ${counterColor}`} aria-live="polite">
            {verbatim.length}/{MAX_LENGTH}
          </p>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-line-2 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-paper-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red focus-visible:ring-offset-1"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="rounded-full bg-error px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-error focus-visible:ring-offset-1"
          >
            Écarter
          </button>
        </div>
      </div>
    </div>
  );
}
