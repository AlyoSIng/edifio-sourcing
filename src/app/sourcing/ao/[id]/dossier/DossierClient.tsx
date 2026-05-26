"use client";

/**
 * DossierClient — composant Client de la page dossier IA.
 *
 * Reçoit `data: DossierPageData` pré-chargée côté Server Component.
 *
 * 3 sections :
 *   1. DCE — téléchargement auto ou upload manuel du RC
 *   2. Analyse RC — déclenchement de l'analyse Claude Sonnet 4.6
 *   3. Résultats — pièces demandées, alertes, échéances, critères de jugement
 *
 * Gestion d'état :
 *   - `useTransition` pour chaque Server Action (indicateurs de chargement)
 *   - `useState` pour les messages d'erreur inline et l'analyse locale
 *     (quand l'analyse vient d'être faite sans rechargement serveur)
 *
 * Source de vérité :
 *   - Spec PR-B module dossier IA (brief Board 2026-05-25)
 */

import { useRef, useState, useTransition } from "react";

import type { DossierPageData } from "./page-data";
import type { RcAnalysis } from "@/lib/ai/schemas";
import { downloadDceFromUrl, uploadDcePdf, analyzeRcAction } from "./actions";

// ---------------------------------------------------------------------------
// Helpers de formatage
// ---------------------------------------------------------------------------

