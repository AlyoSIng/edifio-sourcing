"use client";

/**
 * Tableau filtrable + bouton export CSV des envois dossier_dispatches.
 *
 * Chantier I2 — Steve 2026-06-04. Affiche un historique complet (actifs +
 * annulés) avec filtre par statut, recherche par AO/archi/email, et export
 * CSV des lignes filtrées.
 */

import { useMemo, useState } from "react";

export interface EnvoiRow {
  id: string;
  tenderTitle: string;
  tenderExternalRef: string | null;
  architectCabinet: string;
  recipientEmail: string;
  sentAtIso: string;
  signedUrlExpiresAtIso: string;
  cancelledAtIso: string | null;
  cancellationReason: string | null;
}

type StatusFilter = "all" | "active" | "cancelled";

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

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(";") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function isUrlExpired(iso: string, now: Date): boolean {
  return new Date(iso).getTime() < now.getTime();
}

export function EnvoisTable({ rows }: { rows: EnvoiRow[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const now = useMemo(() => new Date(), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter === "active" && r.cancelledAtIso) return false;
      if (statusFilter === "cancelled" && !r.cancelledAtIso) return false;
      if (q) {
        const blob = (
          r.tenderTitle +
          " " +
          r.architectCabinet +
          " " +
          r.recipientEmail
        ).toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [rows, query, statusFilter]);

  function handleExport() {
    const headers = [
      "AO",
      "Référence",
      "Architecte",
      "Email destinataire",
      "Envoyé le",
      "Lien expire le",
      "Annulé le",
      "Motif annulation",
    ];
    const lines = [headers.map(escapeCsv).join(";")];
    for (const r of filtered) {
      lines.push(
        [
          r.tenderTitle,
          r.tenderExternalRef ?? "",
          r.architectCabinet,
          r.recipientEmail,
          formatDateTime(r.sentAtIso),
          formatDateTime(r.signedUrlExpiresAtIso),
          r.cancelledAtIso ? formatDateTime(r.cancelledAtIso) : "",
          r.cancellationReason ?? "",
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
    a.download = `Envois_dossiers_${today}.csv`;
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
          placeholder="Rechercher un AO, un archi ou un email…"
          className="w-full max-w-md rounded border border-line bg-white px-3 py-1.5 text-sm text-ink outline-none focus:border-brand-red focus:ring-1 focus:ring-brand-red"
          aria-label="Rechercher dans les envois"
        />

        {/* Toggle statut */}
        <nav
          className="inline-flex items-center rounded-full border border-line bg-white p-0.5"
          aria-label="Filtrer par statut"
        >
          {(
            [
              { v: "all" as const, l: "Tous" },
              { v: "active" as const, l: "Actifs" },
              { v: "cancelled" as const, l: "Annulés" },
            ] as const
          ).map((opt) => {
            const active = statusFilter === opt.v;
            return (
              <button
                key={opt.v}
                type="button"
                onClick={() => setStatusFilter(opt.v)}
                className={[
                  "rounded-full px-3 py-1 text-xs font-medium transition",
                  active ? "bg-ink text-white" : "text-ink-2 hover:bg-paper-2",
                ].join(" ")}
              >
                {opt.l}
              </button>
            );
          })}
        </nav>

        <span className="text-xs text-muted">
          {filtered.length} / {rows.length} envoi{filtered.length > 1 ? "s" : ""}
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
        <p className="text-sm italic text-muted">Aucun envoi ne correspond.</p>
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
                  Destinataire
                </th>
                <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-ink-2">
                  Envoyé
                </th>
                <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-ink-2">
                  Statut lien
                </th>
                <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-ink-2">
                  Statut envoi
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((row) => {
                const linkExpired = isUrlExpired(row.signedUrlExpiresAtIso, now);
                return (
                  <tr key={row.id} className={row.cancelledAtIso ? "opacity-60" : ""}>
                    <td className="max-w-[280px] truncate px-3 py-2 text-ink">
                      {row.tenderTitle}
                      {row.tenderExternalRef && (
                        <span className="ml-1 font-mono text-[10px] text-muted">
                          ({row.tenderExternalRef})
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-ink-2">{row.architectCabinet}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-muted">
                      {row.recipientEmail}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-muted">
                      {formatDateTime(row.sentAtIso)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={[
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                          linkExpired ? "bg-paper-2 text-ink-2" : "bg-emerald-50 text-emerald-700",
                        ].join(" ")}
                        title={`Lien valide jusqu'au ${formatDateTime(row.signedUrlExpiresAtIso)}`}
                      >
                        {linkExpired ? "Expiré" : "Actif"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {row.cancelledAtIso ? (
                        <span
                          className="inline-flex items-center rounded-full bg-error-bg px-2 py-0.5 text-[11px] font-medium text-error"
                          title={
                            row.cancellationReason
                              ? `Motif : ${row.cancellationReason}`
                              : "Aucun motif renseigné"
                          }
                        >
                          Annulé le {formatDateTime(row.cancelledAtIso)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                          Actif
                        </span>
                      )}
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
