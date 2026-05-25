/**
 * PipelineStats — chips de comptage par statut Tandem.
 *
 * Server Component pur (pas de 'use client'). Affiche 4 chips horizontaux
 * récapitulant l'état global du pipeline cotraitance.
 *
 * Source de vérité : `specs/module_tandem_engine_v1.md` §3 (pipeline).
 */

import type { PipelineEntry } from "./page-data";

interface Props {
  entries: PipelineEntry[];
}

/**
 * Retourne le nombre d'entrées correspondant à un ou plusieurs statuts.
 */
function countByStatuses(entries: PipelineEntry[], statuses: string[]): number {
  return entries.filter((e) => statuses.includes(e.tender.status)).length;
}

/** Chip coloré individuel. */
function StatChip({
  label,
  count,
  colorClass,
}: {
  label: string;
  count: number;
  colorClass: string;
}) {
  return (
    <span
      className={`rounded-full border border-line bg-white px-3 py-1 text-sm font-medium ${colorClass}`}
    >
      {label} : {count}
    </span>
  );
}

export function PipelineStats({ entries }: Props) {
  const enAttente = countByStatuses(entries, ["awaiting_architect", "selected_tandem"]);
  const acceptes = countByStatuses(entries, ["architect_accepted"]);
  const refuses = countByStatuses(entries, ["architect_declined"]);
  const infosDemandees = countByStatuses(entries, ["architect_info_requested"]);

  return (
    <div className="mb-6 flex flex-wrap gap-3" aria-label="Résumé du pipeline Tandem">
      <StatChip label="En attente" count={enAttente} colorClass="text-amber-700" />
      <StatChip label="Acceptés" count={acceptes} colorClass="text-green-700" />
      <StatChip label="Refusés" count={refuses} colorClass="text-red-700" />
      <StatChip label="Infos demandées" count={infosDemandees} colorClass="text-blue-700" />
    </div>
  );
}
