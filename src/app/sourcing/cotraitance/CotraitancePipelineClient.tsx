"use client";

/**
 * CotraitancePipelineClient — liste filtrable des AOs en pipeline Tandem.
 *
 * Client Component : gère les tabs de filtre par statut sans rechargement
 * (state local, pas de modification URL pour ce filtre léger).
 *
 * Reçoit `entries: PipelineEntry[]` pré-chargées côté Server Component.
 *
 * Source de vérité :
 *   - `specs/module_tandem_engine_v1.md` §3 (pipeline Tandem UI)
 *   - `handoff/PLAN_TANDEM_NADIA_260522.md` §Pipeline cotraitance
 */

import { useState } from "react";

import { PipelineKeywordBar } from "@/app/sourcing/_shared/PipelineKeywordBar";

import type { PipelineEntry } from "./page-data";

// ---------------------------------------------------------------------------
// Helpers de formatage
// ---------------------------------------------------------------------------

/** Tronque un texte à N caractères avec ellipse. */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

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
function isDeadlineSoon(date: Date | null): boolean {
  if (!date) return false;
  const now = new Date();
  const diff = new Date(date).getTime() - now.getTime();
  return diff < 7 * 24 * 60 * 60 * 1000;
}

// ---------------------------------------------------------------------------
// Badges statut tender
// ---------------------------------------------------------------------------

type TenderBadgeStatus =
  | "selected_tandem"
  | "awaiting_architect"
  | "architect_accepted"
  | "architect_declined"
  | "architect_info_requested";

const TENDER_STATUS_CONFIG: Record<TenderBadgeStatus, { label: string; className: string }> = {
  selected_tandem: {
    label: "Sélectionné",
    className: "bg-paper-3 text-ink-2",
  },
  awaiting_architect: {
    label: "En attente",
    className: "border border-amber-200 bg-amber-50 text-amber-700",
  },
  architect_accepted: {
    label: "Accepté",
    className: "bg-success-bg text-success",
  },
  architect_declined: {
    label: "Refusé",
    className: "bg-error-bg text-error",
  },
  architect_info_requested: {
    label: "Infos demandées",
    className: "border border-blue-200 bg-blue-50 text-blue-700",
  },
};

function TenderStatusBadge({ status }: { status: string }) {
  const config = TENDER_STATUS_CONFIG[status as TenderBadgeStatus];
  if (!config) return null;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Badge relance J+3
// ---------------------------------------------------------------------------

/**
 * Badge indiquant l'état de relance automatique J+3.
 *
 * - Rouge  "Relance requise"  : statut pending, > 3 jours, relance pas encore envoyée
 * - Orange "Relancé"          : statut pending, > 3 jours, relance déjà envoyée par le cron
 *
 * Ne s'affiche que si `isOverdue = true`.
 */
function RelanceBadge({
  isOverdue,
  followupSentAt,
}: {
  isOverdue: boolean;
  followupSentAt: Date | null;
}) {
  if (!isOverdue) return null;

  if (followupSentAt) {
    return (
      <span
        className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
        title={`Relancé le ${formatDate(new Date(followupSentAt))}`}
      >
        Relancé
      </span>
    );
  }

  return (
    <span
      className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700"
      title="Aucune réponse depuis plus de 3 jours — relance automatique en attente"
    >
      En attente +3j
    </span>
  );
}

// ---------------------------------------------------------------------------
// Badges réponse architecte
// ---------------------------------------------------------------------------

type ResponseStatus = "pending" | "accepted" | "declined" | "info_requested" | null;

const RESPONSE_STATUS_CONFIG: Record<
  "pending" | "accepted" | "declined" | "info_requested" | "null",
  { label: string; className: string }
> = {
  pending: {
    label: "En attente",
    className: "border border-amber-200 bg-amber-50 text-amber-700",
  },
  accepted: {
    label: "Accepté",
    className: "bg-success-bg text-success",
  },
  declined: {
    label: "Refusé",
    className: "bg-error-bg text-error",
  },
  info_requested: {
    label: "Infos +",
    className: "border border-blue-200 bg-blue-50 text-blue-700",
  },
  null: {
    label: "Non sollicité",
    className: "bg-paper-2 text-muted",
  },
};

function ResponseBadge({ status }: { status: ResponseStatus }) {
  const key = status ?? "null";
  const config = RESPONSE_STATUS_CONFIG[key];
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Tabs de filtre
// ---------------------------------------------------------------------------

type TabKey = "all" | "awaiting" | "accepted" | "declined";

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "Tout" },
  { key: "awaiting", label: "En attente" },
  { key: "accepted", label: "Acceptés" },
  { key: "declined", label: "Refusés" },
];

