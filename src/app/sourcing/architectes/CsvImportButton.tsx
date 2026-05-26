"use client";

/**
 * Bouton d'import CSV architectes — Client Component inline.
 *
 * Ouvre un <input type="file"> caché, soumet via FormData vers
 * la server action `importArchitectsFromCsv`, affiche le résumé.
 *
 * Réservé aux admins (la server action re-vérifie côté serveur).
 */

import { useRef, useState, useTransition } from "react";

import { importArchitectsFromCsv } from "./actions";

export function CsvImportButton() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    imported: number;
    updated: number;
    errors: string[];
  } | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    setResult(null);
    startTransition(async () => {
      const res = await importArchitectsFromCsv(formData);
      setResult(res);
      // Réinitialise l'input pour permettre un re-import du même fichier
      if (fileInputRef.current) fileInputRef.current.value = "";
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        id="architect-csv-input"
        onChange={handleFileChange}
        disabled={isPending}
        aria-label="Importer un fichier CSV architectes"
      />
      <label
        htmlFor="architect-csv-input"
        className={`focus-within:ring-brand-red/40 hover:bg-surface inline-flex cursor-pointer items-center rounded-md border border-line bg-white px-3 py-1.5 text-xs text-ink focus-within:ring-2 ${
          isPending ? "cursor-not-allowed opacity-50" : ""
        }`}
        aria-busy={isPending}
      >
        {isPending ? "Import en cours…" : "Importer CSV"}
      </label>

      {result ? (
        <div
          role="status"
          aria-live="polite"
          className={`rounded-md border px-4 py-2 text-xs ${
            result.errors.length > 0
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-green-200 bg-green-50 text-green-800"
          }`}
        >
          {result.imported > 0 || result.updated > 0 ? (
            <p>
              {result.imported} ajouté{result.imported !== 1 ? "s" : ""}, {result.updated} mis à
              jour.
            </p>
          ) : null}
          {result.errors.length > 0 ? (
            <ul className="mt-1 list-disc pl-4">
              {result.errors.slice(0, 5).map((err, i) => (
                <li key={i}>{err}</li>
              ))}
              {result.errors.length > 5 ? (
                <li>…et {result.errors.length - 5} autre(s) erreur(s).</li>
              ) : null}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
