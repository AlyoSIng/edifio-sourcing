"use client";

/**
 * Sous-composant Client `TenderCardActions` — 3 boutons sur la carte AO :
 * Sélectionner / Différer / Rejeter.
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
 * Copy verbatim :
 *  - Boutons : « Sélectionner » (primary), « Différer » (ghost), « Rejeter »
 *    (danger ghost) — cf. `design/copy/onboarding_and_push_v1.md` l.68-70 et
 *    `guide_utilisateur_1page.html` l.137-145.
 *  - Tooltips alignés sur le même fichier (attribut `title`).
 *
 * V1 limites :
 *  - Pas de drag-and-drop
 *  - Pas de raccourcis clavier (TODO Phase 2 : touche `S` / `D` / `R`)
 *  - `useOptimistic` non utilisé ici car le tableau optimiste vit côté page
 *    parent (la card disparaît, pas juste un changement local) — pour V1
 *    on s'appuie sur `revalidatePath` côté server action pour rafraîchir
 *    la liste après mutation.
 */

import { useState, useTransition } from "react";

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

  function handleSelect(mode: "solo" | "tandem"): void {
    setShowSoloTandemModal(false);
    startTransition(async () => {
      const result = await selectTenderAction(tenderId, mode);
      if (!result.ok) emitError(result.error);
    });
  }

  function handleDefer(): void {
    startTransition(async () => {
      // V1 : 24h fixe (Arbitrage Board B 2026-05-21, extensible Phase 2).
      const result = await deferTenderAction(tenderId, 24);
      if (!result.ok) emitError(result.error);
    });
  }

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

        <button
          type="button"
          onClick={handleDefer}
          disabled={isPending}
          title="Reporte l'AO de 24h. Il reviendra dans le digest de demain."
          className="inline-flex items-center justify-center gap-1.5 rounded-sm border border-line-2 bg-white px-3 py-1 text-[11px] font-medium text-ink transition hover:bg-paper-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-line-2 focus-visible:ring-offset-1 disabled:opacity-50"
        >
          <span aria-hidden>&#x23F8;</span>
          Différer
        </button>

        <button
          type="button"
          onClick={() => setShowRejectModal(true)}
          disabled={isPending}
          title="Rejette l'AO. Un motif vous sera demandé pour améliorer le scoring."
          className="inline-flex items-center justify-center gap-1.5 rounded-sm border border-line-2 bg-white px-3 py-1 text-[11px] font-medium text-error transition hover:bg-error-bg focus:outline-none focus-visible:ring-2 focus-visible:ring-error focus-visible:ring-offset-1 disabled:opacity-50"
        >
          <span aria-hidden>&#x2715;</span>
          Rejeter
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
