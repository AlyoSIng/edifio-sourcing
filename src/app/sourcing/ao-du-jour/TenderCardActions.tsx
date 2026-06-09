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
 *  - Raccourcis clavier hover-based : `S` Sélectionner, `D` Différer, `R` Rejeter
 *    (actifs quand la souris survole le bloc actions — ignorés si focus dans un input)
 *  - `useOptimistic` non utilisé ici car le tableau optimiste vit côté page
 *    parent (la card disparaît, pas juste un changement local) — pour V1
 *    on s'appuie sur `revalidatePath` côté server action pour rafraîchir
 *    la liste après mutation.
 */

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { RejectionReasonCode } from "@/lib/sourcing/learning/rejection-reasons";

import {
  deferTenderAction,
  excludeTenderAction,
  rejectTenderAction,
  selectTenderAction,
} from "./actions";
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
  /** Score de pertinence 0-100 issu de `tenders.score` — transmis à SoloTandemModal pour le badge. */
  tenderScore: number | null;
  /**
   * AO actuellement exclu ? (prop optionnelle — `false` par défaut).
   * En pratique toujours `false` sur la page AO du jour (les exclus sont
   * filtrés par `getTendersOfTheDay`), mais utile pour une future vue
   * « AO exclus » où l'utilisateur peut les réintégrer via « Inclure ».
   */
  isExcluded?: boolean;
}

export function TenderCardActions({
  tenderId,
  tenderTitle,
  tenderAmount,
  tenderDeadline,
  tenderScore,
  isExcluded = false,
}: TenderCardActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showSoloTandemModal, setShowSoloTandemModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showDeferPopover, setShowDeferPopover] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

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

  // Raccourcis clavier S / D / R — actifs quand la souris survole les actions
  useEffect(() => {
    if (!isHovered || isPending) return;
    const onKey = (e: KeyboardEvent) => {
      // Ignorer si l'utilisateur tape dans un champ texte
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement).isContentEditable)
        return;
      switch (e.key.toLowerCase()) {
        case "s":
          e.preventDefault();
          setShowSoloTandemModal(true);
          break;
        case "d":
          e.preventDefault();
          setShowDeferPopover((v) => !v);
          break;
        case "r":
          e.preventDefault();
          setShowRejectModal(true);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isHovered, isPending]);

  function handleSelect(mode: "solo" | "tandem" | "conception_realisation"): void {
    setShowSoloTandemModal(false);
    startTransition(async () => {
      const result = await selectTenderAction(tenderId, mode);
      if (!result.ok) {
        emitError(result.error);
        return;
      }
      // Après bascule :
      //  - solo   : reste sur la page AO du jour, force le re-fetch pour que
      //             l'AO traité disparaisse de la liste sans re-navigation
      //  - tandem : redirige vers la page short-list architectes
      //  - conception_realisation : redirige vers la page globale C/R (pipeline Phase 2)
      if (mode === "tandem") {
        router.push(`/sourcing/ao/${tenderId}/tandem`);
      } else if (mode === "conception_realisation") {
        router.push(`/sourcing/conception-realisation`);
      } else {
        router.refresh();
      }
    });
  }

  const handleDefer = useCallback(
    (hours: number) => {
      setShowDeferPopover(false);
      startTransition(async () => {
        const result = await deferTenderAction(tenderId, hours);
        if (!result.ok) {
          emitError(result.error);
          return;
        }
        // revalidatePath côté server invalide le cache mais ne force pas
        // le re-render du Server Component depuis un Client Component
        // (Next.js 14). router.refresh() déclenche un re-fetch immédiat
        // pour que la carte traitée disparaisse de la liste.
        router.refresh();
      });
    },
    [tenderId, router],
  );

  function handleReject(reasonCode: RejectionReasonCode, verbatim: string | null): void {
    setShowRejectModal(false);
    startTransition(async () => {
      const result = await rejectTenderAction(tenderId, reasonCode, verbatim);
      if (!result.ok) {
        emitError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleExclude(): void {
    startTransition(async () => {
      // isExcluded=true → on inclut (exclude=false) ; isExcluded=false → on exclut (exclude=true)
      const result = await excludeTenderAction(tenderId, !isExcluded);
      if (!result.ok) emitError(result.error);
    });
  }

  return (
    <>
      <div
        className={`flex flex-col gap-1.5 sm:items-stretch ${isPending ? "pointer-events-none opacity-50" : ""}`}
        aria-busy={isPending}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <button
          type="button"
          onClick={() => setShowSoloTandemModal(true)}
          disabled={isPending}
          title="Bascule l'AO en pipeline. Vous choisirez ensuite Mandataire ou Cotraitance."
          className="inline-flex items-center justify-center gap-1.5 rounded-full bg-brand-red px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-red-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red focus-visible:ring-offset-1 disabled:opacity-50"
        >
          <span aria-hidden>&#x2713;</span>
          Sélectionner
          {isHovered && (
            <kbd className="ml-1 rounded bg-white/20 px-1 py-0.5 font-mono text-[9px] text-white/80">
              S
            </kbd>
          )}
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
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-line-2 bg-white px-3 py-1 text-[11px] font-medium text-ink transition hover:bg-paper-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-line-2 focus-visible:ring-offset-1 disabled:opacity-50"
          >
            <span aria-hidden>&#x23F8;</span>
            Reporter
            {isHovered && (
              <kbd className="ml-1 rounded bg-paper-3 px-1 py-0.5 font-mono text-[9px] text-muted">
                D
              </kbd>
            )}
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
          title="Écarte l'AO. Le motif aide edifio à vous suggérer d'affiner votre profil de recherche."
          className="inline-flex items-center justify-center gap-1.5 rounded-full border border-line-2 bg-white px-3 py-1 text-[11px] font-medium text-error transition hover:bg-error-bg focus:outline-none focus-visible:ring-2 focus-visible:ring-error focus-visible:ring-offset-1 disabled:opacity-50"
        >
          <span aria-hidden>&#x2715;</span>
          Écarter
          {isHovered && (
            <kbd className="ml-1 rounded bg-error-bg px-1 py-0.5 font-mono text-[9px] text-error">
              R
            </kbd>
          )}
        </button>

        <button
          type="button"
          onClick={() => handleExclude()}
          disabled={isPending}
          title={
            isExcluded
              ? "Inclure à nouveau cet AO dans la liste"
              : "Exclure cet AO de la liste (réversible)"
          }
          className="inline-flex items-center justify-center gap-1.5 rounded-full border border-line-2 bg-white px-3 py-1 text-[11px] font-medium text-muted transition hover:bg-paper-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-line-2 focus-visible:ring-offset-1 disabled:opacity-50"
        >
          {isExcluded ? "↩ Inclure" : "⊘ Exclure"}
        </button>
      </div>

      {showSoloTandemModal ? (
        <SoloTandemModal
          tenderTitle={tenderTitle}
          tenderAmount={tenderAmount}
          tenderDeadline={tenderDeadline}
          tenderScore={tenderScore}
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
