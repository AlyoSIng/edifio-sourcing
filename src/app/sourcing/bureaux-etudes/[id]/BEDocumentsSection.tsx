"use client";

/**
 * Section Documents administratifs — composant Client pour la fiche BE.
 *
 * Affiche la liste des documents existants du bureau d'études et offre :
 *  - Téléchargement (URL signée 60 min) pour tous les rôles authentifiés
 *  - Ajout d'un document (admin uniquement) : formulaire inline avec
 *    sélecteur de type, label, input file, date d'expiration optionnelle
 *  - Suppression (admin uniquement) avec confirmation inline
 *
 * Pattern calqué sur `TandemCotraitantClient.tsx` (bibliothèque cotraitants).
 *
 * Créé dans feat/be-documents (Alex, 2026-05-26).
 */

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import {
  BE_DOCUMENT_KIND_LABELS,
  BE_DOCUMENT_KINDS,
  type BeDocument,
  type BeDocumentKind,
} from "@/db/schema/be-documents";

import { deleteBeDocument, getBeDocumentUrl, uploadBeDocument } from "../actions";

// ============================================================================
// Props
// ============================================================================

interface BEDocumentsSectionProps {
  beId: string;
  documents: BeDocument[];
  isAdmin: boolean;
}

// ============================================================================
// Composant principal
// ============================================================================

