"use client";

/**
 * LibraryClient — composant Client de la bibliothèque entreprise AlyoS.
 *
 * Affiche une section par catégorie de document (kind). Pour chaque section :
 *  - Liste des documents existants avec nom, taille, date d'upload et badge
 *    d'expiration coloré.
 *  - Bouton "Supprimer" avec confirmation native.
 *  - Zone d'upload (fichier + date d'expiration optionnelle + notes optionnelles).
 *
 * Gestion d'état :
 *  - `useTransition` pour les Server Actions (indicateur de chargement).
 *  - `useState` pour les messages d'erreur inline par section.
 *
 * Source de vérité :
 *  - Spec PR-A module dossier IA (brief Board 2026-05-25)
 */

import { useRef, useState, useTransition } from "react";

import type { PresentationLibraryItem } from "@/db/schema/library";
import { deleteLibraryDoc, uploadLibraryDoc } from "./actions";

// ---------------------------------------------------------------------------
// Constantes : catégories de documents
// ---------------------------------------------------------------------------

export const LIBRARY_KINDS = [
  { key: "kbis", label: "Extrait Kbis", hasExpiry: true },
  { key: "urssaf", label: "Attestation URSSAF", hasExpiry: true },
  { key: "attestation_fiscale", label: "Attestation fiscale DGFiP", hasExpiry: true },
  { key: "assurance_rc", label: "Assurance RC professionnelle", hasExpiry: true },
  { key: "bilan", label: "Bilan comptable", hasExpiry: false },
  { key: "rib", label: "RIB bancaire", hasExpiry: false },
  { key: "references", label: "Références de marchés", hasExpiry: false },
  { key: "dc2_vierge", label: "DC2 vierge (template)", hasExpiry: false },
  { key: "dc4_vierge", label: "DC4 / Pouvoir vierge (template)", hasExpiry: false },
  { key: "autre", label: "Autre document", hasExpiry: false },
] as const;

type KindKey = (typeof LIBRARY_KINDS)[number]["key"];

// ---------------------------------------------------------------------------
// Helpers de formatage
// ---------------------------------------------------------------------------

/**
 * Formate une taille en octets en Ko ou Mo lisible.
 * < 1 024 octets → "X Ko"
 * >= 1 024 octets → "X.x Mo"
 */
