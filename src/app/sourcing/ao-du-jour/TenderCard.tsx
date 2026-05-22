import type { TenderOfTheDay } from "@/lib/sourcing/queries";

import { formatAmount, formatDeadline } from "./format";
import { TenderCardActions } from "./TenderCardActions";

/**
 * Carte AO « du jour » — habillage charte edifio (M-A lignes 236-302).
 *
 * Server Component pour le rendu + sous-composant Client `<TenderCardActions />`
 * pour les 3 boutons Sélectionner / Différer / Rejeter (PR n°5).
 *
 * Pattern visuel :
 *   - Grid 3 colonnes : [score ring 64px] [main] [actions 132px+]
 *   - Score ring SVG inline avec dasharray dynamique (cf. helper plus bas)
 *   - Couleur du ring dérivée du score (≥75 brand-red, 50-74 warn, <50 line-2)
 *   - Score breakdown (4 barres CPV / Géo / Montant / Délai) — V2 quand les
 *     sous-scores seront exposés. V1 affiche uniquement la barre globale via
 *     le ring.
 *
 * Aucune touche aux données : signature `TenderCard({ tender })` inchangée.
 */
export function TenderCard({ tender }: { tender: TenderOfTheDay }) {
  const mainCpv = tender.cpv[0] ?? "—";
  const platformLabel = tender.platformCode.toUpperCase();
  const scoreNum = tender.score ? Math.round(Number(tender.score)) : null;
  const deadlineLabel = formatDeadline(tender.deadline);
  const daysToDeadline = daysUntil(tender.deadline);
  const deadlineTone = deadlineToneFromDays(daysToDeadline);

  return (
    <article className="grid grid-cols-1 gap-4 rounded-md border border-line bg-white p-4 transition hover:shadow-card sm:grid-cols-[64px_1fr_auto] sm:items-start">
      {/* Score ring 64×64 — SVG inline pour ne pas dépendre d'un pack icônes */}
      <ScoreRing score={scoreNum} />

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

      <div className="flex flex-col items-stretch gap-1.5 sm:min-w-[140px]">
        <span
          className={`text-right font-mono text-[11px] ${deadlineTone}`}
          aria-label={`Date limite de remise des offres : ${deadlineLabel}`}
        >
          {daysToDeadline !== null
            ? `Clôture J-${daysToDeadline} · ${deadlineLabel}`
            : `Clôture ${deadlineLabel}`}
        </span>
        <TenderCardActions
          tenderId={tender.id}
          tenderTitle={tender.title}
          tenderAmount={formatAmount(tender.amount)}
          tenderDeadline={deadlineLabel}
        />
      </div>
    </article>
  );
}

/**
 * Score ring SVG — circonférence visuelle proportionnelle au score / 100.
 *
 * Détails techniques :
 *   - Cercle de rayon 28 (diamètre 56) dans un viewBox 64×64
 *   - Circonférence ≈ 175.9 (= 2 × π × 28)
 *   - `strokeDashoffset` = circumference × (1 - score / 100)
 *   - Couleur du ring : brand-red ≥ 75, warn 50-74, line-2 < 50
 *   - Le texte du score est centré, mono-style, lisible WCAG AA
 *
 * Score `null` (cas pathologique seed) → ring vide + libellé « — ».
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
 * Calcule le nombre de jours entre aujourd'hui et la deadline. `null` si pas
 * de deadline ou déjà passée.
 */
function daysUntil(deadline: Date | null): number | null {
  if (!deadline) return null;
  const diffMs = deadline.getTime() - Date.now();
  if (diffMs < 0) return null;
  return Math.ceil(diffMs / (24 * 3600 * 1000));
}

/**
 * Couleur du libellé deadline selon l'urgence :
 *   - ≤ 7 jours → warn
 *   - 8-14 jours → ink-2 (texte normal)
 *   - > 14 jours → muted
 */
function deadlineToneFromDays(days: number | null): string {
  if (days === null) return "text-muted";
  if (days <= 7) return "text-warn";
  if (days <= 14) return "text-ink-2";
  return "text-muted";
}
