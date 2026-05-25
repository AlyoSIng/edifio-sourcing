import { notFound, redirect } from "next/navigation";
import { eq, and } from "drizzle-orm";

import { db } from "@/db/client";
import { architects } from "@/db/schema/architects";
import { isAdmin, toUserProfile } from "@/lib/auth/types";
import { ALYOS_ORG_ID } from "@/lib/constants/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { ArchitectEditForm } from "./ArchitectEditForm";

/**
 * Page fiche architecte — Server Component.
 *
 * Source de vérité visuelle :
 *   `design/maquettes/maquettes_v5_admin_architectes.html` §fiche
 *
 * Périmètre :
 *  - Lecture : tous rôles authentifiés AlyoS.
 *  - Édition : admin uniquement (formulaire `ArchitectEditForm` inclus si admin).
 *  - Données : lecture directe BDD avec filtre tenant explicite `ALYOS_ORG_ID`.
 *
 * Pattern résilience (MEMORY) : try/catch absorbé avec ErrorBanner.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: `Fiche architecte — edifio Sourcing` };
}

export default async function ArchitectFichePage({ params }: { params: { id: string } }) {
  // Auth check défensif
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/sourcing/architectes/${params.id}`);
  const profile = toUserProfile(user);
  const adminUser = isAdmin(profile);

  // Résilience runtime
  let architect: Awaited<ReturnType<typeof fetchArchitect>> | null = null;
  let fetchError: string | null = null;

  try {
    architect = await fetchArchitect(params.id);
  } catch (err) {
    console.error("[architecte-fiche:fetch-failed]", err);
    fetchError = err instanceof Error ? err.message : String(err);
  }

  // Architecte introuvable (id inconnu ou hors tenant) → 404
  if (!fetchError && !architect) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      {/* Fil d'Ariane */}
      <nav aria-label="Fil d'Ariane" className="mb-4 text-xs text-muted">
        <a href="/sourcing/architectes" className="hover:underline">
          Architectes
        </a>
        {" / "}
        <span className="text-ink">{architect?.cabinet ?? params.id}</span>
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
      ) : architect ? (
        <div className="rounded-md border border-line bg-white p-6">
          {/* En-tête fiche */}
          <header className="mb-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="font-display text-xl font-bold text-ink">{architect.cabinet}</h1>
                {architect.contactName ? (
                  <p className="mt-0.5 text-sm text-ink-2">{architect.contactName}</p>
                ) : null}
              </div>
              {/* Badges statut */}
              <div className="flex shrink-0 flex-wrap gap-1.5">
                {architect.preferred ? (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                    ★ Préféré
                  </span>
                ) : null}
                {architect.solicitable ? (
                  <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">
                    ✓ Sollicitable
                  </span>
                ) : (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                    Non sollicitable
                  </span>
                )}
                {architect.active ? null : (
                  <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
                    Inactif
                  </span>
                )}
                {architect.rgpdOpposition ? (
                  <span
                    className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-800"
                    title={
                      architect.rgpdOppositionDate
                        ? `Opposition posée le ${architect.rgpdOppositionDate.toLocaleDateString("fr-FR")}`
                        : "Opposition RGPD art. 21"
                    }
                  >
                    Opposition RGPD
                  </span>
                ) : null}
              </div>
            </div>
          </header>

          {/* Informations de contact */}
          <section aria-labelledby="contact-heading" className="mb-6">
            <h2
              id="contact-heading"
              className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Contact
            </h2>
            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <InfoField label="Email" value={architect.email} isEmail />
              <InfoField label="Téléphone" value={architect.phone} />
              <InfoField label="Site web" value={architect.website} isUrl />
              <InfoField label="SIREN" value={architect.siren} />
              <InfoField
                label="Ville"
                value={[architect.zip, architect.city].filter(Boolean).join(" ") || null}
              />
            </dl>
          </section>

          {/* Spécialités et zones géo */}
          <section aria-labelledby="matching-heading" className="mb-6">
            <h2
              id="matching-heading"
              className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Matching
            </h2>
            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted">Spécialités</dt>
                <dd className="mt-0.5 text-ink">
                  {architect.specialtyCodes.length > 0 ? architect.specialtyCodes.join(", ") : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Zones géo</dt>
                <dd className="mt-0.5 text-ink">
                  {architect.geoZones.length > 0 ? architect.geoZones.join(", ") : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Tutoiement</dt>
                <dd className="mt-0.5 text-ink">
                  {architect.tutoiement ? "Oui" : "Non (vouvoiement)"}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Collaborations passées</dt>
                <dd className="mt-0.5 text-ink">{architect.pastCollabsCount}</dd>
              </div>
            </dl>
          </section>

          {/* Notes */}
          {architect.notes ? (
            <section aria-labelledby="notes-heading" className="mb-6">
              <h2
                id="notes-heading"
                className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted"
              >
                Notes
              </h2>
              <p className="whitespace-pre-line text-sm text-ink">{architect.notes}</p>
            </section>
          ) : null}

          {/* Formulaire d'édition (admin uniquement) */}
          {adminUser ? (
            <section aria-labelledby="edit-heading" className="border-t border-line pt-6">
              <h2 id="edit-heading" className="mb-4 text-sm font-semibold text-ink">
                Modifier la fiche
              </h2>
              <ArchitectEditForm architect={architect} />
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ============================================================================
// Helpers de fetch
// ============================================================================

/**
 * Récupère un architecte par son UUID, filtré sur le tenant AlyoS.
 * Retourne `null` si introuvable (pas d'erreur — 404 géré côté page).
 */
async function fetchArchitect(id: string) {
  // Validation UUID shape avant la requête
  const UUID_SHAPE =
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  if (!UUID_SHAPE.test(id)) return null;

  const rows = await db
    .select()
    .from(architects)
    .where(and(eq(architects.id, id), eq(architects.organizationId, ALYOS_ORG_ID)))
    .limit(1);

  return rows[0] ?? null;
}

// ============================================================================
// Composant interne InfoField
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
