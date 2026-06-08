import { redirect } from "next/navigation";
import Link from "next/link";

import { isAdmin, toUserProfile } from "@/lib/auth/types";
import { getRequiredOrgId } from "@/lib/auth/get-required-org-id";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ALYOS_ORG_ID } from "@/lib/constants/organization";
import { BE_SPECIALTY_CODES } from "@/lib/architects/specialty-codes";
import type { BureauEtudes } from "@/db/schema/bureaux-etudes";

import { CsvImportModal } from "@/components/contacts/CsvImportModal";
import { fetchBEPage } from "./actions";
import { DeleteBEButton } from "./DeleteBEButton";
import { DuplicateBEManager } from "./DuplicateBEManager";
import { detectBEDuplicatesAction } from "./duplicate-be-actions";
import type { DuplicateBEGroup } from "./duplicate-be-actions";

export const metadata = {
  title: "Bureaux d'Études — edifio Sourcing",
};

/**
 * Page liste Bureaux d'Études — Server Component.
 *
 * Périmètre :
 *  - Lecture tous rôles AlyoS authentifiés.
 *  - Tableau paginé 25 lignes/page avec filtres URL (search, specialty).
 *  - Colonnes : cabinet, email, spécialités (badges), zones géo, budget, actions.
 *  - Boutons "Ajouter un BET" et "Importer CSV" (admin uniquement).
 *
 * Pattern résilience : try/catch absorbé + <ErrorBanner role="alert">.
 */
export const dynamic = "force-dynamic";

interface SearchParams {
  page?: string;
  search?: string;
  specialty?: string;
  implantation?: string;
}

