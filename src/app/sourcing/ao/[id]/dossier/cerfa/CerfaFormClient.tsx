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
import { validateCerfa } from "./actions";
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
}

function SingleCerfaForm({ tenderId, doc, existingFile }: SingleCerfaFormProps) {
  // Initialisation depuis les champs préremplis (ou depuis l'état "déjà validé")
  const [fields, setFields] = useState<CerfaField[]>(doc.fields);
  // Mode édition : true si l'utilisateur clique "Modifier" après validation
  const [isEditing, setIsEditing] = useState<boolean>(existingFile === null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(existingFile !== null);
  const [isPending, startTransition] = useTransition();

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
      const result = await validateCerfa(tenderId, doc.cerfa_kind, fields);
      if (result.ok) {
        setSuccess(true);
        setIsEditing(false);
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
        {/* Bouton Modifier si déjà validé */}
        {success && !isEditing && (
          <button
            type="button"
            onClick={handleEdit}
            className="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-paper-2"
          >
            Modifier
          </button>
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
            className="hover:bg-ink/80 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white transition disabled:opacity-50"
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
 */
export function CerfaFormClient({
  dc1,
  dc2,
  tenderId,
  existingDc1,
  existingDc2,
}: CerfaFormClientProps) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <SingleCerfaForm tenderId={tenderId} doc={dc1} existingFile={existingDc1} />
      <SingleCerfaForm tenderId={tenderId} doc={dc2} existingFile={existingDc2} />
    </div>
  );
}
