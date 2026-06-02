"use client";

/**
 * CerfaFormClient — formulaires DC1 + DC2 côté client.
 *
 * Affiche deux formulaires pré-remplis (DC1 et DC2) permettant à l'utilisateur
 * de compléter les champs manquants et de valider chaque CERFA.
 *
 * Gestion d'état :
 *   - `useState<CerfaField[]>` pour chaque formulaire (initialisé depuis les
 *     champs construits côté serveur, ou depuis les `existingFields` si déjà
 *     sauvegardés)
 *   - `useTransition` pour chaque appel à `validateCerfa`
 *   - Badge couleur par source : bleu=company_data, vert=tender_data, orange=a_completer
 *
 * Source de vérité : brief Board PR-C 2026-05-25.
 */

import { useState, useTransition } from "react";

import type { CerfaDoc, CerfaField } from "@/lib/dossier/cerfa-prefill";
import type { AcceptedArchitect } from "../page-data";
import { getCerfaSignedUrl, validateCerfa } from "./actions";
import type { ExistingCerfa } from "./actions";

// ---------------------------------------------------------------------------
// Types props
// ---------------------------------------------------------------------------

export interface CerfaFormClientProps {
  /** Formulaire DC1 prérempli (champs construits côté serveur). */
  dc1: CerfaDoc;
  /** Formulaire DC2 prérempli (champs construits côté serveur). */
  dc2: CerfaDoc;
  /** UUID du tender courant (nécessaire pour appeler `validateCerfa`). */
  tenderId: string;
  /** Fichier DC1 existant si déjà validé (null sinon). */
  existingDc1: ExistingCerfa | null;
  /** Fichier DC2 existant si déjà validé (null sinon). */
  existingDc2: ExistingCerfa | null;
  /**
   * Architecte mandataire sélectionné (Phase 3 Tandem multi-archi).
   * Quand non-null, l'UUID est passé à `validateCerfa` pour lier le
   * `response_file` à l'archi via `response_files.architect_id`.
   * Affiche aussi un mini header de contexte au-dessus des formulaires.
   */
  selectedArchitect: AcceptedArchitect | null;
}

// ---------------------------------------------------------------------------
// Badge source
// ---------------------------------------------------------------------------

function SourceBadge({ source }: { source: CerfaField["source"] }) {
  if (source === "company_data") {
    return (
      <span className="rounded-full bg-blue-100 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-blue-700">
        données société
      </span>
    );
  }
  if (source === "tender_data") {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-emerald-700">
        données AO
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-amber-700">
      à compléter
    </span>
  );
}

// ---------------------------------------------------------------------------
// Formulaire individuel
// ---------------------------------------------------------------------------

interface SingleCerfaFormProps {
  tenderId: string;
  doc: CerfaDoc;
  existingFile: ExistingCerfa | null;
  /**
   * UUID de l'archi mandataire (Phase 3) — transmis à `validateCerfa` pour
   * lier le response_file. `null` si Solo / Tandem sans archi sélectionné.
   */
  architectId: string | null;
}

