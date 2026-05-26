"use client";

/**
 * PartageClient — composant Client pour la page de partage de pièces.
 *
 * Gère :
 *  1. Sélection des items de la bibliothèque via checkboxes (groupés par kind)
 *  2. Saisie nom + email cotraitant
 *  3. Soumission → createShareSession → affichage du lien généré
 *  4. Liste des partages existants : statut signé/en attente, bouton Révoquer,
 *     recopie du lien public
 */

import { useState, useTransition } from "react";

import { createShareSession, revokeShare } from "./actions";
import type { LibraryItemForShare, ShareForDisplay } from "./page";

interface Props {
  tenderId: string;
  libraryItems: LibraryItemForShare[];
  existingShares: ShareForDisplay[];
}

export function PartageClient({ tenderId, libraryItems, existingShares }: Props) {
  const [isPending, startTransition] = useTransition();

  // --- Formulaire création ---
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);

  // --- Liste des partages (mise à jour optimiste) ---
  const [shares, setShares] = useState<ShareForDisplay[]>(existingShares);

  // -------------------------------------------------------------------------
  // Sélection items
  // -------------------------------------------------------------------------

  function toggleItem(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // -------------------------------------------------------------------------
  // Création
  // -------------------------------------------------------------------------

  function handleCreate() {
    setFormError(null);
    setGeneratedLink(null);

    const selected = libraryItems.filter((i) => selectedIds.has(i.id));
    if (selected.length === 0) {
      setFormError("Sélectionnez au moins une pièce.");
      return;
    }
    if (!contactName.trim()) {
      setFormError("Le nom du cotraitant est requis.");
      return;
    }
    if (!contactEmail.trim()) {
      setFormError("L'email du cotraitant est requis.");
      return;
    }

    const formData = new FormData();
    formData.set("tenderId", tenderId);
    formData.set("contactName", contactName);
    formData.set("contactEmail", contactEmail);
    formData.set(
      "items",
      JSON.stringify(
        selected.map((i) => ({
          id: i.id,
          name: i.name,
          kind: i.kind,
          storagePath: i.storagePath,
        })),
      ),
    );

    startTransition(async () => {
      const result = await createShareSession(formData);
      if (!result.ok) {
        setFormError(mapCreateErrorToFr(result.error));
        return;
      }
      const link = `${window.location.origin}/cotraitant/${result.token}`;
      setGeneratedLink(link);
      // Réinitialise le formulaire
      setSelectedIds(new Set());
      setContactName("");
      setContactEmail("");
    });
  }

  // -------------------------------------------------------------------------
  // Révocation
  // -------------------------------------------------------------------------

  function handleRevoke(shareId: string) {
    startTransition(async () => {
      const result = await revokeShare(shareId, tenderId);
      if (result.ok) {
        setShares((prev) =>
          prev.map((s) => (s.id === shareId ? { ...s, revokedAt: new Date() } : s)),
        );
      }
    });
  }

  // -------------------------------------------------------------------------
  // Groupement items par kind
  // -------------------------------------------------------------------------

  const byKind = libraryItems.reduce<Record<string, LibraryItemForShare[]>>((acc, item) => {
    if (!acc[item.kind]) acc[item.kind] = [];
    acc[item.kind]!.push(item);
    return acc;
  }, {});

  // -------------------------------------------------------------------------
  // Rendu
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-8">
      {/* ------------------------------------------------------------------ */}
      {/* Section création                                                    */}
      {/* ------------------------------------------------------------------ */}
      <section className="rounded-md border border-line bg-white p-6">
        <h2 className="mb-4 font-display text-lg font-semibold text-ink">Nouveau partage</h2>

        {libraryItems.length === 0 ? (
          <p className="text-sm text-muted">
            Aucune pièce dans la bibliothèque.{" "}
            <a href="/sourcing/admin/bibliotheque" className="text-brand-red hover:underline">
              Ajouter des documents &rarr;
            </a>
          </p>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted">Sélectionnez les pièces à partager :</p>

            {/* Checkboxes groupées par catégorie */}
            <div className="mb-4 space-y-4">
              {Object.entries(byKind).map(([kind, items]) => (
                <div key={kind}>
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
                    {kind.replace(/_/g, " ")}
                  </div>
                  <div className="space-y-1">
                    {items.map((item) => (
                      <label
                        key={item.id}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-neutral-50"
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.id)}
                          onChange={() => toggleItem(item.id)}
                          className="h-4 w-4 rounded border-line accent-brand-red"
                        />
                        <span className="text-sm text-ink">{item.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Champs contact */}
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink">Nom du cotraitant</label>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Ex. BE Structure Moreau"
                  className="w-full rounded-sm border border-line px-3 py-1.5 text-sm focus:border-brand-red focus:outline-none focus:ring-1 focus:ring-brand-red"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink">Email cotraitant</label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="contact@be-structure.fr"
                  className="w-full rounded-sm border border-line px-3 py-1.5 text-sm focus:border-brand-red focus:outline-none focus:ring-1 focus:ring-brand-red"
                />
              </div>
            </div>

            {/* Erreur formulaire */}
            {formError ? (
              <p role="alert" className="mb-3 text-sm text-error">
                {formError}
              </p>
            ) : null}

            <button
              type="button"
              onClick={handleCreate}
              disabled={isPending}
              className="rounded-sm bg-brand-red px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "Création…" : "Créer le lien de partage"}
            </button>

            {/* Lien généré */}
            {generatedLink ? (
              <div className="mt-4 rounded-md border border-green-200 bg-green-50 p-3">
                <p className="mb-1 text-xs font-semibold text-green-700">
                  Lien créé — valable 30 jours
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded bg-white px-2 py-1 font-mono text-[11px] text-ink">
                    {generatedLink}
                  </code>
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard.writeText(generatedLink)}
                    className="shrink-0 rounded-sm border border-line px-2 py-1 text-[11px] font-medium text-ink transition hover:bg-neutral-50"
                  >
                    Copier
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-muted">
                  Envoyez ce lien manuellement au cotraitant par email ou tout autre canal sécurisé.
                </p>
              </div>
            ) : null}
          </>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Section partages existants                                          */}
      {/* ------------------------------------------------------------------ */}
      {shares.length > 0 ? (
        <section className="space-y-4">
          <h2 className="font-display text-lg font-semibold text-ink">Partages créés</h2>

          {shares.map((share) => {
            const isRevoked = !!share.revokedAt;
            const isExpired = new Date(share.expiresAt) < new Date();
            const signedCount = share.items.filter((i) => i.signedAt).length;
            // Note : window.location.origin n'est disponible que côté client —
            // on construit le chemin relatif pour l'affichage SSR, le JS le
            // complétera si besoin.
            const sharePath = `/cotraitant/${share.token}`;

            return (
              <div
                key={share.id}
                className={`rounded-md border p-4 ${
                  isRevoked || isExpired
                    ? "border-line bg-neutral-50 opacity-70"
                    : "border-line bg-white"
                }`}
              >
                {/* En-tête partage */}
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-ink">{share.contactName}</div>
                    <div className="text-xs text-muted">{share.contactEmail}</div>
                    <div className="mt-1 text-[11px] text-muted">
                      Créé le {new Date(share.createdAt).toLocaleDateString("fr-FR")} · Expire le{" "}
                      {new Date(share.expiresAt).toLocaleDateString("fr-FR")}
                      {isRevoked ? " · Révoqué" : ""}
                      {isExpired && !isRevoked ? " · Expiré" : ""}
                    </div>
                  </div>

                  {!isRevoked ? (
                    <button
                      type="button"
                      onClick={() => handleRevoke(share.id)}
                      disabled={isPending}
                      className="text-xs text-error transition hover:underline disabled:opacity-50"
                    >
                      Révoquer
                    </button>
                  ) : null}
                </div>

                {/* Items du partage */}
                <div className="mt-3 space-y-1">
                  {share.items.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 text-xs">
                      <span className={item.signedAt ? "text-green-600" : "text-muted"}>
                        {item.signedAt ? "✓" : "○"}
                      </span>
                      <span className="text-ink">{item.name}</span>
                      {item.signedAt ? (
                        <span className="text-muted">
                          — signé le {new Date(item.signedAt).toLocaleDateString("fr-FR")} par{" "}
                          {item.signerName ?? "—"}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>

                {/* Lien copiable (uniquement si actif) */}
                {!isRevoked && !isExpired ? (
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-[11px] text-muted">Lien : </span>
                    <code className="font-mono text-[11px] text-brand-red">{sharePath}</code>
                    <button
                      type="button"
                      onClick={() =>
                        void navigator.clipboard.writeText(`${window.location.origin}${sharePath}`)
                      }
                      className="text-[11px] text-muted transition hover:text-ink"
                    >
                      Copier
                    </button>
                  </div>
                ) : null}

                {/* Compteur signatures */}
                {signedCount > 0 ? (
                  <div className="mt-2 text-xs font-medium text-green-600">
                    {signedCount}/{share.items.length} pièce
                    {signedCount > 1 ? "s" : ""} signée
                    {signedCount > 1 ? "s" : ""} et redéposée
                    {signedCount > 1 ? "s" : ""}
                  </div>
                ) : null}
              </div>
            );
          })}
        </section>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapCreateErrorToFr(code: string): string {
  const messages: Record<string, string> = {
    not_authenticated: "Session expirée. Reconnectez-vous.",
    forbidden_domain: "Accès refusé.",
    invalid_input: "Paramètre invalide.",
    missing_contact_name: "Le nom du cotraitant est requis.",
    missing_contact_email: "L'email du cotraitant est requis.",
    missing_items: "Sélectionnez au moins une pièce.",
    invalid_items: "Erreur de format des pièces sélectionnées.",
    no_items_selected: "Sélectionnez au moins une pièce.",
    internal_error: "Erreur technique. Veuillez réessayer.",
  };
  return messages[code] ?? "Erreur technique. Veuillez réessayer.";
}