export function BEDocumentsSection({ beId, documents, isAdmin }: BEDocumentsSectionProps) {
  const router = useRouter();

  // État d'upload (remplace useTransition — React 18 ne supporte pas les
  // async callbacks dans startTransition, ce qui rendait isPending incorrect
  // et pouvait faire ignorer router.refresh() après l'upload).
  const [isUploading, setIsUploading] = useState(false);

  // Formulaire d'ajout
  const [showForm, setShowForm] = useState(false);
  const [formKind, setFormKind] = useState<BeDocumentKind>("dc1");
  const [formLabel, setFormLabel] = useState("");
  const [formExpiresAt, setFormExpiresAt] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Suppression en cours
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Téléchargement en cours
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // ============================================================================
  // Handlers
  // ============================================================================

  async function handleDownload(documentId: string, filename: string) {
    setDownloadingId(documentId);
    try {
      const result = await getBeDocumentUrl(documentId);
      if (!result.ok) {
        alert("Impossible de générer le lien de téléchargement.");
        return;
      }
      // Ouvre dans un nouvel onglet (téléchargement natif)
      const link = document.createElement("a");
      link.href = result.data.url;
      link.download = filename;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleDelete(documentId: string) {
    setDeletingId(documentId);
    setDeleteError(null);
    try {
      const result = await deleteBeDocument(documentId);
      if (!result.ok) {
        setDeleteError("Erreur lors de la suppression.");
        return;
      }
      // router.refresh() appelé directement — pas dans startTransition
      // (évite le problème async callback React 18 identique à handleUpload).
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!fileInputRef.current?.files?.[0]) {
      setFormError("Veuillez sélectionner un fichier.");
      return;
    }
    if (!formLabel.trim()) {
      setFormError("Le libellé est obligatoire.");
      return;
    }

    const formData = new FormData();
    formData.append("file", fileInputRef.current.files[0]);

    const expiresAt = formExpiresAt ? new Date(formExpiresAt) : null;

    // Fonction async normale — plus de startTransition(async () => {...}).
    // Le startTransition async (React 18) complète immédiatement dès que la
    // Promise est retournée : isPending passe à false avant la fin du fetch,
    // et router.refresh() pouvait être ignoré dans certains contextes.
    setIsUploading(true);
    try {
      const result = await uploadBeDocument(beId, formData, formKind, formLabel, expiresAt);
      if (!result.ok) {
        const messages: Record<string, string> = {
          forbidden_role: "Accès réservé aux administrateurs.",
          invalid_input: "Données invalides. Vérifiez le fichier et le libellé.",
          internal_error: "Erreur serveur lors de l'upload.",
        };
        setFormError(messages[result.error] ?? "Erreur inconnue.");
        return;
      }
      setFormSuccess("Document ajouté avec succès.");
      setFormLabel("");
      setFormExpiresAt("");
      setFormKind("dc1");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setShowForm(false);
      // Appel direct — sans startTransition — pour garantir que Next.js
      // re-fetch bien les Server Components après l'upload.
      router.refresh();
    } catch {
      setFormError("Erreur inattendue lors de l'upload.");
    } finally {
      setIsUploading(false);
    }
  }

  // ============================================================================
  // Rendu
  // ============================================================================

  return (
    <section aria-labelledby="be-docs-heading" className="border-t border-line pt-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2
          id="be-docs-heading"
          className="text-xs font-semibold uppercase tracking-wide text-muted"
        >
          Documents administratifs
        </h2>
        {isAdmin && !showForm ? (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="hover:bg-brand-red/90 focus:ring-brand-red/40 rounded-md bg-brand-red px-3 py-1.5 text-xs font-medium text-white focus:outline-none focus:ring-2"
          >
            + Ajouter un document
          </button>
        ) : null}
      </div>

      {/* Message de succès */}
      {formSuccess ? (
        <p role="status" className="mb-3 text-sm font-medium text-green-700">
          {formSuccess}
        </p>
      ) : null}

      {/* Message d'erreur suppression */}
      {deleteError ? (
        <p role="alert" className="mb-3 text-sm font-medium text-error">
          {deleteError}
        </p>
      ) : null}

      {/* Formulaire d'ajout inline */}
      {isAdmin && showForm ? (
        <form
          onSubmit={handleUpload}
          className="mb-6 rounded-md border border-line bg-gray-50 p-4"
          aria-label="Ajouter un document administratif"
        >
          <h3 className="mb-3 text-sm font-semibold text-ink">Nouveau document</h3>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Type de document */}
            <div>
              <label htmlFor="be-doc-kind" className="mb-1 block text-xs font-medium text-ink-2">
                Type de document <span aria-hidden="true">*</span>
              </label>
              <select
                id="be-doc-kind"
                value={formKind}
                onChange={(e) => setFormKind(e.target.value as BeDocumentKind)}
                className="focus:ring-brand-red/40 w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2"
                required
              >
                {BE_DOCUMENT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {BE_DOCUMENT_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>

            {/* Libellé */}
            <div>
              <label htmlFor="be-doc-label" className="mb-1 block text-xs font-medium text-ink-2">
                Libellé <span aria-hidden="true">*</span>
              </label>
              <input
                id="be-doc-label"
                type="text"
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
                placeholder="ex. DC1 — AO EDM 26 S 01"
                maxLength={200}
                required
                className="focus:ring-brand-red/40 w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2"
              />
            </div>

            {/* Fichier */}
            <div>
              <label htmlFor="be-doc-file" className="mb-1 block text-xs font-medium text-ink-2">
                Fichier <span aria-hidden="true">*</span>
              </label>
              <input
                id="be-doc-file"
                type="file"
                ref={fileInputRef}
                accept=".pdf,.doc,.docx,.xlsx,.xls,.png,.jpg,.jpeg"
                required
                className="w-full text-sm text-ink file:mr-2 file:rounded file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-xs file:font-medium"
              />
            </div>

            {/* Date d'expiration (optionnelle) */}
            <div>
              <label htmlFor="be-doc-expires" className="mb-1 block text-xs font-medium text-ink-2">
                Date d&rsquo;expiration <span className="text-muted">(optionnel)</span>
              </label>
              <input
                id="be-doc-expires"
                type="date"
                value={formExpiresAt}
                onChange={(e) => setFormExpiresAt(e.target.value)}
                className="focus:ring-brand-red/40 w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2"
              />
            </div>
          </div>

          {/* Erreur formulaire */}
          {formError ? (
            <p role="alert" className="mt-2 text-xs font-medium text-error">
              {formError}
            </p>
          ) : null}

          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              disabled={isUploading}
              className="hover:bg-brand-red/90 focus:ring-brand-red/40 rounded-md bg-brand-red px-4 py-2 text-xs font-medium text-white focus:outline-none focus:ring-2 disabled:opacity-60"
            >
              {isUploading ? "Upload…" : "Ajouter"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setFormError(null);
              }}
              className="focus:ring-brand-red/40 rounded-md border border-line bg-white px-4 py-2 text-xs font-medium text-ink hover:bg-gray-50 focus:outline-none focus:ring-2"
            >
              Annuler
            </button>
          </div>
        </form>
      ) : null}

      {/* Liste des documents */}
      {documents.length === 0 ? (
        <p className="text-sm text-muted">Aucun document administratif enregistré.</p>
      ) : (
        <ul className="divide-y divide-line" role="list">
          {documents.map((doc) => {
            const kindLabel = BE_DOCUMENT_KIND_LABELS[doc.kind as BeDocumentKind] ?? doc.kind;
            const isExpired = doc.expiresAt !== null && new Date(doc.expiresAt) < new Date();
            const isExpiringSoon =
              doc.expiresAt !== null &&
              !isExpired &&
              new Date(doc.expiresAt) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

            return (
              <li key={doc.id} className="flex items-start gap-3 py-3">
                {/* Icône type */}
                <span className="mt-0.5 flex-shrink-0 text-lg" aria-hidden="true" title={kindLabel}>
                  {getDocumentIcon(doc.kind as BeDocumentKind)}
                </span>

                {/* Infos document */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink" title={doc.label}>
                    {doc.label}
                  </p>
                  <p className="text-xs text-muted">{kindLabel}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted">
                      Ajouté le{" "}
                      {new Date(doc.uploadedAt).toLocaleDateString("fr-FR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </span>
                    {doc.expiresAt ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          isExpired
                            ? "bg-red-100 text-red-700"
                            : isExpiringSoon
                              ? "bg-amber-50 text-amber-700"
                              : "bg-green-50 text-green-700"
                        }`}
                      >
                        {isExpired
                          ? "Expiré"
                          : `Expire le ${new Date(doc.expiresAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })}`}
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleDownload(doc.id, doc.filename)}
                    disabled={downloadingId === doc.id}
                    aria-label={`Télécharger ${doc.label}`}
                    className="focus:ring-brand-red/40 rounded-md border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-gray-50 focus:outline-none focus:ring-2 disabled:opacity-60"
                  >
                    {downloadingId === doc.id ? "…" : "Télécharger"}
                  </button>
                  {isAdmin ? (
                    <button
                      type="button"
                      onClick={() => handleDelete(doc.id)}
                      disabled={deletingId === doc.id || isUploading}
                      aria-label={`Supprimer ${doc.label}`}
                      className="rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-error hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-300 disabled:opacity-60"
                    >
                      {deletingId === doc.id ? "…" : "Supprimer"}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ============================================================================
// Helper — icône emoji par kind
// ============================================================================

function getDocumentIcon(kind: BeDocumentKind): string {
  const icons: Record<BeDocumentKind, string> = {
    dc1: "📋",
    dc2: "📋",
    dc4: "📋",
    pouvoir: "✍️",
    kbis: "🏛️",
    assurance: "🛡️",
    urssaf: "🏦",
    fiscal: "💼",
    presentation_be: "🗂️",
    moyens_humains: "👥",
    references: "⭐",
    memoire_rse: "🌱",
  };
  return icons[kind] ?? "📄";
}
