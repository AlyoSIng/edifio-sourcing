"use client";

/**
 * `ProfileForm` — édition du profil de recherche AlyoS (P2 Gate 6).
 *
 * Composant client contrôlé : il détient l'état du form via `useState` et
 * appelle la Server Action `updateProfileAction` au submit. La page parente
 * (Server Component) injecte les valeurs initiales pré-remplies depuis BDD.
 *
 * 8 sections d'édition (Q1-Q5 Board 22/05) :
 *  1. Mots-clés positifs  (ChipInput)
 *  2. Mots-clés négatifs  (ChipInput)
 *  3. Mots-clés exact     (ChipInput, note explicative que la logique exact
 *                          n'est pas encore implémentée côté `filter.ts`)
 *  4. Codes CPV           (ChipInput, validation regex 2-8 digits)
 *  5. Zones géo FR        (ChipInput, validation regex département FR)
 *  6. Types de marché     (Multi-select enum fermé travaux/services/fournitures/moe)
 *  7. Montant min         (number input, optional ≥ 0)
 *  8. Montant max         (number input, optional ≥ 0, ≥ montant min via Zod refine)
 *
 * États :
 *  - `idle`     : form prêt
 *  - `pending`  : submit en cours (bouton désactivé, état loading)
 *  - `success`  : toast vert 3s puis idle
 *  - `error`    : message d'erreur global + fieldErrors inline
 *
 * Accessibilité :
 *  - Chaque section a un `<fieldset>` + `<legend>`
 *  - Erreurs `role="alert"` côté ChipInput + globalement
 *  - `aria-busy` pendant submit
 *  - Toast succès `role="status"`
 *
 * Naming : on garde les libellés FR côté UI mais les champs Zod sont en
 * snake_case (cohérence audit log A3). Le mapping snake→camel est interne.
 */

import { useState, useTransition } from "react";

import { ChipInput } from "@/components/ui/ChipInput";
import { MARKET_TYPES, type MarketType } from "@/lib/profile/schema";

import { updateProfileAction, type UpdateProfileResult } from "./actions";

// ============================================================================
// Types — valeurs initiales pré-remplies par le Server Component
// ============================================================================

/**
 * Valeurs initiales — mirror exact des champs éditables côté `SearchProfilePatch`
 * mais avec les montants en `number | null` (l'UI manipule des nombres, le
 * mapping vers numeric string Postgres est fait dans `actions.ts`).
 */
export interface ProfileFormInitialValues {
  positive: string[];
  negative: string[];
  exact: string[];
  cpv_codes: string[];
  geo_zones: string[];
  market_types: MarketType[];
  amount_min: number | null;
  amount_max: number | null;
}

interface ProfileFormProps {
  initialValues: ProfileFormInitialValues;
  profileName: string;
}

// ============================================================================
// Validation locale légère (UX) — Zod côté serveur reste la source de vérité
// ============================================================================

const CPV_REGEX = /^\d{2,8}$/;
const FR_DEPT_REGEX = /^(2[AB]|\d{2,3})$/;

function validateCpv(value: string): string | null {
  return CPV_REGEX.test(value) ? null : "Code CPV invalide (2 à 8 chiffres)";
}

function validateGeoZone(value: string): string | null {
  return FR_DEPT_REGEX.test(value)
    ? null
    : "Département FR attendu (01-95, 2A/2B, ou DROM 971-976)";
}

// ============================================================================
// Composant
// ============================================================================

const MARKET_TYPE_LABELS: Record<MarketType, string> = {
  travaux: "Travaux",
  services: "Services",
  fournitures: "Fournitures",
  moe: "Maîtrise d'œuvre",
};

