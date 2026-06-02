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
 *   5. Bouton "Compiler le dossier" — actif (PR-E)
 *
 * Composant client pur (appel Server Action compileDossierAction).
 *
 * Source de vérité : brief Board PR-D/PR-E 2026-05-26.
 */

import { useState, useTransition } from "react";

import type { PieceMatch } from "@/lib/dossier/pieces-match";
import type { ExistingCerfa } from "../cerfa/actions";
import { compileDossierAction } from "./actions";

// ---------------------------------------------------------------------------
// Types props
// ---------------------------------------------------------------------------

export interface PiecesClientProps {
  tenderId: string;
  existingDc1: ExistingCerfa | null;
  existingDc2: ExistingCerfa | null;
  pieceMatches: PieceMatch[];
  /**
   * UUID archi sélectionné (Phase 3 multi-archi). Propagé sur tous les liens
   * internes vers `/dossier` et `/dossier/cerfa` pour conserver le contexte
   * archi mandataire. `null` → liens standards sans query param.
   */
  archiParam: string | null;
  /**
   * UUID BE cotraitant sélectionné (Lot B — Cotraitance BE). Mutuellement
   * exclusif avec `archiParam` (la page parent garantit qu'au plus l'un des
   * deux est non null). `null` → comportement Solo / Tandem.
   */
  beParam: string | null;
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
  archiQuery,
}: {
  label: string;
  existing: ExistingCerfa | null;
  tenderId: string;
  archiQuery: string;
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
            href={`/sourcing/ao/${tenderId}/dossier/cerfa${archiQuery}`}
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
// Labels d'erreur compilation
// ---------------------------------------------------------------------------

function compileErrorLabel(code: string | undefined): string {
  switch (code) {
    case "not_authenticated":
      return "Session expirée — reconnectez-vous.";
    case "no_cerfa":
      return "DC1 et DC2 doivent être validés avant de compiler le dossier.";
    case "architect_not_accepted":
      return "L'architecte sélectionné n'a pas accepté la sollicitation — impossible de compiler son dossier.";
    case "be_not_cotraitant":
      return "Le BE sélectionné n'est pas cotraitant sur cet AO — impossible de compiler son dossier.";
    case "zip_empty":
      return "Aucun document disponible — ajoutez des pièces à la bibliothèque d'abord.";
    case "zip_download_failed":
      return "Erreur de téléchargement des pièces depuis le stockage — réessayez.";
    case "storage_upload_failed":
    case "signed_url_failed":
      return "Erreur de stockage — réessayez.";
    default:
      return "Erreur inattendue lors de la compilation — réessayez.";
  }
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

export function PiecesClient({
  tenderId,
  existingDc1,
  existingDc2,
  pieceMatches,
  archiParam,
  beParam,
}: PiecesClientProps) {
  const missingCount = pieceMatches.filter((m) => m.status === "missing").length;
  const partialCount = pieceMatches.filter((m) => m.status === "partial").length;
  const availableCount = pieceMatches.filter((m) => m.status === "available").length;

  // Phase 3 + Lot B — query string propagé sur tous les liens internes vers
  // /dossier et /dossier/cerfa pour conserver le contexte archi mandataire ou
  // BE cotraitant. Mutual exclusivity garantie par la page parent.
  const archiQuery = archiParam ? `?archi=${archiParam}` : beParam ? `?be=${beParam}` : "";

  // Mode courant — pour le hint UX au-dessus du bouton "Compiler".
  type CompileMode = "tandem" | "cotraitance_be" | "solo";
  const compileMode: CompileMode = archiParam ? "tandem" : beParam ? "cotraitance_be" : "solo";

  // Alerte si DC1 ou DC2 manquants
  const cerfsIncomplete = !existingDc1 || !existingDc2;

  // État compilation ZIP
  const [isCompiling, startCompile] = useTransition();
  const [compileError, setCompileError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [zipFileCount, setZipFileCount] = useState<number | null>(null);

  function handleCompile() {
    setCompileError(null);
    setDownloadUrl(null);
    startCompile(async () => {
      const result = await compileDossierAction(tenderId, {
        architectId: archiParam,
        beId: beParam,
      });
      if (result.ok && result.downloadUrl) {
        setDownloadUrl(result.downloadUrl);
        setZipFileCount(result.fileCount ?? null);
      } else {
        setCompileError(compileErrorLabel(result.error));
      }
    });
  }

  // UX hint — message contextualisé selon le mode de réponse.
  const compileHint: string = (() => {
    switch (compileMode) {
      case "tandem":
        return "Le ZIP contiendra DC1 + DC2 + Pouvoir + RC + pièces, optimisé pour l'architecte sélectionné.";
      case "cotraitance_be":
        return "Le ZIP contiendra DC1 + DC2 du BE + Pouvoir + RC + pièces.";
      case "solo":
      default:
        return "Le ZIP contiendra DC1 + DC2 + Pouvoir + RC + pièces de la bibliothèque.";
    }
  })();

  return (
    <div className="space-y-8">
      {/* Bandeau info — pièces ciblées sur l'archi mandataire (Phase 3) ou le BE cotraitant (Lot B). */}
      {archiParam && (
        <div className="mb-4 rounded-md border border-line bg-paper-2 p-3 text-xs text-ink-2">
          Pièces du dossier préparé pour l&apos;architecte mandataire sélectionné.
        </div>
      )}
      {beParam && (
        <div className="mb-4 rounded-md border border-line bg-paper-2 p-3 text-xs text-ink-2">
          Pièces du dossier préparé pour le bureau d&apos;études cotraitant sélectionné.
        </div>
      )}

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
            archiQuery={archiQuery}
          />
          <CerfaStatusCard
            label="DC2 — Déclaration du candidat"
            existing={existingDc2}
            tenderId={tenderId}
            archiQuery={archiQuery}
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

      {/* Compilation ZIP */}
      <div className="border-t border-line pt-6">
        {/* Hint UX — composition du ZIP selon le mode de réponse. */}
        {!downloadUrl && <p className="mb-3 text-xs text-ink-2">{compileHint}</p>}
        {/* Résultat : lien de téléchargement */}
        {downloadUrl ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium text-emerald-700">
              ✓ Dossier compilé —{" "}
              {zipFileCount !== null && (
                <span className="font-normal">
                  {zipFileCount} fichier{zipFileCount > 1 ? "s" : ""}
                </span>
              )}
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href={downloadUrl}
                download
                className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
              >
                Télécharger le dossier (ZIP)
                <span aria-hidden>↓</span>
              </a>
              <button
                type="button"
                onClick={handleCompile}
                disabled={isCompiling || cerfsIncomplete}
                className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-paper-2 disabled:opacity-50"
              >
                Recompiler
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-end gap-2">
            {compileError && (
              <p role="alert" className="text-sm text-error">
                {compileError}
              </p>
            )}
            <button
              type="button"
              onClick={handleCompile}
              disabled={isCompiling || cerfsIncomplete}
              className="inline-flex items-center gap-2 rounded-full bg-brand-red px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              title={cerfsIncomplete ? "Validez DC1 et DC2 avant de compiler" : undefined}
            >
              {isCompiling ? (
                "Compilation en cours…"
              ) : (
                <>
                  Compiler le dossier
                  <span aria-hidden>&rarr;</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
