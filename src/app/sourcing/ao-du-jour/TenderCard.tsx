import type { TenderOfTheDay } from "@/lib/sourcing/queries";

import { formatAmount, formatDeadline } from "./format";
import { TenderCardActions } from "./TenderCardActions";

/**
 * Carte AO « du jour ».
 *
 * Server Component pour le rendu, **avec un sous-composant Client**
 * `<TenderCardActions />` qui porte les 3 boutons Sélectionner / Différer /
 * Rejeter (PR n°5).
 *
 * Source design : `design/maquettes/maquettes_v1.html` lignes 195-220
 * (Maquette 1 mobile + Maquette 2 desktop kanban-card) + lignes 294-323
 * (Maquette 3 modale Solo/Tandem, déclenchée depuis le bouton « Sélectionner »).
 *
 * Copy verbatim (cf. `design/copy/onboarding_and_push_v1.md` l.68-70 +
 * `guide_utilisateur_1page.html` l.137-145) : « Sélectionner / Différer /
 * Rejeter ». Tooltips alignés sur le même fichier (hover desktop, focus
 * keyboard).
 */
export function TenderCard({ tender }: { tender: TenderOfTheDay }) {
  // CPV principal (premier code) — V1 affiche le code brut ; un mapping
  // CPV → libellé FR sera ajouté avec la PR scoring V2 (table `cpv_labels`
  // pas encore au schéma).
  const mainCpv = tender.cpv[0] ?? "—";
  const platformLabel = tender.platformCode.toUpperCase();
  const scoreLabel = tender.score ? String(Math.round(Number(tender.score))) : "—";

  return (
    <article className="rounded-md border border-neutral-200 bg-white p-3 shadow-sm">
      <header className="mb-1.5 flex items-start justify-between gap-3">
        <h2 className="line-clamp-2 font-display text-sm font-semibold leading-snug text-neutral-900">
          {tender.title}
        </h2>
        <span
          aria-label={`Score : ${scoreLabel}`}
          className="shrink-0 rounded bg-[#FF0033] px-2 py-0.5 font-mono text-xs font-semibold text-white"
        >
          {scoreLabel}
        </span>
      </header>

      <p className="mb-2 text-xs text-neutral-600">{tender.buyer}</p>

      <p className="mb-2 text-xs text-neutral-600">
        {formatAmount(tender.amount)} · Remise {formatDeadline(tender.deadline)} · CPV {mainCpv}
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="rounded bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-blue-800">
          {platformLabel}
        </span>
        <span
          className="font-mono text-[10px] text-neutral-400"
          aria-label="Référence externe de l'avis"
        >
          {tender.externalRef}
        </span>
      </div>

      <TenderCardActions
        tenderId={tender.id}
        tenderTitle={tender.title}
        tenderAmount={formatAmount(tender.amount)}
        tenderDeadline={formatDeadline(tender.deadline)}
      />
    </article>
  );
}