export function ProfileForm({ initialValues, profileName }: ProfileFormProps) {
  // État contrôlé — chaque champ géré séparément (pas de useFormState car on
  // veut un contrôle fin par section avec ChipInput, plus simple en useState).
  const [positive, setPositive] = useState<string[]>(initialValues.positive);
  const [negative, setNegative] = useState<string[]>(initialValues.negative);
  const [exactKeywords, setExactKeywords] = useState<string[]>(initialValues.exact);
  const [cpvCodes, setCpvCodes] = useState<string[]>(initialValues.cpv_codes);
  const [geoZones, setGeoZones] = useState<string[]>(initialValues.geo_zones);
  const [marketTypes, setMarketTypes] = useState<MarketType[]>(initialValues.market_types);
  const [amountMin, setAmountMin] = useState<string>(
    initialValues.amount_min === null ? "" : String(initialValues.amount_min),
  );
  const [amountMax, setAmountMax] = useState<string>(
    initialValues.amount_max === null ? "" : String(initialValues.amount_max),
  );

  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<UpdateProfileResult | null>(null);
  const [successVisible, setSuccessVisible] = useState(false);

  // ----- reset -----
  function handleReset() {
    setPositive(initialValues.positive);
    setNegative(initialValues.negative);
    setExactKeywords(initialValues.exact);
    setCpvCodes(initialValues.cpv_codes);
    setGeoZones(initialValues.geo_zones);
    setMarketTypes(initialValues.market_types);
    setAmountMin(initialValues.amount_min === null ? "" : String(initialValues.amount_min));
    setAmountMax(initialValues.amount_max === null ? "" : String(initialValues.amount_max));
    setResult(null);
  }

  // ----- submit -----
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setResult(null);
    setSuccessVisible(false);

    // Parse local des montants (string → number | null) — Zod côté serveur
    // re-valide derrière. On envoie `null` si chaîne vide, sinon le nombre.
    const parsedMin = amountMin.trim() === "" ? null : Number(amountMin);
    const parsedMax = amountMax.trim() === "" ? null : Number(amountMax);

    const payload = {
      keywords: {
        positive,
        negative,
        exact: exactKeywords,
      },
      cpv_codes: cpvCodes,
      geo_zones: geoZones,
      market_types: marketTypes,
      amount_min: parsedMin,
      amount_max: parsedMax,
    };

    startTransition(async () => {
      const res = await updateProfileAction(payload);
      setResult(res);
      if (res.ok) {
        setSuccessVisible(true);
        window.setTimeout(() => setSuccessVisible(false), 3_000);
      }
    });
  }

  // ----- erreurs Zod → fieldErrors par section -----
  const fieldErrors: Record<string, string[]> =
    result && !result.ok && result.error === "invalid_input" ? result.fieldErrors : {};

  // Pour les sous-champs `keywords.positive` etc., Zod émet la clé avec un
  // path nested. On extrait les erreurs par sous-clé pour les passer à
  // ChipInput. `.flatten()` aplatit en `fieldErrors["keywords"]` global avec
  // toutes les erreurs ; on les remonte tels quels en top de form pour
  // simplicité MVP.
  const globalError =
    result && !result.ok
      ? mapErrorToGlobalMessage(result.error, "formErrors" in result ? result.formErrors : [])
      : null;

  return (
    <form onSubmit={handleSubmit} aria-busy={isPending} className="space-y-7">
      {/* Toast succès */}
      {successVisible ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-sm border-l-4 border-success bg-success-bg px-4 py-3 text-sm text-success"
        >
          Profil <strong className="font-semibold">{profileName}</strong> enregistré avec succès.
        </div>
      ) : null}

      {/* Erreur globale */}
      {globalError ? (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-sm border-l-4 border-error bg-error-bg px-4 py-3 text-sm text-error"
        >
          <strong className="mr-1 font-semibold">Action impossible :</strong>
          {globalError}
        </div>
      ) : null}

      {/* SECTION 1 — Mots-clés positifs */}
      <fieldset className="space-y-2 border-t border-line pt-6 first:border-t-0 first:pt-0">
        <legend className="font-display text-base font-semibold text-ink">
          Mots-clés positifs
        </legend>
        <p className="text-xs text-muted">
          Au moins un doit matcher dans le titre d&apos;un AO (sinon rejeté). Insensible à la casse
          et aux accents.
        </p>
        <ChipInput
          name="keywords.positive"
          values={positive}
          onChange={setPositive}
          placeholder="ex. rénovation, BTP, construction"
          disabled={isPending}
          errors={fieldErrors["keywords"]}
        />
      </fieldset>

      {/* SECTION 2 — Mots-clés négatifs */}
      <fieldset className="space-y-2 border-t border-line pt-6">
        <legend className="font-display text-base font-semibold text-ink">
          Mots-clés négatifs
        </legend>
        <p className="text-xs text-muted">
          Si un seul matche le titre, l&apos;AO est rejeté. Insensible à la casse et aux accents.
        </p>
        <ChipInput
          name="keywords.negative"
          values={negative}
          onChange={setNegative}
          placeholder="ex. informatique, mobilier, logiciel"
          disabled={isPending}
        />
      </fieldset>

      {/* SECTION 3 — Mots-clés exact */}
      <fieldset className="space-y-2 border-t border-line pt-6">
        <legend className="font-display text-base font-semibold text-ink">Mots-clés exact</legend>
        <p className="text-xs text-muted">
          Recherche d&apos;expression exacte dans le titre (bonus de score si match). NB : la
          logique « exact » n&apos;est pas encore câblée côté filtre, à clarifier avec la CTO avant
          V2.
        </p>
        <ChipInput
          name="keywords.exact"
          values={exactKeywords}
          onChange={setExactKeywords}
          placeholder="ex. AlyoS, edifio"
          disabled={isPending}
        />
      </fieldset>

      {/* SECTION 4 — Codes CPV */}
      <fieldset className="space-y-2 border-t border-line pt-6">
        <legend className="font-display text-base font-semibold text-ink">Codes CPV</legend>
        <p className="text-xs text-muted">
          2 à 8 chiffres. 2 digits = famille (ex. <code className="font-mono">45</code> tous travaux
          BTP) ; 8 digits = code exact.
        </p>
        <ChipInput
          name="cpv_codes"
          values={cpvCodes}
          onChange={setCpvCodes}
          placeholder="ex. 45000000, 71"
          validate={validateCpv}
          disabled={isPending}
          errors={fieldErrors["cpv_codes"]}
        />
      </fieldset>

      {/* SECTION 5 — Zones géographiques FR */}
      <fieldset className="space-y-2 border-t border-line pt-6">
        <legend className="font-display text-base font-semibold text-ink">
          Zones géographiques (départements FR)
        </legend>
        <p className="text-xs text-muted">
          Codes département : 01 à 95 (métropole), 2A / 2B (Corse), 971 à 976 (DROM).
        </p>
        <ChipInput
          name="geo_zones"
          values={geoZones}
          onChange={setGeoZones}
          placeholder="ex. 33, 40, 47, 64, 2A"
          validate={validateGeoZone}
          disabled={isPending}
          errors={fieldErrors["geo_zones"]}
        />
      </fieldset>

      {/* SECTION 6 — Types de marché */}
      <fieldset className="space-y-2 border-t border-line pt-6">
        <legend className="font-display text-base font-semibold text-ink">Types de marché</legend>
        <p className="text-xs text-muted">
          Sélectionner un ou plusieurs types. Cocher tous = pas de filtre.
        </p>
        <div className="flex flex-wrap gap-2">
          {MARKET_TYPES.map((mt) => {
            const checked = marketTypes.includes(mt);
            return (
              <label
                key={mt}
                className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${
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
                    setMarketTypes((prev) =>
                      prev.includes(mt) ? prev.filter((x) => x !== mt) : [...prev, mt],
                    );
                  }}
                />
                {MARKET_TYPE_LABELS[mt]}
              </label>
            );
          })}
        </div>
        {fieldErrors["market_types"] ? (
          <ul role="alert" className="text-xs text-error">
            {fieldErrors["market_types"].map((msg, i) => (
              <li key={i}>{msg}</li>
            ))}
          </ul>
        ) : null}
      </fieldset>

      {/* SECTION 7 & 8 — Montants */}
      <fieldset className="space-y-2 border-t border-line pt-6">
        <legend className="font-display text-base font-semibold text-ink">
          Plage de montants (EUR)
        </legend>
        <p className="text-xs text-muted">
          Bornes optionnelles. Si renseignées, le montant min doit être inférieur ou égal au montant
          max.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted">
              Montant min
            </span>
            <input
              type="number"
              name="amount_min"
              value={amountMin}
              onChange={(e) => setAmountMin(e.target.value)}
              disabled={isPending}
              min={0}
              step="0.01"
              placeholder="—"
              className="mt-1 block w-full rounded-sm border border-line-2 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand-red focus:ring-1 focus:ring-brand-red"
            />
            {fieldErrors["amount_min"] ? (
              <ul role="alert" className="mt-1 text-xs text-error">
                {fieldErrors["amount_min"].map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
              </ul>
            ) : null}
          </label>
          <label className="block">
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted">
              Montant max
            </span>
            <input
              type="number"
              name="amount_max"
              value={amountMax}
              onChange={(e) => setAmountMax(e.target.value)}
              disabled={isPending}
              min={0}
              step="0.01"
              placeholder="—"
              className="mt-1 block w-full rounded-sm border border-line-2 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand-red focus:ring-1 focus:ring-brand-red"
            />
            {fieldErrors["amount_max"] ? (
              <ul role="alert" className="mt-1 text-xs text-error">
                {fieldErrors["amount_max"].map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
              </ul>
            ) : null}
          </label>
        </div>
      </fieldset>

      {/* Actions */}
      <div className="flex items-center gap-3 border-t border-line pt-6">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-brand-red px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-red-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red focus-visible:ring-offset-1 disabled:bg-line-2 disabled:opacity-70"
        >
          {isPending ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button
          type="button"
          onClick={handleReset}
          disabled={isPending}
          className="rounded-full border border-line-2 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-paper-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-line-2 disabled:opacity-60"
        >
          Annuler les modifications
        </button>
      </div>
    </form>
  );
}

// ============================================================================
// Mapping erreur → message FR
// ============================================================================

function mapErrorToGlobalMessage(
  error: Exclude<UpdateProfileResult, { ok: true }>["error"],
  formErrors: string[],
): string {
  switch (error) {
    case "not_authenticated":
      return "Session expirée. Rafraîchis la page pour te reconnecter.";
    case "forbidden_domain":
      return "Domaine non autorisé. Cette interface est réservée aux comptes @alyosingenierie.fr.";
    case "forbidden_role":
      return "Action réservée aux administrateurs.";
    case "invalid_input":
      if (formErrors.length > 0) return formErrors.join(" · ");
      return "Un ou plusieurs champs sont invalides. Vérifie les erreurs ci-dessous.";
    case "profile_not_found":
      return "Profil de recherche introuvable. Contacte un administrateur.";
    case "internal_error":
    default:
      return "Erreur technique. Réessaye dans quelques instants.";
  }
}
