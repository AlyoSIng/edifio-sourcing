"use client";

/**
 * Formulaire d'édition d'une fiche architecte — Client Component.
 *
 * Source de vérité visuelle :
 *   `design/maquettes/maquettes_v5_admin_architectes.html` §formulaire-edition
 *
 * Périmètre MVP :
 *  - Édition des champs principaux : `cabinet`, `contactName`, `email`,
 *    `phone`, `website`, `siren`, `zip`, `city`, `notes`, `tutoiement`,
 *    `preferred`.
 *  - Toggle RGPD opposition (section dédiée, distinct des champs ordinaires).
 *  - Validation client-side minimaliste (cabinet non vide).
 *  - Soumission via Server Action `upsertArchitect` + `setRgpdOpposition`.
 *  - Feedback optimiste : état `pending` sur les boutons pendant la mutation.
 *
 * Champs hors formulaire (calculés / gérés autrement) :
 *  - `solicitable` : dérivé automatiquement (GENERATED ALWAYS AS).
 *  - `specialtyCodes`, `geoZones` : édition prévue Phase 2 (multi-select).
 *  - `headcount`, `companySize`, `companyCreatedAt` : enrichissement externe.
 *  - `odooExternalId` : géré par import Odoo uniquement.
 *  - `pastCollabsCount` : incrémenté automatiquement par l'app.
 */

import { useTransition, useState } from "react";

import type { Architect } from "@/db/schema/architects";

import { upsertArchitect, setRgpdOpposition } from "../actions";

interface ArchitectEditFormProps {
  /** Architecte courant — pré-remplit le formulaire. */
  architect: Architect;
}

