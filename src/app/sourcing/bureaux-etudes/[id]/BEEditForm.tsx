"use client";

/**
 * Formulaire d'édition d'une fiche bureau d'études — Client Component.
 *
 * Calqué sur `ArchitectEditForm.tsx` avec les adaptations BET :
 *  - Spécialités via `BE_SPECIALTY_CODES` (checkboxes)
 *  - Colonnes `tutoiement` + `concoursOnly` présentes (même que architects)
 *  - `router.refresh()` après sauvegarde réussie
 *
 * Créé dans feat/be-companies (Nadia, 2026-05-26).
 */

import { useTransition, useState } from "react";

import { useRouter } from "next/navigation";

import type { BureauEtudes } from "@/db/schema/bureaux-etudes";
import { BE_SPECIALTY_CODES } from "@/lib/architects/specialty-codes";

import { upsertBE } from "../actions";

interface BEEditFormProps {
  be: BureauEtudes;
}

export function BEEditForm({ be }: BEEditFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState(false);

  // Champs
  const [cabinet, setCabinet] = useState(be.cabinet);
  const [firstName, setFirstName] = useState(() => {
    const name = be.contactName ?? "";
    const spaceIdx = name.indexOf(" ");
    return spaceIdx >= 0 ? name.slice(0, spaceIdx) : name;
  });
  const [lastName, setLastName] = useState(() => {
    const name = be.contactName ?? "";
    const spaceIdx = name.indexOf(" ");
    return spaceIdx >= 0 ? name.slice(spaceIdx + 1) : "";
  });
  const [email, setEmail] = useState(be.email ?? "");
  const [phone, setPhone] = useState(be.phone ?? "");
  const [website, setWebsite] = useState(be.website ?? "");
  const [siren, setSiren] = useState(be.siren ?? "");
  const [siret, setSiret] = useState(be.siret ?? "");
  const [zip, setZip] = useState(be.zip ?? "");
  const [city, setCity] = useState(be.city ?? "");
  const [notes, setNotes] = useState(be.notes ?? "");

  // Drapeaux
  const [tutoiement, setTutoiement] = useState(be.tutoiement);
  const [preferred, setPreferred] = useState(be.preferred);
  const [concoursOnly, setConcoursOnly] = useState(be.concoursOnly ?? false);

  // Spécialités
  const [selectedSpecialties, setSelectedSpecialties] = useState<Set<string>>(
    new Set(be.specialtyCodes ?? []),
  );

  // Zones géo
  const [geoZonesText, setGeoZonesText] = useState((be.geoZones ?? []).join(", "));

  // Budget
  const [budgetMin, setBudgetMin] = useState(be.budgetMin?.toString() ?? "");
  const [budgetMax, setBudgetMax] = useState(be.budgetMax?.toString() ?? "");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEditError(null);
    setEditSuccess(false);

    if (!cabinet.trim()) {
      setEditError("La raison sociale (cabinet) est obligatoire.");
      return;
    }

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

    startTransition(async () => {
      const result = await upsertBE(
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
          active: be.active,
          rgpdOpposition: be.rgpdOpposition,
          rgpdOppositionDate: be.rgpdOppositionDate,
          headcount: be.headcount,
          companySize: be.companySize,
          odooExternalId: be.odooExternalId,
          pastCollabsCount: be.pastCollabsCount,
        },
        be.id,
      );

      if (result.ok) {
        setEditSuccess(true);
        router.refresh();
      } else {
        const messages: Record<string, string> = {
          not_authenticated: "Session expirée. Rechargez la page.",
          forbidden_domain: "Accès réservé aux emails @alyosingenierie.fr.",
          forbidden_role: "Action réservée aux administrateurs.",
          invalid_input: "Données invalides. Vérifiez les champs.",
          not_found: "Bureau d'études introuvable.",
          internal_error: "Erreur interne. Réessayez dans quelques instants.",
        };
        setEditError(messages[result.error] ?? "Erreur inconnue.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <fieldset disabled={pending} className="space-y-4">
        <legend className="sr-only">Modifier la fiche bureau d&apos;études</legend>

        {/* Cabinet */}
        <div>
          <label htmlFor="be-cabinet" className="block text-xs font-medium text-ink">
            Raison sociale{" "}
            <span aria-hidden="true" className="text-error">
              *
            </span>
          </label>
          <input
            id="be-cabinet"
            type="text"
            value={cabinet}
            onChange={(e) => setCabinet(e.target.value)}
            required
            aria-required="true"
            className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
          />
        </div>

        {/* Contact : Prénom + Nom */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="be-firstname" className="block text-xs font-medium text-ink">
              Prénom
            </label>
            <input
              id="be-firstname"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
            />
          </div>
          <div>
            <label htmlFor="be-lastname" className="block text-xs font-medium text-ink">
              Nom
            </label>
            <input
              id="be-lastname"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
            />
          </div>
        </div>
        {/* Email */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="be-email" className="block text-xs font-medium text-ink">
              Email
            </label>
            <input
              id="be-email"
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
            <label htmlFor="be-phone" className="block text-xs font-medium text-ink">
              Téléphone
            </label>
            <input
              id="be-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
            />
          </div>
          <div>
            <label htmlFor="be-website" className="block text-xs font-medium text-ink">
              Site web
            </label>
            <input
              id="be-website"
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
            <label htmlFor="be-siret" className="block text-xs font-medium text-ink">
              SIRET (14 chiffres) <span className="text-xs font-normal text-muted">optionnel</span>
            </label>
            <input
              id="be-siret"
              type="text"
              value={siret}
              onChange={(e) => setSiret(e.target.value)}
              maxLength={14}
              placeholder="ex : 12345678901234"
              className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
            />
          </div>
          <div>
            <label htmlFor="be-siren" className="block text-xs font-medium text-ink">
              SIREN (9 chiffres) <span className="text-xs font-normal text-muted">matching</span>
            </label>
            <input
              id="be-siren"
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
            <label htmlFor="be-zip" className="block text-xs font-medium text-ink">
              Code postal
            </label>
            <input
              id="be-zip"
              type="text"
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
            />
          </div>
          <div>
            <label htmlFor="be-city" className="block text-xs font-medium text-ink">
              Ville
            </label>
            <input
              id="be-city"
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label htmlFor="be-notes" className="block text-xs font-medium text-ink">
            Notes internes
          </label>
          <textarea
            id="be-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="focus:ring-brand-red/40 mt-1 w-full resize-y rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
          />
        </div>

        {/* Spécialités — checkboxes BE */}
        <div>
          <span className="mb-2 block text-xs font-medium text-ink">Spécialités</span>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {BE_SPECIALTY_CODES.map(({ code, label }) => (
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

        {/* Zones géo */}
        <div>
          <label htmlFor="be-geo" className="block text-xs font-medium text-ink">
            Zones géo{" "}
            <span className="text-xs font-normal text-muted">(n° départements, virgule)</span>
          </label>
          <input
            id="be-geo"
            type="text"
            value={geoZonesText}
            onChange={(e) => setGeoZonesText(e.target.value)}
            placeholder="ex : 75, 92, 93, 94"
            className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
          />
        </div>

        {/* Budget */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="be-budget-min" className="block text-xs font-medium text-ink">
              Budget min (€ HT) <span className="text-xs font-normal text-muted">optionnel</span>
            </label>
            <input
              id="be-budget-min"
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
            <label htmlFor="be-budget-max" className="block text-xs font-medium text-ink">
              Budget max (€ HT) <span className="text-xs font-normal text-muted">optionnel</span>
            </label>
            <input
              id="be-budget-max"
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

        {/* Drapeaux */}
        <div className="flex flex-wrap gap-6">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={tutoiement}
              onChange={(e) => setTutoiement(e.target.checked)}
              className="accent-brand-red"
            />
            Tutoiement
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={preferred}
              onChange={(e) => setPreferred(e.target.checked)}
              className="accent-brand-red"
            />
            BET préféré (mise en avant)
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={concoursOnly}
              onChange={(e) => setConcoursOnly(e.target.checked)}
              className="accent-brand-red"
            />
            Concours uniquement
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
          disabled={pending}
          aria-busy={pending}
          className="hover:bg-brand-red/90 focus:ring-brand-red/40 rounded-md bg-brand-red px-4 py-2 text-sm font-medium text-white focus:outline-none focus:ring-2 disabled:opacity-50"
        >
          {pending ? "Enregistrement…" : "Enregistrer les modifications"}
        </button>
      </fieldset>
    </form>
  );
}
