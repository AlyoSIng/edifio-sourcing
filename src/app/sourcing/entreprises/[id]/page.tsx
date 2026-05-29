import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { companies } from "@/db/schema/companies";
import { isAdmin, toUserProfile } from "@/lib/auth/types";
import { getRequiredOrgId } from "@/lib/auth/get-required-org-id";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ALYOS_ORG_ID } from "@/lib/constants/organization";
import { COMPANY_SPECIALTY_CODES } from "@/lib/architects/specialty-codes";

import { CompanyEditForm } from "./CompanyEditForm";

/**
 * Page fiche Entreprise/Major — Server Component.
 *
 * Périmètre :
 *  - Lecture : tous rôles authentifiés AlyoS.
 *  - Édition : admin uniquement.
 *
 * Pattern résilience : try/catch absorbé + ErrorBanner.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: "Fiche entreprise — edifio Sourcing" };
}

const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export default async function EntrepriseFichePage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/sourcing/entreprises/${params.id}`);
  const profile = toUserProfile(user);
  const adminUser = isAdmin(profile);
  // Résolution dynamique de l'org (Phase A multi-tenant).
  // Try/catch propre : si la requête memberships échoue, fallback sur ALYOS_ORG_ID
  // plutôt que crash 500 de la page entière.
  let orgId: string;
  try {
    orgId = await getRequiredOrgId(user.id);
  } catch (err) {
    console.error("[entreprise-detail:org-resolution-failed]", err);
    orgId = ALYOS_ORG_ID;
  }

  let company: Awaited<ReturnType<typeof fetchCompany>> | null = null;
  let fetchError: string | null = null;

  try {
    company = await fetchCompany(params.id, orgId);
  } catch (err) {
    console.error("[entreprise-fiche:fetch-failed]", err);
    fetchError = err instanceof Error ? err.message : String(err);
  }

  if (!fetchError && !company) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <nav aria-label="Fil d'Ariane" className="mb-4 text-xs text-muted">
        <a href="/sourcing/entreprises" className="hover:underline">
          Entreprises / Majors
        </a>
        {" / "}
        <span className="text-ink">{company?.name ?? params.id}</span>
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
      ) : company ? (
        <div className="rounded-md border border-line bg-white p-6">
          {/* En-tête */}
          <header className="mb-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="font-display text-xl font-bold text-ink">{company.name}</h1>
                {company.contactName ? (
                  <p className="mt-0.5 text-sm text-ink-2">{company.contactName}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                {company.preferred ? (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                    ★ Préférée
                  </span>
                ) : null}
                {!company.active ? (
                  <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
                    Inactive
                  </span>
                ) : null}
                {company.rgpdOpposition ? (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-800">
                    Opposition RGPD
                  </span>
                ) : null}
              </div>
            </div>
          </header>

          {/* Contact */}
          <section aria-labelledby="co-contact-heading" className="mb-6">
            <h2
              id="co-contact-heading"
              className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Contact
            </h2>
            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <InfoField label="Email" value={company.email} isEmail />
              <InfoField label="Téléphone" value={company.phone} />
              <InfoField label="Site web" value={company.website} isUrl />
              <InfoField label="SIREN" value={company.siren} />
              <InfoField
                label="Ville"
                value={[company.zip, company.city].filter(Boolean).join(" ") || null}
              />
            </dl>
          </section>

          {/* Profil */}
          <section aria-labelledby="co-profil-heading" className="mb-6">
            <h2
              id="co-profil-heading"
              className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Profil
            </h2>
            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted">Spécialités</dt>
                <dd className="mt-0.5">
                  {company.specialtyCodes.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {company.specialtyCodes.map((code) => {
                        const found = COMPANY_SPECIALTY_CODES.find((s) => s.code === code);
                        return (
                          <span
                            key={code}
                            className="inline-flex rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-700"
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
                  {company.geoZones.length > 0 ? company.geoZones.join(", ") : "—"}
                </dd>
              </div>
              {company.budgetMin !== null || company.budgetMax !== null ? (
                <div>
                  <dt className="text-muted">Budget opération (€ HT)</dt>
                  <dd className="mt-0.5 text-ink">
                    {company.budgetMin !== null
                      ? `min. ${company.budgetMin.toLocaleString("fr-FR")} €`
                      : ""}
                    {company.budgetMin !== null && company.budgetMax !== null ? " — " : ""}
                    {company.budgetMax !== null
                      ? `max. ${company.budgetMax.toLocaleString("fr-FR")} €`
                      : ""}
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>

          {/* Notes */}
          {company.notes ? (
            <section aria-labelledby="co-notes-heading" className="mb-6">
              <h2
                id="co-notes-heading"
                className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted"
              >
                Notes
              </h2>
              <p className="whitespace-pre-line text-sm text-ink">{company.notes}</p>
            </section>
          ) : null}

          {/* Formulaire édition (admin) */}
          {adminUser ? (
            <section aria-labelledby="co-edit-heading" className="border-t border-line pt-6">
              <h2 id="co-edit-heading" className="mb-4 text-sm font-semibold text-ink">
                Modifier la fiche
              </h2>
              <CompanyEditForm company={company} />
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

async function fetchCompany(id: string, orgId: string) {
  if (!UUID_SHAPE.test(id)) return null;

  const rows = await db
    .select()
    .from(companies)
    .where(and(eq(companies.id, id), eq(companies.organizationId, orgId)))
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
