import type { TenderOfTheDay } from "@/lib/sourcing/queries";

import { formatAmount, formatDeadline } from "./format";

/**
 * Carte AO « du jour » — V1 read-only.
 *
 * Server Component pur (pas de `"use client"`). Affichage strict, aucune
 * interactivité au V1.
 *
 * V1 read-only — actions Sélectionner / Différer / Rejeter wireup PR suivante
 * avec audit log A4 `tender_select` + transition vers `selected_solo` /
 * `selected_tandem` via modal Solo/Tandem (Maquette 3 + spec `audit_log_v1.md`).
 *
 * Source design : `design/maquettes/maquettes_v1.html` lignes 195-220
 * (Maquette 1 mobile + Maquette 2 desktop kanban-card).
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

      <div className="flex flex-wrap items-center gap-1.5">
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
    </article>
  );
}
