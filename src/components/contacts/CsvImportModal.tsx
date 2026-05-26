"use client";

/**
 * Modal d'import CSV — composant partagé pour BE et Entreprises.
 *
 * Prop `type` : "be" | "company"
 *  - "be"      → appelle `importBEFromCsv`
 *  - "company" → appelle `importCompanyFromCsv`
 *
 * Fonctionnement :
 *  - Input file `accept=".csv"`
 *  - Bouton "Importer" → appelle la Server Action, affiche le résultat
 *  - Lien "Télécharger le template CSV" → génère un CSV vide avec headers
 *
 * Créé dans feat/be-companies (Nadia, 2026-05-26).
 */

import { useRef, useState, useTransition } from "react";

import { importBEFromCsv } from "@/app/sourcing/bureaux-etudes/actions";
import { importCompanyFromCsv } from "@/app/sourcing/entreprises/actions";

// ---------------------------------------------------------------------------
// Headers CSV par type
// ---------------------------------------------------------------------------

const BE_CSV_HEADERS =
  "cabinet,email,phone,siren,zip,city,specialty_codes,geo_zones,budget_min,budget_max,concours_only,tutoiement,notes";

const COMPANY_CSV_HEADERS =
  "name,email,phone,siren,zip,city,specialty_codes,geo_zones,budget_min,budget_max,notes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ImportResult {
  imported: number;
  updated: number;
  errors: string[];
}

interface CsvImportModalProps {
  /** Type de contact à importer. */
  type: "be" | "company";
  /** Callback appelé après un import réussi (pour rafraîchir la liste). */
  onSuccess?: () => void;
}

// ---------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------

export function CsvImportModal({ type, onSuccess }: CsvImportModalProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const label = type === "be" ? "Bureaux d'Études" : "Entreprises";
  const headers = type === "be" ? BE_CSV_HEADERS : COMPANY_CSV_HEADERS;

  function handleDownloadTemplate() {
    const blob = new Blob([headers + "\n"], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = type === "be" ? "template_bureaux_etudes.csv" : "template_entreprises.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setResult(null);

    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Veuillez sélectionner un fichier CSV.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    startTransition(async () => {
      try {
        const res =
          type === "be" ? await importBEFromCsv(formData) : await importCompanyFromCsv(formData);

        setResult(res);

        if (res.imported > 0 || res.updated > 0) {
          onSuccess?.();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur inattendue.");
      }
    });
  }

  function handleClose() {
    setOpen(false);
    setResult(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <>
      {/* Bouton déclencheur */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus:ring-brand-red/40 hover:bg-surface inline-flex h-8 items-center rounded-md border border-line bg-white px-3 text-xs font-medium text-ink focus:outline-none focus:ring-2"
      >
        Importer CSV
      </button>

      {/* Overlay + Dialog */}
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="csv-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="w-full max-w-md rounded-lg border border-line bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2 id="csv-modal-title" className="font-display text-base font-semibold text-ink">
                Importer des {label} (CSV)
              </h2>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Fermer"
                className="rounded-md p-1 text-muted hover:text-ink"
              >
                ✕
              </button>
            </div>

            {/* Template download */}
            <p className="mb-3 text-xs text-muted">
              Format attendu : colonnes séparées par virgule, spécialités et zones géo séparées par
              point-virgule dans leur colonne.
            </p>
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="focus:ring-brand-red/40 mb-4 text-xs text-brand-red underline hover:no-underline focus:outline-none focus:ring-2"
            >
              Télécharger le template CSV
            </button>

            {/* Formulaire */}
            <form onSubmit={handleSubmit} noValidate>
              <div className="mb-4">
                <label htmlFor="csv-file-input" className="mb-1 block text-xs font-medium text-ink">
                  Fichier CSV{" "}
                  <span aria-hidden="true" className="text-error">
                    *
                  </span>
                </label>
                <input
                  id="csv-file-input"
                  type="file"
                  accept=".csv"
                  ref={fileRef}
                  disabled={pending}
                  className="file:bg-surface w-full text-sm text-ink file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-ink hover:file:bg-line disabled:opacity-50"
                />
              </div>

              {error ? (
                <p role="alert" className="mb-3 text-xs text-error">
                  {error}
                </p>
              ) : null}

              {result ? (
                <div
                  role="status"
                  className={`mb-3 rounded-md border p-3 text-xs ${
                    result.errors.length > 0
                      ? "border-amber-200 bg-amber-50 text-amber-800"
                      : "border-green-200 bg-green-50 text-green-800"
                  }`}
                >
                  <p className="font-medium">
                    {result.imported} importé{result.imported !== 1 ? "s" : ""}, {result.updated}{" "}
                    mis à jour
                    {result.errors.length > 0 ? `, ${result.errors.length} erreur(s)` : ""}
                  </p>
                  {result.errors.length > 0 ? (
                    <ul className="mt-2 list-inside list-disc space-y-0.5">
                      {result.errors.slice(0, 5).map((e, idx) => (
                        <li key={idx}>{e}</li>
                      ))}
                      {result.errors.length > 5 ? (
                        <li>...et {result.errors.length - 5} autre(s) erreur(s).</li>
                      ) : null}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="hover:bg-surface focus:ring-brand-red/40 rounded-md border border-line bg-white px-4 py-2 text-sm text-ink focus:outline-none focus:ring-2"
                >
                  {result ? "Fermer" : "Annuler"}
                </button>
                {!result ? (
                  <button
                    type="submit"
                    disabled={pending}
                    aria-busy={pending}
                    className="hover:bg-brand-red/90 focus:ring-brand-red/40 rounded-md bg-brand-red px-4 py-2 text-sm font-medium text-white focus:outline-none focus:ring-2 disabled:opacity-50"
                  >
                    {pending ? "Import en cours…" : "Importer"}
                  </button>
                ) : null}
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
