"use client";

/**
 * Tableau filtrable + bouton export CSV des 30 dernières sollicitations Tandem.
 *
 * Chantier I1 — Steve 2026-06-04. Server Component parent passe une snapshot
 * des `recent` (ISO dates), on filtre côté Client par champ libre (cabinet
 * ou intitulé AO) et on exporte ce qu'on voit.
 */

import { useMemo, useState } from "react";

export interface TandemRow {
  id: string;
  status: string;
  respondedAtIso: string | null;
  createdAtIso: string;
  followupSentAtIso: string | null;
  tenderTitle: string;
  architectCabinet: string;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(status: string): { label: string; className: string } {
  switch (status) {
    case "pending":
      return { label: "En attente", className: "bg-amber-50 text-amber-700" };
    case "accepted":
      return { label: "Accepté", className: "bg-emerald-50 text-emerald-700" };
    case "declined":
      return { label: "Décliné", className: "bg-error-bg text-error" };
    case "info_requested":
      return { label: "Demande d'infos", className: "bg-paper-2 text-ink-2" };
    default:
      return { label: status, className: "bg-paper-2 text-ink-2" };
  }
}

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(";") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function TandemTable({ rows }: { rows: TandemRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.architectCabinet.toLowerCase().includes(q) || r.tenderTitle.toLowerCase().includes(q),
    );
  }, [rows, query]);

  function handleExport() {
    const headers = ["AO", "Architecte", "Statut", "Sollicité le", "Répondu le", "Relance J+3"];
    const lines = [headers.map(escapeCsv).join(";")];
    for (const r of filtered) {
      lines.push(
        [
          r.tenderTitle,
          r.architectCabinet,
          statusLabel(r.status).label,
          formatDateTime(r.createdAtIso),
          formatDateTime(r.respondedAtIso),
          formatDateTime(r.followupSentAtIso),
        ]
          .map(escapeCsv)
          .join(";"),
      );
    }
    const csv = lines.join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "_");
    a.href = url;
    a.download = `Tandem_sollicitations_${today}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un cabinet ou un AO…"
          className="w-full max-w-md rounded border border-line bg-white px-3 py-1.5 text-sm text-ink outline-none focus:border-brand-red focus:ring-1 focus:ring-brand-red"
          aria-label="Rechercher dans les sollicitations"
        />
        <span className="text-xs text-muted">
          {filtered.length} / {rows.length} ligne{filtered.length > 1 ? "s" : ""}
        </span>
        <button
          type="button"
          onClick={handleExport}
          disabled={filtered.length === 0}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-paper-2 disabled:cursor-not-allowed disabled:opacity-50"
          title="Exporter les lignes filtrées au format CSV"
        >
          📥 Export CSV
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm italic text-muted">Aucune ligne ne correspond à la recherche.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-white">
          <table className="w-full text-sm">
            <thead className="bg-paper-2">
              <tr>
                <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-ink-2">
                  AO
                </th>
                <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-ink-2">
                  Architecte
                </th>
                <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-ink-2">
                  Statut
                </th>
                <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-ink-2">
                  Sollicité
                </th>
                <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-ink-2">
                  Répondu
                </th>
                <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-ink-2">
                  Relance J+3
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((row) => {
                const status = statusLabel(row.status);
                return (
                  <tr key={row.id}>
                    <td className="max-w-[280px] truncate px-3 py-2 text-ink">{row.tenderTitle}</td>
                    <td className="px-3 py-2 text-ink-2">{row.architectCabinet}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${status.className}`}
                      >
                        {status.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-muted">
                      {formatDateTime(row.createdAtIso)}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-muted">
                      {formatDateTime(row.respondedAtIso)}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-muted">
                      {formatDateTime(row.followupSentAtIso)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
