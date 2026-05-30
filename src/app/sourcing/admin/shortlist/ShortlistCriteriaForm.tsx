"use client";

/**
 * Formulaire de configuration des critères de short-list — composant Client.
 *
 * Trois onglets (Architectes / Cotraitants / Entreprises), chacun géré
 * indépendamment. Soumission par Server Action (`upsertShortlistCriteria`).
 *
 * Source de vérité :
 *  - src/db/schema/shortlist.ts (champs)
 *  - specs/module_tandem_engine_v1.md §short-list
 *  - Décision Nadia 2026-05-28
 */

import { useState, useTransition } from "react";

import { upsertShortlistCriteria, type ShortlistTarget } from "./actions";
import type { ShortlistCriteria } from "@/db/schema/shortlist";

// ============================================================================
// Types
// ============================================================================

interface ShortlistCriteriaFormProps {
  /** Critères initiaux chargés depuis la BDD pour chaque cible. null = pas encore configuré. */
  initialArchitects: ShortlistCriteria | null;
  initialCotraitants: ShortlistCriteria | null;
  initialCompanies: ShortlistCriteria | null;
}

type TabId = ShortlistTarget;

const TABS: { id: TabId; label: string }[] = [
  { id: "architects", label: "Architectes" },
  { id: "cotraitants", label: "Cotraitants" },
  { id: "companies", label: "Entreprises/Majors" },
];

// ============================================================================
// Composant principal
// ============================================================================

export function ShortlistCriteriaForm({
  initialArchitects,
  initialCotraitants,
  initialCompanies,
}: ShortlistCriteriaFormProps) {
  const [activeTab, setActiveTab] = useState<TabId>("architects");

  const initialByTarget: Record<TabId, ShortlistCriteria | null> = {
    architects: initialArchitects,
    cotraitants: initialCotraitants,
    companies: initialCompanies,
  };

  return (
    <div>
      {/* Onglets */}
      <div className="mb-6 flex overflow-hidden rounded-md border border-line">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${
              activeTab === tab.id
                ? "bg-brand-red text-white"
                : "bg-white text-ink-2 hover:bg-paper-2"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Panneau actif */}
      {TABS.map((tab) =>
        activeTab === tab.id ? (
          <TargetPanel
            key={tab.id}
            target={tab.id}
            label={tab.label}
            initial={initialByTarget[tab.id]}
          />
        ) : null,
      )}
    </div>
  );
}

// ============================================================================
// TargetPanel — formulaire pour une cible donnée
// ============================================================================

interface TargetPanelProps {
  target: ShortlistTarget;
  label: string;
  initial: ShortlistCriteria | null;
}

