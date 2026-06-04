"use client";

/**
 * Mini-éditeur inline pour `tenders.buyer_address` (Steve 2026-06-04).
 *
 * Affiché en complément du nom de l'acheteur sur la page AO. Si l'adresse
 * existe : affichage lecture + bouton « Modifier » qui passe en mode édition.
 * Sinon : bouton « + Ajouter adresse » qui révèle l'input.
 *
 * Réservé aux admins (la Server Action revérifie côté serveur). En lecture,
 * accessible à tous les rôles.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { updateBuyerAddressAction } from "./actions";

interface BuyerAddressEditorProps {
  tenderId: string;
  initialAddress: string | null;
  /** Si false, on n'affiche pas les contrôles d'édition (seulement lecture). */
  editable: boolean;
}

export function BuyerAddressEditor({
  tenderId,
  initialAddress,
  editable,
}: BuyerAddressEditorProps) {
  const router = useRouter();
  const [address, setAddress] = useState(initialAddress ?? "");
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const currentValue = initialAddress;

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateBuyerAddressAction(tenderId, address.trim() || null);
      if (!result.ok) {
        setError(
          result.error === "forbidden_role"
            ? "Action réservée aux admins."
            : "Échec de l'enregistrement.",
        );
        return;
      }
      setIsEditing(false);
      router.refresh();
    });
  }

  function handleCancel() {
    setAddress(initialAddress ?? "");
    setIsEditing(false);
    setError(null);
  }

  // Mode lecture
  if (!isEditing) {
    return (
      <div className="mt-1 flex items-baseline gap-2">
        {currentValue ? (
          <p className="text-sm text-muted">📍 {currentValue}</p>
        ) : (
          <p className="text-xs italic text-muted">Adresse acheteur non renseignée</p>
        )}
        {editable && (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="text-xs text-ink-2 underline decoration-dotted underline-offset-2 hover:text-ink"
          >
            {currentValue ? "Modifier" : "+ Ajouter"}
          </button>
        )}
      </div>
    );
  }

  // Mode édition
  return (
    <div className="mt-1 space-y-1">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Ex. : 1 Place de la Comédie, 69001 Lyon"
          maxLength={300}
          disabled={isPending}
          className="w-full max-w-md rounded border border-line bg-white px-2 py-1 text-sm text-ink outline-none focus:border-brand-red focus:ring-1 focus:ring-brand-red disabled:opacity-50"
          autoFocus
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="rounded bg-ink px-3 py-1 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "…" : "Enregistrer"}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={isPending}
          className="rounded px-2 py-1 text-xs text-ink-2 hover:bg-paper-2 disabled:opacity-50"
        >
          Annuler
        </button>
      </div>
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
