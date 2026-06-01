"use client";

/**
 * Formulaire de création d'un architecte — Client Component.
 *
 * Reprend les champs de ArchitectEditForm mais en mode création (pas d'`id` fourni).
 * Redirige vers la fiche après INSERT réussi.
 *
 * Pattern identique à BECreateForm (bureaux-etudes/nouveau).
 */

import { useTransition, useState } from "react";

import { useRouter } from "next/navigation";

import { ARCHITECT_SPECIALTY_CODES } from "@/lib/architects/specialty-codes";

import { upsertArchitect } from "../actions";

export function ArchitectCreateForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editError, setEditError] = useState<string | null>(null);

  // Champs identité
  const [cabinet, setCabinet] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");

  // Champs administratifs
  const [siren, setSiren] = useState("");
  const [siret, setSiret] = useState("");
  const [zip, setZip] = useState("");
  const [city, setCity] = useState("");

  // Notes
  const [notes, setNotes] = useState("");

  // Drapeaux booléens
  const [tutoiement, setTutoiement] = useState(false);
  const [preferred, setPreferred] = useState(false);
  const [concoursOnly, setConcoursOnly] = useState(false);

  // Spécialités — Set pour gestion checkboxes
  const [selectedSpecialties, setSelectedSpecialties] = useState<Set<string>>(new Set());

  // Zones géo — CSV text (départements séparés par virgule)
  const [geoZonesText, setGeoZonesText] = useState("");

  // Budget min / max (€ HT)
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEditError(null);

    if (!cabinet.trim()) {
      setEditError("La raison sociale (cabinet) est obligatoire.");
      return;
    }

    // Validation SIRET : si renseigné, doit être 14 chiffres
    const siretValue = siret.trim() || null;
    if (siretValue !== null && !/^\d{14}$/.test(siretValue)) {
      setEditError("Le SIRET doit comporter exactement 14 chiffres.");
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
      const result = await upsertArchitect({
        cabinet: cabinet.trim(),
        contactName: [firstName, lastName].filter(Boolean).join(" ") || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        website: website.trim() || null,
        siren: siren.trim() || null,
        siret: siretValue,
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
        annualRevenue: null,
        companySize: null,
        companyCreatedAt: null,
        odooExternalId: null,
        pastCollabsCount: 0,
      });

      if (result.ok) {
        router.push(`/sourcing/architectes/${result.architect.id}`);
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
        <legend className="sr-only">Créer un architecte</legend>

        {/* Raison sociale */}
        <div>
          <label htmlFor="new-arch-cabinet" className="block text-xs font-medium text-ink">
            Raison sociale{" "}
            <span aria-hidden="true" className="text-error">
              *
            </span>
          </label>
          <input
            id="new-arch-cabinet"
            type="text"
            value={cabinet}
            onChange={(e) => setCabinet(e.target.value)}
            required
            aria-required="true"
            className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
          />
        </div>

        {/* Prénom + Nom du contact */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="new-arch-firstname" className="block text-xs font-medium text-ink">
              Prénom du contact
            </label>
            <input
              id="new-arch-firstname"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Prénom"
              className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 disabled:opacity-50"
            />
          </div>
          <div>
            <label htmlFor="new-arch-lastname" className="block text-xs font-medium text-ink">
              Nom du contact
            </label>
            <input
              id="new-arch-lastname"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Nom"
              className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 disabled:opacity-50"
            />
          </div>
        </div>

        {/* Email */}
        <div>
          <label htmlFor="new-arch-email" className="block text-xs font-medium text-ink">
            Email
          </label>
          <input
            id="new-arch-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
          />
        </div>

        {/* Téléphone + Site web */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="new-arch-phone" className="block text-xs font-medium text-ink">
              Téléphone
            </label>
            <input
              id="new-arch-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
            />
          </div>
          <div>
            <label htmlFor="new-arch-website" className="block text-xs font-medium text-ink">
              Site web
            </label>
            <input
              id="new-arch-website"
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
            <label htmlFor="new-arch-siret" className="block text-xs font-medium text-ink">
              SIRET (14 chiffres) <span className="text-xs font-normal text-muted">optionnel</span>
            </label>
            <input
              id="new-arch-siret"
              type="text"
              value={siret}
              onChange={(e) => setSiret(e.target.value)}
              maxLength={14}
              placeholder="ex : 12345678901234"
              className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
            />
          </div>
          <div>
            <label htmlFor="new-arch-siren" className="block text-xs font-medium text-ink">
              SIREN (9 chiffres) <span className="text-xs font-normal text-muted">matching</span>
            </label>
            <input
              id="new-arch-siren"
              type="text"
              value={siren}
              onChange={(e) => setSiren(e.target.value)}
              maxLength={9}
              className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
            />
          </div>
        </div>

        {/* Code postal + Ville */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="new-arch-zip" className="block text-xs font-medium text-ink">
              Code postal
            </label>
            <input
              id="new-arch-zip"
              type="text"
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
            />
          </div>
          <div>
            <label htmlFor="new-arch-city" className="block text-xs font-medium text-ink">
              Ville
            </label>
            <input
              id="new-arch-city"
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="focus:ring-brand-red/40 mt-1 w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 disabled:opacity-50"
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label htmlFor="new-arch-notes" className="block text-xs font-medium text-ink">
            Notes internes
          </label>
          <textarea
            id="new-arch-notes"
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
          <label htmlFor="new-arch-geo" className="block text-xs font-medium text-ink">
            Zones géo{" "}
            <span className="text-xs font-normal text-muted">(n° départements, virgule)</span>
          </label>
          <input
            id="new-arch-geo"
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
            <label htmlFor="new-arch-bmin" className="block text-xs font-medium text-ink">
              Budget min (€ HT) <span className="text-xs font-normal text-muted">optionnel</span>
            </label>
            <input
              id="new-arch-bmin"
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
            <label htmlFor="new-arch-bmax" className="block text-xs font-medium text-ink">
              Budget max (€ HT) <span className="text-xs font-normal text-muted">optionnel</span>
            </label>
            <input
              id="new-arch-bmax"
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

        {/* Drapeaux booléens */}
        <div className="flex flex-wrap gap-6">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={tutoiement}
              onChange={(e) => setTutoiement(e.target.checked)}
              className="accent-brand-red"
            />
            Tutoiement (pilote template Brevo TU)
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={preferred}
              onChange={(e) => setPreferred(e.target.checked)}
              className="accent-brand-red"
            />
            Architecte préféré
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
            className="hover:bg-brand-red/90 focus:ring-brand-red/40 rounded-full bg-brand-red px-4 py-2 text-sm font-medium text-white focus:outline-none focus:ring-2 disabled:opacity-50"
          >
            {pending ? "Création en cours…" : "Créer l'architecte"}
          </button>
          <a href="/sourcing/architectes" className="text-sm text-muted hover:text-ink">
            Annuler
          </a>
        </div>
      </fieldset>
    </form>
  );
}
