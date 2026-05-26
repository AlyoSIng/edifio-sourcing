"use client";

/**
 * PiecesClient — liste des pièces complémentaires du dossier de candidature.
 *
 * Affiche :
 *   1. Récap DC1 + DC2 avec statut "Prêt" ou "À valider"
 *   2. Liste des pièces RC avec badge de matching bibliothèque :
 *      ✓ Disponible | ⚠ Partiel | ✕ Manquant
 *   3. Pour les pièces disponibles : lien vers le doc bibliothèque
 *   4. Pour les pièces manquantes : suggestion de catégorie + lien bibliothèque
 *   5. Bouton "Compiler le dossier" (aria-disabled — PR-E)
 *
 * Composant client pur (pas d'appel serveur ici — données passées en props).
 *
 * Source de vérité : brief Board PR-D 2026-05-25.
 */

import type { PieceMatch } from "@/lib/dossier/pieces-match";
import type { ExistingCerfa } from "../cerfa/actions";

// ---------------------------------------------------------------------------
// Types props
// ---------------------------------------------------------------------------

export interface PiecesClientProps {
  tenderId: string;
  existingDc1: ExistingCerfa | null;
  existingDc2: ExistingCerfa | null;
  pieceMatches: PieceMatch[];
}

// ---------------------------------------------------------------------------
// Badge statut matching
// ---------------------------------------------------------------------------

function PieceBadge({ status }: { status: PieceMatch["status"] }) {
  if (status === "available") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700"
        title="Document disponible dans la bibliothèque"
      >
        <span aria-hidden className="text-emerald-600">
          ✓
        </span>
        Disponible
      </span>
    );
  }
  if (status === "partial") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"
        title="Correspondance partielle — à vérifier"
      >
        <span aria-hidden className="text-amber-600">
          ⚠
        </span>
        À vérifier
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-error-bg px-2 py-0.5 text-xs font-medium text-error"
      title="Aucun document correspondant dans la bibliothèque"
    >
      <span aria-hidden className="text-error">
        ✕
      </span>
      Manquant
    </span>
  );
}

// ---------------------------------------------------------------------------
// Carte DC1/DC2
// ---------------------------------------------------------------------------