const TAB_STATUSES: Record<TabKey, string[]> = {
  all: [
    "selected_tandem",
    "awaiting_architect",
    "architect_accepted",
    "architect_declined",
    "architect_info_requested",
  ],
  awaiting: ["selected_tandem", "awaiting_architect"],
  accepted: ["architect_accepted"],
  declined: ["architect_declined"],
};

// ---------------------------------------------------------------------------
// Composant card pour un AO
// ---------------------------------------------------------------------------

function PipelineCard({ entry }: { entry: PipelineEntry }) {
  const { tender, solicitations } = entry;
  const deadlineSoon = isDeadlineSoon(tender.deadline);

  return (
    <article className="rounded-lg border border-line bg-white p-4 shadow-sm">
      {/* En-tête : titre + statut */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-ink" title={tender.title}>
            {truncate(tender.title, 60)}
          </p>
          <p className="mt-0.5 text-xs text-ink-2">{tender.buyer}</p>
        </div>
        <TenderStatusBadge status={tender.status} />
      </div>

      {/* Deadline */}
      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-ink-2">
        <span>
          Deadline :{" "}
          <span className={deadlineSoon ? "font-semibold text-brand-red" : ""}>
            {formatDate(tender.deadline)}
            {deadlineSoon && tender.deadline ? " — urgent" : ""}
          </span>
        </span>
      </div>

      {/* Solicitations architectes */}
      {solicitations.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          {solicitations.map((s) => (
            <div
              key={s.architect.id}
              className="flex flex-wrap items-center gap-2 rounded-md bg-paper-2 px-3 py-1.5 text-xs"
            >
              <span className="font-medium text-ink">{s.architect.cabinet}</span>
              <span className="text-muted">rang {s.rank}</span>
              <ResponseBadge status={s.responseStatus} />
              <RelanceBadge isOverdue={s.isOverdue} followupSentAt={s.followupSentAt} />
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted">Aucun architecte proposé.</p>
      )}

      {/* Liens footer : short-list + dossier (si architect_accepted) */}
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        <a
          href={`/sourcing/ao/${tender.id}/tandem`}
          className="focus:ring-brand-red/40 inline-flex items-center rounded-md border border-line bg-white px-3 py-1 text-xs font-medium text-ink-2 hover:bg-paper-2 hover:text-ink focus:outline-none focus:ring-2"
        >
          Voir la short-list →
        </a>
        {tender.status === "architect_accepted" && (
          <a
            href={`/sourcing/ao/${tender.id}/dossier`}
            className="focus:ring-brand-red/40 hover:bg-brand-red/90 inline-flex items-center rounded-md bg-brand-red px-3 py-1 text-xs font-medium text-white focus:outline-none focus:ring-2"
          >
            Préparer le dossier →
          </a>
        )}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

interface Props {
  entries: PipelineEntry[];
}

export function CotraitancePipelineClient({ entries }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [keyword, setKeyword] = useState("");

  // État vide global (aucun AO en pipeline Tandem)
  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line py-16 text-center">
        <p className="text-base font-medium text-ink">Aucun AO en Cotraitance en cours</p>
        <p className="mt-1 text-sm text-muted">
          Sélectionnez un AO en Cotraitance depuis la page AO du jour.
        </p>
      </div>
    );
  }

  // Filtrage côté client selon l'onglet actif + mots-clés
  const allowedStatuses = TAB_STATUSES[activeTab];
  const filtered = entries.filter((e) => {
    if (!allowedStatuses.includes(e.tender.status)) return false;
    if (!keyword.trim()) return true;
    const kw = keyword.toLowerCase();
    return e.tender.title.toLowerCase().includes(kw) || e.tender.buyer.toLowerCase().includes(kw);
  });

  return (
    <div>
      {/* Barre de filtre keyword — mode local (données déjà en mémoire) */}
      <PipelineKeywordBar
        currentKeyword={keyword}
        onSearch={(kw) => setKeyword(kw)}
        onClear={() => setKeyword("")}
      />

      {/* Tabs de filtre */}
      <div
        role="tablist"
        aria-label="Filtrer par statut"
        className="mb-4 flex gap-1 rounded-lg border border-line bg-paper-2 p-1"
      >
        {TABS.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`focus:ring-brand-red/40 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 ${
              activeTab === tab.key
                ? "bg-white text-ink shadow-sm"
                : "text-ink-2 hover:bg-white/60 hover:text-ink"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Liste filtrée */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line py-16 text-center">
          <p className="text-sm text-muted">Aucun AO en pipeline Tandem pour ce filtre.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((entry) => (
            <PipelineCard key={entry.tender.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
