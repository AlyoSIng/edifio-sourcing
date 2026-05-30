"use client";

/**
 * NewOrgForm — formulaire de création d'une organisation (superadmin)
 *
 * Client Component — appelle `createOrgAction` via useTransition.
 * Champs : name (obligatoire), subscriptionTier (select), siren (optionnel),
 * siret (optionnel), adminFirstName (obligatoire), adminLastName (obligatoire),
 * adminEmail (obligatoire).
 *
 * Un email d'invitation est automatiquement envoyé à l'administrateur initial.
 * Même pattern de style que `FaqItemForm`.
 */

import { useState, useTransition } from "react";

import { createOrgAction } from "./actions";

interface NewOrgFormProps {
  onClose: () => void;
}

const TIER_OPTIONS = [
  { value: "studio", label: "Studio (complet)" },
  { value: "sourcing", label: "Sourcing (entrée)" },
  { value: "cotraitance", label: "Cotraitance (intermédiaire)" },
] as const;

export function NewOrgForm({ onClose }: NewOrgFormProps) {
  const [name, setName] = useState("");
  const [tier, setTier] = useState("studio");
  const [siren, setSiren] = useState("");
  const [siret, setSiret] = useState("");
  const [adminFirstName, setAdminFirstName] = useState("");
  const [adminLastName, setAdminLastName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Le nom de l'organisation est obligatoire.");
      return;
    }
    if (!adminFirstName.trim() || !adminLastName.trim() || !adminEmail.trim()) {
      setError("Les informations de l'administrateur initial sont obligatoires.");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("name", name.trim());
      formData.set("subscriptionTier", tier);
      formData.set("siren", siren.trim());
      formData.set("siret", siret.trim());
      formData.set("adminFirstName", adminFirstName.trim());
      formData.set("adminLastName", adminLastName.trim());
      formData.set("adminEmail", adminEmail.trim().toLowerCase());

      const result = await createOrgAction(formData);
      if (!result.ok) {
        setError(result.error ?? "Une erreur est survenue.");
      } else {
        // Réinitialisation + fermeture
        setName("");
        setTier("studio");
        setSiren("");
        setSiret("");
        setAdminFirstName("");
        setAdminLastName("");
        setAdminEmail("");
        onClose();
      }
    });
  }

  const inputCls = [
    "w-full rounded-md border px-3 py-2 text-sm text-ink placeholder:text-muted",
    "focus:border-brand-red focus:outline-none focus:ring-1 focus:ring-brand-red",
    "disabled:opacity-50 border-line bg-white",
  ].join(" ");

  return (
    <div className="mb-6 rounded-md border border-line bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-ink">Nouvelle organisation</h3>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Nom */}
        <div>
          <label htmlFor="org-name" className="mb-1 block text-xs font-medium text-ink-2">
            Nom <span className="text-error">*</span>
          </label>
          <input
            id="org-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={255}
            placeholder="Ex. : Cabinet Dupont Architecture"
            disabled={isPending}
            className={inputCls}
          />
          <p className="mt-0.5 text-right font-mono text-[10px] text-muted">{name.length} / 255</p>
        </div>

        {/* Palier + SIREN */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="org-tier" className="mb-1 block text-xs font-medium text-ink-2">
              Palier de souscription
            </label>
            <select
              id="org-tier"
              value={tier}
              onChange={(e) => setTier(e.target.value)}
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
            <label htmlFor="org-siren" className="mb-1 block text-xs font-medium text-ink-2">
              SIREN <span className="font-normal text-muted">(optionnel, 9 chiffres)</span>
            </label>
            <input
              id="org-siren"
              type="text"
              value={siren}
              onChange={(e) => setSiren(e.target.value)}
              maxLength={9}
              placeholder="123456789"
              disabled={isPending}
              className={inputCls}
            />
          </div>
        </div>

        {/* SIRET */}
        <div>
          <label htmlFor="org-siret" className="mb-1 block text-xs font-medium text-ink-2">
            SIRET <span className="font-normal text-muted">(optionnel, 14 chiffres)</span>
          </label>
          <input
            id="org-siret"
            type="text"
            value={siret}
            onChange={(e) => setSiret(e.target.value)}
            maxLength={14}
            placeholder="12345678900001"
            disabled={isPending}
            className={inputCls}
          />
        </div>

        {/* Administrateur initial */}
        <div className="border-t border-line pt-4">
          <p className="mb-3 text-xs font-semibold text-ink">
            Administrateur initial{" "}
            <span className="font-normal text-muted">
              — un email d&apos;invitation sera envoyé automatiquement
            </span>
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="admin-firstname"
                className="mb-1 block text-xs font-medium text-ink-2"
              >
                Prénom <span className="text-error">*</span>
              </label>
              <input
                id="admin-firstname"
                type="text"
                value={adminFirstName}
                onChange={(e) => setAdminFirstName(e.target.value)}
                maxLength={100}
                placeholder="Marie"
                disabled={isPending}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="admin-lastname" className="mb-1 block text-xs font-medium text-ink-2">
                Nom <span className="text-error">*</span>
              </label>
              <input
                id="admin-lastname"
                type="text"
                value={adminLastName}
                onChange={(e) => setAdminLastName(e.target.value)}
                maxLength={100}
                placeholder="Dupont"
                disabled={isPending}
                className={inputCls}
              />
            </div>
          </div>
          <div className="mt-3">
            <label htmlFor="admin-email" className="mb-1 block text-xs font-medium text-ink-2">
              Email <span className="text-error">*</span>{" "}
              <span className="font-normal text-muted">
                (doit être @alyosingenierie.fr ou @edifio.fr)
              </span>
            </label>
            <input
              id="admin-email"
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              maxLength={255}
              placeholder="marie.dupont@alyosingenierie.fr"
              disabled={isPending}
              className={inputCls}
            />
          </div>
        </div>

        {/* Erreur */}
        {error && (
          <div
            role="alert"
            className="rounded-md border border-l-4 border-line border-l-error bg-error-bg px-4 py-3 text-sm text-error"
          >
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="inline-flex items-center rounded-full border border-line bg-paper-2 px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-paper-3 hover:text-ink disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={
              !name.trim() ||
              !adminEmail.trim() ||
              !adminFirstName.trim() ||
              !adminLastName.trim() ||
              isPending
            }
            className="inline-flex items-center rounded-full bg-brand-red px-3 py-1.5 text-xs font-medium text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Création…" : "Créer l'organisation"}
          </button>
        </div>
      </form>
    </div>
  );
}
