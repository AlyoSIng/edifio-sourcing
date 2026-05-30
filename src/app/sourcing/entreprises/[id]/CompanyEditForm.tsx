"use client";

/**
 * Formulaire d'édition d'une fiche entreprise — Client Component.
 *
 * Différences vs BEEditForm :
 *  - Spécialités via `COMPANY_SPECIALTY_CODES`
 *  - Pas de `tutoiement` (relation commerciale)
 *  - Pas de `concoursOnly` (entreprises CR répondent à tous marchés)
 *  - Champ `name` au lieu de `cabinet`
 *
 * Créé dans feat/be-companies (Nadia, 2026-05-26).
 */

import { useTransition, useState } from "react";

import { useRouter } from "next/navigation";

import type { Company } from "@/db/schema/companies";
import { COMPANY_SPECIALTY_CODES } from "@/lib/architects/specialty-codes";

import { upsertCompany } from "../actions";

interface CompanyEditFormProps {
  company: Company;
}

export function CompanyEditForm({ company: co }: CompanyEditFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState(false);

  const [name, setName] = useState(co.name);
  const [firstName, setFirstName] = useState(() => {
    const name = co.contactName ?? "";
    const spaceIdx = name.indexOf(" ");
    return spaceIdx >= 0 ? name.slice(0, spaceIdx) : name;
  });
  const [lastName, setLastName] = useState(() => {
    const name = co.contactName ?? "";
    const spaceIdx = name.indexOf(" ");
    return spaceIdx >= 0 ? name.slice(spaceIdx + 1) : "";
  });
  const [email, setEmail] = useState(co.email ?? "");
  const [phone, setPhone] = useState(co.phone ?? "");
  const [website, setWebsite] = useState(co.website ?? "");
  const [siren, setSiren] = useState(co.siren ?? "");
  const [zip, setZip] = useState(co.zip ?? "");
  const [city, setCity] = useState(co.city ?? "");
  const [notes, setNotes] = useState(co.notes ?? "");
  const [preferred, setPreferred] = useState(co.preferred);

  const [selectedSpecialties, setSelectedSpecialties] = useState<Set<string>>(
    new Set(co.specialtyCodes ?? []),
  );
  const [geoZonesText, setGeoZonesText] = useState((co.geoZones ?? []).join(", "));
  const [budgetMin, setBudgetMin] = useState(co.budgetMin?.toString() ?? "");
  const [budgetMax, setBudgetMax] = useState(co.budgetMax?.toString() ?? "");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEditError(null);
    setEditSuccess(false);

    if (!name.trim()) {
      setEditError("La raison sociale est obligatoire.");
      return;
    }

    const specialtyCodesValue = Array.from(selectedSpecialties);
    const geoZonesValue = geoZonesText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const budgetMinValue = budgetMin ? parseInt(budgetMin, 10) : null;
    const budgetMaxValue = budgetMax ? parseInt(budgetMax, 10) : null;

    startTransition(async () => {
      const result = await upsertCompany(
        {
          name: name.trim(),
          contactName: [firstName, lastName].filter(Boolean).join(" ") || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
          website: website.trim() || null,
          siren: siren.trim() || null,
          zip: zip.trim() || null,
          city: city.trim() || null,
          notes: notes.trim() || null,
          preferred,
          specialtyCodes: specialtyCodesValue,
          geoZones: geoZonesValue,
          budgetMin: budgetMinValue,
          budgetMax: budgetMaxValue,
          active: co.active,
          rgpdOpposition: co.rgpdOpposition,
          rgpdOppositionDate: co.rgpdOppositionDate,
          headcount: co.headcount,
          companySize: co.companySize,
        },
        co.id,
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
          not_found: "Entreprise introuvable.",
          internal_error: "Erreur interne. Réessayez dans quelques instants.",
        };
        setEditError(messages[result.error] ?? "Erreur inconnue.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <fieldset disabled={pending} className="space-y-4">
        <legend className="sr-only">Modifier la fiche entreprise</legend>

        <div>
          <label htmlFor="co-name" className="block text-xs font-medium text-ink">
            Raison sociale{" "}
            <span aria-hidden="true" className="text-error">
              *
            </span>
          </label>
          <input
            id="co-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            aria-required="true"
            className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="co-firstname" className="block text-xs font-medium text-ink">
              Prénom
            </label>
            <input
              id="co-firstname"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
            />
          </div>
          <div>
            <label htmlFor="co-lastname" className="block text-xs font-medium text-ink">
              Nom
            </label>
            <input
              id="co-lastname"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="co-email" className="block text-xs font-medium text-ink">
              Email
            </label>
            <input
              id="co-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="co-phone" className="block text-xs font-medium text-ink">
              Téléphone
            </label>
            <input
              id="co-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
            />
          </div>
          <div>
            <label htmlFor="co-website" className="block text-xs font-medium text-ink">
              Site web
            </label>
            <input
              id="co-website"
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="co-siren" className="block text-xs font-medium text-ink">
              SIREN (9 chiffres)
            </label>
            <input
              id="co-siren"
              type="text"
              value={siren}
              onChange={(e) => setSiren(e.target.value)}
              maxLength={9}
              className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
            />
          </div>
          <div>
            <label htmlFor="co-zip" className="block text-xs font-medium text-ink">
              Code postal
            </label>
            <input
              id="co-zip"
              type="text"
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
            />
          </div>
          <div>
            <label htmlFor="co-city" className="block text-xs font-medium text-ink">
              Ville
            </label>
            <input
              id="co-city"
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
            />
          </div>
        </div>

        <div>
          <label htmlFor="co-notes" className="block text-xs font-medium text-ink">
            Notes internes
          </label>
          <textarea
            id="co-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="focus:ring-brand-red/40 mt-1 w-full resize-y rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
          />
        </div>

        {/* Spécialités Entreprises */}
        <div>
          <span className="mb-2 block text-xs font-medium text-ink">Spécialités</span>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {COMPANY_SPECIALTY_CODES.map(({ code, label }) => (
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

        <div>
          <label htmlFor="co-geo" className="block text-xs font-medium text-ink">
            Zones géo{" "}
            <span className="text-xs font-normal text-muted">(n° départements, virgule)</span>
          </label>
          <input
            id="co-geo"
            type="text"
            value={geoZonesText}
            onChange={(e) => setGeoZonesText(e.target.value)}
            placeholder="ex : 75, 92, 93, 94"
            className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="co-bmin" className="block text-xs font-medium text-ink">
              Budget min (€ HT) <span className="text-xs font-normal text-muted">optionnel</span>
            </label>
            <input
              id="co-bmin"
              type="number"
              min={0}
              step={10000}
              value={budgetMin}
              onChange={(e) => setBudgetMin(e.target.value)}
              className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
            />
          </div>
          <div>
            <label htmlFor="co-bmax" className="block text-xs font-medium text-ink">
              Budget max (€ HT) <span className="text-xs font-normal text-muted">optionnel</span>
            </label>
            <input
              id="co-bmax"
              type="number"
              min={0}
              step={10000}
              value={budgetMax}
              onChange={(e) => setBudgetMax(e.target.value)}
              className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-6">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={preferred}
              onChange={(e) => setPreferred(e.target.checked)}
              className="accent-brand-red"
            />
            Entreprise préférée (mise en avant)
          </label>
        </div>

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
          className="hover:bg-brand-red/90 focus:ring-brand-red/40 rounded-full bg-brand-red px-4 py-2 text-sm font-medium text-white focus:outline-none focus:ring-2 disabled:opacity-50"
        >
          {pending ? "Enregistrement…" : "Enregistrer les modifications"}
        </button>
      </fieldset>
    </form>
  );
}