/** Formate une taille en octets en Ko ou Mo lisible. */
function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} Ko`;
  return `${(kb / 1024).toFixed(1)} Mo`;
}

/** Formate une Date en dd/MM/yyyy HH:mm. */
function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Labels d'erreur
// ---------------------------------------------------------------------------

function downloadErrorLabel(code: string | undefined): string {
  switch (code) {
    case "not_authenticated":
      return "Session expirée — reconnectez-vous.";
    case "tender_not_found":
      return "AO introuvable.";
    case "no_dce_url":
      return "Aucune URL DCE renseignée pour cet AO.";
    case "not_a_pdf":
      return "L'URL DCE ne pointe pas directement vers un PDF. Uploadez le RC manuellement.";
    case "fetch_failed":
      return "Impossible de télécharger l'URL DCE (timeout ou erreur réseau). Uploadez le RC manuellement.";
    case "storage_upload_failed":
      return "Erreur lors de l'enregistrement dans le stockage — réessayez.";
    case "db_insert_failed":
      return "Erreur d'enregistrement en base — réessayez.";
    default:
      return "Erreur inattendue — réessayez ou contactez l'administrateur.";
  }
}

function uploadErrorLabel(code: string | undefined): string {
  switch (code) {
    case "not_authenticated":
      return "Session expirée — reconnectez-vous.";
    case "missing_file":
      return "Veuillez sélectionner un fichier PDF.";
    case "not_a_pdf":
      return "Seuls les fichiers PDF sont acceptés.";
    case "file_too_large":
      return "Fichier trop volumineux (max 50 Mo).";
    case "tender_not_found":
      return "AO introuvable.";
    case "storage_upload_failed":
      return "Erreur lors de l'enregistrement dans le stockage — réessayez.";
    case "db_insert_failed":
      return "Erreur d'enregistrement en base — réessayez.";
    default:
      return "Erreur inattendue — réessayez ou contactez l'administrateur.";
  }
}

function analyzeErrorLabel(code: string | undefined): string {
  switch (code) {
    case "not_authenticated":
      return "Session expirée — reconnectez-vous.";
    case "document_not_found":
      return "Document RC introuvable — rechargez la page.";
    case "storage_download_failed":
      return "Impossible de télécharger le RC depuis le stockage — réessayez.";
    case "pdf_parse_failed":
      return "Impossible d'extraire le texte du PDF — vérifiez que le fichier est un PDF valide.";
    case "pdf_empty":
      return "Le PDF RC ne contient pas de texte extractible (PDF scanné sans OCR ?).";
    case "prompt_not_seeded":
      return "Le prompt P1 n'est pas en base. Exécutez src/db/seeds/001_ai_prompts.sql sur la BDD.";
    case "anthropic_error":
      return "Erreur de communication avec l'API Anthropic — réessayez.";
    case "parse_error":
      return "La réponse de Sonnet 4.6 n'a pas pu être validée — réessayez.";
    default:
      return "Erreur inattendue lors de l’analyse — réessayez ou contactez l’administrateur.";
  }
}

// ---------------------------------------------------------------------------
// Section 1 : DCE
// ---------------------------------------------------------------------------

interface DceSectionProps {
  tenderId: string;
  dceUrl: string | null;
  rcDocument: DossierPageData["rcDocument"];
}

function DceSection({ tenderId, dceUrl, rcDocument }: DceSectionProps) {
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDownloading, startDownload] = useTransition();
  const [isUploading, startUpload] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleDownload() {
    setDownloadError(null);
    startDownload(async () => {
      const result = await downloadDceFromUrl(tenderId);
      if (!result.ok) {
        setDownloadError(downloadErrorLabel(result.error));
      }
    });
  }

  function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setUploadError(null);
    const fd = new FormData(e.currentTarget);
    startUpload(async () => {
      const result = await uploadDcePdf(tenderId, fd);
      if (result.ok) {
        if (fileInputRef.current) fileInputRef.current.value = "";
      } else {
        setUploadError(uploadErrorLabel(result.error));
      }
    });
  }

  // RC déjà présent → affichage de la carte verte
  if (rcDocument) {
    return (
      <section
        className="rounded-lg border border-success bg-success-bg p-4"
        aria-label="Document RC"
      >
        <div className="flex items-start gap-3">
          {/* Icône fichier */}
          <div className="mt-0.5 shrink-0 text-success" aria-hidden>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              width={20}
              height={20}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <polyline points="9 12 12 15 15 12" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">RC téléchargé</p>
            <p className="mt-0.5 text-xs text-ink-2">
              <span className="font-medium">{rcDocument.name}</span>
              {rcDocument.sizeBytes ? ` · ${formatBytes(rcDocument.sizeBytes)}` : ""}
              {" · "}
              Ajouté le {formatDateTime(rcDocument.uploadedAt)}
            </p>
          </div>
        </div>
      </section>
    );
  }

  // RC absent → formulaire de téléchargement / upload
  return (
    <section className="space-y-4" aria-label="Obtenir le DCE">
      {/* Téléchargement automatique (si URL DCE disponible) */}
      {dceUrl ? (
        <div className="rounded-lg border border-line bg-white p-4">
          <p className="mb-3 text-sm font-medium text-ink">Télécharger le DCE automatiquement</p>
          <p className="mb-3 text-xs text-ink-2">
            L&apos;URL DCE de cet AO est disponible. Tentez le téléchargement direct (si l&apos;URL
            pointe vers un PDF). Sinon, uploadez le RC manuellement.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleDownload}
              disabled={isDownloading}
              className="hover:bg-ink/80 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white transition disabled:opacity-50"
            >
              {isDownloading ? "Téléchargement en cours…" : "Télécharger le DCE automatiquement"}
            </button>
            <a
              href={dceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="focus:ring-brand-red/40 text-sm text-brand-red hover:underline focus:outline-none focus:ring-2"
            >
              Ouvrir la page source →
            </a>
          </div>
          {downloadError && (
            <p role="alert" className="mt-2 text-sm text-error">
              {downloadError}
            </p>
          )}
        </div>
      ) : null}

      {/* Upload manuel */}
      <div className="rounded-lg border border-dashed border-line bg-white p-4">
        <p className="mb-3 text-sm font-medium text-ink">Uploader le RC manuellement</p>
        <form onSubmit={handleUpload}>
          <label
            htmlFor="rc-file-input"
            className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted"
          >
            Fichier PDF uniquement — max 50 Mo
          </label>
          <input
            ref={fileInputRef}
            id="rc-file-input"
            name="file"
            type="file"
            accept=".pdf,application/pdf"
            required
            disabled={isUploading}
            className="hover:file:bg-ink/80 w-full rounded border border-line bg-paper px-2 py-1.5 text-sm text-ink file:mr-3 file:rounded file:border-0 file:bg-ink file:px-2 file:py-1 file:text-xs file:font-medium file:text-white disabled:opacity-50"
          />
          {uploadError && (
            <p role="alert" className="mt-2 text-sm text-error">
              {uploadError}
            </p>
          )}
          <div className="mt-3 flex justify-end">
            <button
              type="submit"
              disabled={isUploading}
              className="hover:bg-ink/80 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white transition disabled:opacity-50"
            >
              {isUploading ? "Upload en cours…" : "Uploader le RC manuellement"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section 2 : Déclenchement de l'analyse
// ---------------------------------------------------------------------------

interface AnalysisTriggerSectionProps {
  tenderId: string;
  rcDocument: NonNullable<DossierPageData["rcDocument"]>;
  onAnalysisDone: (analysis: RcAnalysis) => void;
}

function AnalysisTriggerSection({
  tenderId,
  rcDocument,
  onAnalysisDone,
}: AnalysisTriggerSectionProps) {
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [isPending, startAnalysis] = useTransition();

  function handleAnalyze() {
    setAnalyzeError(null);
    startAnalysis(async () => {
      const result = await analyzeRcAction(tenderId, rcDocument.id);
      if (result.ok && result.analysis) {
        onAnalysisDone(result.analysis);
      } else {
        setAnalyzeError(analyzeErrorLabel(result.error));
      }
    });
  }

  if (rcDocument.analyzed) return null;

  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <p className="mb-1 text-sm font-medium text-ink">Analyser le RC avec Sonnet 4.6</p>
      <p className="mb-3 text-xs text-ink-2">
        Claude Sonnet 4.6 va lire le RC et en extraire les pièces demandées, les échéances, les
        critères de jugement et les alertes. Durée estimée : 30 à 60 secondes.
      </p>
      <button
        type="button"
        onClick={handleAnalyze}
        disabled={isPending}
        className="hover:bg-brand-red/90 rounded-md bg-brand-red px-4 py-2 text-sm font-medium text-white transition disabled:opacity-50"
      >
        {isPending ? "Analyse en cours… (30–60 s)" : "Analyser le RC avec Sonnet 4.6"}
      </button>
      {analyzeError && (
        <p role="alert" className="mt-2 text-sm text-error">
          {analyzeError}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 3 : Résultats de l'analyse
// ---------------------------------------------------------------------------

function AnalysisResultSection({ analysis, tenderId }: { analysis: RcAnalysis; tenderId: string }) {
  return (
    <div className="space-y-5">
      {/* Alertes */}
      {analysis.alertes.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="mb-2 text-sm font-semibold text-amber-800">
            Alertes ({analysis.alertes.length})
          </p>
          <ul className="space-y-1" role="list">
            {analysis.alertes.map((alerte, i) => (
              <li key={i} className="flex gap-2 text-sm text-amber-800">
                <span aria-hidden className="mt-0.5 shrink-0">
                  ⚠
                </span>
                {alerte}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Pièces demandées */}
      {analysis.pieces_demandees.length > 0 && (
        <section aria-labelledby="pieces-heading">
          <h3
            id="pieces-heading"
            className="mb-2 font-display text-sm font-semibold uppercase tracking-wide text-ink"
          >
            Pièces demandées ({analysis.pieces_demandees.length})
          </h3>
          <ul className="divide-y divide-line rounded-lg border border-line bg-white" role="list">
            {analysis.pieces_demandees.map((piece, i) => (
              <li key={i} className="flex flex-wrap items-start gap-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ink">{piece.nom}</span>
                    {/* Badge obligatoire / facultatif */}
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        piece.obligatoire ? "bg-error-bg text-error" : "bg-paper-2 text-ink-2"
                      }`}
                    >
                      {piece.obligatoire ? "Obligatoire" : "Facultatif"}
                    </span>
                    {/* Badge signature */}
                    {piece.signature_requise && (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                        Signature requise
                      </span>
                    )}
                    {/* Format */}
                    {piece.format && (
                      <span className="rounded bg-paper-2 px-1.5 py-0.5 font-mono text-[10px] text-muted">
                        {piece.format}
                      </span>
                    )}
                  </div>
                  {/* Provenance */}
                  <p className="mt-0.5 font-mono text-[10px] text-muted">
                    p. {piece.provenance.page} — «{piece.provenance.citation.slice(0, 80)}
                    {piece.provenance.citation.length > 80 ? "…" : ""}»
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Échéances */}
      {analysis.echeances.length > 0 && (
        <section aria-labelledby="echeances-heading">
          <h3
            id="echeances-heading"
            className="mb-2 font-display text-sm font-semibold uppercase tracking-wide text-ink"
          >
            Échéances ({analysis.echeances.length})
          </h3>
          <ul className="divide-y divide-line rounded-lg border border-line bg-white" role="list">
            {[...analysis.echeances]
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((echeance, i) => (
                <li key={i} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-paper-2 px-2 py-0.5 text-xs font-medium capitalize text-ink-2">
                        {echeance.type.replace("_", " ")}
                      </span>
                      <span className="text-sm font-medium text-ink">{echeance.date}</span>
                      {echeance.heure && (
                        <span className="font-mono text-xs text-ink-2">{echeance.heure}</span>
                      )}
                    </div>
                    <p className="mt-0.5 font-mono text-[10px] text-muted">
                      p. {echeance.provenance.page} — «{echeance.provenance.citation.slice(0, 80)}
                      {echeance.provenance.citation.length > 80 ? "…" : ""}»
                    </p>
                  </div>
                </li>
              ))}
          </ul>
        </section>
      )}

      {/* Critères de jugement */}
      {analysis.criteres_jugement.length > 0 && (
        <section aria-labelledby="criteres-heading">
          <h3
            id="criteres-heading"
            className="mb-2 font-display text-sm font-semibold uppercase tracking-wide text-ink"
          >
            Critères de jugement ({analysis.criteres_jugement.length})
          </h3>
          <ul className="divide-y divide-line rounded-lg border border-line bg-white" role="list">
            {analysis.criteres_jugement.map((critere, i) => (
              <li key={i} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-ink">{critere.critere}</span>
                  <span className="rounded-full bg-paper-2 px-2 py-0.5 font-mono text-xs font-semibold text-ink">
                    {critere.ponderation_pct} %
                  </span>
                </div>
                {critere.sous_criteres && critere.sous_criteres.length > 0 && (
                  <ul className="ml-3 mt-1 space-y-0.5" role="list">
                    {critere.sous_criteres.map((sc, j) => (
                      <li key={j} className="text-xs text-ink-2">
                        · {sc}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-0.5 font-mono text-[10px] text-muted">
                  p. {critere.provenance.page} — «{critere.provenance.citation.slice(0, 80)}
                  {critere.provenance.citation.length > 80 ? "…" : ""}»
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Bouton Préparer les DC (PR-C — activé) */}
      <div className="flex justify-end pt-2">
        <a
          href={`/sourcing/ao/${tenderId}/dossier/cerfa`}
          className="hover:bg-ink/80 inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white transition"
        >
          Préparer les DC
          <span aria-hidden>&rarr;</span>
        </a>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

interface DossierClientProps {
  data: DossierPageData;
}

export function DossierClient({ data }: DossierClientProps) {
  const { tender, rcDocument, rcAnalysis: initialAnalysis } = data;

  // L'analyse peut arriver via la page (rechargement serveur) ou via l'action
  // (sans rechargement, résultat retourné directement depuis la Server Action)
  const [localAnalysis, setLocalAnalysis] = useState<RcAnalysis | null>(initialAnalysis);

  return (
    <div className="space-y-6">
      {/* Section 1 — DCE */}
      <section aria-labelledby="dce-section-heading">
        <h2 id="dce-section-heading" className="mb-3 font-display text-base font-semibold text-ink">
          1. Règlement de Consultation (RC)
        </h2>
        <DceSection tenderId={tender.id} dceUrl={tender.dceUrl} rcDocument={rcDocument} />
      </section>

      {/* Section 2 — Analyse RC (visible seulement si RC présent et pas encore analysé) */}
      {rcDocument && !localAnalysis && (
        <section aria-labelledby="analyze-section-heading">
          <h2
            id="analyze-section-heading"
            className="mb-3 font-display text-base font-semibold text-ink"
          >
            2. Analyse du RC par IA
          </h2>
          <AnalysisTriggerSection
            tenderId={tender.id}
            rcDocument={rcDocument}
            onAnalysisDone={setLocalAnalysis}
          />
        </section>
      )}

      {/* Section 3 — Résultats de l'analyse */}
      {localAnalysis && (
        <section aria-labelledby="results-section-heading">
          <h2
            id="results-section-heading"
            className="mb-3 font-display text-base font-semibold text-ink"
          >
            2. Résultats de l&apos;analyse RC
          </h2>
          <AnalysisResultSection analysis={localAnalysis} tenderId={tender.id} />
        </section>
      )}
    </div>
  );
}
