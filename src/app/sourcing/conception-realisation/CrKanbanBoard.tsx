"use client";

/**
 * CrKanbanBoard — Kanban light 4 colonnes pour le pipeline Conception/Réalisation.
 *
 * Client Component : pas d'I/O — reçoit `data: CrKanbanData` du Server Component.
 *
 * Les 4 colonnes reflètent l'avancement du dossier C/R :
 *   1. À analyser       — AOs sans RC uploadée
 *   2. RC analysée      — RC uploadée + brief IA disponible
 *   3. Dossier en cours — Pièces DCE en cours de constitution
 *   4. Soumis           — Dossier ZIP compilé/envoyé
 *
 * Source de vérité :
 *   - `handoff/BRIEF_CHANTIER_260527.md` §Feature 1 Pipeline C/R
 */

import { useState } from "react";

import Link from "next/link";

import { PipelineKeywordBar } from "@/app/sourcing/_shared/PipelineKeywordBar";

import type { CrCard, CrKanbanData } from "./page-data";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Formate une date en dd/MM/yyyy. */
function formatDate(date: Date | null): string {
  if (!date) return "—";
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/** Retourne true si la date est dans moins de 7 jours (ou passée). */
function isDeadlineUrgent(date: Date | null): boolean {
  if (!date) return false;
  const diff = new Date(date).getTime() - Date.now();
  return diff < 7 * 24 * 60 * 60 * 1000;
}

/** Tronque un texte à N caractères avec ellipse. */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

// ---------------------------------------------------------------------------
// Configuration des colonnes
// ---------------------------------------------------------------------------

interface ColumnConfig {
  key: keyof CrKanbanData;
  label: string;
  /** Couleur de l'indicateur de colonne (top border). */
  accentClass: string;
  /** Description courte affichée sous le titre de la colonne. */
  description: string;
}

const COLUMNS: ColumnConfig[] = [
  {
    key: "a_analyser",
    label: "À analyser",
    accentClass: "bg-paper-3",
    description: "RC non encore récupérée",
  },
  {
    key: "rc_analysee",
    label: "RC analysée",
    accentClass: "bg-amber-400",
    description: "Brief IA disponible",
  },
  {
    key: "dossier_en_cours",
    label: "Dossier en cours",
    accentClass: "bg-blue-400",
    description: "Pièces DCE en constitution",
  },
  {
    key: "soumis",
    label: "Soumis",
    accentClass: "bg-success",
    description: "Dossier ZIP compilé",
  },
];

// ---------------------------------------------------------------------------
// Carte AO
// ---------------------------------------------------------------------------

function KanbanCard({ card }: { card: CrCard }) {
  const deadlineUrgent = isDeadlineUrgent(card.deadline);
  const deadlineLabel = formatDate(card.deadline);

  return (
    <article className="rounded-lg border border-line bg-white p-3 shadow-sm transition hover:shadow-md">
      {/* Titre + score */}
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm font-medium leading-snug text-ink" title={card.title}>
          {truncate(card.title, 55)}
        </p>
        {card.score !== null && (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
              card.score >= 75
                ? "bg-brand-red/10 text-brand-red"
                : card.score >= 50
                  ? "bg-amber-100 text-amber-700"
                  : "bg-paper-3 text-ink-2"
            }`}
            aria-label={`Score ${card.score}/100`}
          >
            {card.score}
          </span>
        )}
      </div>

      {/* Acheteur */}
      <p className="mt-1 truncate text-xs text-ink-2">{card.buyer}</p>

      {/* Deadline */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span
          className={`text-xs ${deadlineUrgent ? "font-semibold text-brand-red" : "text-ink-2"}`}
        >
          {deadlineUrgent ? `Urgent · ${deadlineLabel}` : deadlineLabel}
        </span>

        {/* Lien fiche AO */}
        <Link
          href={`/sourcing/ao/${card.id}`}
          className="focus:ring-brand-red/40 inline-flex shrink-0 items-center rounded border border-line bg-paper px-2 py-0.5 text-xs text-ink-2 transition hover:bg-paper-2 hover:text-ink focus:outline-none focus:ring-2"
          aria-label={`Voir la fiche de l'AO ${card.title}`}
        >
          Voir →
        </Link>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Colonne Kanban
// ---------------------------------------------------------------------------

function KanbanColumn({ config, cards }: { config: ColumnConfig; cards: CrCard[] }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* En-tête colonne */}
      <div className={`mb-3 h-1 rounded-full ${config.accentClass}`} aria-hidden />
      <div className="mb-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-sm font-semibold text-ink">{config.label}</h2>
          <span
            className="rounded-full bg-paper-3 px-2 py-0.5 text-xs font-medium text-ink-2"
            aria-label={`${cards.length} AO${cards.length > 1 ? "s" : ""}`}
          >
            {cards.length}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted">{config.description}</p>
      </div>

      {/* Cartes */}
      <div className="flex-1 space-y-2">
        {cards.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line py-8 text-center">
            <p className="text-xs text-muted">Aucun AO</p>
          </div>
        ) : (
          cards.map((card) => <KanbanCard key={card.id} card={card} />)
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

interface Props {
  data: CrKanbanData;
}

export function CrKanbanBoard({ data }: Props) {
  const [keyword, setKeyword] = useState("");

  const totalAos =
    data.a_analyser.length +
    data.rc_analysee.length +
    data.dossier_en_cours.length +
    data.soumis.length;

  if (totalAos === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line py-16 text-center">
        <p className="text-base font-medium text-ink">Aucun AO Conception/Réalisation en cours</p>
        <p className="mt-1 text-sm text-muted">
          Sélectionnez un AO en mode Conception/Réalisation depuis la page AO du jour.
        </p>
      </div>
    );
  }

  // Filtrage local par mots-clés : appliqué sur chaque colonne individuellement
  function filterCards(cards: CrCard[]): CrCard[] {
    if (!keyword.trim()) return cards;
    const kw = keyword.toLowerCase();
    return cards.filter(
      (c) => c.title.toLowerCase().includes(kw) || c.buyer.toLowerCase().includes(kw),
    );
  }

  const filteredData: CrKanbanData = {
    a_analyser: filterCards(data.a_analyser),
    rc_analysee: filterCards(data.rc_analysee),
    dossier_en_cours: filterCards(data.dossier_en_cours),
    soumis: filterCards(data.soumis),
  };

  return (
    <div>
      {/* Barre de filtre keyword — mode local (données déjà en mémoire) */}
      <PipelineKeywordBar
        currentKeyword={keyword}
        onSearch={(kw) => setKeyword(kw)}
        onClear={() => setKeyword("")}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => (
          <KanbanColumn key={col.key} config={col} cards={filteredData[col.key]} />
        ))}
      </div>
    </div>
  );
}
