"use client";

/**
 * Formulaire de création d'un AO manuel (consultation privée).
 *
 * Client Component : gère l'état du formulaire, la validation côté client
 * (doublon de la validation serveur pour le feedback immédiat) et appelle
 * la Server Action `createPrivateTender`.
 *
 * Après création réussie, redirige vers la page de détail de l'AO créé.
 *
 * Source de vérité : brief Board feat/boamp-dce-ao-manuel (2026-05-27).
 */

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";

import { createPrivateTender, enrichTenderFromUrlAction } from "./actions";

// ============================================================================
// Données statiques — sélects
// ============================================================================

const MARKET_TYPES = [
  { value: "", label: "— Non précisé —" },
  { value: "moe", label: "Maîtrise d'œuvre (MOE)" },
  { value: "services", label: "Services" },
  { value: "travaux", label: "Travaux" },
  { value: "fournitures", label: "Fournitures" },
  { value: "autre", label: "Autre" },
] as const;

/** Codes de département FR + DOM-TOM (101 départements). */
const DEPARTMENTS: Array<{ code: string; label: string }> = [
  { code: "", label: "— Non précisé —" },
  { code: "01", label: "01 — Ain" },
  { code: "02", label: "02 — Aisne" },
  { code: "03", label: "03 — Allier" },
  { code: "04", label: "04 — Alpes-de-Haute-Provence" },
  { code: "05", label: "05 — Hautes-Alpes" },
  { code: "06", label: "06 — Alpes-Maritimes" },
  { code: "07", label: "07 — Ardèche" },
  { code: "08", label: "08 — Ardennes" },
  { code: "09", label: "09 — Ariège" },
  { code: "10", label: "10 — Aube" },
  { code: "11", label: "11 — Aude" },
  { code: "12", label: "12 — Aveyron" },
  { code: "13", label: "13 — Bouches-du-Rhône" },
  { code: "14", label: "14 — Calvados" },
  { code: "15", label: "15 — Cantal" },
  { code: "16", label: "16 — Charente" },
  { code: "17", label: "17 — Charente-Maritime" },
  { code: "18", label: "18 — Cher" },
  { code: "19", label: "19 — Corrèze" },
  { code: "2A", label: "2A — Corse-du-Sud" },
  { code: "2B", label: "2B — Haute-Corse" },
  { code: "21", label: "21 — Côte-d'Or" },
  { code: "22", label: "22 — Côtes-d'Armor" },
  { code: "23", label: "23 — Creuse" },
  { code: "24", label: "24 — Dordogne" },
  { code: "25", label: "25 — Doubs" },
  { code: "26", label: "26 — Drôme" },
  { code: "27", label: "27 — Eure" },
  { code: "28", label: "28 — Eure-et-Loir" },
  { code: "29", label: "29 — Finistère" },
  { code: "30", label: "30 — Gard" },
  { code: "31", label: "31 — Haute-Garonne" },
  { code: "32", label: "32 — Gers" },
  { code: "33", label: "33 — Gironde" },
  { code: "34", label: "34 — Hérault" },
  { code: "35", label: "35 — Ille-et-Vilaine" },
  { code: "36", label: "36 — Indre" },
  { code: "37", label: "37 — Indre-et-Loire" },
  { code: "38", label: "38 — Isère" },
  { code: "39", label: "39 — Jura" },
  { code: "40", label: "40 — Landes" },
  { code: "41", label: "41 — Loir-et-Cher" },
  { code: "42", label: "42 — Loire" },
  { code: "43", label: "43 — Haute-Loire" },
  { code: "44", label: "44 — Loire-Atlantique" },
  { code: "45", label: "45 — Loiret" },
  { code: "46", label: "46 — Lot" },
  { code: "47", label: "47 — Lot-et-Garonne" },
  { code: "48", label: "48 — Lozère" },
  { code: "49", label: "49 — Maine-et-Loire" },
  { code: "50", label: "50 — Manche" },
  { code: "51", label: "51 — Marne" },
  { code: "52", label: "52 — Haute-Marne" },
  { code: "53", label: "53 — Mayenne" },
  { code: "54", label: "54 — Meurthe-et-Moselle" },
  { code: "55", label: "55 — Meuse" },
  { code: "56", label: "56 — Morbihan" },
  { code: "57", label: "57 — Moselle" },
  { code: "58", label: "58 — Nièvre" },
  { code: "59", label: "59 — Nord" },
  { code: "60", label: "60 — Oise" },
  { code: "61", label: "61 — Orne" },
  { code: "62", label: "62 — Pas-de-Calais" },
  { code: "63", label: "63 — Puy-de-Dôme" },
  { code: "64", label: "64 — Pyrénées-Atlantiques" },
  { code: "65", label: "65 — Hautes-Pyrénées" },
  { code: "66", label: "66 — Pyrénées-Orientales" },
  { code: "67", label: "67 — Bas-Rhin" },
  { code: "68", label: "68 — Haut-Rhin" },
  { code: "69", label: "69 — Rhône" },
  { code: "70", label: "70 — Haute-Saône" },
  { code: "71", label: "71 — Saône-et-Loire" },
  { code: "72", label: "72 — Sarthe" },
  { code: "73", label: "73 — Savoie" },
  { code: "74", label: "74 — Haute-Savoie" },
  { code: "75", label: "75 — Paris" },
  { code: "76", label: "76 — Seine-Maritime" },
  { code: "77", label: "77 — Seine-et-Marne" },
  { code: "78", label: "78 — Yvelines" },
  { code: "79", label: "79 — Deux-Sèvres" },
  { code: "80", label: "80 — Somme" },
  { code: "81", label: "81 — Tarn" },
  { code: "82", label: "82 — Tarn-et-Garonne" },
  { code: "83", label: "83 — Var" },
  { code: "84", label: "84 — Vaucluse" },
  { code: "85", label: "85 — Vendée" },
  { code: "86", label: "86 — Vienne" },
  { code: "87", label: "87 — Haute-Vienne" },
  { code: "88", label: "88 — Vosges" },
  { code: "89", label: "89 — Yonne" },
  { code: "90", label: "90 — Territoire de Belfort" },
  { code: "91", label: "91 — Essonne" },
  { code: "92", label: "92 — Hauts-de-Seine" },
  { code: "93", label: "93 — Seine-Saint-Denis" },
  { code: "94", label: "94 — Val-de-Marne" },
  { code: "95", label: "95 — Val-d'Oise" },
  { code: "971", label: "971 — Guadeloupe" },
  { code: "972", label: "972 — Martinique" },
  { code: "973", label: "973 — Guyane" },
  { code: "974", label: "974 — La Réunion" },
  { code: "976", label: "976 — Mayotte" },
];