function TargetPanel({ target, label, initial }: TargetPanelProps) {
  const [caMiniEur, setCaMiniEur] = useState(initial?.caMiniEur?.toString() ?? "");
  const [effectifMini, setEffectifMini] = useState(initial?.effectifMini?.toString() ?? "");
  const [requiredSpecialties, setRequiredSpecialties] = useState(
    initial?.requiredSpecialties?.join(", ") ?? "",
  );
  const [minSeniorsRequired, setMinSeniorsRequired] = useState(
    initial?.minSeniorsRequired?.toString() ?? "0",
  );
  const [maxSolicitations, setMaxSolicitations] = useState(
    initial?.maxSolicitations?.toString() ?? "",
  );
  const [allowedDepartments, setAllowedDepartments] = useState(
    initial?.allowedDepartments?.join(", ") ?? "",
  );
  const [maxResults, setMaxResults] = useState(initial?.maxResults?.toString() ?? "");
  const [aiNotesWeight, setAiNotesWeight] = useState(initial?.aiNotesWeight ?? "0.5");

  const [isPending, startTransition] = useTransition();
  const [saveResult, setSaveResult] = useState<
    | { ok: true }
    | { ok: false; error: string; detail?: string; fieldErrors?: Record<string, string[]> }
    | null
  >(null);

  /** Convertit une string "34, 30, 11" en tableau ["34", "30", "11"]. */
  function parseCommaSep(raw: string): string[] {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaveResult(null);

    const payload = {
      caMiniEur: caMiniEur === "" ? null : parseInt(caMiniEur, 10),
      effectifMini: effectifMini === "" ? null : parseInt(effectifMini, 10),
      requiredSpecialties: parseCommaSep(requiredSpecialties),
      minSeniorsRequired: parseInt(minSeniorsRequired || "0", 10),
      maxSolicitations: maxSolicitations === "" ? null : parseInt(maxSolicitations, 10),
      allowedDepartments: parseCommaSep(allowedDepartments),
      maxResults: maxResults === "" ? null : parseInt(maxResults, 10),
      aiNotesWeight,
    };

    startTransition(async () => {
      const result = await upsertShortlistCriteria(target, payload);
      setSaveResult(result);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" aria-label={`Critères — ${label}`}>
      {/* En-tête section */}
      <p className="text-sm text-muted">
        Critères appliqués lors de la génération des short-lists pour les{" "}
        <strong className="font-medium text-ink">{label.toLowerCase()}</strong>. Laisser un champ
        vide = pas de filtre sur ce critère.
      </p>

      {/* Grille de champs */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {/* CA minimum */}
        <div>
          <label className="mb-1 block text-sm font-medium text-ink" htmlFor={`${target}-ca`}>
            CA minimum (€)
          </label>
          <input
            id={`${target}-ca`}
            type="number"
            min="0"
            step="10000"
            value={caMiniEur}
            onChange={(e) => setCaMiniEur(e.target.value)}
            placeholder="ex. 500000 (laissez vide = sans filtre)"
            className="focus:ring-brand-red/40 w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2"
          />
        </div>

        {/* Effectif minimum */}
        <div>
          <label className="mb-1 block text-sm font-medium text-ink" htmlFor={`${target}-effectif`}>
            Effectif minimum
          </label>
          <input
            id={`${target}-effectif`}
            type="number"
            min="0"
            value={effectifMini}
            onChange={(e) => setEffectifMini(e.target.value)}
            placeholder="ex. 5 (laissez vide = sans filtre)"
            className="focus:ring-brand-red/40 w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2"
          />
        </div>

        {/* Nb seniors requis */}
        <div>
          <label className="mb-1 block text-sm font-medium text-ink" htmlFor={`${target}-seniors`}>
            Nb seniors requis ({">"} 10 ans)
          </label>
          <input
            id={`${target}-seniors`}
            type="number"
            min="0"
            value={minSeniorsRequired}
            onChange={(e) => setMinSeniorsRequired(e.target.value)}
            placeholder="0 = désactivé"
            className="focus:ring-brand-red/40 w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2"
          />
        </div>

        {/* Max sollicitations simultanées */}
        <div>
          <label className="mb-1 block text-sm font-medium text-ink" htmlFor={`${target}-maxsol`}>
            Max sollicitations simultanées
          </label>
          <input
            id={`${target}-maxsol`}
            type="number"
            min="1"
            value={maxSolicitations}
            onChange={(e) => setMaxSolicitations(e.target.value)}
            placeholder="ex. 5 (laissez vide = sans limite)"
            className="focus:ring-brand-red/40 w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2"
          />
        </div>

        {/* Max résultats short-list */}
        <div>
          <label className="mb-1 block text-sm font-medium text-ink" htmlFor={`${target}-maxres`}>
            Max résultats dans la short-list
          </label>
          <input
            id={`${target}-maxres`}
            type="number"
            min="1"
            value={maxResults}
            onChange={(e) => setMaxResults(e.target.value)}
            placeholder="ex. 10 (laissez vide = sans limite)"
            className="focus:ring-brand-red/40 w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2"
          />
        </div>
      </div>

      {/* Spécialités requises */}
      <div>
        <label
          className="mb-1 block text-sm font-medium text-ink"
          htmlFor={`${target}-specialties`}
        >
          Spécialités requises{" "}
          <span className="font-normal text-muted">(séparées par des virgules)</span>
        </label>
        <input
          id={`${target}-specialties`}
          type="text"
          value={requiredSpecialties}
          onChange={(e) => setRequiredSpecialties(e.target.value)}
          placeholder="ex. MOE, Réhabilitation, Équipements sportifs"
          className="focus:ring-brand-red/40 w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2"
        />
        <p className="mt-1 text-xs text-muted">
          Au moins l&apos;une de ces spécialités doit matcher. Vide = toutes spécialités acceptées.
        </p>
      </div>

      {/* Départements autorisés */}
      <div>
        <label className="mb-1 block text-sm font-medium text-ink" htmlFor={`${target}-depts`}>
          Départements autorisés{" "}
          <span className="font-normal text-muted">(codes séparés par des virgules)</span>
        </label>
        <input
          id={`${target}-depts`}
          type="text"
          value={allowedDepartments}
          onChange={(e) => setAllowedDepartments(e.target.value)}
          placeholder="ex. 34, 30, 11, 13 (vide = tous départements)"
          className="focus:ring-brand-red/40 w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2"
        />
      </div>

      {/* Poids IA notes internes */}
      <div>
        <label className="mb-1 block text-sm font-medium text-ink" htmlFor={`${target}-ai`}>
          Poids IA — notes internes{" "}
          <span className="font-normal text-muted">
            (0 = ignorer les notes Haiku, 1 = critère dominant)
          </span>
        </label>
        <div className="flex items-center gap-4">
          <input
            id={`${target}-ai`}
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={aiNotesWeight}
            onChange={(e) => setAiNotesWeight(e.target.value)}
            className="w-full accent-brand-red"
          />
          <span className="w-10 shrink-0 text-center font-mono text-sm font-semibold text-ink">
            {aiNotesWeight}
          </span>
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-muted">
          <span>0 — filtres uniquement</span>
          <span className="text-center">0.5 — équilibré</span>
          <span>1 — IA dominant</span>
        </div>
      </div>

      {/* Message de retour */}
      {saveResult && (
        <div
          role="alert"
          className={`rounded-md border px-4 py-3 text-sm ${
            saveResult.ok
              ? "border-success bg-success-bg text-success"
              : "border-l-4 border-line border-l-error bg-error-bg text-error"
          }`}
        >
          {saveResult.ok ? (
            "Critères enregistrés avec succès."
          ) : (
            <>
              <strong className="mr-1 font-semibold">Erreur :</strong>
              {saveResult.error === "invalid_input"
                ? "Données invalides — vérifiez les champs."
                : saveResult.error === "forbidden_role"
                  ? "Accès refusé — rôle admin requis."
                  : `Erreur inattendue${saveResult.detail ? ` : ${saveResult.detail}` : "."}`}
            </>
          )}
        </div>
      )}

      {/* Bouton Enregistrer */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending}
          className="hover:bg-brand-red/90 focus:ring-brand-red/40 rounded-full bg-brand-red px-5 py-2 text-sm font-medium text-white focus:outline-none focus:ring-2 disabled:opacity-60"
        >
          {isPending ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}
