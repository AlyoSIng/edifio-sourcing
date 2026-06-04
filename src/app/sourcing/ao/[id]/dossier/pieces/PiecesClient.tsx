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
import { cancelDossierDispatchAction, sendDossierToArchitectAction } from "./dispatch-actions";

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
  /**
   * Métadonnées de l'archi sélectionné (Steve 2026-06-03) — affichées sur le
   * bouton « Envoyer à l'archi » + utilisées pour bloquer l'envoi si l'archi
   * n'a pas d'email. `null` si Solo / Cotraitance BE ou si archi introuvable.
   */
  selectedArchitect: { id: string; cabinet: string; email: string | null } | null;
  /**
   * Dernier envoi du dossier à cet archi (si existant) — affiche
   * « Envoyé le DD/MM à HH:MM » sous le bouton. Date sérialisée en ISO pour
   * franchir la frontière Server → Client (les Date natives ne passent pas).
   */
  lastDispatch: { dispatchId: string; sentAtIso: string; recipientEmail: string } | null;
  /**
   * Résumé des items biblio à problème d'expiration (chantier G2.1 — Steve
   * 2026-06-03). `expired` : déjà périmés → exclus du ZIP, à renouveler.
   * `expiringSoon` : encore inclus mais ≤ J+30, à surveiller.
   */
  expirySummary?: {
    expired: Array<{ id: string; name: string; validUntilIso: string }>;
    expiringSoon: Array<{ id: string; name: string; validUntilIso: string }>;
  };
  /**
   * Aperçu de la composition du ZIP (G3 — Steve 2026-06-03). Précalculé côté
   * server, affiché dans un panneau dépliable au-dessus du bouton Compiler.
   */
  zipComposition?: {
    hasPouvoir: boolean;
    pouvoirName: string | null;
    hasRc: boolean;
    matchedItems: Array<{ id: string; name: string; pieceLabel: string }>;
    extraItems: Array<{ id: string; name: string; kind: string }>;
    excludedExpiredCount: number;
  };
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
  reusedBadge,
}: {
  label: string;
  existing: ExistingCerfa | null;
  tenderId: string;
  archiQuery: string;
  /**
   * Optionnel : badge « Réutilisé » affiché à droite du « Prêt » quand le
   * document a été produit pour un autre contexte (ex. DC2 AlyoS persiste
   * d'un archi à l'autre — Steve 2026-06-03). `null` = pas de badge.
   */
  reusedBadge?: string | null;
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
          <>
            {reusedBadge && (
              <span
                className="rounded-full border border-emerald-200 bg-white px-2 py-0.5 text-[11px] font-medium text-emerald-700"
                title="Document conservé d'un précédent contexte — données AlyoS identiques"
              >
                {reusedBadge}
              </span>
            )}
            <span className="text-xs font-medium text-emerald-700">Prêt</span>
            <a
              href={`/sourcing/ao/${tenderId}/dossier/cerfa${archiQuery}`}
              className="text-xs font-medium text-emerald-700 underline hover:text-emerald-900"
            >
              Revoir →
            </a>
          </>
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
// Labels d'erreur envoi à l'archi
// ---------------------------------------------------------------------------

function sendErrorLabel(code: string | undefined, detail?: string): string {
  switch (code) {
    case "not_authenticated":
      return "Session expirée — reconnectez-vous.";
    case "invalid_input":
      return "Paramètres invalides — actualisez la page.";
    case "tender_not_found":
      return "Cet AO n'existe plus ou est inaccessible.";
    case "architect_not_found":
      return "Architecte introuvable.";
    case "architect_no_email":
      return "L'architecte n'a pas d'email renseigné — ajoutez-le sur sa fiche.";
    case "no_compiled_zip":
      return "Aucun ZIP compilé pour cet archi — compilez le dossier d'abord.";
    case "signed_url_failed":
      return "Impossible de générer le lien de téléchargement — réessayez.";
    case "brevo_send_failed":
      return `Échec de l'envoi du mail (${detail ?? "raison inconnue"}) — réessayez.`;
    default:
      return "Erreur inattendue lors de l'envoi — réessayez.";
  }
}

/** Formate un ISO timestamp en « DD/MM à HH:MM » (fr). */
function formatSentAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `${date} à ${time}`;
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
  selectedArchitect,
  lastDispatch,
  expirySummary,
  zipComposition,
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

  // État envoi à l'archi (Steve 2026-06-03). Le dernier envoi server-rendered
  // est rehydraté en `lastSentAt` ; chaque clic envoi update cette valeur en
  // optimistic UI puis revalidate la page.
  const [isSending, startSend] = useTransition();
  const [sendError, setSendError] = useState<string | null>(null);
  const [lastSentAtIso, setLastSentAtIso] = useState<string | null>(
    lastDispatch?.sentAtIso ?? null,
  );
  // H6 — Steve 2026-06-04 : id du dernier dispatch actif, pour permettre
  // l'annulation. Le state suit lastSentAtIso : à chaque nouvel envoi,
  // l'id devient celui du nouveau dispatch (renvoyé par la Server Action).
  const [activeDispatchId, setActiveDispatchId] = useState<string | null>(
    lastDispatch?.dispatchId ?? null,
  );
  const [isCancellingDispatch, startCancelDispatch] = useTransition();
  const [cancelError, setCancelError] = useState<string | null>(null);

  const archiHasEmail = Boolean(selectedArchitect?.email);
  const canSendToArchi = compileMode === "tandem" && archiHasEmail && downloadUrl !== null;

  function handleSendToArchitect() {
    if (!archiParam || !selectedArchitect) return;
    if (!confirm(`Envoyer le dossier de candidature à ${selectedArchitect.cabinet} ?`)) return;
    setSendError(null);
    startSend(async () => {
      const result = await sendDossierToArchitectAction(tenderId, archiParam);
      if (result.ok) {
        setLastSentAtIso(result.sentAt.toISOString());
        setActiveDispatchId(result.dispatchId);
      } else {
        setSendError(sendErrorLabel(result.error, result.detail));
      }
    });
  }

  // H6 — annulation soft d'un envoi (le lien signé reste actif côté
  // Supabase jusqu'à expiration naturelle 7j, mais l'UI considère l'envoi
  // comme inexistant).
  function handleCancelDispatch() {
    if (!activeDispatchId) return;
    const reason = window.prompt("Motif de l'annulation (optionnel — visible dans l'audit) :", "");
    if (reason === null) return; // user clicked Cancel
    setCancelError(null);
    startCancelDispatch(async () => {
      const result = await cancelDossierDispatchAction(activeDispatchId, reason);
      if (result.ok) {
        setLastSentAtIso(null);
        setActiveDispatchId(null);
      } else {
        setCancelError(
          result.error === "already_cancelled"
            ? "Cet envoi a déjà été annulé."
            : result.error === "dispatch_not_found"
              ? "Envoi introuvable."
              : "Annulation impossible — réessaie.",
        );
      }
    });
  }

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
        return "Le ZIP contiendra DC1 + DC2 + Pouvoir + RC + toutes les pièces valides de la bibliothèque (les expirées sont exclues), optimisé pour l'architecte sélectionné.";
      case "cotraitance_be":
        return "Le ZIP contiendra DC1 + DC2 du BE + Pouvoir + RC + toutes les pièces valides de la bibliothèque (les expirées sont exclues).";
      case "solo":
      default:
        return "Le ZIP contiendra DC1 + DC2 + Pouvoir + RC + toutes les pièces valides de la bibliothèque (les expirées sont exclues).";
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
            // Badge « Réutilisé » uniquement en Tandem (DC2 AlyoS persiste
            // d'un archi à l'autre — Steve 2026-06-03).
            reusedBadge={compileMode === "tandem" && existingDc2 ? "Réutilisé" : null}
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
        {/* Avertissements expiration biblio (G2.1 — Steve 2026-06-03).
            Affichés AVANT le hint UX pour que l'admin les voie en premier. */}
        {expirySummary && expirySummary.expired.length > 0 && (
          <div
            role="alert"
            className="mb-3 rounded-md border border-l-4 border-line border-l-error bg-error-bg px-4 py-3 text-sm text-error"
          >
            <strong>
              {expirySummary.expired.length} document
              {expirySummary.expired.length > 1 ? "s" : ""} expiré
              {expirySummary.expired.length > 1 ? "s" : ""}
            </strong>{" "}
            — exclu{expirySummary.expired.length > 1 ? "s" : ""} du ZIP. À renouveler dans la
            bibliothèque :
            <ul className="mt-1 list-inside list-disc text-xs">
              {expirySummary.expired.slice(0, 5).map((it) => (
                <li key={it.id}>
                  {it.name}{" "}
                  <span className="font-mono text-[10px] opacity-70">
                    (valide jusqu&apos;au {it.validUntilIso})
                  </span>
                </li>
              ))}
              {expirySummary.expired.length > 5 && (
                <li className="italic">
                  … et {expirySummary.expired.length - 5} autre
                  {expirySummary.expired.length - 5 > 1 ? "s" : ""}
                </li>
              )}
            </ul>
            <a
              href="/sourcing/admin/bibliotheque"
              className="mt-2 inline-block text-xs underline hover:opacity-80"
            >
              → Aller à la bibliothèque
            </a>
          </div>
        )}
        {expirySummary && expirySummary.expiringSoon.length > 0 && (
          <div
            role="alert"
            className="mb-3 rounded-md border border-l-4 border-line border-l-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          >
            <strong>
              {expirySummary.expiringSoon.length} document
              {expirySummary.expiringSoon.length > 1 ? "s" : ""} expire
              {expirySummary.expiringSoon.length > 1 ? "nt" : ""} dans les 30 jours
            </strong>{" "}
            — inclus dans le ZIP mais à surveiller :
            <ul className="mt-1 list-inside list-disc text-xs">
              {expirySummary.expiringSoon.slice(0, 5).map((it) => (
                <li key={it.id}>
                  {it.name}{" "}
                  <span className="font-mono text-[10px] opacity-70">
                    (valide jusqu&apos;au {it.validUntilIso})
                  </span>
                </li>
              ))}
              {expirySummary.expiringSoon.length > 5 && (
                <li className="italic">
                  … et {expirySummary.expiringSoon.length - 5} autre
                  {expirySummary.expiringSoon.length - 5 > 1 ? "s" : ""}
                </li>
              )}
            </ul>
          </div>
        )}
        {/* Hint UX — composition du ZIP selon le mode de réponse. */}
        {!downloadUrl && <p className="mb-3 text-xs text-ink-2">{compileHint}</p>}
        {/* Panneau dépliable « Voir le détail de la composition » (G3). */}
        {!downloadUrl && zipComposition && (
          <details className="mb-3 rounded-md border border-line bg-paper-2 px-3 py-2 text-xs text-ink-2">
            <summary className="cursor-pointer font-medium text-ink">
              📋 Voir le détail de la composition du ZIP
            </summary>
            <div className="mt-3 space-y-2">
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
                Documents standards
              </p>
              <ul className="list-inside list-disc pl-2 text-xs">
                <li>DC1 — Lettre de candidature</li>
                <li>DC2 — Déclaration du candidat</li>
                {zipComposition.hasPouvoir && (
                  <li>
                    Pouvoir mandataire
                    {zipComposition.pouvoirName && (
                      <span className="text-muted"> ({zipComposition.pouvoirName})</span>
                    )}
                  </li>
                )}
                {zipComposition.hasRc && <li>Règlement de Consultation (RC) source</li>}
              </ul>

              {zipComposition.matchedItems.length > 0 && (
                <>
                  <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-muted">
                    Pièces matchées RC ({zipComposition.matchedItems.length})
                  </p>
                  <ul className="list-inside list-disc pl-2 text-xs">
                    {zipComposition.matchedItems.slice(0, 8).map((m) => (
                      <li key={m.id}>
                        {m.name}
                        <span className="ml-1 text-muted">
                          (pour « {m.pieceLabel.slice(0, 40)}
                          {m.pieceLabel.length > 40 ? "…" : ""} »)
                        </span>
                      </li>
                    ))}
                    {zipComposition.matchedItems.length > 8 && (
                      <li className="italic text-muted">
                        … et {zipComposition.matchedItems.length - 8} autres
                      </li>
                    )}
                  </ul>
                </>
              )}

              {zipComposition.extraItems.length > 0 && (
                <>
                  <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-muted">
                    Autres pièces biblio valides ({zipComposition.extraItems.length})
                  </p>
                  <ul className="list-inside list-disc pl-2 text-xs">
                    {zipComposition.extraItems.slice(0, 12).map((it) => (
                      <li key={it.id}>
                        {it.name}
                        <span className="ml-1 text-muted">[{it.kind}]</span>
                      </li>
                    ))}
                    {zipComposition.extraItems.length > 12 && (
                      <li className="italic text-muted">
                        … et {zipComposition.extraItems.length - 12} autres
                      </li>
                    )}
                  </ul>
                </>
              )}

              {zipComposition.excludedExpiredCount > 0 && (
                <p className="mt-2 text-xs italic text-amber-700">
                  ⚠ {zipComposition.excludedExpiredCount} document
                  {zipComposition.excludedExpiredCount > 1 ? "s" : ""} expiré
                  {zipComposition.excludedExpiredCount > 1 ? "s" : ""} exclu
                  {zipComposition.excludedExpiredCount > 1 ? "s" : ""} (cf. bandeau ci-dessus).
                </p>
              )}
            </div>
          </details>
        )}
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
              {/* Envoyer à l'archi (mode Tandem uniquement — Steve 2026-06-03).
                  Disabled si pas d'archi ou pas d'email archi. */}
              {compileMode === "tandem" && selectedArchitect && (
                <button
                  type="button"
                  onClick={handleSendToArchitect}
                  disabled={isSending || !canSendToArchi}
                  className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  title={
                    !archiHasEmail
                      ? "L'architecte n'a pas d'email — ajoutez-le sur sa fiche"
                      : `Envoyer le dossier à ${selectedArchitect.cabinet}`
                  }
                >
                  {isSending
                    ? "Envoi en cours…"
                    : lastSentAtIso
                      ? "Renvoyer à l'architecte"
                      : "Envoyer à l'architecte"}
                  <span aria-hidden>✉</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleCompile}
                disabled={isCompiling || cerfsIncomplete}
                className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-paper-2 disabled:opacity-50"
              >
                Recompiler
              </button>
            </div>
            {/* État envoi : confirmation + last sent + erreur */}
            {sendError && (
              <p role="alert" className="text-xs text-error">
                {sendError}
              </p>
            )}
            {lastSentAtIso && !sendError && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-ink-2">
                <span>
                  ✉ Dossier envoyé à <strong>{selectedArchitect?.email ?? "—"}</strong> le{" "}
                  {formatSentAt(lastSentAtIso)}. Lien valable 7 jours.
                </span>
                {activeDispatchId && (
                  <button
                    type="button"
                    onClick={handleCancelDispatch}
                    disabled={isCancellingDispatch}
                    className="rounded border border-line bg-white px-2 py-0.5 text-[11px] font-medium text-error transition hover:bg-error-bg disabled:opacity-50"
                    title="Marquer cet envoi comme annulé (le lien signé reste actif jusqu'à expiration naturelle 7j)"
                  >
                    {isCancellingDispatch ? "…" : "Annuler cet envoi"}
                  </button>
                )}
              </div>
            )}
            {cancelError && (
              <p role="alert" className="text-xs text-error">
                {cancelError}
              </p>
            )}
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