function CerfaStatusCard({
  label,
  existing,
  tenderId,
}: {
  label: string;
  existing: ExistingCerfa | null;
  tenderId: string;
}) {
  const isDone = existing !== null;
  return (
    <div
      className={[
        "flex items-center justify-between rounded-lg border px-4 py-3",
        isDone ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50",
      ].join(" ")}
    >
      <div className="flex items-center gap-3">
        <span
          className={[
            "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
            isDone ? "bg-emerald-500 text-white" : "bg-amber-400 text-white",
          ].join(" ")}
          aria-hidden
        >
          {isDone ? "✓" : "!"}
        </span>
        <span className="text-sm font-medium text-ink">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {isDone ? (
          <span className="text-xs font-medium text-emerald-700">Prêt</span>
        ) : (
          <a
            href={`/sourcing/ao/${tenderId}/dossier/cerfa`}
            className="text-xs font-medium text-amber-700 underline hover:text-amber-900"
          >
            Valider →
          </a>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

export function PiecesClient({
  tenderId,
  existingDc1,
  existingDc2,
  pieceMatches,
}: PiecesClientProps) {
  const missingCount = pieceMatches.filter((m) => m.status === "missing").length;
  const partialCount = pieceMatches.filter((m) => m.status === "partial").length;
  const availableCount = pieceMatches.filter((m) => m.status === "available").length;

  // Alerte si DC1 ou DC2 manquants
  const cerfsIncomplete = !existingDc1 || !existingDc2;

  return (
    <div className="space-y-8">
      {/* Section : formulaires CERFA */}
      <section aria-labelledby="cerfa-section-heading">
        <h2
          id="cerfa-section-heading"
          className="mb-3 font-display text-base font-semibold text-ink"
        >
          Pièces standards CERFA
        </h2>
        <div className="space-y-3">
          <CerfaStatusCard
            label="DC1 — Lettre de candidature"
            existing={existingDc1}
            tenderId={tenderId}
          />
          <CerfaStatusCard
            label="DC2 — Déclaration du candidat"
            existing={existingDc2}
            tenderId={tenderId}
          />
        </div>
        {cerfsIncomplete && (
          <p role="alert" className="mt-3 text-sm text-amber-700">
            Validez DC1 et DC2 avant de compiler le dossier.
          </p>
        )}
      </section>

      {/* Section : pièces RC */}
      <section aria-labelledby="pieces-rc-heading">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="pieces-rc-heading" className="font-display text-base font-semibold text-ink">
            Pièces demandées par le RC ({pieceMatches.length})
          </h2>
          {/* Récap */}
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="font-medium text-emerald-700">
              {availableCount} disponible{availableCount > 1 ? "s" : ""}
            </span>
            {partialCount > 0 && (
              <span className="font-medium text-amber-700">{partialCount} à vérifier</span>
            )}
            {missingCount > 0 && (
              <span className="font-medium text-error">
                {missingCount} manquant{missingCount > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        {pieceMatches.length === 0 ? (
          <p className="text-sm text-ink-2">
            Aucune pièce extraite de l&apos;analyse RC. Relancez l&apos;analyse depuis la page
            Dossier.
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-white" role="list">
            {pieceMatches.map((match, i) => (
              <li key={i} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start">
                {/* Infos pièce */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ink">{match.piece.nom}</span>
                    {/* Obligatoire */}
                    {match.piece.obligatoire && (
                      <span className="rounded-full bg-error-bg px-2 py-0.5 text-xs font-medium text-error">
                        Obligatoire
                      </span>
                    )}
                    {/* Signature */}
                    {match.piece.signature_requise && (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                        Signature requise
                      </span>
                    )}
                    {/* Format */}
                    {match.piece.format && (
                      <span className="rounded bg-paper-2 px-1.5 py-0.5 font-mono text-[10px] text-muted">
                        {match.piece.format}
                      </span>
                    )}
                  </div>
                  {/* Provenance RC */}
                  <p className="mt-0.5 font-mono text-[10px] text-muted">
                    p. {match.piece.provenance.page} — «
                    {match.piece.provenance.citation.slice(0, 80)}
                    {match.piece.provenance.citation.length > 80 ? "…" : ""}»
                  </p>
                </div>

                {/* Statut + actions */}
                <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
                  <PieceBadge status={match.status} />

                  {match.status === "available" && match.libraryItem && (
                    <a
                      href="/sourcing/admin/bibliotheque"
                      className="text-xs text-ink-2 underline hover:text-ink"
                    >
                      Voir dans la bibliothèque →
                    </a>
                  )}

                  {match.status === "partial" && match.libraryItem && (
                    <a
                      href="/sourcing/admin/bibliotheque"
                      className="text-xs text-amber-700 underline hover:text-amber-900"
                    >
                      Vérifier : «{match.libraryItem.name}» →
                    </a>
                  )}

                  {match.status === "missing" && (
                    <a
                      href="/sourcing/admin/bibliotheque"
                      className="text-xs text-error underline hover:opacity-80"
                      title="Ajouter ce document dans la bibliothèque"
                    >
                      Ajouter à la bibliothèque →
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Bouton Compiler le dossier (PR-E — disabled) */}
      <div className="flex justify-end pt-2">
        <div className="relative">
          <button
            type="button"
            aria-disabled="true"
            disabled
            title="Disponible prochainement — étape PR-E"
            className="inline-flex cursor-not-allowed items-center rounded-md bg-paper-2 px-4 py-2 text-sm font-medium text-muted"
          >
            Compiler le dossier
            <span aria-hidden className="ml-1">
              &rarr;
            </span>
          </button>
          <span className="absolute -right-1 -top-1 rounded bg-ink px-1 py-0.5 font-mono text-[9px] text-white">
            bientôt
          </span>
        </div>
      </div>
    </div>
  );
}
