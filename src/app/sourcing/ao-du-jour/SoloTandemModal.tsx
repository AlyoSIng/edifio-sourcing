"use client";

/**
 * Modale Solo / Tandem — Maquette 3 (`design/maquettes/maquettes_v1.html`
 * lignes 294-323). Copy verbatim sur les deux descriptions de mode.
 *
 * ARIA :
 *  - `role="dialog"` + `aria-modal="true"`
 *  - `aria-labelledby` sur le title
 *  - focus initial sur le 1er bouton de choix (Solo)
 *  - Escape ferme la modale (onCancel)
 *  - click outside (backdrop) ferme la modale (onCancel)
 *
 * V1 — pas de scoring architecte automatique : le tag `Recommandé · score MOE
 * 0.91` reste *présentationnel uniquement* (cf. brief PR n°5 §3.2). Le tag
 * est marqué via comment HTML pour le futur dev (Phase 2 scoring réel).
 */

import { useCallback, useEffect, useId, useState } from "react";

type Mode = "solo" | "tandem";

export interface SoloTandemModalProps {
  tenderTitle: string;
  /** Pré-formaté (ex. « 850 000 € »). */
  tenderAmount: string;
  /** Pré-formaté (ex. « 28 mai »). */
  tenderDeadline: string;
  onConfirm: (mode: Mode) => void;
  onCancel: () => void;
}

export function SoloTandemModal({
  tenderTitle,
  tenderAmount,
  tenderDeadline,
  onConfirm,
  onCancel,
}: SoloTandemModalProps) {
  const titleId = useId();
  const [selectedMode, setSelectedMode] = useState<Mode | null>(null);

  // Escape ferme la modale
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
    if (selectedMode) onConfirm(selectedMode);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F1A2E]/45 p-6"
    >
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        {/* Header */}
        <div className="mb-5">
          <div className="font-mono text-[11px] uppercase tracking-wider text-[#FF0033]">
            Mode de réponse
          </div>
          <h2
            id={titleId}
            className="mt-1 font-display text-[22px] font-bold leading-snug text-neutral-900"
          >
            Comment réponds-tu à cet AO ?
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            {tenderTitle} · {tenderAmount} · Remise {tenderDeadline}
          </p>
        </div>

        {/* Grid 2 colonnes Solo / Tandem */}
        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ModeCard
            mode="solo"
            icon="🧍"
            name="Solo"
            description="Tu réponds en propre, en mandataire seul. L'AO bascule en pipeline et l'opportunité est créée dans Odoo."
            selected={selectedMode === "solo"}
            onSelect={() => setSelectedMode("solo")}
            autoFocus
          />
          <ModeCard
            mode="tandem"
            icon="🤝"
            name="Tandem"
            description="Tu mobilises un architecte cotraitant. edifio Sourcing te propose 3 architectes scorés et envoie la sollicitation."
            selected={selectedMode === "tandem"}
            onSelect={() => setSelectedMode("tandem")}
            recommendedTag="Recommandé · score MOE 0.91"
          />
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
            disabled={selectedMode === null}
            className="rounded-md bg-[#FF0033] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#cc0029] disabled:cursor-not-allowed disabled:bg-neutral-300"
          >
            Confirmer
          </button>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// ModeCard — choix Solo OU Tandem
// ----------------------------------------------------------------------------

interface ModeCardProps {
  mode: Mode;
  icon: string;
  name: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
  /**
   * TODO V2 score réel : le tag « Recommandé · score MOE 0.91 » est
   * présentationnel en V1 — pas de calcul backend. Cf. brief PR n°5 §3.2.
   */
  recommendedTag?: string;
  autoFocus?: boolean;
}

function ModeCard({
  mode,
  icon,
  name,
  description,
  selected,
  onSelect,
  recommendedTag,
  autoFocus,
}: ModeCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      autoFocus={autoFocus}
      aria-pressed={selected}
      aria-label={`Choisir le mode ${name}`}
      data-mode={mode}
      className={`relative flex flex-col items-start gap-2 rounded-md border-2 p-4 text-left transition ${
        selected
          ? "border-[#FF0033] bg-red-50/50"
          : "border-neutral-200 bg-white hover:border-neutral-400"
      }`}
    >
      <span className="text-2xl" aria-hidden>
        {icon}
      </span>
      <span className="font-display text-base font-bold text-neutral-900">{name}</span>
      <span className="text-xs leading-relaxed text-neutral-600">{description}</span>
      {recommendedTag ? (
        <span className="mt-1 rounded bg-[#FF0033] px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-white">
          {recommendedTag}
        </span>
      ) : null}
    </button>
  );
}