// ============================================================================
// Composant
// ============================================================================

export function PrivateTenderForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // État du formulaire
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [deadline, setDeadline] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [department, setDepartment] = useState("");
  const [marketType, setMarketType] = useState("");
  const [notes, setNotes] = useState("");

  // État enrichissement automatique depuis URL
  const [enrichUrl, setEnrichUrl] = useState("");
  const [enrichError, setEnrichError] = useState<string | null>(null);
  const [enrichSuccess, setEnrichSuccess] = useState(false);
  const [isEnriching, startEnrich] = useTransition();

  /** Messages d'erreur lisibles pour les codes retournés par enrichTenderFromUrlAction. */
  const ENRICH_ERROR_MESSAGES: Record<string, string> = {
    not_authenticated: "Session expirée.",
    invalid_url: "L'URL n'est pas valide (HTTPS requis).",
    not_a_webpage: "L'URL ne pointe pas vers une page HTML.",
    parse_error: "Impossible d'extraire les informations. Remplissez manuellement.",
    fetch_failed: "Impossible d'accéder à l'URL. Vérifiez le lien.",
    internal_error: "Erreur interne. Réessayez.",
  };

  function handleEnrich() {
    setEnrichError(null);
    setEnrichSuccess(false);
    startEnrich(async () => {
      const result = await enrichTenderFromUrlAction(enrichUrl.trim());
      if (!result.ok) {
        setEnrichError(ENRICH_ERROR_MESSAGES[result.error] ?? "Erreur inconnue.");
        return;
      }
      const d = result.data;
      if (d.title) setTitle(d.title);
      if (d.buyerName) setBuyerName(d.buyerName);
      if (d.deadline) setDeadline(d.deadline);
      if (d.estimatedValue) setEstimatedValue(String(d.estimatedValue));
      if (d.description) setDescription(d.description);
      if (d.department) setDepartment(d.department);
      if (d.marketType) setMarketType(d.marketType);
      setEnrichSuccess(true);
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    // Validation côté client (feedback immédiat)
    if (!title.trim()) {
      setError("Le titre est obligatoire.");
      return;
    }
    if (title.trim().length > 500) {
      setError("Le titre ne peut pas dépasser 500 caractères.");
      return;
    }
    if (!deadline) {
      setError("La date limite de réponse est obligatoire.");
      return;
    }
    if (description.length > 2000) {
      setError("La description ne peut pas dépasser 2000 caractères.");
      return;
    }

    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await createPrivateTender(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccessId(result.tenderId);
      // Redirection après un court délai (feedback visuel)
      router.push(`/sourcing/ao/${result.tenderId}`);
    });
  }

  // État succès en attente de redirection
  if (successId) {
    return (
      <div className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-800">
        Consultation créée avec succès. Redirection en cours…
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {/* Message d'erreur global */}
      {error && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </div>
      )}

      {/* Bloc enrichissement automatique depuis URL */}
      <div className="rounded-md border border-line bg-paper-2 p-4">
        <p className="mb-2 text-sm font-medium text-ink">
          Enrichissement automatique
          <span className="ml-2 text-xs font-normal text-muted">— optionnel</span>
        </p>
        <p className="mb-3 text-xs text-muted">
          Collez l&apos;URL de l&apos;annonce. Les champs seront pré-remplis automatiquement.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="url"
            value={enrichUrl}
            onChange={(e) => setEnrichUrl(e.target.value)}
            placeholder="https://www.boamp.fr/avis/detail/… ou https://www.marches-publics.info/…"
            disabled={isEnriching}
            className="flex-1 rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-red focus:outline-none focus:ring-1 focus:ring-brand-red disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleEnrich}
            disabled={isEnriching || !enrichUrl.trim()}
            className="whitespace-nowrap rounded-full bg-brand-red px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isEnriching ? "Analyse en cours…" : "Remplir automatiquement"}
          </button>
        </div>
        {enrichError && (
          <p role="alert" className="mt-2 text-xs text-error">
            {enrichError}
          </p>
        )}
        {enrichSuccess && (
          <p className="mt-2 text-xs text-success">
            Champs pré-remplis — vérifiez avant de valider.
          </p>
        )}
      </div>

      {/* Section 1 — Informations générales */}
      <fieldset className="space-y-4">
        <legend className="font-display text-sm font-semibold uppercase tracking-wider text-muted">
          Informations générales
        </legend>

        {/* Titre */}
        <div>
          <label htmlFor="title" className="mb-1 block text-sm font-medium text-ink">
            Titre du marché <span className="text-brand-red">*</span>
          </label>
          <input
            id="title"
            name="title"
            type="text"
            required
            maxLength={500}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex. : Maîtrise d'œuvre réhabilitation école primaire"
            className="focus:border-primary focus:ring-primary w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-1"
          />
          <p className="mt-1 text-[11px] text-muted">{title.length}/500 caractères</p>
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className="mb-1 block text-sm font-medium text-ink">
            Objet / Description du marché
          </label>
          <textarea
            id="description"
            name="description"
            rows={4}
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description détaillée de la prestation attendue…"
            className="focus:border-primary focus:ring-primary w-full resize-y rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-1"
          />
          <p className="mt-1 text-[11px] text-muted">{description.length}/2000 caractères</p>
        </div>

        {/* Maître d'ouvrage */}
        <div>
          <label htmlFor="buyerName" className="mb-1 block text-sm font-medium text-ink">
            Maître d&apos;ouvrage
          </label>
          <input
            id="buyerName"
            name="buyerName"
            type="text"
            value={buyerName}
            onChange={(e) => setBuyerName(e.target.value)}
            placeholder="Ex. : Mairie de Lyon"
            className="focus:border-primary focus:ring-primary w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-1"
          />
        </div>
      </fieldset>

      {/* Section 2 — Calendrier et marché */}
      <fieldset className="space-y-4">
        <legend className="font-display text-sm font-semibold uppercase tracking-wider text-muted">
          Calendrier et caractéristiques
        </legend>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Date limite */}
          <div>
            <label htmlFor="deadline" className="mb-1 block text-sm font-medium text-ink">
              Date limite de réponse <span className="text-brand-red">*</span>
            </label>
            <input
              id="deadline"
              name="deadline"
              type="date"
              required
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="focus:border-primary focus:ring-primary w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1"
            />
          </div>

          {/* Valeur estimée */}
          <div>
            <label htmlFor="estimatedValue" className="mb-1 block text-sm font-medium text-ink">
              Valeur estimée (€)
            </label>
            <input
              id="estimatedValue"
              name="estimatedValue"
              type="number"
              min="0"
              step="1"
              value={estimatedValue}
              onChange={(e) => setEstimatedValue(e.target.value)}
              placeholder="Ex. : 150000"
              className="focus:border-primary focus:ring-primary w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-1"
            />
          </div>

          {/* Département */}
          <div>
            <label htmlFor="department" className="mb-1 block text-sm font-medium text-ink">
              Département
            </label>
            <select
              id="department"
              name="department"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="focus:border-primary focus:ring-primary w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1"
            >
              {DEPARTMENTS.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          {/* Type de marché */}
          <div>
            <label htmlFor="marketType" className="mb-1 block text-sm font-medium text-ink">
              Type de marché
            </label>
            <select
              id="marketType"
              name="marketType"
              value={marketType}
              onChange={(e) => setMarketType(e.target.value)}
              className="focus:border-primary focus:ring-primary w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1"
            >
              {MARKET_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </fieldset>

      {/* Section 3 — DCE */}
      <fieldset className="space-y-3">
        <legend className="font-display text-sm font-semibold uppercase tracking-wider text-muted">
          Dossier de consultation (DCE)
        </legend>
        <p className="text-xs text-muted">
          Uploadez le DCE si vous le possédez déjà (PDF ou ZIP, max 50 Mo). Vous pourrez également
          l&apos;uploader plus tard depuis la page de détail.
        </p>
        <div>
          <label htmlFor="dceFile" className="mb-1 block text-sm font-medium text-ink">
            Fichier DCE
          </label>
          <input
            id="dceFile"
            name="dceFile"
            type="file"
            ref={fileInputRef}
            accept=".pdf,.zip"
            className="file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 w-full cursor-pointer rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink file:mr-3 file:cursor-pointer file:rounded file:border-0 file:px-3 file:py-1 file:text-xs file:font-medium"
          />
          <p className="mt-1 text-[11px] text-muted">Formats acceptés : PDF, ZIP — max 50 Mo</p>
        </div>
      </fieldset>

      {/* Section 4 — Notes internes */}
      <fieldset>
        <legend className="mb-2 font-display text-sm font-semibold uppercase tracking-wider text-muted">
          Notes internes
        </legend>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes internes, contexte commercial, contacts, etc."
          className="focus:border-primary focus:ring-primary w-full resize-y rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-1"
        />
      </fieldset>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 border-t border-line pt-4">
        <a
          href="/sourcing/ao-du-jour"
          className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-paper-2"
        >
          Annuler
        </a>
        <button
          type="submit"
          disabled={isPending}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending && (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          )}
          {isPending ? "Création en cours…" : "Créer la consultation"}
        </button>
      </div>
    </form>
  );
}
