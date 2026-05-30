"use client";

/**
 * CotraitantPageClient — composant Client pour la page publique cotraitant.
 *
 * Gère pour chaque pièce :
 *  - Téléchargement de la pièce originale (URL signée Supabase Storage)
 *  - Saisie du nom du signataire
 *  - Upload de la pièce signée (PDF/JPG/PNG, max 20 MB)
 *  - Mise à jour optimiste du statut après dépôt réussi
 */

import { useState, useTransition } from "react";

import { getCotraitantDownloadUrl, uploadSignedDocument } from "./actions";
import type { CotraitantItemData } from "./page";

interface Props {
  shareId: string;
  token: string;
  items: CotraitantItemData[];
}

export function CotraitantPageClient({ token, items: initialItems }: Props) {
  const [isPending, startTransition] = useTransition();
  const [items, setItems] = useState<CotraitantItemData[]>(initialItems);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [globalSuccess, setGlobalSuccess] = useState<string | null>(null);

  // État par item : nom signataire + fichier sélectionné + erreur locale
  const [signerNames, setSignerNames] = useState<Record<string, string>>({});
  const [uploadFiles, setUploadFiles] = useState<Record<string, File | null>>({});
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});

  // -------------------------------------------------------------------------
  // Téléchargement pièce originale
  // -------------------------------------------------------------------------

  function handleDownload(itemId: string) {
    setGlobalError(null);
    startTransition(async () => {
      const result = await getCotraitantDownloadUrl(token, itemId);
      if (!result.ok) {
        setGlobalError("Impossible de générer le lien de téléchargement. Veuillez réessayer.");
        return;
      }
      window.open(result.url, "_blank");
    });
  }

  // -------------------------------------------------------------------------
  // Upload pièce signée
  // -------------------------------------------------------------------------

  function handleUpload(itemId: string) {
    const file = uploadFiles[itemId];
    if (!file) {
      setItemErrors((prev) => ({
        ...prev,
        [itemId]: "Veuillez sélectionner un fichier à déposer.",
      }));
      return;
    }

    setItemErrors((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    setGlobalError(null);
    setGlobalSuccess(null);

    const formData = new FormData();
    formData.set("token", token);
    formData.set("itemId", itemId);
    formData.set("file", file);
    formData.set("signerName", signerNames[itemId] ?? "");

    startTransition(async () => {
      const result = await uploadSignedDocument(formData);
      if (!result.ok) {
        const msg = mapUploadErrorToFr(result.error);
        setItemErrors((prev) => ({ ...prev, [itemId]: msg }));
        return;
      }

      // Mise à jour optimiste de l'item
      setItems((prev) =>
        prev.map((i) =>
          i.id === itemId
            ? {
                ...i,
                signedAt: new Date(),
                signerName: signerNames[itemId] ?? null,
                signedFilename: file.name,
              }
            : i,
        ),
      );
      setGlobalSuccess("Pièce déposée avec succès !");
      // Nettoyage fichier sélectionné
      setUploadFiles((prev) => ({ ...prev, [itemId]: null }));
    });
  }

  // -------------------------------------------------------------------------
  // Rendu
  // -------------------------------------------------------------------------

  const allSigned = items.length > 0 && items.every((i) => i.signedAt !== null);

  return (
    <div className="space-y-4">
      {/* Messages globaux */}
      {globalError ? (
        <div role="alert" className="rounded-md bg-error-bg p-3 text-sm text-error">
          {globalError}
        </div>
      ) : null}
      {globalSuccess ? (
        <div role="status" className="rounded-md bg-success-bg p-3 text-sm text-success">
          {globalSuccess}
        </div>
      ) : null}

      {/* Liste des pièces */}
      {items.map((item) => {
        const isSigned = item.signedAt !== null;
        return (
          <div
            key={item.id}
            className={`rounded-md border p-4 ${
              isSigned ? "border-green-200 bg-success-bg" : "border-line bg-white"
            }`}
          >
            {/* En-tête */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium text-ink">{item.name}</div>
                <div className="text-xs text-muted">{item.kind.replace(/_/g, " ")}</div>
              </div>
              <span
                className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                  isSigned ? "bg-success text-white" : "bg-paper-3 text-muted"
                }`}
              >
                {isSigned ? "Signé" : "En attente"}
              </span>
            </div>

            {/* Pièce déjà signée */}
            {isSigned ? (
              <p className="mt-2 text-xs text-muted">
                Signé le {new Date(item.signedAt!).toLocaleDateString("fr-FR")} par{" "}
                {item.signerName ?? "—"} {item.signedFilename ? `(${item.signedFilename})` : ""}
              </p>
            ) : (
              /* Formulaire téléchargement + dépôt */
              <div className="mt-3 space-y-3">
                <p className="text-xs text-muted">
                  1. Téléchargez la pièce, signez-la, puis déposez le fichier signé ci-dessous.
                </p>

                {/* Bouton téléchargement */}
                <button
                  type="button"
                  onClick={() => handleDownload(item.id)}
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-paper-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  &darr; Télécharger la pièce originale
                </button>

                {/* Zone dépôt */}
                <div className="rounded-md border border-line p-3">
                  <p className="mb-2 text-xs font-medium text-ink">
                    2. Déposer la version signée (PDF, JPG ou PNG, max 20&nbsp;MB)
                  </p>
                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="Votre nom complet"
                      value={signerNames[item.id] ?? ""}
                      onChange={(e) =>
                        setSignerNames((prev) => ({
                          ...prev,
                          [item.id]: e.target.value,
                        }))
                      }
                      className="w-full rounded-sm border border-line px-3 py-1.5 text-sm focus:border-brand-red focus:outline-none focus:ring-1 focus:ring-brand-red"
                    />
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) =>
                        setUploadFiles((prev) => ({
                          ...prev,
                          [item.id]: e.target.files?.[0] ?? null,
                        }))
                      }
                      className="w-full text-sm text-muted"
                    />

                    {/* Erreur item */}
                    {itemErrors[item.id] ? (
                      <p role="alert" className="text-xs text-error">
                        {itemErrors[item.id]}
                      </p>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => handleUpload(item.id)}
                      disabled={isPending || !uploadFiles[item.id]}
                      className="rounded-full bg-brand-red px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isPending ? "Dépôt en cours…" : "Déposer la pièce signée"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Message final toutes pièces signées */}
      {allSigned ? (
        <div className="rounded-md bg-success-bg p-4 text-center">
          <p className="font-semibold text-success">
            Toutes les pièces ont été signées et déposées
          </p>
          <p className="mt-1 text-sm text-muted">
            AlyoS Ingénierie sera notifié et pourra télécharger vos dépôts.
          </p>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapUploadErrorToFr(code: string): string {
  const messages: Record<string, string> = {
    invalid_input: "Paramètre invalide.",
    missing_file: "Veuillez sélectionner un fichier.",
    file_too_large: "Fichier trop volumineux (max 20 MB).",
    invalid_mime_type: "Format non accepté. Utilisez PDF, JPG ou PNG.",
    share_invalid: "Ce lien de partage n'est plus actif.",
    item_not_found: "Pièce introuvable dans ce partage.",
    storage_upload_failed: "Erreur lors du dépôt. Veuillez réessayer dans quelques instants.",
    internal_error: "Erreur technique. Veuillez réessayer.",
  };
  return messages[code] ?? "Erreur technique. Veuillez réessayer.";
}
