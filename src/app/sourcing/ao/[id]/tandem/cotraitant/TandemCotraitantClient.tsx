"use client";

/**
 * TandemCotraitantClient — gestion du cotraitant associé à un AO.
 *
 * Deux sections :
 *
 * Section 1 — "Cotraitant associé à cet AO" :
 *  - Si aucun : combobox pour sélectionner + bouton "Associer"
 *  - Si un cotraitant : affiche cabinet + contact + email + bouton "Dissocier"
 *  - Lien "Gérer la fiche" → /sourcing/cotraitants
 *
 * Section 2 — "Documents" (visible seulement si un cotraitant est associé) :
 *  - Trois sous-sections : "AlyoS → cotraitant", "Cotraitant → AlyoS",
 *    "Convention de cotraitance"
 *  - Chaque doc : label, kind chip, date, bouton download + supprimer
 *  - Bouton "Ajouter une pièce" par section → formulaire upload
 *
 * Source de vérité : demande Board 2026-05-26 (bibliothèque cotraitants).
 */

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { CotraitantDocumentKind } from "@/db/schema/cotraitants";
import type { CotraitantRow, CotraitantDocumentRow } from "@/app/sourcing/cotraitants/actions";
import {
  associateToTender,
  deleteCotraitantDocument,
  dissociateFromTender,
  getDownloadUrl,
  uploadCotraitantDocument,
} from "@/app/sourcing/cotraitants/actions";

// ============================================================================
// Types
// ============================================================================

interface AssociationState {
  associationId: string;
  cotraitant: CotraitantRow;
}

interface Props {
  tenderId: string;
  isAdmin: boolean;
  initialAssociation: AssociationState | null;
  allCotraitants: CotraitantRow[];
  initialDocuments: CotraitantDocumentRow[];
}

// Regroupement des kinds par section affichée
const SECTION_KINDS: {
  id: string;
  label: string;
  kinds: CotraitantDocumentKind[];
  defaultKind: CotraitantDocumentKind;
}[] = [
  {
    id: "alyos_to_cotrait",
    label: "AlyoS → cotraitant",
    kinds: ["dc1_signed", "alyos_rc"],
    defaultKind: "dc1_signed",
  },
  {
    id: "cotrait_to_alyos",
    label: "Cotraitant → AlyoS",
    kinds: ["urssaf", "assurance", "rib"],
    defaultKind: "urssaf",
  },
  {
    id: "convention",
    label: "Convention de cotraitance",
    kinds: ["convention", "autre"],
    defaultKind: "convention",
  },
];

const KIND_LABELS: Record<CotraitantDocumentKind, string> = {
  dc1_signed: "DC1 signé",
  urssaf: "URSSAF",
  assurance: "Assurance RC",
  rib: "RIB",
  convention: "Convention",
  alyos_rc: "RC AlyoS",
  autre: "Autre",
};

const KIND_COLORS: Record<CotraitantDocumentKind, string> = {
  dc1_signed: "bg-blue-50 text-blue-700",
  urssaf: "bg-green-50 text-green-700",
  assurance: "bg-amber-50 text-amber-700",
  rib: "bg-purple-50 text-purple-700",
  convention: "bg-indigo-50 text-indigo-700",
  alyos_rc: "bg-slate-50 text-slate-700",
  autre: "bg-gray-100 text-gray-600",
};

// ============================================================================
// Composant principal
// ============================================================================

