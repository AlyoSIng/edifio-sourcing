import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { bureauEtudes } from "@/db/schema/bureaux-etudes";
import { isAdmin, toUserProfile } from "@/lib/auth/types";
import { ALYOS_ORG_ID } from "@/lib/constants/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BE_SPECIALTY_CODES } from "@/lib/architects/specialty-codes";

import { listBeDocuments } from "../actions";
import { BEDocumentsSection } from "./BEDocumentsSection";
import { BEEditForm } from "./BEEditForm";
import { PappersEnrichSingleButton } from "./PappersEnrichSingleButton";

/**
 * Page fiche Bureau d'Études — Server Component.
 *
 * Périmètre :
 *  - Lecture : tous rôles authentifiés AlyoS.
 *  - Édition : admin uniquement (formulaire BEEditForm si admin).
 *
 * Section Documents administratifs : chargée en parallèle de la fiche.
 * Pattern résilience : try/catch absorbé + ErrorBanner.
 *
 * Mis à jour dans feat/be-documents (Alex, 2026-05-26) :
 *  - import listBeDocuments + BEDocumentsSection
 *  - chargement parallèle be + documents
 */
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: "Fiche BET — edifio Sourcing" };
}

const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export default async function BEFichePage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/sourcing/bureaux-etudes/${params.id}`);
  const profile = toUserProfile(user);
  const adminUser = isAdmin(profile);

  let be: Awaited<ReturnType<typeof fetchBE>> | null = null;
  let fetchError: string | null = null;
  // Chargement des documents administratifs en parallèle de la fiche
  let documents: Awaited<ReturnType<typeof listBeDocuments>> = [];

  try {
    [be, documents] = await Promise.all([fetchBE(params.id), listBeDocuments(params.id)]);
  } catch (err) {
    console.error("[be-fiche:fetch-failed]", err);
    fetchError = err instanceof Error ? err.message : String(err);
  }

  if (!fetchError && !be) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <nav aria-label="Fil d'Ariane" className="mb-4 text-xs text-muted">
        <a href="/sourcing/bureaux-etudes" className="hover:underline">
          Bureaux d&rsquo;Études
        </a>
        {" / "}
        <span className="text-ink">{be?.cabinet ?? params.id}</span>
      </nav>

      {fetchError ? (
        <div
          role="alert"
          className="rounded-md border border-l-4 border-line border-l-error bg-error-bg px-6 py-8 text-center"
        >
          <p className="font-display text-base font-semibold text-error">Fiche indisponible</p>
          {process.env.NODE_ENV !== "production" ? (
            <p className="mt-2 font-mono text-[11px] text-error">{fetchError}</p>
          ) : null}
        </div>
      ) : be ? (
        <div className="rounded-md border border-line bg-white p-6">
          {/* En-tête */}
          <header className="mb-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="font-display text-xl font-bold text-ink">{be.cabinet}</h1>
                {be.contactName ? (
                  <p className="mt-0.5 text-sm text-ink-2">{be.contactName}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                {be.preferred ? (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                    ★ Préféré
                  </span>
                ) : null}
                {be.solicitable ? (
                  <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">
                    ✓ Sollicitable
                  </span>
                ) : (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                    Non sollicitable
                  </span>
                )}
                {!be.active ? (
                  <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
                    Inactif
                  </span>
                ) : null}
                {be.rgpdOpposition ? (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-800">
                    Opposition RGPD
                  </span>
                ) : null}
              </div>
            </div>
          </header>

          {/* Contact */}
          <section aria-labelledby="be-contact-heading" className="mb-6">
            <h2
              id="be-contact-heading"
              className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Contact
            </h2>
            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <InfoField label="Email" value={be.email} isEmail />
              <InfoField label="Téléphone" value={be.phone} />
              <InfoField label="Site web" value={be.website} isUrl />
              <InfoField label="SIRET" value={be.siret} />
              <InfoField label="SIREN" value={be.siren} />
              <InfoField
                label="Ville"
                value={[be.zip, be.city].filter(Boolean).join(" ") || null}
              />
            </dl>
            {adminUser ? (
              <div className="mt-3">
                <PappersEnrichSingleButton beId={be.id} />
              </div>
            ) : null}
          </section>

          {/* Profil matching */}
          <section aria-labelledby="be-matching-heading" className="mb-6">
            <h2
              id="be-matching-heading"
              className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Profil
            </h2>
            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted">Spécialités</dt>
                <dd className="mt-0.5">
                  {be.specialtyCodes.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {be.specialtyCodes.map((code) => {
                        const found = BE_SPECIALTY_CODES.find((s) => s.code === code);
                        return (
                          <span
                            key={code}
                            className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700"
                          >
                            {found?.label ?? code}
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Zones géo</dt>
                <dd className="mt-0.5 text-ink">
                  {be.geoZones.length > 0 ? be.geoZones.join(", ") : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Tutoiement</dt>
                <dd className="mt-0.5 text-ink">{be.tutoiement ? "Oui" : "Non (vouvoiement)"}</dd>
              </div>
              {be.budgetMin !== null || be.budgetMax !== null ? (
                <div>
                  <dt className="text-muted">Budget opération (€ HT)</dt>
                  <dd className="mt-0.5 text-ink">
                    {be.budgetMin !== null ? `min. ${be.budgetMin.toLocaleString("fr-FR")} €` : ""}
                    {be.budgetMin !== null && be.budgetMax !== null ? " — " : ""}
                    {be.budgetMax !== null ? `max. ${be.budgetMax.toLocaleString("fr-FR")} €` : ""}
                  </dd>
                </div>
              ) : null}
              {be.concoursOnly ? (
                <div>
                  <dt className="text-muted">Procédure</dt>
                  <dd className="mt-0.5 font-medium text-amber-700">Concours uniquement</dd>
                </div>
              ) : null}
            </dl>
          </section>

          {/* Notes */}
          {be.notes ? (
            <section aria-labelledby="be-notes-heading" className="mb-6">
              <h2
                id="be-notes-heading"
                className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted"
              >
                Notes
              </h2>
              <p className="whitespace-pre-line text-sm text-ink">{be.notes}</p>
            </section>
          ) : null}

          {/* Documents administratifs */}
          <BEDocumentsSection beId={be.id} documents={documents} isAdmin={adminUser} />

          {/* Formulaire édition (admin) */}
          {adminUser ? (
            <section aria-labelledby="be-edit-heading" className="border-t border-line pt-6">
              <h2 id="be-edit-heading" className="mb-4 text-sm font-semibold text-ink">
                Modifier la fiche
              </h2>
              <BEEditForm be={be} />
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ============================================================================
// Helpers fetch
// ============================================================================

async function fetchBE(id: string) {
  if (!UUID_SHAPE.test(id)) return null;

  const rows = await db
    .select()
    .from(bureauEtudes)
    .where(and(eq(bureauEtudes.id, id), eq(bureauEtudes.organizationId, ALYOS_ORG_ID)))
    .limit(1);

  return rows[0] ?? null;
}

// ============================================================================
// Composant InfoField
// ============================================================================

function InfoField({
  label,
  value,
  isEmail = false,
  isUrl = false,
}: {
  label: string;
  value: string | null | undefined;
  isEmail?: boolean;
  isUrl?: boolean;
}) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="mt-0.5 text-ink">
        {value ? (
          isEmail ? (
            <a
              href={`mailto:${value}`}
              className="focus:ring-brand-red/40 text-brand-red hover:underline focus:outline-none focus:ring-2"
            >
              {value}
            </a>
          ) : isUrl ? (
            <a
              href={value.startsWith("http") ? value : `https://${value}`}
              target="_blank"
              rel="noopener noreferrer"
              className="focus:ring-brand-red/40 text-brand-red hover:underline focus:outline-none focus:ring-2"
            >
              {value}
            </a>
          ) : (
            value
          )
        ) : (
          <span className="text-muted">—</span>
        )}
      </dd>
    </div>
  );
}