function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} Ko`;
  return `${(kb / 1024).toFixed(1)} Mo`;
}

/** Formate une date ISO (YYYY-MM-DD ou timestamp) en dd/MM/yyyy. */
function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ---------------------------------------------------------------------------
// Badge d'expiration
// ---------------------------------------------------------------------------

/** Calcule le nombre de jours restants avant expiration (peut être négatif). */
function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  // Comparaison en jours entiers
  const diffMs = target.setHours(0, 0, 0, 0) - now.setHours(0, 0, 0, 0);
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

interface ExpiryBadgeProps {
  validUntil: string | null | undefined;
}

function ExpiryBadge({ validUntil }: ExpiryBadgeProps) {
  const days = daysUntil(validUntil);

  if (days === null) return null;

  if (days <= 0) {
    return (
      <span className="inline-flex items-center rounded bg-error-bg px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-error">
        Expiré
      </span>
    );
  }
  if (days <= 7) {
    return (
      <span className="inline-flex items-center rounded bg-error-bg px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-error">
        J−{days}
      </span>
    );
  }
  if (days <= 30) {
    return (
      <span className="inline-flex items-center rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-amber-700">
        J−{days}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded bg-success-bg px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-success">
      {formatDate(validUntil)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

interface LibraryClientProps {
  entries: PresentationLibraryItem[];
}

export function LibraryClient({ entries }: LibraryClientProps) {
  // Groupe les entrées par kind pour accès O(1) dans chaque section
  const byKind = new Map<KindKey, PresentationLibraryItem[]>();
  for (const kind of LIBRARY_KINDS) {
    byKind.set(kind.key, []);
  }
  for (const item of entries) {
    const key = item.kind as KindKey;
    if (byKind.has(key)) {
      byKind.get(key)!.push(item);
    } else {
      // Catégorie inconnue → regroupée sous "autre" pour robustesse
      byKind.get("autre")!.push(item);
    }
  }

  return (
    <div className="space-y-6">
      {LIBRARY_KINDS.map((kindMeta) => (
        <KindSection
          key={kindMeta.key}
          kindKey={kindMeta.key}
          label={kindMeta.label}
          hasExpiry={kindMeta.hasExpiry}
          items={byKind.get(kindMeta.key) ?? []}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section par catégorie
// ---------------------------------------------------------------------------

interface KindSectionProps {
  kindKey: KindKey;
  label: string;
  hasExpiry: boolean;
  items: PresentationLibraryItem[];
}

function KindSection({ kindKey, label, hasExpiry, items }: KindSectionProps) {
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const notesInputRef = useRef<HTMLTextAreaElement>(null);

  // --- Suppression ---
  function handleDelete(id: string, storagePath: string, name: string) {
    if (!confirm(`Supprimer « ${name} » ? Cette action est irréversible.`)) return;

    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteLibraryDoc(id, storagePath);
      if (!result.ok) {
        setDeleteError(deleteErrorLabel(result.error));
      }
    });
  }

  // --- Upload ---
  function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setUploadError(null);

    const fd = new FormData(e.currentTarget);
    fd.set("kind", kindKey);

    startTransition(async () => {
      const result = await uploadLibraryDoc(fd);
      if (result.ok) {
        // Réinitialise les champs du formulaire après succès
        if (fileInputRef.current) fileInputRef.current.value = "";
        if (dateInputRef.current) dateInputRef.current.value = "";
        if (notesInputRef.current) notesInputRef.current.value = "";
      } else {
        setUploadError(uploadErrorLabel(result.error));
      }
    });
  }

  return (
    <section
      className="rounded-md border border-line bg-white"
      aria-labelledby={`section-${kindKey}`}
    >
      {/* En-tête de section */}
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 id={`section-${kindKey}`} className="font-display text-sm font-semibold text-ink">
          {label}
        </h2>
        <span className="font-mono text-xs text-muted">
          {items.length} document{items.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="space-y-4 px-4 py-3">
        {/* Liste des documents existants */}
        {items.length > 0 ? (
          <ul className="divide-y divide-line" role="list">
            {items.map((item) => (
              <li key={item.id} className="flex items-start gap-3 py-2.5">
                {/* Icône fichier */}
                <div className="mt-0.5 shrink-0 text-muted" aria-hidden>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    width={16}
                    height={16}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>

                {/* Infos document */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-ink">{item.name}</span>
                    {item.validUntil && <ExpiryBadge validUntil={item.validUntil} />}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px] text-muted">
                    <span>{formatBytes(item.sizeBytes)}</span>
                    <span>Ajouté le {formatDate(item.createdAt)}</span>
                    {item.notes && <span className="italic">{item.notes}</span>}
                  </div>
                </div>

                {/* Bouton suppression */}
                <button
                  type="button"
                  onClick={() => handleDelete(item.id, item.storagePath, item.name)}
                  disabled={isPending}
                  className="shrink-0 rounded px-2 py-1 text-xs font-medium text-error transition hover:bg-error-bg disabled:opacity-50"
                  aria-label={`Supprimer ${item.name}`}
                >
                  Supprimer
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-1 text-sm italic text-muted">Aucun document dans cette catégorie.</p>
        )}

        {/* Erreur de suppression */}
        {deleteError && (
          <p role="alert" className="text-sm text-error">
            {deleteError}
          </p>
        )}

        {/* Formulaire d'upload */}
        <form onSubmit={handleUpload} className="rounded border border-dashed border-line p-3">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-ink-2">
            Ajouter un document
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Champ fichier */}
            <div className="sm:col-span-2">
              <label
                htmlFor={`file-${kindKey}`}
                className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted"
              >
                Fichier (PDF, Word, Excel, image — max 50 Mo)
              </label>
              <input
                ref={fileInputRef}
                id={`file-${kindKey}`}
                name="file"
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png"
                required
                disabled={isPending}
                className="hover:file:bg-ink/80 w-full rounded border border-line bg-paper px-2 py-1.5 text-sm text-ink file:mr-3 file:rounded file:border-0 file:bg-ink file:px-2 file:py-1 file:text-xs file:font-medium file:text-white disabled:opacity-50"
              />
            </div>

            {/* Date d'expiration (uniquement pour les catégories avec hasExpiry) */}
            {hasExpiry && (
              <div>
                <label
                  htmlFor={`valid-until-${kindKey}`}
                  className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted"
                >
                  Date d&apos;expiration (optionnelle)
                </label>
                <input
                  ref={dateInputRef}
                  id={`valid-until-${kindKey}`}
                  name="validUntil"
                  type="date"
                  disabled={isPending}
                  className="w-full rounded border border-line bg-white px-2 py-1.5 text-sm text-ink outline-none focus:border-brand-red focus:ring-1 focus:ring-brand-red disabled:opacity-50"
                />
              </div>
            )}

            {/* Notes (optionnelles, toutes catégories) */}
            <div className={hasExpiry ? "" : "sm:col-span-2"}>
              <label
                htmlFor={`notes-${kindKey}`}
                className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted"
              >
                Notes (optionnel)
              </label>
              <textarea
                ref={notesInputRef}
                id={`notes-${kindKey}`}
                name="notes"
                rows={2}
                maxLength={500}
                disabled={isPending}
                placeholder="Ex. version 2024, agence Normandie…"
                className="w-full rounded border border-line bg-white px-2 py-1.5 text-sm text-ink outline-none focus:border-brand-red focus:ring-1 focus:ring-brand-red disabled:opacity-50"
              />
            </div>
          </div>

          {/* Erreur d'upload */}
          {uploadError && (
            <p role="alert" className="mt-2 text-sm text-error">
              {uploadError}
            </p>
          )}

          {/* Bouton submit */}
          <div className="mt-3 flex justify-end">
            <button
              type="submit"
              disabled={isPending}
              className="hover:bg-ink/80 rounded bg-ink px-3 py-1.5 text-xs font-medium text-white transition disabled:opacity-50"
            >
              {isPending ? "Envoi en cours…" : "Ajouter"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Labels d'erreur lisibles
// ---------------------------------------------------------------------------

function uploadErrorLabel(code: string | undefined): string {
  switch (code) {
    case "not_authenticated":
      return "Session expirée — reconnectez-vous.";
    case "forbidden_role":
      return "Accès refusé — rôle admin requis.";
    case "missing_file":
      return "Veuillez sélectionner un fichier.";
    case "missing_kind":
      return "Catégorie manquante — rechargez la page.";
    case "invalid_kind":
      return "Catégorie invalide — rechargez la page.";
    case "file_too_large":
      return "Fichier trop volumineux (max 50 Mo).";
    case "invalid_mime_type":
      return "Type de fichier non autorisé (PDF, Word, Excel, image uniquement).";
    case "invalid_valid_until":
      return "Date d'expiration invalide (format YYYY-MM-DD attendu).";
    case "storage_upload_failed":
      return "Erreur lors de l'upload vers le stockage — réessayez.";
    case "db_insert_failed":
      return "Erreur d'enregistrement en base — le fichier a été supprimé du stockage.";
    default:
      return "Erreur inattendue — réessayez ou contactez l'administrateur.";
  }
}

function deleteErrorLabel(code: string | undefined): string {
  switch (code) {
    case "not_authenticated":
      return "Session expirée — reconnectez-vous.";
    case "forbidden_role":
      return "Accès refusé — rôle admin requis.";
    case "document_not_found":
      return "Document introuvable — rechargez la page.";
    case "storage_delete_failed":
      return "Erreur lors de la suppression du fichier — réessayez.";
    case "db_delete_failed":
      return "Erreur de suppression en base — réessayez.";
    default:
      return "Erreur inattendue — réessayez ou contactez l'administrateur.";
  }
}