export function TandemCotraitantClient({
  tenderId,
  isAdmin,
  initialAssociation,
  allCotraitants,
  initialDocuments,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // --- Section 1 : association ---
  const [association, setAssociation] = useState<AssociationState | null>(initialAssociation);
  const [selectedCotraitantId, setSelectedCotraitantId] = useState<string>("");
  const [assocError, setAssocError] = useState<string | null>(null);
  const [assocLoading, setAssocLoading] = useState(false);

  // --- Section 2 : documents ---
  const [documents, setDocuments] = useState<CotraitantDocumentRow[]>(initialDocuments);
  const [uploadSectionId, setUploadSectionId] = useState<string | null>(null);
  const [uploadKind, setUploadKind] = useState<CotraitantDocumentKind>("dc1_signed");
  const [uploadLabel, setUploadLabel] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Handler : associer ---
  const handleAssociate = useCallback(() => {
    if (!selectedCotraitantId) return;
    setAssocError(null);
    setAssocLoading(true);
    startTransition(async () => {
      const result = await associateToTender(tenderId, selectedCotraitantId);
      if (!result.ok) {
        setAssocError(mapError(result.error));
        setAssocLoading(false);
        return;
      }
      setAssocLoading(false);
      router.refresh();
    });
  }, [selectedCotraitantId, tenderId, router]);

  // --- Handler : dissocier ---
  const handleDissociate = useCallback(() => {
    if (
      !window.confirm(
        "Dissocier ce cotraitant de l'AO ? Les documents liés à l'AO seront conservés.",
      )
    )
      return;
    setAssocError(null);
    setAssocLoading(true);
    startTransition(async () => {
      const result = await dissociateFromTender(tenderId);
      if (!result.ok) {
        setAssocError(mapError(result.error));
        setAssocLoading(false);
        return;
      }
      setAssociation(null);
      setAssocLoading(false);
    });
  }, [tenderId]);

  // --- Handler : télécharger ---
  const handleDownload = useCallback(async (docId: string) => {
    const result = await getDownloadUrl(docId);
    if (!result.ok) {
      alert("Impossible de générer le lien de téléchargement.");
      return;
    }
    window.open(result.data.url, "_blank", "noopener,noreferrer");
  }, []);

  // --- Handler : supprimer un document ---
  const handleDeleteDoc = useCallback((docId: string, label: string) => {
    if (!window.confirm(`Supprimer le document "${label}" ? Cette action est irréversible.`))
      return;
    startTransition(async () => {
      const result = await deleteCotraitantDocument(docId);
      if (!result.ok) {
        alert(`Erreur : ${mapError(result.error)}`);
        return;
      }
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    });
  }, []);

  // --- Handler : ouvrir formulaire upload ---
  function openUpload(sectionId: string, defaultKind: CotraitantDocumentKind) {
    setUploadSectionId(sectionId);
    setUploadKind(defaultKind);
    setUploadLabel("");
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // --- Handler : soumettre upload ---
  const handleUploadSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!association) return;
      if (!uploadLabel.trim()) {
        setUploadError("Le libellé est obligatoire.");
        return;
      }
      const file = fileInputRef.current?.files?.[0];
      if (!file) {
        setUploadError("Veuillez sélectionner un fichier.");
        return;
      }

      setUploadError(null);
      setUploadLoading(true);

      const formData = new FormData();
      formData.append("file", file);

      const result = await uploadCotraitantDocument(
        association.cotraitant.id,
        tenderId,
        formData,
        uploadKind,
        uploadLabel.trim(),
      );

      setUploadLoading(false);

      if (!result.ok) {
        setUploadError(mapError(result.error));
        return;
      }

      // Rafraîchissement pour récupérer le doc avec ses métadonnées serveur
      router.refresh();
      setUploadSectionId(null);
    },
    [association, uploadLabel, uploadKind, tenderId, router],
  );

  return (
    <div className="space-y-8">
      {/* ================================================================== */}
      {/* Section 1 — Cotraitant associé                                      */}
      {/* ================================================================== */}
      <section>
        <h2 className="mb-4 font-display text-lg font-semibold text-ink">
          Cotraitant associé à cet AO
        </h2>

        {association ? (
          /* Cotraitant existant */
          <div className="rounded-md border border-line bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-medium text-ink">{association.cotraitant.cabinet}</p>
                {association.cotraitant.contactName ? (
                  <p className="mt-0.5 text-sm text-ink-2">{association.cotraitant.contactName}</p>
                ) : null}
                {association.cotraitant.email ? (
                  <a
                    href={`mailto:${association.cotraitant.email}`}
                    className="mt-0.5 block text-sm text-brand-red hover:underline"
                  >
                    {association.cotraitant.email}
                  </a>
                ) : null}
                {association.cotraitant.phone ? (
                  <p className="mt-0.5 text-sm text-muted">{association.cotraitant.phone}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href="/sourcing/cotraitants"
                  className="focus:ring-brand-red/40 inline-flex h-8 items-center rounded-full border border-line bg-white px-3 text-xs text-muted hover:text-ink focus:outline-none focus:ring-2"
                >
                  Gérer la fiche
                </a>
                {isAdmin ? (
                  <button
                    type="button"
                    onClick={handleDissociate}
                    disabled={assocLoading}
                    className="focus:ring-error/40 inline-flex h-8 items-center rounded-full border border-line bg-white px-3 text-xs text-error hover:bg-error-bg focus:outline-none focus:ring-2 disabled:opacity-50"
                  >
                    Dissocier
                  </button>
                ) : null}
              </div>
            </div>
            {assocError ? (
              <p role="alert" className="mt-3 text-xs text-error">
                {assocError}
              </p>
            ) : null}
          </div>
        ) : (
          /* Aucun cotraitant — sélecteur */
          <div className="rounded-md border border-line bg-white p-5">
            {allCotraitants.length === 0 ? (
              <div className="text-sm text-muted">
                Aucun cotraitant dans l&apos;annuaire.{" "}
                <a href="/sourcing/cotraitants" className="text-brand-red hover:underline">
                  Créer un cotraitant
                </a>
              </div>
            ) : isAdmin ? (
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium text-ink-2">
                    Sélectionner un cotraitant
                  </label>
                  <select
                    value={selectedCotraitantId}
                    onChange={(e) => setSelectedCotraitantId(e.target.value)}
                    className="focus:ring-brand-red/40 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2"
                  >
                    <option value="">— Choisir —</option>
                    {allCotraitants.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.cabinet}
                        {c.city ? ` (${c.city})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={handleAssociate}
                  disabled={!selectedCotraitantId || assocLoading}
                  className="focus:ring-brand-red/40 inline-flex h-9 items-center rounded-full bg-brand-red px-4 text-sm font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 disabled:opacity-50"
                >
                  {assocLoading ? "Association…" : "Associer"}
                </button>
                <a
                  href="/sourcing/cotraitants"
                  className="focus:ring-brand-red/40 inline-flex h-9 items-center rounded-full border border-line bg-white px-3 text-xs text-muted hover:text-ink focus:outline-none focus:ring-2"
                >
                  Gérer l&apos;annuaire
                </a>
              </div>
            ) : (
              <p className="text-sm text-muted">Aucun cotraitant associé à cet AO.</p>
            )}
            {assocError ? (
              <p role="alert" className="mt-2 text-xs text-error">
                {assocError}
              </p>
            ) : null}
          </div>
        )}
      </section>

      {/* ================================================================== */}
      {/* Section 2 — Documents (visible seulement si cotraitant associé)    */}
      {/* ================================================================== */}
      {association ? (
        <section>
          <h2 className="mb-4 font-display text-lg font-semibold text-ink">Documents</h2>

          <div className="space-y-6">
            {SECTION_KINDS.map((section) => {
              const sectionDocs = documents.filter((d) =>
                section.kinds.includes(d.kind as CotraitantDocumentKind),
              );
              const isUploadOpen = uploadSectionId === section.id;

              return (
                <div key={section.id} className="rounded-md border border-line bg-white p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-ink">{section.label}</h3>
                    {isAdmin ? (
                      <button
                        type="button"
                        onClick={() =>
                          isUploadOpen
                            ? setUploadSectionId(null)
                            : openUpload(section.id, section.defaultKind)
                        }
                        className="focus:ring-brand-red/40 text-xs text-brand-red hover:underline focus:outline-none focus:ring-2"
                      >
                        {isUploadOpen ? "Annuler" : "+ Ajouter une pièce"}
                      </button>
                    ) : null}
                  </div>

                  {/* Liste des documents */}
                  {sectionDocs.length === 0 && !isUploadOpen ? (
                    <p className="text-xs text-muted">Aucune pièce pour cette section.</p>
                  ) : (
                    <ul className="space-y-2">
                      {sectionDocs.map((doc) => (
                        <li key={doc.id} className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${KIND_COLORS[doc.kind as CotraitantDocumentKind] ?? "bg-gray-100 text-gray-600"}`}
                            >
                              {KIND_LABELS[doc.kind as CotraitantDocumentKind] ?? doc.kind}
                            </span>
                            <span className="truncate text-sm text-ink">{doc.label}</span>
                            <span className="shrink-0 text-[11px] text-muted">
                              {new Date(doc.uploadedAt).toLocaleDateString("fr-FR")}
                            </span>
                            {doc.expiresAt ? (
                              <span className="shrink-0 text-[11px] text-amber-600">
                                exp. {new Date(doc.expiresAt).toLocaleDateString("fr-FR")}
                              </span>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <button
                              type="button"
                              onClick={() => handleDownload(doc.id)}
                              className="focus:ring-brand-red/40 text-xs text-muted hover:text-ink focus:outline-none focus:ring-2"
                              aria-label={`Télécharger ${doc.label}`}
                            >
                              Télécharger
                            </button>
                            {isAdmin ? (
                              <button
                                type="button"
                                onClick={() => handleDeleteDoc(doc.id, doc.label)}
                                className="focus:ring-error/40 text-xs text-muted hover:text-error focus:outline-none focus:ring-2"
                                aria-label={`Supprimer ${doc.label}`}
                              >
                                Supprimer
                              </button>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Formulaire upload inline */}
                  {isUploadOpen ? (
                    <form onSubmit={handleUploadSubmit} className="mt-4 border-t border-line pt-4">
                      <div className="space-y-3">
                        {/* Sélecteur de type */}
                        <div>
                          <label className="mb-1 block text-xs font-medium text-ink-2">
                            Type de document
                          </label>
                          <select
                            value={uploadKind}
                            onChange={(e) =>
                              setUploadKind(e.target.value as CotraitantDocumentKind)
                            }
                            className="focus:ring-brand-red/40 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2"
                          >
                            {section.kinds.map((k) => (
                              <option key={k} value={k}>
                                {KIND_LABELS[k]}
                              </option>
                            ))}
                            <option value="autre">Autre</option>
                          </select>
                        </div>

                        {/* Libellé */}
                        <div>
                          <label className="mb-1 block text-xs font-medium text-ink-2">
                            Libellé *
                          </label>
                          <input
                            type="text"
                            value={uploadLabel}
                            onChange={(e) => setUploadLabel(e.target.value)}
                            placeholder='Ex. "DC1 signé AO EDM 26 S 01"'
                            className="focus:ring-brand-red/40 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2"
                          />
                        </div>

                        {/* Fichier */}
                        <div>
                          <label className="mb-1 block text-xs font-medium text-ink-2">
                            Fichier *
                          </label>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                            className="file:bg-surface w-full text-sm text-ink-2 file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1 file:text-xs file:font-medium file:text-ink"
                          />
                        </div>

                        {/* Erreur */}
                        {uploadError ? (
                          <p role="alert" className="text-xs text-error">
                            {uploadError}
                          </p>
                        ) : null}

                        {/* Actions */}
                        <div className="flex justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setUploadSectionId(null)}
                            className="hover:bg-surface focus:ring-brand-red/40 rounded-full border border-line bg-white px-3 py-1.5 text-xs text-ink focus:outline-none focus:ring-2"
                          >
                            Annuler
                          </button>
                          <button
                            type="submit"
                            disabled={uploadLoading}
                            className="focus:ring-brand-red/40 rounded-full bg-brand-red px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 disabled:opacity-50"
                          >
                            {uploadLoading ? "Upload…" : "Déposer"}
                          </button>
                        </div>
                      </div>
                    </form>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function mapError(code: string): string {
  const messages: Record<string, string> = {
    not_authenticated: "Session expirée, veuillez vous reconnecter.",
    forbidden_domain: "Accès refusé : domaine non autorisé.",
    forbidden_role: "Vous n'avez pas les droits nécessaires pour cette action.",
    invalid_input: "Données invalides.",
    not_found: "Enregistrement introuvable.",
    already_associated: "Un cotraitant est déjà associé à cet AO.",
    internal_error: "Erreur interne. Réessayez dans quelques instants.",
  };
  return messages[code] ?? "Erreur inconnue.";
}