function SingleCerfaForm({ tenderId, doc, existingFile, architectId }: SingleCerfaFormProps) {
  // Initialisation depuis les champs préremplis (ou depuis l'état "déjà validé")
  const [fields, setFields] = useState<CerfaField[]>(doc.fields);
  // Mode édition : true si l'utilisateur clique "Modifier" après validation
  const [isEditing, setIsEditing] = useState<boolean>(existingFile === null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(existingFile !== null);
  const [isPending, startTransition] = useTransition();
  /**
   * ID du `response_files` PDF courant pour ce CERFA, utilisé par le bouton
   * "Télécharger le PDF" qui demande une URL signée à la Server Action.
   * Initialisé depuis `existingFile` (si l'utilisateur revient sur la page
   * après une validation antérieure), puis mis à jour après chaque submit.
   */
  const [responseFileId, setResponseFileId] = useState<string | null>(existingFile?.id ?? null);
  /**
   * Indicateur de chargement spécifique au bouton "Télécharger" — évite de
   * bloquer le reste du formulaire (qui utilise `isPending` de useTransition).
   */
  const [isDownloading, setIsDownloading] = useState<boolean>(false);

  // Nombre de champs restants à compléter
  const toCompleteCount = fields.filter(
    (f) => f.required && f.source === "a_completer" && f.value.trim() === "",
  ).length;

  function handleFieldChange(index: number, newValue: string) {
    setFields((prev) => {
      const updated = [...prev];
      const current = updated[index];
      if (!current) return prev;
      updated[index] = {
        field_id: current.field_id,
        field_label: current.field_label,
        required: current.required,
        value: newValue,
        // Si l'utilisateur a saisi quelque chose, on marque comme company_data
        source: newValue.trim().length > 0 ? "company_data" : "a_completer",
      };
      return updated;
    });
  }

  function handleValidate() {
    setError(null);
    startTransition(async () => {
      const result = await validateCerfa(tenderId, doc.cerfa_kind, fields, architectId);
      if (result.ok) {
        setSuccess(true);
        setIsEditing(false);
        if (result.responseFileId) {
          setResponseFileId(result.responseFileId);
        }
      } else if (result.error === "missing_required_fields") {
        const labels = result.missing
          ?.map((id) => fields.find((f) => f.field_id === id)?.field_label ?? id)
          .join(", ");
        setError(`Champs obligatoires manquants : ${labels ?? "—"}`);
      } else {
        setError(errorLabel(result.error));
      }
    });
  }

  function handleEdit() {
    setSuccess(false);
    setIsEditing(true);
  }

  /**
   * Demande une URL signée (1h) à la Server Action puis ouvre l'onglet de
   * téléchargement. On préfère `window.open` à un `<a download>` car l'URL
   * signée n'est connue qu'après l'aller-retour serveur — le `<a download>`
   * nécessiterait de pré-générer l'URL au mount, ce qui serait gaspillé si
   * l'utilisateur ne télécharge pas.
   */
  async function handleDownload() {
    if (!responseFileId) return;
    setError(null);
    setIsDownloading(true);
    try {
      const result = await getCerfaSignedUrl(responseFileId);
      if (result.ok && result.url) {
        // _blank pour ne pas faire perdre l'état du formulaire à l'utilisateur.
        // noopener+noreferrer = bonnes pratiques sécurité pour les liens externes.
        window.open(result.url, "_blank", "noopener,noreferrer");
      } else {
        setError("Impossible de générer le lien de téléchargement — réessayez.");
      }
    } catch {
      setError("Erreur réseau pendant la demande de téléchargement — réessayez.");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="rounded-lg border border-line bg-white">
      {/* En-tête */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <p className="font-display text-sm font-semibold text-ink">{doc.label}</p>
          {success && !isEditing && (
            <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 16 16"
                width={12}
                height={12}
                fill="currentColor"
                aria-hidden
              >
                <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z" />
              </svg>
              Validé
            </span>
          )}
        </div>
        {/* Boutons Télécharger + Modifier si déjà validé */}
        {success && !isEditing && (
          <div className="flex flex-wrap items-center gap-2">
            {responseFileId && (
              <button
                type="button"
                onClick={handleDownload}
                disabled={isDownloading}
                className="hover:bg-ink/80 inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-white transition disabled:opacity-50"
                aria-label={`Télécharger le ${doc.cerfa_kind} en PDF`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 16 16"
                  width={12}
                  height={12}
                  fill="currentColor"
                  aria-hidden
                >
                  <path d="M8 1a.75.75 0 0 1 .75.75v7.69l2.22-2.22a.75.75 0 1 1 1.06 1.06l-3.5 3.5a.75.75 0 0 1-1.06 0l-3.5-3.5a.75.75 0 0 1 1.06-1.06l2.22 2.22V1.75A.75.75 0 0 1 8 1ZM2.75 13a.75.75 0 0 0 0 1.5h10.5a.75.75 0 0 0 0-1.5H2.75Z" />
                </svg>
                {isDownloading ? "Préparation…" : `Télécharger le ${doc.cerfa_kind}.pdf`}
              </button>
            )}
            <button
              type="button"
              onClick={handleEdit}
              className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-paper-2"
            >
              Modifier
            </button>
          </div>
        )}
      </div>

      {/* Corps du formulaire */}
      <div className="divide-y divide-line">
        {fields.map((field, index) => {
          const isRequired = field.required;
          const needsCompletion =
            isRequired && field.source === "a_completer" && field.value.trim() === "";

          return (
            <div key={field.field_id} className="px-5 py-3">
              {/* Label + badge */}
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <label
                  htmlFor={`${doc.cerfa_kind}-${field.field_id}`}
                  className="text-xs font-medium text-ink"
                >
                  {field.field_label}
                  {isRequired && (
                    <span className="ml-0.5 text-error" aria-label="requis">
                      *
                    </span>
                  )}
                </label>
                <SourceBadge source={field.source} />
              </div>

              {/* Input */}
              <input
                id={`${doc.cerfa_kind}-${field.field_id}`}
                type="text"
                value={field.value}
                onChange={(e) => handleFieldChange(index, e.target.value)}
                disabled={!isEditing || isPending}
                placeholder={isRequired ? "Obligatoire — à compléter" : "Optionnel"}
                className={[
                  "w-full rounded-md px-3 py-2 text-sm text-ink placeholder:text-muted",
                  "focus:ring-brand-red/40 border transition focus:outline-none focus:ring-2",
                  needsCompletion
                    ? "border-amber-400 bg-amber-50 focus:border-amber-500"
                    : "border-line bg-paper focus:border-brand-red",
                  !isEditing || isPending ? "cursor-not-allowed opacity-60" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              />
            </div>
          );
        })}
      </div>

      {/* Pied de formulaire */}
      {isEditing && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4">
          {/* Compteur */}
          <p className="text-xs text-ink-2">
            {toCompleteCount > 0 ? (
              <span className="font-medium text-amber-600">
                {toCompleteCount} champ{toCompleteCount > 1 ? "s" : ""} obligatoire
                {toCompleteCount > 1 ? "s" : ""} à compléter
              </span>
            ) : (
              <span className="font-medium text-emerald-600">
                Tous les champs obligatoires sont remplis
              </span>
            )}
          </p>

          {/* Bouton validation */}
          <button
            type="button"
            onClick={handleValidate}
            disabled={isPending}
            className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? "Enregistrement…" : `Valider le ${doc.cerfa_kind}`}
          </button>
        </div>
      )}

      {/* Message d'erreur */}
      {error && (
        <div className="px-5 pb-4">
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Labels d'erreur
// ---------------------------------------------------------------------------

function errorLabel(code: string | undefined): string {
  switch (code) {
    case "not_authenticated":
      return "Session expirée — reconnectez-vous.";
    case "tender_not_found":
      return "AO introuvable — rechargez la page.";
    case "architect_not_accepted":
      return "Architecte non accepté pour cet AO — rechargez la page et resélectionnez.";
    case "storage_upload_failed":
      return "Erreur d'enregistrement dans le stockage — réessayez.";
    case "db_insert_failed":
      return "Erreur d'enregistrement en base — réessayez.";
    default:
      return "Erreur inattendue — réessayez ou contactez l'administrateur.";
  }
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

/**
 * Affiche DC1 et DC2 en deux cartes empilées (desktop : côte à côte via grid).
 *
 * Phase 3 — quand un architecte mandataire est sélectionné, affiche un mini
 * header de contexte et propage son UUID au submit pour lier le
 * `response_files.architect_id`.
 */
export function CerfaFormClient({
  dc1,
  dc2,
  tenderId,
  existingDc1,
  existingDc2,
  selectedArchitect,
}: CerfaFormClientProps) {
  const architectId = selectedArchitect?.id ?? null;

  return (
    <div>
      {selectedArchitect && (
        <div className="mb-4 rounded-md border border-line bg-paper-2 p-3 text-sm text-ink-2">
          Dossier CERFA pour <strong className="text-ink">{selectedArchitect.cabinet}</strong>. Le
          DC1 utilise les informations de cet architecte comme mandataire du groupement.
        </div>
      )}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SingleCerfaForm
          tenderId={tenderId}
          doc={dc1}
          existingFile={existingDc1}
          architectId={architectId}
        />
        <SingleCerfaForm
          tenderId={tenderId}
          doc={dc2}
          existingFile={existingDc2}
          architectId={architectId}
        />
      </div>
    </div>
  );
}