export function ArchitectEditForm({ architect }: ArchitectEditFormProps) {
  const [editPending, startEditTransition] = useTransition();
  const [rgpdPending, startRgpdTransition] = useTransition();
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState(false);
  const [rgpdError, setRgpdError] = useState<string | null>(null);
  const [rgpdSuccess, setRgpdSuccess] = useState(false);

  // Champs du formulaire
  const [cabinet, setCabinet] = useState(architect.cabinet);
  const [contactName, setContactName] = useState(architect.contactName ?? "");
  const [email, setEmail] = useState(architect.email ?? "");
  const [phone, setPhone] = useState(architect.phone ?? "");
  const [website, setWebsite] = useState(architect.website ?? "");
  const [siren, setSiren] = useState(architect.siren ?? "");
  const [zip, setZip] = useState(architect.zip ?? "");
  const [city, setCity] = useState(architect.city ?? "");
  const [notes, setNotes] = useState(architect.notes ?? "");
  const [tutoiement, setTutoiement] = useState(architect.tutoiement);
  const [preferred, setPreferred] = useState(architect.preferred);

  // -------------------------------------------------------------------------
  // Soumission formulaire principal
  // -------------------------------------------------------------------------
  function handleEditSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEditError(null);
    setEditSuccess(false);

    if (!cabinet.trim()) {
      setEditError("La raison sociale (cabinet) est obligatoire.");
      return;
    }

    startEditTransition(async () => {
      const result = await upsertArchitect(
        {
          cabinet: cabinet.trim(),
          contactName: contactName.trim() || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
          website: website.trim() || null,
          siren: siren.trim() || null,
          zip: zip.trim() || null,
          city: city.trim() || null,
          notes: notes.trim() || null,
          tutoiement,
          preferred,
          // Champs conservés tels quels (non modifiables ici)
          active: architect.active,
          rgpdOpposition: architect.rgpdOpposition,
          rgpdOppositionDate: architect.rgpdOppositionDate,
          specialtyCodes: architect.specialtyCodes,
          geoZones: architect.geoZones,
          headcount: architect.headcount,
          companySize: architect.companySize,
          companyCreatedAt: architect.companyCreatedAt,
          odooExternalId: architect.odooExternalId,
          pastCollabsCount: architect.pastCollabsCount,
        },
        architect.id,
      );

      if (result.ok) {
        setEditSuccess(true);
      } else {
        const messages: Record<string, string> = {
          not_authenticated: "Session expirée. Rechargez la page.",
          forbidden_domain: "Accès réservé aux emails @alyosingenierie.fr.",
          forbidden_role: "Action réservée aux administrateurs.",
          invalid_input: "Données invalides. Vérifiez les champs.",
          internal_error: "Erreur interne. Réessayez dans quelques instants.",
        };
        setEditError(messages[result.error] ?? "Erreur inconnue.");
      }
    });
  }

  // -------------------------------------------------------------------------
  // Toggle RGPD opposition
  // -------------------------------------------------------------------------
  function handleRgpdToggle() {
    setRgpdError(null);
    setRgpdSuccess(false);
    const newOppose = !architect.rgpdOpposition;

    startRgpdTransition(async () => {
      const result = await setRgpdOpposition(architect.id, newOppose);

      if (result.ok) {
        setRgpdSuccess(true);
        // Rafraîchissement de la page pour refléter le nouveau statut
        window.location.reload();
      } else {
        const messages: Record<string, string> = {
          not_authenticated: "Session expirée. Rechargez la page.",
          forbidden_domain: "Accès réservé aux emails @alyosingenierie.fr.",
          forbidden_role: "Action réservée aux administrateurs.",
          invalid_input: "Identifiant invalide.",
          not_found: "Architecte introuvable.",
          internal_error: "Erreur interne. Réessayez dans quelques instants.",
        };
        setRgpdError(messages[result.error] ?? "Erreur inconnue.");
      }
    });
  }

  return (
    <div className="space-y-8">
      {/* ------------------------------------------------------------------ */}
      {/* Section 1 : Champs principaux                                        */}
      {/* ------------------------------------------------------------------ */}
      <form onSubmit={handleEditSubmit} noValidate>
        <fieldset disabled={editPending} className="space-y-4">
          <legend className="sr-only">Modifier la fiche architecte</legend>

          {/* Cabinet */}
          <div>
            <label htmlFor="cabinet" className="block text-xs font-medium text-ink">
              Raison sociale{" "}
              <span aria-hidden="true" className="text-error">
                *
              </span>
            </label>
            <input
              id="cabinet"
              type="text"
              value={cabinet}
              onChange={(e) => setCabinet(e.target.value)}
              required
              aria-required="true"
              className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
            />
          </div>

          {/* Contact + Email sur deux colonnes */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="contactName" className="block text-xs font-medium text-ink">
                Nom du contact
              </label>
              <input
                id="contactName"
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-xs font-medium text-ink">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
              />
            </div>
          </div>

          {/* Téléphone + Site web */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="phone" className="block text-xs font-medium text-ink">
                Téléphone
              </label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
              />
            </div>
            <div>
              <label htmlFor="website" className="block text-xs font-medium text-ink">
                Site web
              </label>
              <input
                id="website"
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
              />
            </div>
          </div>

          {/* SIREN + CP + Ville */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="siren" className="block text-xs font-medium text-ink">
                SIREN (9 chiffres)
              </label>
              <input
                id="siren"
                type="text"
                value={siren}
                onChange={(e) => setSiren(e.target.value)}
                maxLength={9}
                className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
              />
            </div>
            <div>
              <label htmlFor="zip" className="block text-xs font-medium text-ink">
                Code postal
              </label>
              <input
                id="zip"
                type="text"
                value={zip}
                onChange={(e) => setZip(e.target.value)}
                className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
              />
            </div>
            <div>
              <label htmlFor="city" className="block text-xs font-medium text-ink">
                Ville
              </label>
              <input
                id="city"
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="notes" className="block text-xs font-medium text-ink">
              Notes internes
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="focus:ring-brand-red/40 mt-1 w-full resize-y rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
            />
          </div>

          {/* Drapeaux */}
          <div className="flex flex-wrap gap-6">
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={tutoiement}
                onChange={(e) => setTutoiement(e.target.checked)}
                className="accent-brand-red"
              />
              Tutoiement (Gate 4 — pilote template Brevo TU)
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={preferred}
                onChange={(e) => setPreferred(e.target.checked)}
                className="accent-brand-red"
              />
              Architecte préféré (mise en avant matching)
            </label>
          </div>

          {/* Feedback + bouton */}
          {editError ? (
            <p role="alert" className="text-xs text-error">
              {editError}
            </p>
          ) : null}
          {editSuccess ? (
            <p role="status" className="text-xs text-green-700">
              Fiche mise à jour avec succès.
            </p>
          ) : null}

          <button
            type="submit"
            disabled={editPending}
            className="hover:bg-brand-red/90 focus:ring-brand-red/40 rounded-md bg-brand-red px-4 py-2 text-sm font-medium text-white focus:outline-none focus:ring-2 disabled:opacity-50"
            aria-busy={editPending}
          >
            {editPending ? "Enregistrement…" : "Enregistrer les modifications"}
          </button>
        </fieldset>
      </form>

      {/* ------------------------------------------------------------------ */}
      {/* Section 2 : Opposition RGPD art. 21                                 */}
      {/* ------------------------------------------------------------------ */}
      <section
        aria-labelledby="rgpd-heading"
        className="border-error/30 rounded-md border bg-red-50 p-4"
      >
        <h3 id="rgpd-heading" className="mb-2 text-sm font-semibold text-error">
          Opposition RGPD (art. 21)
        </h3>
        <p className="mb-3 text-xs text-ink-2">
          Poser une opposition retire cet architecte du matching et des sollicitations futures (sans
          suppression dure). La date d&rsquo;opposition est tracée en audit log.
        </p>

        {architect.rgpdOpposition ? (
          <p className="mb-3 text-xs text-ink-2">
            Opposition posée le{" "}
            {architect.rgpdOppositionDate
              ? new Date(architect.rgpdOppositionDate).toLocaleDateString("fr-FR")
              : "—"}
            .
          </p>
        ) : null}

        {rgpdError ? (
          <p role="alert" className="mb-2 text-xs text-error">
            {rgpdError}
          </p>
        ) : null}
        {rgpdSuccess ? (
          <p role="status" className="mb-2 text-xs text-green-700">
            Opposition mise à jour. Rechargement en cours…
          </p>
        ) : null}

        <button
          type="button"
          onClick={handleRgpdToggle}
          disabled={rgpdPending}
          aria-busy={rgpdPending}
          className={`focus:ring-brand-red/40 rounded-md px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 disabled:opacity-50 ${
            architect.rgpdOpposition
              ? "hover:bg-surface border border-line bg-white text-ink"
              : "hover:bg-error/90 bg-error text-white"
          }`}
        >
          {rgpdPending
            ? "Traitement…"
            : architect.rgpdOpposition
              ? "Lever l'opposition RGPD"
              : "Poser l'opposition RGPD"}
        </button>
      </section>
    </div>
  );
}
