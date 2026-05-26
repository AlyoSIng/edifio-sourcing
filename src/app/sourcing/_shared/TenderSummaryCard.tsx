/**
 * Carte AO simplifiée — Server Component partagé entre les pages
 * « Sélectionnés », « Différés » et « Réponse solo ».
 *
 * Layout identique à `TenderCard` (score ring + titre + acheteur + CPV +
 * montant + deadline) mais SANS les boutons actions Sélectionner / Reporter /
 * Écarter — ceux-ci ne sont pertinents que sur la page « AO du jour ».
 *
 * À la place : un `cta` optionnel passé en prop (lien vers dossier, lien
 * Tandem, etc.). Cela maintient le composant générique et évite de coupler
 * la logique de routage CTA dans le composant carte lui-même.
 *
 * Pattern visuel :
 *   - Grid 3 colonnes : [score ring 64px] [main] [actions auto]
 *   - Score ring SVG inline (identique à `TenderCard`)
 *   - Couleur ring : brand-red ≥ 75, warn 50-74, line-2 < 50
 *
 * Server Component pur — aucune interactivité.
 */

import type { ReactNode } from "react";

import type { TenderOfTheDay } from "@/lib/sourcing/queries";

import { formatAmount, formatDeadline } from "../ao-du-jour/format";

// ============================================================================
// Props
// ============================================================================

export interface TenderSummaryCardProps {
  /** AO à afficher — `status` optionnel (présent pour TenderSelected). */
  tender: TenderOfTheDay & { status?: string };
  /**
   * Bouton ou lien CTA contextuel rendu dans la colonne droite.
   * Si absent, la colonne droite ne rend que la deadline.
   */
  cta?: ReactNode;
}

// ============================================================================
// Composant principal
// ============================================================================

export function TenderSummaryCard({ tender, cta }: TenderSummaryCardProps) {
  const mainCpv = tender.cpv[0] ?? "—";
  const platformLabel = tender.platformCode.toUpperCase();
  const scoreNum = tender.score ? Math.round(Number(tender.score)) : null;
  const deadlineLabel = formatDeadline(tender.deadline);
  const daysToDeadline = daysUntil(tender.deadline);
  const deadlineTone = deadlineToneFromDays(daysToDeadline);

  return (
    <article className="grid grid-cols-1 gap-4 rounded-md border border-line bg-white p-4 transition hover:shadow-card sm:grid-cols-[64px_1fr_auto] sm:items-start">
      {/* Score ring 64×64 — SVG inline */}
      <ScoreRing score={scoreNum} />

      {/* Informations principales */}
      <div className="min-w-0">
        <h2 className="line-clamp-2 font-display text-base font-semibold leading-snug text-ink">
          {tender.title}
        </h2>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span>{tender.buyer}</span>
          <span className="font-mono">CPV {mainCpv}</span>
          <span className="font-mono">Réf. {tender.externalRef}</span>
          <span
            className="rounded-xs bg-paper-2 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ink-2"
            aria-label="Plateforme source"
          >
            {platformLabel}
          </span>
        </div>
        <p className="mt-2 text-xs text-ink-2">
          Estimation <span className="font-medium">{formatAmount(tender.amount)}</span>
        </p>
      </div>

      {/* Colonne droite : deadline + CTA optionnel */}
      <div className="flex flex-col items-stretch gap-1.5 sm:min-w-[160px]">
        <span
          className={`text-right font-mono text-[11px] ${deadlineTone}`}
          aria-label={`Date limite de remise des offres : ${deadlineLabel}`}
        >
          {daysToDeadline !== null
            ? `Clôture J-${daysToDeadline} · ${deadlineLabel}`
            : `Clôture ${deadlineLabel}`}
        </span>
        {cta ? <div className="mt-1 flex flex-col gap-1">{cta}</div> : null}
      </div>
    </article>
  );
}

// ============================================================================
// Helpers visuels (dupliqués depuis TenderCard pour indépendance du module)
// ============================================================================

/**
 * Score ring SVG — identique à `TenderCard.ScoreRing`.
 * Dupliqué intentionnellement pour que `_shared` ne dépende pas de
 * `ao-du-jour/` (chemin de dépendance inversé = dette de couplage).
 */
function ScoreRing({ score }: { score: number | null }) {
  const circumference = 175.9;
  const safeScore = score === null ? 0 : Math.max(0, Math.min(100, score));
  const dashOffset = circumference * (1 - safeScore / 100);
  const strokeColor =
    score === null
      ? "var(--line-2)"
      : score >= 75
        ? "var(--brand-red)"
        : score >= 50
          ? "var(--status-warn)"
          : "var(--line-2)";

  return (
    <div
      className="relative grid h-16 w-16 place-items-center"
      role="img"
      aria-label={`Score de pertinence ${score ?? "indisponible"} sur 100`}
    >
      <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90">
        <circle cx="32" cy="32" r="28" fill="none" stroke="var(--paper-3)" strokeWidth="6" />
        <circle
          cx="32"
          cy="32"
          r="28"
          fill="none"
          stroke={strokeColor}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <span className="font-display text-[19px] font-bold text-ink">
        {score === null ? "—" : score}
      </span>
    </div>
  );
}

/**
 * Nombre de jours entiers entre maintenant et la deadline.
 * `null` si pas de deadline ou déjà passée.
 */
function daysUntil(deadline: Date | null): number | null {
  if (!deadline) return null;
  const diffMs = deadline.getTime() - Date.now();
  if (diffMs < 0) return null;
  return Math.ceil(diffMs / (24 * 3600 * 1000));
}

/**
 * Couleur du libellé deadline selon l'urgence :
 *   - <= 7 jours  → warn (orange)
 *   - 8-14 jours  → ink-2
 *   - > 14 jours  → muted
 */
function deadlineToneFromDays(days: number | null): string {
  if (days === null) return "text-muted";
  if (days <= 7) return "text-warn";
  if (days <= 14) return "text-ink-2";
  return "text-muted";
}
