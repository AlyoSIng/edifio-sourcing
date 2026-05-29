"use client";

/**
 * SearchProfilesClient — UI de gestion multi-profils (Tâche #29, 2026-05-27).
 *
 * Client Component : gère l'état du formulaire inline de création/édition et
 * déclenche les Server Actions CRUD.
 *
 * Fonctionnalités :
 *  - Liste des profils avec badges (défaut, inactif, stats)
 *  - Boutons Définir par défaut / Modifier / Supprimer par ligne
 *  - Formulaire inline de création ou d'édition (même champs que ProfileForm
 *    mais simplifié : name + keywords + CPV + geo + market_types)
 *  - Messages d'erreur inline + toast succès
 */

import { useState, useTransition } from "react";

import { ChipInput } from "@/components/ui/ChipInput";
import { MARKET_TYPES, type MarketType } from "@/lib/profile/schema";

import type { SearchProfileListItem } from "../profil/search-profiles-actions";
import {
  createSearchProfileAction,
  deleteSearchProfileAction,
  duplicateSearchProfileAction,
  setDefaultProfileAction,
  updateSearchProfileAction,
  type ProfileActionResult,
} from "../profil/search-profiles-actions";

// ============================================================================
// Types et constantes
// ============================================================================

const MARKET_TYPE_LABELS: Record<MarketType, string> = {
  travaux: "Travaux",
  services: "Services",
  fournitures: "Fournitures",
  moe: "Maîtrise d'œuvre",
};

const CPV_REGEX = /^\d{2,8}$/;
const FR_DEPT_REGEX = /^(2[AB]|\d{2,3})$/;

function validateCpv(v: string) {
  return CPV_REGEX.test(v) ? null : "Code CPV invalide (2 à 8 chiffres)";
}
function validateGeo(v: string) {
  return FR_DEPT_REGEX.test(v) ? null : "Département FR attendu (01-95, 2A/2B, ou DROM 971-976)";
}

interface FormState {
  name: string;
  positive: string[];
  negative: string[];
  exact: string[];
  cpvCodes: string[];
  geoZones: string[];
  marketTypes: MarketType[];
}

function emptyForm(): FormState {
  return {
    name: "",
    positive: [],
    negative: [],
    exact: [],
    cpvCodes: [],
    geoZones: [],
    marketTypes: [],
  };
}

function profileToForm(p: SearchProfileListItem): FormState {
  return {
    name: p.name,
    positive: p.keywords.positive,
    negative: p.keywords.negative,
    exact: p.keywords.exact,
    cpvCodes: p.cpvCodes,
    geoZones: p.geoZones,
    marketTypes: (p.marketTypes as MarketType[]).filter((mt): mt is MarketType =>
      (MARKET_TYPES as readonly string[]).includes(mt),
    ),
  };
}

function mapError(result: Extract<ProfileActionResult, { ok: false }>): string {
  switch (result.error) {
    case "not_authenticated":
      return "Session expirée. Rafraîchis la page.";
    case "forbidden_domain":
      return "Domaine non autorisé (@alyosingenierie.fr requis).";
    case "forbidden_role":
      return "Action réservée aux administrateurs.";
    case "invalid_input":
      return "formErrors" in result && result.formErrors.length > 0
        ? result.formErrors.join(" · ")
        : "Champs invalides. Vérifie les erreurs ci-dessous.";
    case "profile_not_found":
      return "Profil introuvable. Actualise la page.";
    case "last_active_profile":
      return "Impossible de supprimer le seul profil actif de l'organisation.";
    case "internal_error":
    default:
      return "Erreur technique. Réessaye dans quelques instants.";
  }
}

// ============================================================================
// Composant principal
// ============================================================================

interface SearchProfilesClientProps {
  profiles: SearchProfileListItem[];
}

