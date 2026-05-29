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
 *    `preferred`, `concoursOnly`.
 *  - Édition des spécialités via checkboxes (liste ARCHITECT_SPECIALTY_CODES).
 *  - Édition des zones géo en CSV text (départements séparés par virgule).
 *  - Édition budget min / max (€ HT, optionnels).
 *  - Édition `pastCollabsCount` (collaborations passées — saisie manuelle admin).
 *  - Toggle RGPD opposition (section dédiée, distinct des champs ordinaires).
 *  - Validation client-side minimaliste (cabinet non vide).
 *  - Soumission via Server Action `upsertArchitect` + `setRgpdOpposition`.
 *  - Feedback optimiste : état `pending` sur les boutons pendant la mutation.
 *  - `router.refresh()` après sauvegarde réussie pour rafraîchir le Server
 *    Component parent (PR #64 — supersède PR #61 spécialités/zones géo CSV).
 *
 * Champs hors formulaire (calculés / gérés autrement) :
 *  - `solicitable` : dérivé automatiquement (GENERATED ALWAYS AS).
 *  - `headcount`, `companySize`, `companyCreatedAt` : enrichissement externe.
 *  - `odooExternalId` : géré par import Odoo uniquement.
 */

import { useTransition, useState } from "react";

import { useRouter } from "next/navigation";

import type { Architect } from "@/db/schema/architects";
import { ARCHITECT_SPECIALTY_CODES } from "@/lib/architects/specialty-codes";

import { upsertArchitect, setRgpdOpposition } from "../actions";

interface ArchitectEditFormProps {
  /** Architecte courant — pré-remplit le formulaire. */
  architect: Architect;
  /** Nombre de collaborations passées — pré-remplit le champ dédié. */
  initialPastCollabs?: number;
}

export function ArchitectEditForm({ architect, initialPastCollabs }: ArchitectEditFormProps) {
  const router = useRouter();
  const [editPending, startEditTransition] = useTransition();
  const [rgpdPending, startRgpdTransition] = useTransition();
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState(false);
  const [rgpdError, setRgpdError] = useState<string | null>(null);
  const [rgpdSuccess, setRgpdSuccess] = useState(false);

  // Champs du formulaire — données principales
  const [cabinet, setCabinet] = useState(architect.cabinet);
  // Prénom / Nom dérivés depuis contactName stocké en BDD ("Prénom Nom")
  const [firstName, setFirstName] = useState(() => {
    const name = architect.contactName ?? "";
    const spaceIdx = name.indexOf(" ");
    return spaceIdx >= 0 ? name.slice(0, spaceIdx) : name;
  });
  const [lastName, setLastName] = useState(() => {
    const name = architect.contactName ?? "";
    const spaceIdx = name.indexOf(" ");
    return spaceIdx >= 0 ? name.slice(spaceIdx + 1) : "";
  });
  const [email, setEmail] = useState(architect.email ?? "");
  const [phone, setPhone] = useState(architect.phone ?? "");
  const [website, setWebsite] = useState(architect.website ?? "");
  const [siren, setSiren] = useState(architect.siren ?? "");
  const [siret, setSiret] = useState(architect.siret ?? "");
  const [zip, setZip] = useState(architect.zip ?? "");
  const [city, setCity] = useState(architect.city ?? "");
  const [notes, setNotes] = useState(architect.notes ?? "");

  // Drapeaux booléens
  const [tutoiement, setTutoiement] = useState(architect.tutoiement);
  const [preferred, setPreferred] = useState(architect.preferred);
  const [concoursOnly, setConcoursOnly] = useState(architect.concoursOnly ?? false);

  // Spécialités — Set pour gestion checkboxes
  const [selectedSpecialties, setSelectedSpecialties] = useState<Set<string>>(
    new Set(architect.specialtyCodes ?? []),
  );

  // Zones géo — CSV text (départements séparés par virgule)
  const [geoZonesText, setGeoZonesText] = useState((architect.geoZones ?? []).join(", "));

  // Budget min / max (€ HT) — string pour input[type=number]
  const [budgetMin, setBudgetMin] = useState(architect.budgetMin?.toString() ?? "");
  const [budgetMax, setBudgetMax] = useState(architect.budgetMax?.toString() ?? "");

  // Effectif — saisie manuelle (enrichissement)
  const [headcount, setHeadcount] = useState(architect.headcount?.toString() ?? "");

  // CA annuel moyen — saisie manuelle (filtre éligibilité Tandem)
  const [annualRevenue, setAnnualRevenue] = useState(architect.annualRevenue?.toString() ?? "");

  // Collaborations passées — saisie manuelle admin (signal historique matching)
  const [pastCollabs, setPastCollabs] = useState<number>(
    initialPastCollabs ?? architect.pastCollabsCount ?? 0,
  );

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

    // Conversion des champs dérivés
    const specialtyCodesValue = Array.from(selectedSpecialties);
    const geoZonesValue = geoZonesText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const budgetMinValue = budgetMin ? parseInt(budgetMin, 10) : null;
    const budgetMaxValue = budgetMax ? parseInt(budgetMax, 10) : null;

    // Validation SIRET : si renseigné, doit être 14 chiffres
    const siretValue = siret.trim() || null;
    if (siretValue !== null && !/^\d{14}$/.test(siretValue)) {
      setEditError("Le SIRET doit comporter exactement 14 chiffres.");
      return;
    }

    startEditTransition(async () => {
      const result = await upsertArchitect(
        {
          cabinet: cabinet.trim(),
          contactName: [firstName, lastName].filter(Boolean).join(" ") || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
          website: website.trim() || null,
          siret: siretValue,
          siren: siren.trim() || null,
          zip: zip.trim() || null,
          city: city.trim() || null,
          notes: notes.trim() || null,
          tutoiement,
          preferred,
          concoursOnly,
          specialtyCodes: specialtyCodesValue,
          geoZones: geoZonesValue,
          budgetMin: budgetMinValue,
          budgetMax: budgetMaxValue,
          // Champs conservés tels quels (non modifiables ici)
          active: architect.active,
          rgpdOpposition: architect.rgpdOpposition,
          rgpdOppositionDate: architect.rgpdOppositionDate,
          headcount: headcount ? parseInt(headcount, 10) : null,
          annualRevenue: annualRevenue ? parseInt(annualRevenue, 10) : null,
          companySize: architect.companySize,
          companyCreatedAt: architect.companyCreatedAt,
          odooExternalId: architect.odooExternalId,
          pastCollabsCount: pastCollabs,
        },
        architect.id,
      );

      if (result.ok) {
        setEditSuccess(true);
        // Rafraîchit le Server Component parent pour afficher les nouvelles valeurs
        router.refresh();
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

          {/* Prénom + Nom du contact sur deux colonnes */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink">Prénom</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Prénom du contact"
                className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink">Nom</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Nom du contact"
                className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
          </div>

          {/* Email */}
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

          {/* SIRET + SIREN */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="siret" className="block text-xs font-medium text-ink">
                SIRET (14 chiffres){" "}
                <span className="text-xs font-normal text-muted">optionnel</span>
              </label>
              <input
                id="siret"
                type="text"
                value={siret}
                onChange={(e) => setSiret(e.target.value)}
                maxLength={14}
                placeholder="ex : 12345678901234"
                className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
              />
            </div>
            <div>
              <label htmlFor="siren" className="block text-xs font-medium text-ink">
                SIREN (9 chiffres) <span className="text-xs font-normal text-muted">matching</span>
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
          </div>

          {/* CP + Ville */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

          {/* Spécialités — checkboxes */}
          <div>
            <span className="mb-2 block text-xs font-medium text-ink">Spécialités</span>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {ARCHITECT_SPECIALTY_CODES.map(({ code, label }) => (
                <label
                  key={code}
                  className="flex cursor-pointer items-center gap-2 text-sm text-ink-2"
                >
                  <input
                    type="checkbox"
                    checked={selectedSpecialties.has(code)}
                    onChange={(e) => {
                      const next = new Set(selectedSpecialties);
                      if (e.target.checked) next.add(code);
                      else next.delete(code);
                      setSelectedSpecialties(next);
                    }}
                    className="h-4 w-4 rounded border-line accent-brand-red"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* Zones géo — CSV text */}
          <div>
            <label htmlFor="geo-zones" className="block text-xs font-medium text-ink">
              Zones géo{" "}
              <span className="text-xs font-normal text-muted">(n° départements, virgule)</span>
            </label>
            <input
              id="geo-zones"
              type="text"
              value={geoZonesText}
              onChange={(e) => setGeoZonesText(e.target.value)}
              placeholder="ex : 75, 92, 93, 94"
              className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
            />
          </div>

          {/* Budget min / max */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="budget-min" className="block text-xs font-medium text-ink">
                Budget min (€ HT) <span className="text-xs font-normal text-muted">optionnel</span>
              </label>
              <input
                id="budget-min"
                type="number"
                min={0}
                step={10000}
                value={budgetMin}
                onChange={(e) => setBudgetMin(e.target.value)}
                placeholder="ex : 100000"
                className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
              />
            </div>
            <div>
              <label htmlFor="budget-max" className="block text-xs font-medium text-ink">
                Budget max (€ HT) <span className="text-xs font-normal text-muted">optionnel</span>
              </label>
              <input
                id="budget-max"
                type="number"
                min={0}
                step={10000}
                value={budgetMax}
                onChange={(e) => setBudgetMax(e.target.value)}
                placeholder="ex : 2000000"
                className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
              />
            </div>
          </div>

          {/* Effectif + CA — grille 2 colonnes */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="headcount" className="block text-xs font-medium text-ink">
                Effectif{" "}
                <span className="text-xs font-normal text-muted">(personnes, optionnel)</span>
              </label>
              <input
                id="headcount"
                type="number"
                min={1}
                max={9999}
                step={1}
                value={headcount}
                onChange={(e) => setHeadcount(e.target.value)}
                placeholder="ex : 5"
                className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
              />
            </div>
            <div>
              <label htmlFor="annualRevenue" className="block text-xs font-medium text-ink">
                CA annuel moyen (€ HT){" "}
                <span className="text-xs font-normal text-muted">optionnel</span>
              </label>
              <input
                id="annualRevenue"
                type="number"
                min={0}
                step={10000}
                value={annualRevenue}
                onChange={(e) => setAnnualRevenue(e.target.value)}
                placeholder="ex : 500000"
                className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
              />
            </div>
          </div>

          {/* Collaborations passées */}
          <div>
            <label className="text-xs font-medium text-muted">Collaborations passées</label>
            <input
              type="number"
              min={0}
              value={pastCollabs}
              onChange={(e) => setPastCollabs(Number(e.target.value))}
              className="mt-1 h-8 w-full rounded border border-line bg-white px-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-brand-red"
            />
            <p className="mt-0.5 text-[10px] text-muted">Nombre de fois cotraitants ensemble</p>
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
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={concoursOnly}
                onChange={(e) => setConcoursOnly(e.target.checked)}
                className="accent-brand-red"
              />
              Concours uniquement (pas de candidature)
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
