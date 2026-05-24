"use client";

/**
 * Sous-composant Client `TenderCardActions` — 3 boutons sur la carte AO :
 * Sélectionner / Reporter / Écarter.
 *
 * Pattern :
 *  - `useTransition` pour suivre l'état pending pendant l'appel server action
 *  - Optimistic UI minimale : pendant le pending, la card est "ghost"
 *    (opacité réduite, boutons disabled). Si le serveur renvoie une erreur,
 *    on rollback (la card redevient cliquable) + affichage d'un message
 *    d'erreur en `role="alert"` au-dessus de la liste (porté par CSS via
 *    le parent — ici on remonte le code erreur au call-site).
 *  - Pour la simplicité V1, on dispatch un CustomEvent global capté par la
 *    page parent qui se charge d'afficher le toast. Pas de lib toast externe.
 *
 * Copy verbatim (Addendum spec 2026-05-24 §Exigence 1) :
 *  - « Sélectionner » (primary), « Reporter » (ghost, popover shortcuts),
 *    « Écarter » (danger ghost, ouvre modale motif optionnel).
 *  - Identifiants techniques inchangés côté server action
 *    (`deferTenderAction`, `rejectTenderAction`) — wording UI seul.
 *
 * UX « Reporter » (Addendum spec 2026-05-24) :
 *  - Clic sur le bouton « Reporter » ouvre un popover avec 3 shortcuts :
 *    +1 jour (24h), +3 jours (72h), +7 jours (168h).
 *  - Le popover se ferme : clic outside, Escape, clic sur un shortcut.
 *  - Pas de date picker custom en V1 (KISS) — extensible Phase 2 si besoin.
 *  - Implémenté en composant inline (state local + listener outside-click)
 *    plutôt qu'un @radix-ui/react-popover pour ne pas ajouter de dépendance.
 *
 * V1 limites :
 *  - Pas de drag-and-drop
 *  - Pas de raccourcis clavier (TODO Phase 2 : touche `S` / `D` / `R`)
 *  - `useOptimistic` non utilisé ici car le tableau optimiste vit côté page
 *    parent (la card disparaît, pas juste un changement local) — pour V1
 *    on s'appuie sur `revalidatePath` côté server action pour rafraîchir
 *    la liste après mutation.
 */

import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { deferTenderAction, rejectTenderAction, selectTenderAction } from "./actions";
import { RejectReasonModal } from "./RejectReasonModal";
import { SoloTandemModal } from "./SoloTandemModal";

// ============================================================================
// Map code erreur → message FR (pour le toast d'alerte)
// ============================================================================

const ERROR_MESSAGES: Record<string, string> = {
  not_authenticated: "Session expirée. Reconnecte-toi.",
  forbidden_domain: "Accès refusé.",
  invalid_input: "Paramètre invalide. Réessaye.",
  tender_not_found: "Cet AO n'existe plus.",
  invalid_state: "Cet AO a déjà été traité.",
  internal_error: "Erreur technique. Réessaye dans quelques instants.",
};

/**
 * Shortcuts du popover « Reporter ». Le mapping label → heures est ici la
 * source de vérité côté UI ; côté server action `deferTenderAction` ré-valide
 * via whitelist stricte `{24, 72, 168}` (décision Board 2026-05-24, revue
 * Hugo MEDIUM-1) — toute valeur hors set renvoie `invalid_input`. Si on
 * ajoute un shortcut ici, il faut l'ajouter en miroir dans
 * `ALLOWED_HOURS_OFFSETS` (`src/app/sourcing/ao-du-jour/actions.ts`).
 */
const DEFER_SHORTCUTS: ReadonlyArray<{ label: string; hours: number }> = [
  { label: "+1 jour", hours: 24 },
  { label: "+3 jours", hours: 72 },
  { label: "+7 jours", hours: 168 },
];

/**
 * Émet un CustomEvent capté par la page parent (cf. `page.tsx`).
 * Type `tender-action-error` payload `{ message }`.
 */
function emitError(code: string): void {
  if (typeof window === "undefined") return;
  const message = ERROR_MESSAGES[code] ?? ERROR_MESSAGES.internal_error;
  window.dispatchEvent(
    new CustomEvent("tender-action-error", {
      detail: { message, code },
    }),
  );
}

// ============================================================================
// Composant
// ============================================================================

export interface TenderCardActionsProps {
  tenderId: string;
  tenderTitle: string;
  /** Montant formaté (ex. « 850 000 € ») — affiché en subtitle modale Solo/Tandem */
  tenderAmount: string;
  /** Deadline formatée (ex. « 28 mai ») — affichée en subtitle modale Solo/Tandem */
  tenderDeadline: string;
}