export function SearchProfilesClient({ profiles: initialProfiles }: SearchProfilesClientProps) {
  const [profiles, setProfiles] = useState<SearchProfileListItem[]>(initialProfiles);
  const [isPending, startTransition] = useTransition();

  // Mode : null = liste seule ; "create" = formulaire nouveau ; uuid = édition inline
  const [mode, setMode] = useState<null | "create" | string>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // ---------- helpers ----------

  function showSuccess(msg: string) {
    setSuccessMsg(msg);
    window.setTimeout(() => setSuccessMsg(null), 3_000);
  }

  function resetMode() {
    setMode(null);
    setForm(emptyForm());
    setActionError(null);
  }

  function openCreate() {
    setMode("create");
    setForm(emptyForm());
    setActionError(null);
  }

  function openEdit(p: SearchProfileListItem) {
    setMode(p.id);
    setForm(profileToForm(p));
    setActionError(null);
  }

  // ---------- actions ----------

  function handleSetDefault(profileId: string) {
    setActionError(null);
    startTransition(async () => {
      const res = await setDefaultProfileAction(profileId);
      if (!res.ok) {
        setActionError(mapError(res));
      } else {
        setProfiles((prev) => prev.map((p) => ({ ...p, isDefault: p.id === profileId })));
        showSuccess("Profil par défaut mis à jour.");
      }
    });
  }

  function handleDelete(profileId: string, name: string) {
    if (!window.confirm(`Supprimer le profil « ${name} » ? Cette action est irréversible.`)) return;
    setActionError(null);
    startTransition(async () => {
      const res = await deleteSearchProfileAction(profileId);
      if (!res.ok) {
        setActionError(mapError(res));
      } else {
        setProfiles((prev) => prev.filter((p) => p.id !== profileId));
        showSuccess(`Profil « ${name} » supprimé.`);
      }
    });
  }

  function handleDuplicate(profileId: string, name: string) {
    setActionError(null);
    startTransition(async () => {
      const res = await duplicateSearchProfileAction(profileId);
      if (!res.ok) {
        setActionError(mapError(res));
      } else {
        // La revalidatePath côté serveur mettra à jour la liste ; on ajoute
        // un item optimiste minimal pour feedback immédiat.
        const newItem: SearchProfileListItem = {
          id: res.profileId ?? "",
          name: `${name} (copie)`,
          isDefault: false,
          displayOrder: 0,
          active: true,
          keywordsPositiveCount: 0,
          keywordsNegativeCount: 0,
          cpvCodesCount: 0,
          geoZonesCount: 0,
          keywords: { positive: [], negative: [], exact: [] },
          cpvCodes: [],
          geoZones: [],
          marketTypes: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        setProfiles((prev) => [...prev, newItem]);
        showSuccess(`Profil « ${name} » dupliqué en « ${name} (copie) ».`);
      }
    });
  }

  function handleSubmitCreate(e: React.FormEvent) {
    e.preventDefault();
    setActionError(null);
    startTransition(async () => {
      const res = await createSearchProfileAction({
        name: form.name,
        keywords: { positive: form.positive, negative: form.negative, exact: form.exact },
        cpv_codes: form.cpvCodes,
        geo_zones: form.geoZones,
        market_types: form.marketTypes,
      });
      if (!res.ok) {
        setActionError(mapError(res));
      } else {
        // Le Server Component parent sera revalidé ; on optimiste-update la liste.
        const newItem: SearchProfileListItem = {
          id: res.profileId ?? "",
          name: form.name,
          isDefault: false,
          displayOrder: 0,
          active: true,
          keywordsPositiveCount: form.positive.length,
          keywordsNegativeCount: form.negative.length,
          cpvCodesCount: form.cpvCodes.length,
          geoZonesCount: form.geoZones.length,
          keywords: { positive: form.positive, negative: form.negative, exact: form.exact },
          cpvCodes: form.cpvCodes,
          geoZones: form.geoZones,
          marketTypes: form.marketTypes,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        setProfiles((prev) => [...prev, newItem]);
        resetMode();
        showSuccess(`Profil « ${form.name} » créé.`);
      }
    });
  }

  function handleSubmitEdit(profileId: string) {
    return async (e: React.FormEvent) => {
      e.preventDefault();
      setActionError(null);
      startTransition(async () => {
        const res = await updateSearchProfileAction(profileId, {
          name: form.name,
          keywords: { positive: form.positive, negative: form.negative, exact: form.exact },
          cpv_codes: form.cpvCodes,
          geo_zones: form.geoZones,
          market_types: form.marketTypes,
        });
        if (!res.ok) {
          setActionError(mapError(res));
        } else {
          setProfiles((prev) =>
            prev.map((p) =>
              p.id === profileId
                ? {
                    ...p,
                    name: form.name,
                    keywords: {
                      positive: form.positive,
                      negative: form.negative,
                      exact: form.exact,
                    },
                    cpvCodes: form.cpvCodes,
                    geoZones: form.geoZones,
                    marketTypes: form.marketTypes,
                    keywordsPositiveCount: form.positive.length,
                    keywordsNegativeCount: form.negative.length,
                    cpvCodesCount: form.cpvCodes.length,
                    geoZonesCount: form.geoZones.length,
                    updatedAt: new Date(),
                  }
                : p,
            ),
          );
          resetMode();
          showSuccess(`Profil « ${form.name} » mis à jour.`);
        }
      });
    };
  }

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="space-y-6">
      {/* Toast succès */}
      {successMsg ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-sm border-l-4 border-success bg-success-bg px-4 py-3 text-sm text-success"
        >
          {successMsg}
        </div>
      ) : null}

      {/* Erreur globale action */}
      {actionError ? (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-sm border-l-4 border-error bg-error-bg px-4 py-3 text-sm text-error"
        >
          <strong className="mr-1 font-semibold">Erreur :</strong>
          {actionError}
        </div>
      ) : null}

      {/* Liste des profils */}
      {profiles.length === 0 ? (
        <p className="text-sm text-muted">Aucun profil de recherche. Créez-en un ci-dessous.</p>
      ) : (
        <ul className="space-y-3">
          {profiles.map((p) => (
            <li key={p.id}>
              <div className="rounded-md border border-line bg-white px-4 py-3">
                {/* Ligne titre + badges + actions */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-sm font-semibold text-ink">{p.name}</span>
                    {p.isDefault ? (
                      <span className="rounded-sm bg-brand-red px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                        Défaut
                      </span>
                    ) : null}
                    {!p.active ? (
                      <span className="rounded-sm bg-line-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                        Inactif
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {!p.isDefault ? (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleSetDefault(p.id)}
                        className="rounded-sm border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-paper-2 disabled:opacity-50"
                      >
                        Définir par défaut
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => (mode === p.id ? resetMode() : openEdit(p))}
                      className="rounded-sm border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-paper-2 disabled:opacity-50"
                    >
                      {mode === p.id ? "Annuler" : "Modifier"}
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleDuplicate(p.id, p.name)}
                      className="rounded-sm border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-paper-2 disabled:opacity-50"
                    >
                      Dupliquer
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleDelete(p.id, p.name)}
                      className="rounded-sm border border-line px-2.5 py-1 text-xs font-medium text-error transition hover:bg-error-bg disabled:opacity-50"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>

                {/* Stats */}
                <div className="mt-1.5 flex flex-wrap gap-3 text-[11px] text-muted">
                  <span>{p.keywordsPositiveCount} mots-clés positifs</span>
                  <span>{p.cpvCodesCount} CPV</span>
                  <span>{p.geoZonesCount} dép.</span>
                  {p.marketTypes.length > 0 ? (
                    <span>
                      {p.marketTypes
                        .map((mt) => MARKET_TYPE_LABELS[mt as MarketType] ?? mt)
                        .join(", ")}
                    </span>
                  ) : null}
                </div>

                {/* Formulaire d'édition inline */}
                {mode === p.id ? (
                  <div className="mt-4 border-t border-line pt-4">
                    <ProfileInlineForm
                      form={form}
                      setForm={setForm}
                      isPending={isPending}
                      onSubmit={handleSubmitEdit(p.id)}
                      onCancel={resetMode}
                      submitLabel="Enregistrer"
                    />
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Bouton créer + formulaire création */}
      {mode !== "create" ? (
        <button
          type="button"
          onClick={openCreate}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-sm border border-line bg-white px-3 py-2 text-sm font-medium text-ink transition hover:bg-paper-2 disabled:opacity-50"
        >
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5 shrink-0"
            aria-hidden
          >
            <path d="M8 3v10M3 8h10" />
          </svg>
          Créer un profil
        </button>
      ) : (
        <div className="rounded-md border border-line bg-paper p-4">
          <h2 className="mb-4 font-display text-base font-semibold text-ink">
            Nouveau profil de recherche
          </h2>
          <ProfileInlineForm
            form={form}
            setForm={setForm}
            isPending={isPending}
            onSubmit={handleSubmitCreate}
            onCancel={resetMode}
            submitLabel="Créer"
          />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Formulaire inline réutilisable (création + édition)
// ============================================================================

interface ProfileInlineFormProps {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  isPending: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  submitLabel: string;
}

function ProfileInlineForm({
  form,
  setForm,
  isPending,
  onSubmit,
  onCancel,
  submitLabel,
}: ProfileInlineFormProps) {
  return (
    <form onSubmit={onSubmit} aria-busy={isPending} className="space-y-5">
      {/* Nom */}
      <div>
        <label className="block">
          <span className="font-mono text-[11px] uppercase tracking-wider text-muted">
            Nom du profil <span className="text-error">*</span>
          </span>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            disabled={isPending}
            placeholder="ex. MOE Île-de-France"
            className="mt-1 block w-full rounded-sm border border-line-2 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand-red focus:ring-1 focus:ring-brand-red"
          />
        </label>
      </div>

      {/* Mots-clés positifs */}
      <fieldset className="space-y-1">
        <legend className="font-display text-sm font-semibold text-ink">Mots-clés positifs</legend>
        <ChipInput
          name="keywords.positive"
          values={form.positive}
          onChange={(v) => setForm((f) => ({ ...f, positive: v }))}
          placeholder="ex. rénovation, BTP"
          disabled={isPending}
        />
      </fieldset>

      {/* Mots-clés négatifs */}
      <fieldset className="space-y-1">
        <legend className="font-display text-sm font-semibold text-ink">Mots-clés négatifs</legend>
        <ChipInput
          name="keywords.negative"
          values={form.negative}
          onChange={(v) => setForm((f) => ({ ...f, negative: v }))}
          placeholder="ex. informatique, logiciel"
          disabled={isPending}
        />
      </fieldset>

      {/* Codes CPV */}
      <fieldset className="space-y-1">
        <legend className="font-display text-sm font-semibold text-ink">Codes CPV</legend>
        <ChipInput
          name="cpv_codes"
          values={form.cpvCodes}
          onChange={(v) => setForm((f) => ({ ...f, cpvCodes: v }))}
          placeholder="ex. 45000000, 71"
          validate={validateCpv}
          disabled={isPending}
        />
      </fieldset>

      {/* Zones géo */}
      <fieldset className="space-y-1">
        <legend className="font-display text-sm font-semibold text-ink">
          Zones géographiques (départements FR)
        </legend>
        <ChipInput
          name="geo_zones"
          values={form.geoZones}
          onChange={(v) => setForm((f) => ({ ...f, geoZones: v }))}
          placeholder="ex. 75, 92, 93, 94"
          validate={validateGeo}
          disabled={isPending}
        />
      </fieldset>

      {/* Types de marché */}
      <fieldset className="space-y-1">
        <legend className="font-display text-sm font-semibold text-ink">Types de marché</legend>
        <div className="flex flex-wrap gap-2 pt-1">
          {MARKET_TYPES.map((mt) => {
            const checked = form.marketTypes.includes(mt);
            return (
              <label
                key={mt}
                className={`flex cursor-pointer items-center gap-2 rounded-sm border px-3 py-1.5 text-xs transition ${
                  checked
                    ? "border-brand-red bg-brand-red text-white"
                    : "border-line-2 bg-white text-ink hover:bg-paper-2"
                } ${isPending ? "pointer-events-none opacity-60" : ""}`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
                  disabled={isPending}
                  onChange={() => {
                    setForm((f) => ({
                      ...f,
                      marketTypes: f.marketTypes.includes(mt)
                        ? f.marketTypes.filter((x) => x !== mt)
                        : [...f.marketTypes, mt],
                    }));
                  }}
                />
                {MARKET_TYPE_LABELS[mt]}
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-sm bg-brand-red px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-red-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red focus-visible:ring-offset-1 disabled:bg-line-2 disabled:opacity-70"
        >
          {isPending ? "En cours…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="rounded-sm border border-line-2 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-paper-2 disabled:opacity-60"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
