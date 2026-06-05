"use client";

/**
 * Tableau filtrable + export CSV de l'annuaire des acheteurs (Q4 —
 * Steve 2026-06-04).
 *
 * Recherche live sur nom + adresse + SIRET. Export CSV BOM UTF-8 +
 * séparateur `;` (convention Excel français cohérente avec les autres
 * exports admin).
 */

import { useMemo, useState } from "react";

export interface BuyerRow {
  id: string;
  name: string;
  address: string | null;
  siret: string | null;
  siren: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  notes: string | null;
  updatedAtIso: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(";") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function BuyersTable({ rows }: { rows: BuyerRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return rows;
    return rows.filter((r) => {
      const blob = [r.name, r.address ?? "", r.siret ?? "", r.siren ?? "", r.contactEmail ?? ""]
        .map(normalize)
        .join(" ");
      return blob.includes(q);
    });
  }, [rows, query]);

  function handleExport() {
    const headers = [
      "Nom",
      "Adresse",
      "SIRET",
      "SIREN",
      "Email contact",
      "Téléphone",
      "Notes",
      "Modifié le",
    ];
    const lines = [headers.map(escapeCsv).join(";")];
    for (const r of filtered) {
      lines.push(
        [
          r.name,
          r.address ?? "",
          r.siret ?? "",
          r.siren ?? "",
          r.contactEmail ?? "",
          r.contactPhone ?? "",
          r.notes ?? "",
          formatDate(r.updatedAtIso),
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
    a.download = `Annuaire_acheteurs_${today}.csv`;
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
          placeholder="Rechercher un nom, une ville, un SIRET…"
          className="w-full max-w-md rounded border border-line bg-white px-3 py-1.5 text-sm text-ink outline-none focus:border-brand-red focus:ring-1 focus:ring-brand-red"
          aria-label="Rechercher dans l'annuaire"
        />
        <span className="text-xs text-muted">
          {filtered.length} / {rows.length} acheteur{filtered.length > 1 ? "s" : ""}
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
        <p className="text-sm italic text-muted">Aucun acheteur ne correspond à la recherche.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-white">
          <table className="w-full text-sm">
            <thead className="bg-paper-2">
              <tr>
                <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-ink-2">
                  Acheteur
                </th>
                <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-ink-2">
                  Adresse
                </th>
                <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-ink-2">
                  SIRET
                </th>
                <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-ink-2">
                  Contact
                </th>
                <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-ink-2">
                  Modifié
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((row) => (
                <tr key={row.id}>
                  <td className="max-w-[260px] truncate px-3 py-2 text-ink">{row.name}</td>
                  <td className="max-w-[280px] px-3 py-2 text-ink-2">
                    {row.address ?? <span className="italic text-muted">—</span>}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-muted">
                    {row.siret ?? <span className="italic">—</span>}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {row.contactEmail && (
                      <p className="font-mono text-[11px] text-ink-2">{row.contactEmail}</p>
                    )}
                    {row.contactPhone && (
                      <p className="font-mono text-[11px] text-muted">{row.contactPhone}</p>
                    )}
                    {!row.contactEmail && !row.contactPhone && (
                      <span className="italic text-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-muted">
                    {formatDate(row.updatedAtIso)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