export function TenderCardActions({
  tenderId,
  tenderTitle,
  tenderAmount,
  tenderDeadline,
}: TenderCardActionsProps) {
  const [isPending, startTransition] = useTransition();
  const [showSoloTandemModal, setShowSoloTandemModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showDeferPopover, setShowDeferPopover] = useState(false);

  // Ref sur le wrapper popover pour détection click-outside.
  const deferContainerRef = useRef<HTMLDivElement | null>(null);

  // Fermeture popover : Escape + click-outside.
  useEffect(() => {
    if (!showDeferPopover) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowDeferPopover(false);
    };
    const onClick = (e: MouseEvent) => {
      const node = deferContainerRef.current;
      if (node && e.target instanceof Node && !node.contains(e.target)) {
        setShowDeferPopover(false);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [showDeferPopover]);

  function handleSelect(mode: "solo" | "tandem"): void {
    setShowSoloTandemModal(false);
    startTransition(async () => {
      const result = await selectTenderAction(tenderId, mode);
      if (!result.ok) emitError(result.error);
    });
  }

  const handleDefer = useCallback(
    (hours: number) => {
      setShowDeferPopover(false);
      startTransition(async () => {
        const result = await deferTenderAction(tenderId, hours);
        if (!result.ok) emitError(result.error);
      });
    },
    [tenderId],
  );

  function handleReject(reason: string | null): void {
    setShowRejectModal(false);
    startTransition(async () => {
      const result = await rejectTenderAction(tenderId, reason);
      if (!result.ok) emitError(result.error);
    });
  }

  return (
    <>
      <div
        className={`flex flex-col gap-1.5 sm:items-stretch ${isPending ? "pointer-events-none opacity-50" : ""}`}
        aria-busy={isPending}
      >
        <button
          type="button"
          onClick={() => setShowSoloTandemModal(true)}
          disabled={isPending}
          title="Bascule l'AO en pipeline. Vous choisirez ensuite Solo ou Tandem."
          className="inline-flex items-center justify-center gap-1.5 rounded-sm bg-brand-red px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-red-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red focus-visible:ring-offset-1 disabled:opacity-50"
        >
          <span aria-hidden>&#x2713;</span>
          Sélectionner
        </button>

        {/* « Reporter » : bouton + popover shortcuts (+1j / +3j / +7j) */}
        <div className="relative" ref={deferContainerRef}>
          <button
            type="button"
            onClick={() => setShowDeferPopover((v) => !v)}
            disabled={isPending}
            aria-haspopup="menu"
            aria-expanded={showDeferPopover}
            title="Reporte l'AO. Il reviendra dans le digest après le délai choisi."
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-sm border border-line-2 bg-white px-3 py-1 text-[11px] font-medium text-ink transition hover:bg-paper-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-line-2 focus-visible:ring-offset-1 disabled:opacity-50"
          >
            <span aria-hidden>&#x23F8;</span>
            Reporter
          </button>

          {showDeferPopover ? (
            <div
              role="menu"
              aria-label="Choisir la durée de report"
              className="absolute right-0 top-full z-20 mt-1 flex w-36 flex-col gap-0.5 rounded-md border border-line-2 bg-white p-1 shadow-card"
            >
              {DEFER_SHORTCUTS.map((shortcut) => (
                <button
                  key={shortcut.hours}
                  type="button"
                  role="menuitem"
                  data-defer-hours={shortcut.hours}
                  onClick={() => handleDefer(shortcut.hours)}
                  className="rounded-sm px-2 py-1 text-left text-[11px] font-medium text-ink transition hover:bg-paper-2 focus:bg-paper-2 focus:outline-none"
                >
                  {shortcut.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => setShowRejectModal(true)}
          disabled={isPending}
          title="Écarte l'AO. Un motif vous sera demandé pour améliorer le scoring."
          className="inline-flex items-center justify-center gap-1.5 rounded-sm border border-line-2 bg-white px-3 py-1 text-[11px] font-medium text-error transition hover:bg-error-bg focus:outline-none focus-visible:ring-2 focus-visible:ring-error focus-visible:ring-offset-1 disabled:opacity-50"
        >
          <span aria-hidden>&#x2715;</span>
          Écarter
        </button>
      </div>

      {showSoloTandemModal ? (
        <SoloTandemModal
          tenderTitle={tenderTitle}
          tenderAmount={tenderAmount}
          tenderDeadline={tenderDeadline}
          onConfirm={handleSelect}
          onCancel={() => setShowSoloTandemModal(false)}
        />
      ) : null}

      {showRejectModal ? (
        <RejectReasonModal
          tenderTitle={tenderTitle}
          onConfirm={handleReject}
          onCancel={() => setShowRejectModal(false)}
        />
      ) : null}
    </>
  );
}
