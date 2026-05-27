"use client";

/**
 * Formulaire de présentation société — composant Client.
 *
 * Source de vérité :
 *  - `handoff/SPEC_ADDENDUM_260525_ARCHITECTES_MENU_ET_TRAME_MAIL.md` §Exigence D
 */

import { useState, useTransition, type FormEvent } from "react";

import {
  saveOrgProfileAction,
  saveOrgSiretAction,
  type SaveOrgProfileResult,
  type SaveOrgSiretResult,
} from "./actions";
import type { OrganizationProfile } from "@/db/schema/messaging";

interface OrgProfileFormProps {
  initial: Pick<
    OrganizationProfile,
    | "presentationBlock"
    | "commercialName"
    | "emailSignature"
    | "agencyDetails"
    | "phone"
    | "contactEmail"
    | "logoUrl"
  > | null;
  /** SIRET de l'organisation (table organizations). Distinct du profil org. */
  initialSiret?: string | null;
}

export function OrgProfileForm({ initial, initialSiret }: OrgProfileFormProps) {
  const [presentationBlock, setPresentationBlock] = useState(initial?.presentationBlock ?? "");
  const [commercialName, setCommercialName] = useState(initial?.commercialName ?? "");
  const [emailSignature, setEmailSignature] = useState(initial?.emailSignature ?? "");
  const [agencyDetails, setAgencyDetails] = useState(initial?.agencyDetails ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [contactEmail, setContactEmail] = useState(initial?.contactEmail ?? "");
  const [logoUrl, setLogoUrl] = useState(initial?.logoUrl ?? "");
  const [result, setResult] = useState<SaveOrgProfileResult | null>(null);
  const [isPending, startTransition] = useTransition();

  // SIRET — section dédiée (table organizations, action séparée)
  const [siret, setSiret] = useState(initialSiret ?? "");
  const [siretResult, setSiretResult] = useState<SaveOrgSiretResult | null>(null);
  const [isSiretPending, startSiretTransition] = useTransition();

  function handleSiretSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSiretResult(null);
    // Validation client-side (secondaire — le serveur revalide)
    const trimmed = siret.trim();
    if (trimmed !== "" && !/^\d{14}$/.test(trimmed)) {
      setSiretResult({
        ok: false,
        error: "invalid_input",
        detail: "Le SIRET doit comporter exactement 14 chiffres.",
      });
      return;
    }
    const fd = new FormData();
    fd.set("siret", trimmed);
    startSiretTransition(async () => {
      const res = await saveOrgSiretAction(fd);
      setSiretResult(res);
    });
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("presentationBlock", presentationBlock);
    fd.set("commercialName", commercialName);
    fd.set("emailSignature", emailSignature);
    fd.set("agencyDetails", agencyDetails);
    fd.set("phone", phone);
    fd.set("contactEmail", contactEmail);
    fd.set("logoUrl", logoUrl);

    startTransition(async () => {
      const res = await saveOrgProfileAction(fd);
      setResult(res);
    });
  }

  return (
    <div className="space-y-8">
      {/* ------------------------------------------------------------------ */}
      {/* Section SIRET — identifiant établissement principal                  */}
      {/* ------------------------------------------------------------------ */}
      <form onSubmit={handleSiretSubmit} className="space-y-4">
        <section>
          <h2 className="mb-2 font-display text-base font-semibold text-ink">
            SIRET de l&rsquo;établissement
          </h2>
          <p className="mb-3 text-sm text-muted">
            Le SIRET (14 chiffres) est utilisé pour pré-remplir les formulaires DC1 et DC2 dans les
            dossiers de candidature.
          </p>
          <div className="flex items-end gap-3">
            <div className="max-w-xs flex-1">
              <label
                htmlFor="org-siret"
                className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-ink-2"
              >
                SIRET (14 chiffres)
              </label>
              <input
                id="org-siret"
                name="siret"
                type="text"
                value={siret}
                onChange={(e) => setSiret(e.target.value)}
                maxLength={14}
                placeholder="ex : 12345678901234"
                className="w-full rounded border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand-red focus:ring-1 focus:ring-brand-red"
              />
            </div>
            <button
              type="submit"
              disabled={isSiretPending}
              className="hover:bg-ink/80 rounded bg-ink px-4 py-2 text-sm font-medium text-white transition disabled:opacity-50"
            >
              {isSiretPending ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
          {siretResult && !siretResult.ok && (
            <p role="alert" className="mt-2 text-xs text-error">
              {siretResult.detail ?? "Erreur lors de l'enregistrement du SIRET."}
            </p>
          )}
          {siretResult?.ok && (
            <p role="status" className="mt-2 text-xs text-green-700">
              SIRET enregistré.
            </p>
          )}
        </section>
      </form>

      {/* ------------------------------------------------------------------ */}
      {/* Formulaire profil organisation                                        */}
      {/* ------------------------------------------------------------------ */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Bloc de présentation */}
        <section>
          <h2 className="mb-4 font-display text-base font-semibold text-ink">
            Présentation de la société
          </h2>
          <p className="mb-3 text-sm text-muted">
            Ce texte est injecté dans la variable{" "}
            <code className="rounded bg-paper-3 px-1 font-mono text-xs">
              {"{{presentation_societe}}"}
            </code>{" "}
            disponible dans tous les templates d&apos;e-mail.
          </p>
          <div>
            <label
              htmlFor="presentationBlock"
              className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-ink-2"
            >
              Bloc de présentation
            </label>
            <textarea
              id="presentationBlock"
              name="presentationBlock"
              value={presentationBlock}
              onChange={(e) => setPresentationBlock(e.target.value)}
              rows={10}
              maxLength={4000}
              placeholder={ALYOS_DEFAULT_PRESENTATION}
              className="w-full rounded border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand-red focus:ring-1 focus:ring-brand-red"
            />
            <p className="mt-1 text-right font-mono text-[10px] text-muted">
              {presentationBlock.length} / 4000 car.
            </p>
          </div>
        </section>

        {/* Identité commerciale */}
        <section>
          <h2 className="mb-4 font-display text-base font-semibold text-ink">
            Identité commerciale
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              id="commercialName"
              label="Nom commercial"
              value={commercialName}
              onChange={setCommercialName}
              maxLength={200}
            />
            <Field
              id="phone"
              label="Téléphone principal"
              type="tel"
              value={phone}
              onChange={setPhone}
              maxLength={50}
            />
            <Field
              id="contactEmail"
              label="E-mail de contact"
              type="email"
              value={contactEmail}
              onChange={setContactEmail}
              maxLength={254}
            />
            <Field
              id="logoUrl"
              label="URL du logo (https://…)"
              type="url"
              value={logoUrl}
              onChange={setLogoUrl}
              maxLength={2048}
            />
          </div>
        </section>

        {/* Signature + agences */}
        <section>
          <h2 className="mb-4 font-display text-base font-semibold text-ink">
            Signature et coordonnées
          </h2>
          <div className="space-y-4">
            <div>
              <label
                htmlFor="emailSignature"
                className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-ink-2"
              >
                Signature e-mail
              </label>
              <input
                id="emailSignature"
                name="emailSignature"
                type="text"
                value={emailSignature}
                onChange={(e) => setEmailSignature(e.target.value)}
                maxLength={500}
                placeholder="L'équipe AlyoS Ingénierie"
                className="w-full rounded border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand-red focus:ring-1 focus:ring-brand-red"
              />
            </div>
            <div>
              <label
                htmlFor="agencyDetails"
                className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-ink-2"
              >
                Coordonnées agences
              </label>
              <textarea
                id="agencyDetails"
                name="agencyDetails"
                value={agencyDetails}
                onChange={(e) => setAgencyDetails(e.target.value)}
                rows={5}
                maxLength={2000}
                placeholder="Agence Normandie : 2 rue des Artisans, 76000 Rouen
Agence PACA : 15 avenue du Mistral, 13100 Aix-en-Provence"
                className="w-full rounded border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand-red focus:ring-1 focus:ring-brand-red"
              />
            </div>
          </div>
        </section>

        {/* Erreurs */}
        {result && !result.ok && (
          <div
            role="alert"
            className="rounded-md border border-l-4 border-line border-l-error bg-error-bg px-4 py-3 text-sm text-error"
          >
            <strong className="mr-1 font-semibold">Erreur :</strong>
            {errorLabel(result.error)}
            {result.detail && <code className="ml-1 text-xs opacity-70">{result.detail}</code>}
            {result.fieldErrors && (
              <ul className="mt-2 list-inside list-disc space-y-1">
                {Object.entries(result.fieldErrors).map(([field, errs]) =>
                  errs.map((e, i) => (
                    <li key={`${field}-${i}`}>
                      <strong>{field}</strong> : {e}
                    </li>
                  )),
                )}
              </ul>
            )}
          </div>
        )}

        {/* Succès */}
        {result?.ok && (
          <div
            role="status"
            className="rounded-md border border-l-4 border-line border-l-success bg-success-bg px-4 py-2.5 text-sm text-success"
          >
            Profil société enregistré.
          </div>
        )}

        {/* Soumission */}
        <div className="flex justify-end border-t border-line pt-4">
          <button
            type="submit"
            disabled={isPending}
            className="hover:bg-ink/80 rounded bg-ink px-4 py-2 text-sm font-medium text-white transition disabled:opacity-50"
          >
            {isPending ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sous-composant champ                                                       */
/* -------------------------------------------------------------------------- */

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  maxLength,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  maxLength?: number;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-ink-2"
      >
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        className="w-full rounded border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand-red focus:ring-1 focus:ring-brand-red"
      />
    </div>
  );
}

function errorLabel(code: string): string {
  switch (code) {
    case "not_authenticated":
      return "Session expirée — reconnectez-vous.";
    case "forbidden_domain":
      return "Accès refusé — domaine @alyosingenierie.fr requis.";
    case "forbidden_role":
      return "Accès refusé — rôle admin requis.";
    case "invalid_input":
      return "Données invalides.";
    default:
      return "Erreur interne — réessayez.";
  }
}

/* -------------------------------------------------------------------------- */
/*  Seed par défaut AlyoS (valeur initiale placeholder)                        */
/* -------------------------------------------------------------------------- */

const ALYOS_DEFAULT_PRESENTATION = `AlyoS Ingénierie est un bureau d'études spécialisé en maîtrise d'œuvre BTP, intervenant en construction neuve et réhabilitation.

• Éco-construction et maîtrise d'œuvre : conception durable, matériaux biosourcés, performance énergétique.
• Accessibilité et réglementaire : mise en conformité Ad'AP, AMO PPMS, missions PEMD/amiante, économie circulaire et réemploi.
• BIM et outils numériques : pilotage maquette ACCA, coordination interopérabilité.
• Deux agences : Normandie (Rouen) et PACA (Aix-en-Provence).`;
