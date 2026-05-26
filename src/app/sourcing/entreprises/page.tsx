import { redirect } from "next/navigation";

import { isAdmin, toUserProfile } from "@/lib/auth/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { COMPANY_SPECIALTY_CODES } from "@/lib/architects/specialty-codes";
import type { Company } from "@/db/schema/companies";

import { CsvImportModal } from "@/components/contacts/CsvImportModal";
import { fetchCompaniesPage } from "./actions";

export const metadata = {
  title: "Entreprises/Majors — edifio Sourcing",
};

/**
 * Page liste Entreprises/Majors — Server Component.
 *
 * Périmètre :
 *  - Lecture tous rôles AlyoS authentifiés.
 *  - Tableau paginé 25 lignes/page avec filtres URL (search, specialty).
 *  - Colonnes : raison sociale, email, spécialités (badges), zones géo, budget, actions.
 *  - Boutons "Ajouter une entreprise" et "Importer CSV" (admin uniquement).
 *
 * Pattern résilience : try/catch absorbé + <ErrorBanner role="alert">.
 */
export const dynamic = "force-dynamic";

interface SearchParams {
  page?: string;
  search?: string;
  specialty?: string;
}

export default async function EntreprisesPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/sourcing/entreprises");
  const profile = toUserProfile(user);

  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const search = searchParams.search?.trim() || undefined;
  const specialty = searchParams.specialty?.trim() || undefined;

  let result: Awaited<ReturnType<typeof fetchCompaniesPage>> | null = null;
  let fetchError: string | null = null;

  try {
    result = await fetchCompaniesPage({ page, search, specialty });
  } catch (err) {
    console.error("[entreprises-page:fetch-failed]", err);
    fetchError = err instanceof Error ? err.message : String(err);
  }

  const companyList = result?.companyList ?? [];
  const total = result?.total ?? 0;
  const totalPages = result?.totalPages ?? 1;
  const adminUser = isAdmin(profile);

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink md:text-3xl">
            Entreprises / Majors
          </h1>
          <p className="mt-1 text-sm text-muted">
            {fetchError ? (
              "Erreur de chargement — voir détail ci-dessous."
            ) : (
              <>
                {total} entreprise{total !== 1 ? "s" : ""} dans l&rsquo;annuaire
              </>
            )}
          </p>
        </div>
        {adminUser ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            <a
              href="/sourcing/entreprises/nouveau"
              className="hover:bg-brand-red/90 focus:ring-brand-red/40 inline-flex h-8 items-center rounded-md bg-brand-red px-3 text-xs font-medium text-white focus:outline-none focus:ring-2"
            >
              + Ajouter une entreprise
            </a>
            <CsvImportModal type="company" />
          </div>
        ) : null}
      </header>

      <FilterBar search={search} specialty={specialty} />

      {fetchError ? (
        <ErrorBanner message={fetchError} />
      ) : companyList.length === 0 ? (
        <EmptyState hasFilters={!!(search || specialty)} />
      ) : (
        <>
          <CompaniesTable companies={companyList} isAdmin={adminUser} />
          {totalPages > 1 ? (
            <PaginationBar
              page={page}
              totalPages={totalPages}
              search={search}
              specialty={specialty}
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

function FilterBar({ search, specialty }: { search?: string; specialty?: string }) {
  return (
    <form
      method="get"
      action="/sourcing/entreprises"
      className="mb-4 flex flex-wrap gap-2"
      aria-label="Filtrer les entreprises"
    >
      <input
        type="search"
        name="search"
        defaultValue={search ?? ""}
        placeholder="Recherche raison sociale, contact, email…"
        className="focus:ring-brand-red/40 h-8 rounded-md border border-line bg-white px-3 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2"
        aria-label="Rechercher"
      />
      <select
        name="specialty"
        defaultValue={specialty ?? ""}
        className="focus:ring-brand-red/40 h-8 rounded-md border border-line bg-white px-2 text-sm text-ink focus:outline-none focus:ring-2"
        aria-label="Filtrer par spécialité"
      >
        <option value="">Toutes spécialités</option>
        {COMPANY_SPECIALTY_CODES.map(({ code, label }) => (
          <option key={code} value={code}>
            {label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="hover:bg-brand-red/90 focus:ring-brand-red/40 h-8 rounded-md bg-brand-red px-4 text-xs font-medium text-white focus:outline-none focus:ring-2"
      >
        Filtrer
      </button>
      <a
        href="/sourcing/entreprises"
        className="inline-flex h-8 items-center rounded-md border border-line bg-white px-3 text-xs text-muted hover:text-ink"
      >
        Réinitialiser
      </a>
    </form>
  );
}

function CompaniesTable({
  companies: rows,
  isAdmin: adminUser,
}: {
  companies: Company[];
  isAdmin: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-line bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface border-b border-line">
            <th className="px-4 py-2.5 text-left font-medium text-ink">Raison sociale</th>
            <th className="px-4 py-2.5 text-left font-medium text-ink">Email</th>
            <th className="px-4 py-2.5 text-left font-medium text-ink">Spécialités</th>
            <th className="px-4 py-2.5 text-left font-medium text-ink">Zones géo</th>
            <th className="px-4 py-2.5 text-left font-medium text-ink">Budget</th>
            {adminUser ? (
              <th className="px-4 py-2.5 text-left font-medium text-ink">
                <span className="sr-only">Actions</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((co) => (
            <CompanyRow key={co.id} company={co} isAdmin={adminUser} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompanyRow({ company: co, isAdmin: adminUser }: { company: Company; isAdmin: boolean }) {
  const budgetText =
    co.budgetMin !== null || co.budgetMax !== null
      ? [
          co.budgetMin !== null ? `min. ${co.budgetMin.toLocaleString("fr-FR")} €` : null,
          co.budgetMax !== null ? `max. ${co.budgetMax.toLocaleString("fr-FR")} €` : null,
        ]
          .filter(Boolean)
          .join(" / ")
      : "—";

  return (
    <tr className="hover:bg-surface/60 border-b border-line last:border-0">
      <td className="px-4 py-2.5 font-medium text-ink">
        <a
          href={`/sourcing/entreprises/${co.id}`}
          className="focus:ring-brand-red/40 hover:underline focus:outline-none focus:ring-2"
        >
          {co.name}
        </a>
      </td>
      <td className="px-4 py-2.5 text-ink-2">
        {co.email ? (
          <a
            href={`mailto:${co.email}`}
            className="focus:ring-brand-red/40 text-brand-red hover:underline focus:outline-none focus:ring-2"
          >
            {co.email}
          </a>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="px-4 py-2.5">
        {co.specialtyCodes.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {co.specialtyCodes.slice(0, 3).map((code) => {
              const found = COMPANY_SPECIALTY_CODES.find((s) => s.code === code);
              return (
                <span
                  key={code}
                  className="inline-flex rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-700"
                  title={found?.label ?? code}
                >
                  {found?.label ?? code}
                </span>
              );
            })}
            {co.specialtyCodes.length > 3 ? (
              <span className="text-[11px] text-muted">+{co.specialtyCodes.length - 3}</span>
            ) : null}
          </div>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="px-4 py-2.5 text-xs text-ink-2">
        {co.geoZones.length > 0 ? co.geoZones.slice(0, 5).join(", ") : "—"}
      </td>
      <td className="px-4 py-2.5 text-xs text-ink-2">{budgetText}</td>
      {adminUser ? (
        <td className="px-4 py-2.5">
          <a
            href={`/sourcing/entreprises/${co.id}`}
            className="focus:ring-brand-red/40 text-xs text-muted hover:text-ink focus:outline-none focus:ring-2"
          >
            Éditer
          </a>
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
}: {
  page: number;
  totalPages: number;
  search?: string;
  specialty?: string;
}) {
  const buildHref = (p: number) => {
    const params = new URLSearchParams();
    params.set("page", String(p));
    if (search) params.set("search", search);
    if (specialty) params.set("specialty", specialty);
    return `/sourcing/entreprises?${params.toString()}`;
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
            className="hover:bg-surface focus:ring-brand-red/40 rounded-md border border-line bg-white px-3 py-1 focus:outline-none focus:ring-2"
          >
            ← Précédent
          </a>
        ) : null}
        {page < totalPages ? (
          <a
            href={buildHref(page + 1)}
            className="hover:bg-surface focus:ring-brand-red/40 rounded-md border border-line bg-white px-3 py-1 focus:outline-none focus:ring-2"
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
        ? "Aucune entreprise ne correspond à ces filtres."
        : "L'annuaire est vide. Importez des entreprises via Import CSV ou ajoutez-en manuellement."}
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
        Impossible de charger les entreprises. Réessayez dans quelques instants — si le problème
        persiste, contactez l&rsquo;administrateur.
      </p>
      {isDev ? (
        <p className="mx-auto mt-4 max-w-xl break-words font-mono text-[11px] text-error">
          {message}
        </p>
      ) : null}
    </div>
  );
}
