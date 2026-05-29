"use client";

/**
 * OrgSettingsForm — formulaire d'édition des paramètres d'une organisation
 *
 * Client Component — appelle `updateOrgAction` via useTransition.
 * Champs : name, subscriptionTier, siren, siret.
 *
 * Même pattern de style que `NewOrgForm` / `FaqItemForm`.
 */

import { useState, useTransition } from "react";

import type { Organization } from "@/db/schema/organizations";

import { updateOrgAction } from "../actions";

interface OrgSettingsFormProps {
  org: Pick<Organization, "id" | "name" | "subscriptionTier" | "siren" | "siret">;
}

const TIER_OPTIONS = [
  { value: "studio", label: "Studio (complet)" },
  { value: "sourcing", label: "Sourcing (entrée)" },
  { value: "cotraitance", label: "Cotraitance (intermédiaire)" },
] as const;

export function OrgSettingsForm({ org }: OrgSettingsFormProps) {
  const [name, setName] = useState(org.name);
  const [tier, setTier] = useState<string>(org.subscriptionTier);
  const [siren, setSiren] = useState(org.siren ?? "");
  const [siret, setSiret] = useState(org.siret ?? "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!name.trim()) {
      setError("Le nom de l'organisation est obligatoire.");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", org.id);
      formData.set("name", name.trim());
      formData.set("subscriptionTier", tier);
      formData.set("siren", siren.trim());
      formData.set("siret", siret.trim());

      const result = await updateOrgAction(formData);
      if (!result.ok) {
        setError(result.error ?? "Une erreur est survenue.");
      } else {
        setSuccess(true);
      }
    });
  }

  const inputCls = [
    "w-full rounded-md border px-3 py-2 text-sm text-ink placeholder:text-muted",
    "focus:border-brand-red focus:outline-none focus:ring-1 focus:ring-brand-red",
    "disabled:opacity-50 border-line bg-white",
  ].join(" ");

  return (
    <div className="rounded-md border border-line bg-white p-5">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Nom */}
        <div>
          <label htmlFor="settings-name" className="mb-1 block text-xs font-medium text-ink-2">
            Nom <span className="text-error">*</span>
          </label>
          <input
            id="settings-name"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSuccess(false);
            }}
            maxLength={255}
            disabled={isPending}
            className={inputCls}
          />
        </div>

        {/* Palier + SIREN */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="settings-tier" className="mb-1 block text-xs font-medium text-ink-2">
              Palier de souscription
            </label>
            <select
              id="settings-tier"
              value={tier}
              onChange={(e) => {
                setTier(e.target.value);
                setSuccess(false);
              }}
              disabled={isPending}
              className={inputCls}
            >
              {TIER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="settings-siren" className="mb-1 block text-xs font-medium text-ink-2">
              SIREN <span className="font-normal text-muted">(optionnel, 9 chiffres)</span>
            </label>
            <input
              id="settings-siren"
              type="text"
              value={siren}
              onChange={(e) => {
                setSiren(e.target.value);
                setSuccess(false);
              }}
              maxLength={9}
              placeholder="123456789"
              disabled={isPending}
              className={inputCls}
            />
          </div>
        </div>

        {/* SIRET */}
        <div>
          <label htmlFor="settings-siret" className="mb-1 block text-xs font-medium text-ink-2">
            SIRET <span className="font-normal text-muted">(optionnel, 14 chiffres)</span>
          </label>
          <input
            id="settings-siret"
            type="text"
            value={siret}
            onChange={(e) => {
              setSiret(e.target.value);
              setSuccess(false);
            }}
            maxLength={14}
            placeholder="12345678900001"
            disabled={isPending}
            className={inputCls}
          />
        </div>

        {/* Message erreur */}
        {error && (
          <div
            role="alert"
            className="rounded-md border border-l-4 border-line border-l-error bg-error-bg px-4 py-3 text-sm text-error"
          >
            {error}
          </div>
        )}

        {/* Message succès */}
        {success && !error && (
          <div
            role="status"
            className="rounded-md border border-l-4 border-line border-l-success bg-success-bg px-4 py-3 text-sm text-success"
          >
            Paramètres enregistrés.
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end">
          <button
            type="submit"
            disabled={!name.trim() || isPending}
            className="inline-flex items-center rounded-md bg-brand-red px-3 py-1.5 text-xs font-medium text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>
    </div>
  );
}