export default async function BureauEtudesPage(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/sourcing/bureaux-etudes");
  const profile = toUserProfile(user);
  // Résolution dynamique de l'org (Phase A multi-tenant).
  // Try/catch propre : si la requête memberships échoue, fallback sur ALYOS_ORG_ID
  // plutôt que crash 500 de la page entière.
  let orgId: string;
  try {
    orgId = await getRequiredOrgId(user.id);
  } catch (err) {
    console.error("[bureaux-etudes:org-resolution-failed]", err);
    orgId = ALYOS_ORG_ID;
  }

  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const search = searchParams.search?.trim() || undefined;
  const specialty = searchParams.specialty?.trim() || undefined;
  const implantation = searchParams.implantation?.trim() || undefined;

  let result: Awaited<ReturnType<typeof fetchBEPage>> | null = null;
  let fetchError: string | null = null;

  try {
    result = await fetchBEPage({ page, search, specialty, implantation, orgId });
  } catch (err) {
    console.error("[bureaux-etudes-page:fetch-failed]", err);
    fetchError = err instanceof Error ? err.message : String(err);
  }

  const bureaux = result?.bureaux ?? [];
  const total = result?.total ?? 0;
  const totalPages = result?.totalPages ?? 1;
  const adminUser = isAdmin(profile);

  // Détection des doublons — uniquement pour les admins, erreur absorbée
  let duplicateGroups: DuplicateBEGroup[] = [];
  if (adminUser) {
    try {
      duplicateGroups = await detectBEDuplicatesAction(orgId);
    } catch (err) {
      console.error("[bureaux-etudes-page:duplicates-failed]", err);
      // Pas bloquant : on affiche la page sans le bandeau doublons
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink md:text-3xl">
            Bureaux d&rsquo;Études
          </h1>
          <p className="mt-1 text-sm text-muted">
            {fetchError ? (
              "Erreur de chargement — voir détail ci-dessous."
            ) : (
              <>
                {total} bureau{total !== 1 ? "x" : ""} dans l&rsquo;annuaire
              </>
            )}
          </p>
        </div>
        {adminUser ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link
              href="/sourcing/bureaux-etudes/nouveau"
              className="hover:bg-brand-red/90 focus:ring-brand-red/40 inline-flex h-8 items-center rounded-full bg-brand-red px-3 text-xs font-medium text-white focus:outline-none focus:ring-2"
            >
              + Ajouter un BET
            </Link>
            <CsvImportModal type="be" />
          </div>
        ) : null}
      </header>

      {/* Bandeau doublons — visible admin uniquement, rendu côté client */}
      {adminUser && <DuplicateBEManager duplicateGroups={duplicateGroups} />}

      <FilterBar search={search} specialty={specialty} implantation={implantation} />

      {fetchError ? (
        <ErrorBanner message={fetchError} />
      ) : bureaux.length === 0 ? (
        <EmptyState hasFilters={!!(search || specialty || implantation)} />
      ) : (
        <>
          <BETable bureaux={bureaux} isAdmin={adminUser} />
          {totalPages > 1 ? (
            <PaginationBar
              page={page}
              totalPages={totalPages}
              search={search}
              specialty={specialty}
              implantation={implantation}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

// ============================================================================
// Composants internes
// ============================================================================

/** Dérive le code département depuis un code postal FR (2 chars, ou 3 pour DOM). */
function deptFromZip(zip: string | null | undefined): string | null {
  if (!zip) return null;
  const digits = zip.trim();
  if (digits.startsWith("97") && digits.length >= 3) return digits.slice(0, 3);
  if (digits.length >= 2) return digits.slice(0, 2);
  return null;
}

function FilterBar({
  search,
  specialty,
  implantation,
}: {
  search?: string;
  specialty?: string;
  implantation?: string;
}) {
  return (
    <form
      method="get"
      action="/sourcing/bureaux-etudes"
      className="mb-4 flex flex-wrap gap-2"
      aria-label="Filtrer les bureaux d'études"
    >
      <input
        type="search"
        name="search"
        defaultValue={search ?? ""}
        placeholder="Recherche cabinet, contact, email…"
        className="focus:ring-brand-red/40 h-8 rounded-md border border-line bg-white px-3 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2"
        aria-label="Rechercher"
      />
      <input
        type="text"
        name="implantation"
        defaultValue={implantation ?? ""}
        placeholder="Siège (ex. 75)"
        className="focus:ring-brand-red/40 h-8 w-28 rounded-md border border-line bg-white px-3 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2"
        aria-label="Filtrer par département de siège"
      />
      <select
        name="specialty"
        defaultValue={specialty ?? ""}
        className="focus:ring-brand-red/40 h-8 rounded-md border border-line bg-white px-2 text-sm text-ink focus:outline-none focus:ring-2"
        aria-label="Filtrer par spécialité"
      >
        <option value="">Toutes spécialités</option>
        {BE_SPECIALTY_CODES.map(({ code, label }) => (
          <option key={code} value={code}>
            {label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="hover:bg-brand-red/90 focus:ring-brand-red/40 h-8 rounded-full bg-brand-red px-4 text-xs font-medium text-white focus:outline-none focus:ring-2"
      >
        Filtrer
      </button>
      <Link
        href="/sourcing/bureaux-etudes"
        className="inline-flex h-8 items-center rounded-full border border-line bg-white px-3 text-xs text-muted hover:text-ink"
      >
        Réinitialiser
      </Link>
    </form>
  );
}

function BETable({ bureaux, isAdmin: adminUser }: { bureaux: BureauEtudes[]; isAdmin: boolean }) {
  return (
    <div className="overflow-x-auto rounded-md border border-line bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface border-b border-line">
            <th className="px-4 py-2.5 text-left font-medium text-ink">Cabinet</th>
            <th className="px-4 py-2.5 text-left font-medium text-ink">Email</th>
            <th className="px-4 py-2.5 text-left font-medium text-ink">Spécialités</th>
            <th className="px-4 py-2.5 text-left font-medium text-ink">Siège</th>
            <th className="px-4 py-2.5 text-left font-medium text-ink">Dép. projets</th>
            <th className="px-4 py-2.5 text-left font-medium text-ink">Budget</th>
            {adminUser ? (
              <th className="px-4 py-2.5 text-left font-medium text-ink">
                <span className="sr-only">Actions</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {bureaux.map((be) => (
            <BERow key={be.id} be={be} isAdmin={adminUser} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BERow({ be, isAdmin: adminUser }: { be: BureauEtudes; isAdmin: boolean }) {
  const budgetText =
    be.budgetMin !== null || be.budgetMax !== null
      ? [
          be.budgetMin !== null ? `min. ${be.budgetMin.toLocaleString("fr-FR")} €` : null,
          be.budgetMax !== null ? `max. ${be.budgetMax.toLocaleString("fr-FR")} €` : null,
        ]
          .filter(Boolean)
          .join(" / ")
      : "—";

  return (
    <tr className="hover:bg-surface/60 border-b border-line last:border-0">
      <td className="px-4 py-2.5 font-medium text-ink">
        <a
          href={`/sourcing/bureaux-etudes/${be.id}`}
          className="focus:ring-brand-red/40 hover:underline focus:outline-none focus:ring-2"
        >
          {be.cabinet}
        </a>
      </td>
      <td className="px-4 py-2.5 text-ink-2">
        {be.email ? (
          <a
            href={`mailto:${be.email}`}
            className="focus:ring-brand-red/40 text-brand-red hover:underline focus:outline-none focus:ring-2"
          >
            {be.email}
          </a>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="px-4 py-2.5">
        {be.specialtyCodes.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {be.specialtyCodes.slice(0, 3).map((code) => {
              const found = BE_SPECIALTY_CODES.find((s) => s.code === code);
              return (
                <span
                  key={code}
                  className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700"
                  title={found?.label ?? code}
                >
                  {found?.label ?? code}
                </span>
              );
            })}
            {be.specialtyCodes.length > 3 ? (
              <span className="text-[11px] text-muted">+{be.specialtyCodes.length - 3}</span>
            ) : null}
          </div>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      {/* Siège — département dérivé du code postal */}
      <td className="px-4 py-2.5 font-mono text-xs text-ink-2">
        {deptFromZip(be.zip) ?? <span className="text-muted">—</span>}
      </td>
      {/* Dép. projets — tous les geo_zones sous forme de badges */}
      <td className="px-4 py-2.5">
        {be.geoZones.length === 0 ? (
          <span className="text-muted">—</span>
        ) : (
          <div className="flex flex-wrap gap-0.5">
            {be.geoZones.map((dept) => (
              <span
                key={dept}
                className="inline-flex items-center rounded-sm bg-paper-2 px-1 py-0.5 font-mono text-[10px] text-ink-2"
              >
                {dept}
              </span>
            ))}
          </div>
        )}
      </td>
      <td className="px-4 py-2.5 text-xs text-ink-2">{budgetText}</td>
      {adminUser ? (
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-3">
            <a
              href={`/sourcing/bureaux-etudes/${be.id}`}
              className="focus:ring-brand-red/40 text-xs text-muted hover:text-ink focus:outline-none focus:ring-2"
            >
              Éditer
            </a>
            <DeleteBEButton beId={be.id} cabinet={be.cabinet} />
          </div>
        </td>
      ) : null}
    </tr>
  );
}

function PaginationBar({
  page,
  totalPages,
  search,
  specialty,
  implantation,
}: {
  page: number;
  totalPages: number;
  search?: string;
  specialty?: string;
  implantation?: string;
}) {
  const buildHref = (p: number) => {
    const params = new URLSearchParams();
    params.set("page", String(p));
    if (search) params.set("search", search);
    if (specialty) params.set("specialty", specialty);
    if (implantation) params.set("implantation", implantation);
    return `/sourcing/bureaux-etudes?${params.toString()}`;
  };

  return (
    <nav
      aria-label="Pagination"
      className="mt-4 flex items-center justify-between text-sm text-muted"
    >
      <span>
        Page {page} / {totalPages}
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <a
            href={buildHref(page - 1)}
            className="hover:bg-surface focus:ring-brand-red/40 rounded-full border border-line bg-white px-3 py-1 focus:outline-none focus:ring-2"
          >
            ← Précédent
          </a>
        ) : null}
        {page < totalPages ? (
          <a
            href={buildHref(page + 1)}
            className="hover:bg-surface focus:ring-brand-red/40 rounded-full border border-line bg-white px-3 py-1 focus:outline-none focus:ring-2"
          >
            Suivant →
          </a>
        ) : null}
      </div>
    </nav>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div
      role="status"
      className="rounded-md border border-line bg-white px-6 py-12 text-center text-sm text-muted"
    >
      {hasFilters
        ? "Aucun bureau d'études ne correspond à ces filtres."
        : "L'annuaire est vide. Importez des BET via Import CSV ou ajoutez-en manuellement."}
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  const isDev = process.env.NODE_ENV !== "production";
  return (
    <div
      role="alert"
      className="rounded-md border border-l-4 border-line border-l-error bg-error-bg px-6 py-8 text-center"
    >
      <div className="mb-2 text-3xl text-error opacity-60" aria-hidden="true">
        ⚠
      </div>
      <h2 className="font-display text-base font-semibold text-error">Annuaire indisponible</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-2">
        Impossible de charger les bureaux d&rsquo;études. Réessayez dans quelques instants — si le
        problème persiste, contactez l&rsquo;administrateur.
      </p>
      {isDev ? (
        <p className="mx-auto mt-4 max-w-xl break-words font-mono text-[11px] text-error">
          {message}
        </p>
      ) : null}
    </div>
  );
}
