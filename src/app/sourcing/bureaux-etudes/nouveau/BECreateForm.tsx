"use client";

/**
 * Formulaire de création d'un bureau d'études — Client Component.
 *
 * Reprend les champs de BEEditForm mais en mode création (pas d'`id` fourni).
 * Redirige vers la fiche après INSERT réussi.
 *
 * Créé dans feat/be-companies (Nadia, 2026-05-26).
 */

import { useTransition, useState } from "react";

import { useRouter } from "next/navigation";

import { BE_SPECIALTY_CODES } from "@/lib/architects/specialty-codes";

import { upsertBE } from "../actions";

export function BECreateForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editError, setEditError] = useState<string | null>(null);

  const [cabinet, setCabinet] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [siren, setSiren] = useState("");
  const [zip, setZip] = useState("");
  const [city, setCity] = useState("");
  const [notes, setNotes] = useState("");
  const [tutoiement, setTutoiement] = useState(false);
  const [preferred, setPreferred] = useState(false);
  const [concoursOnly, setConcoursOnly] = useState(false);
  const [selectedSpecialties, setSelectedSpecialties] = useState<Set<string>>(new Set());
  const [geoZonesText, setGeoZonesText] = useState("");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEditError(null);

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

    startTransition(async () => {
      const result = await upsertBE({
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
        concoursOnly,
        specialtyCodes: specialtyCodesValue,
        geoZones: geoZonesValue,
        budgetMin: budgetMinValue,
        budgetMax: budgetMaxValue,
        active: true,
        rgpdOpposition: false,
        rgpdOppositionDate: null,
        headcount: null,
        companySize: null,
        odooExternalId: null,
        pastCollabsCount: 0,
      });

      if (result.ok) {
        router.push(`/sourcing/bureaux-etudes/${result.bureauEtudes.id}`);
      } else {
        const messages: Record<string, string> = {
          not_authenticated: "Session expirée. Rechargez la page.",
          forbidden_domain: "Accès réservé aux emails @alyosingenierie.fr.",
          forbidden_role: "Action réservée aux administrateurs.",
          invalid_input: "Données invalides. Vérifiez les champs.",
          not_found: "Erreur inattendue.",
          internal_error: "Erreur interne. Réessayez dans quelques instants.",
        };
        setEditError(messages[result.error] ?? "Erreur inconnue.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <fieldset disabled={pending} className="space-y-4">
        <legend className="sr-only">Créer un bureau d&apos;études</legend>

        <div>
          <label htmlFor="new-be-cabinet" className="block text-xs font-medium text-ink">
            Raison sociale{" "}
            <span aria-hidden="true" className="text-error">
              *
            </span>
          </label>
          <input
            id="new-be-cabinet"
            type="text"
            value={cabinet}
            onChange={(e) => setCabinet(e.target.value)}
            required
            aria-required="true"
            className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="new-be-contact" className="block text-xs font-medium text-ink">
              Nom du contact
            </label>
            <input
              id="new-be-contact"
              type="text"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
            />
          </div>
          <div>
            <label htmlFor="new-be-email" className="block text-xs font-medium text-ink">
              Email
            </label>
            <input
              id="new-be-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="new-be-phone" className="block text-xs font-medium text-ink">
              Téléphone
            </label>
            <input
              id="new-be-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
            />
          </div>
          <div>
            <label htmlFor="new-be-website" className="block text-xs font-medium text-ink">
              Site web
            </label>
            <input
              id="new-be-website"
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="new-be-siren" className="block text-xs font-medium text-ink">
              SIREN
            </label>
            <input
              id="new-be-siren"
              type="text"
              value={siren}
              onChange={(e) => setSiren(e.target.value)}
              maxLength={9}
              className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
            />
          </div>
          <div>
            <label htmlFor="new-be-zip" className="block text-xs font-medium text-ink">
              Code postal
            </label>
            <input
              id="new-be-zip"
              type="text"
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
            />
          </div>
          <div>
            <label htmlFor="new-be-city" className="block text-xs font-medium text-ink">
              Ville
            </label>
            <input
              id="new-be-city"
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
            />
          </div>
        </div>

        <div>
          <label htmlFor="new-be-notes" className="block text-xs font-medium text-ink">
            Notes
          </label>
          <textarea
            id="new-be-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="focus:ring-brand-red/40 mt-1 w-full resize-y rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
          />
        </div>

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

        <div>
          <label htmlFor="new-be-geo" className="block text-xs font-medium text-ink">
            Zones géo{" "}
            <span className="text-xs font-normal text-muted">(n° départements, virgule)</span>
          </label>
          <input
            id="new-be-geo"
            type="text"
            value={geoZonesText}
            onChange={(e) => setGeoZonesText(e.target.value)}
            placeholder="ex : 75, 92, 93, 94"
            className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="new-be-bmin" className="block text-xs font-medium text-ink">
              Budget min (€ HT)
            </label>
            <input
              id="new-be-bmin"
              type="number"
              min={0}
              step={10000}
              value={budgetMin}
              onChange={(e) => setBudgetMin(e.target.value)}
              className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
            />
          </div>
          <div>
            <label htmlFor="new-be-bmax" className="block text-xs font-medium text-ink">
              Budget max (€ HT)
            </label>
            <input
              id="new-be-bmax"
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
            BET préféré
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

        {editError ? (
          <p role="alert" className="text-xs text-error">
            {editError}
          </p>
        ) : null}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            aria-busy={pending}
            className="hover:bg-brand-red/90 focus:ring-brand-red/40 rounded-md bg-brand-red px-4 py-2 text-sm font-medium text-white focus:outline-none focus:ring-2 disabled:opacity-50"
          >
            {pending ? "Création en cours…" : "Créer le bureau d'études"}
          </button>
          <a href="/sourcing/bureaux-etudes" className="text-sm text-muted hover:text-ink">
            Annuler
          </a>
        </div>
      </fieldset>
    </form>
  );
}
