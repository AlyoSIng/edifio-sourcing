import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { shortlistCriteria } from "@/db/schema/shortlist";
import { isAdmin, toUserProfile } from "@/lib/auth/types";
import { getRequiredOrgId } from "@/lib/auth/get-required-org-id";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ALYOS_ORG_ID } from "@/lib/constants/organization";
import type { Architect } from "@/db/schema/architects";

import { fetchArchitectsPage } from "./actions";
import { CsvImportButton } from "./CsvImportButton";
import { DeleteArchitectButton } from "./DeleteArchitectButton";
import { PappersEnrichButton } from "./PappersEnrichButton";
import { DuplicateManager } from "./DuplicateManager";
import { detectArchitectDuplicatesAction } from "./duplicate-actions";
import type { DuplicateGroup } from "./duplicate-actions";

export const metadata = {
  title: "Architectes — edifio Sourcing",
};

/**
 * Page liste Architectes — Server Component.
 *
 * Source de vérité visuelle :
 *   `design/maquettes/maquettes_v5_admin_architectes.html` §liste
 *
 * Périmètre fonctionnel :
 *  - Lecture autorisée à tous les rôles AlyoS authentifiés (décision CTO Q3).
 *  - Tableau paginé 20 lignes/page avec filtres URL (search, departement,
 *    tutoiement, solicitable, rgpdOpposition).
 *  - Colonnes : cabinet, contact, email, département, badges tutoiement /
 *    solicitable / RGPD.
 *  - Lien vers fiche individuelle `/sourcing/architectes/[id]`.
 *
 * Pattern résilience (MEMORY) :
 *  - try/catch absorbé : si DATABASE_URL absent (CI sans BDD) ou Supabase blip,
 *    on affiche un <ErrorBanner role="alert"> plutôt qu'un 500 brutal.
 */
export const dynamic = "force-dynamic";

interface SearchParams {
  page?: string;
  search?: string;
  departement?: string;
  implantation?: string;
  tutoiement?: string;
  solicitable?: string;
  rgpdOpposition?: string;
}

export default async function ArchitectesPage({ searchParams }: { searchParams: SearchParams }) {
  // Auth check défensif (le middleware a normalement déjà filtré).
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/sourcing/architectes");
  const profile = toUserProfile(user);
  // Résolution dynamique de l'org (Phase A multi-tenant).
  // Try/catch propre : si la requête memberships échoue, fallback sur ALYOS_ORG_ID
  // plutôt que crash 500 de la page entière.
  let orgId: string;
  try {
    orgId = await getRequiredOrgId(user.id);
  } catch (err) {
    console.error("[architectes:org-resolution-failed]", err);
    orgId = ALYOS_ORG_ID;
  }

  // Parsing des searchParams URL
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const search = searchParams.search?.trim() || undefined;
  const departement = searchParams.departement?.trim() || undefined;
  const implantation = searchParams.implantation?.trim() || undefined;
  const tutoiement =
    searchParams.tutoiement === "true"
      ? true
      : searchParams.tutoiement === "false"
        ? false
        : undefined;
  const solicitable =
    searchParams.solicitable === "true"
      ? true
      : searchParams.solicitable === "false"
        ? false
        : undefined;
  const rgpdOpposition =
    searchParams.rgpdOpposition === "true"
      ? true
      : searchParams.rgpdOpposition === "false"
        ? false
        : undefined;

  // -------------------------------------------------------------------------
  // Résilience runtime (pattern MEMORY : try/catch absorbé)
  // -------------------------------------------------------------------------
  let result: Awaited<ReturnType<typeof fetchArchitectsPage>> | null = null;
  let fetchError: string | null = null;

  try {
    result = await fetchArchitectsPage({
      page,
      search,
      departement,
      implantation,
      tutoiement,
      solicitable,
      rgpdOpposition,
      orgId,
    });
  } catch (err) {
    console.error("[architectes-page:fetch-failed]", err);
    fetchError = err instanceof Error ? err.message : String(err);
  }

  const architectsList = result?.architects ?? [];
  const total = result?.total ?? 0;
  const totalPages = result?.totalPages ?? 1;
  const adminUser = isAdmin(profile);

  // Détection des doublons — uniquement pour les admins, erreur absorbée
  let duplicateGroups: DuplicateGroup[] = [];
  if (adminUser) {
    try {
      duplicateGroups = await detectArchitectDuplicatesAction(orgId);
    } catch (err) {
      console.error("[architectes-page:duplicates-failed]", err);
      // Pas bloquant : on affiche la page sans le bandeau doublons
    }
  }

  // Critères de short-list actifs — indicateur visuel (Tandem Phase 1).
  // Erreur absorbée : badge non bloquant si BDD indisponible.
  let hasShortlistCriteria = false;
  try {
    const criteriaRows = await db
      .select({ id: shortlistCriteria.id })
      .from(shortlistCriteria)
      .where(
        and(
          eq(shortlistCriteria.organizationId, orgId),
          eq(shortlistCriteria.target, "architects"),
        ),
      )
      .limit(1);
    hasShortlistCriteria = criteriaRows.length > 0;
  } catch {
    // Erreur absorbée — le badge n'est pas critique
  }

  return (
    <div className="mx-auto max-w-6xl">
      {/* En-tête de page */}
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink md:text-3xl">
            Architectes
          </h1>
          <p className="mt-1 text-sm text-muted">
            {fetchError ? (
              "Erreur de chargement — voir détail ci-dessous."
            ) : (
              <>
                {total} cabinet{total !== 1 ? "s" : ""} dans l&rsquo;annuaire
              </>
            )}
          </p>
        </div>
        {adminUser ? (
          <div className="flex shrink-0 flex-wrap items-start gap-2">
            {/* Badge critères short-list actifs — Tandem Phase 1 */}
            {hasShortlistCriteria ? (
              <a
                href="/sourcing/admin/shortlist"
                title="Critères de short-list configurés — cliquer pour modifier"
                className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
              >
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                Short-list active
              </a>
            ) : null}
            <PappersEnrichButton />
            <CsvImportButton />
            <span className="inline-flex items-center rounded-md border border-line bg-white px-3 py-1.5 text-xs text-muted opacity-50">
              Export CSV (bientôt)
            </span>
          </div>
        ) : null}
      </header>

      {/* Bandeau doublons — visible admin uniquement, rendu côté client */}
      {adminUser && <DuplicateManager duplicateGroups={duplicateGroups} />}

      {/* Barre de filtres */}
      <FilterBar
        search={search}
        departement={departement}
        implantation={implantation}
        tutoiement={tutoiement}
        solicitable={solicitable}
        rgpdOpposition={rgpdOpposition}
      />

      {/* Contenu principal */}
      {fetchError ? (
        <ErrorBanner message={fetchError} />
      ) : architectsList.length === 0 ? (
        <EmptyState
          hasFilters={
            !!(
              search ||
              departement ||
              implantation ||
              tutoiement !== undefined ||
              solicitable !== undefined ||
              rgpdOpposition !== undefined
            )
          }
        />
      ) : (
        <>
          <ArchitectsTable architects={architectsList} isAdmin={adminUser} />
          {totalPages > 1 ? (
            <PaginationBar
              page={page}
              totalPages={totalPages}
              search={search}
              departement={departement}
              implantation={implantation}
              tutoiement={tutoiement}
              solicitable={solicitable}
              rgpdOpposition={rgpdOpposition}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

/** Dérive le code département depuis un code postal FR (2 chars, ou 3 pour DOM). */
function deptFromZip(zip: string | null | undefined): string | null {
  if (!zip) return null;
  const digits = zip.trim();
  if (digits.startsWith("97") && digits.length >= 3) return digits.slice(0, 3);
  if (digits.length >= 2) return digits.slice(0, 2);
  return null;
}

// ============================================================================
// Composants internes (Server Components purs)
// ============================================================================

/**
 * Barre de filtres — formulaire GET (pas de JS requis, compatible a11y).
 * Les champs modifient les searchParams URL pour re-render côté server.
 */
function FilterBar({
  search,
  departement,
  implantation,
  tutoiement,
  solicitable,
  rgpdOpposition,
}: {
  search?: string;
  departement?: string;
  implantation?: string;
  tutoiement?: boolean;
  solicitable?: boolean;
  rgpdOpposition?: boolean;
}) {
  return (
    <form
      method="get"
      action="/sourcing/architectes"
      className="mb-4 flex flex-wrap gap-2"
      aria-label="Filtrer les architectes"
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
      <input
        type="text"
        name="departement"
        defaultValue={departement ?? ""}
        placeholder="Dép. projets (ex. 75)"
        className="focus:ring-brand-red/40 h-8 w-36 rounded-md border border-line bg-white px-3 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2"
        aria-label="Filtrer par département de projets"
      />
      {/* Filtres booléens */}
      <label className="inline-flex items-center gap-1.5 rounded-md border border-line bg-white px-3 py-1 text-xs text-ink">
        <input
          type="checkbox"
          name="tutoiement"
          value="true"
          defaultChecked={tutoiement === true}
          className="accent-brand-red"
        />
        Tutoiement
      </label>
      <label className="inline-flex items-center gap-1.5 rounded-md border border-line bg-white px-3 py-1 text-xs text-ink">
        <input
          type="checkbox"
          name="solicitable"
          value="true"
          defaultChecked={solicitable === true}
          className="accent-brand-red"
        />
        Solicitable
      </label>
      <label className="inline-flex items-center gap-1.5 rounded-md border border-line bg-white px-3 py-1 text-xs text-ink">
        <input
          type="checkbox"
          name="rgpdOpposition"
          value="true"
          defaultChecked={rgpdOpposition === true}
          className="accent-brand-red"
        />
        Opposition RGPD
      </label>
      <button
        type="submit"
        className="hover:bg-brand-red/90 focus:ring-brand-red/40 h-8 rounded-md bg-brand-red px-4 text-xs font-medium text-white focus:outline-none focus:ring-2"
      >
        Filtrer
      </button>
      {/* Lien reset — efface tous les filtres */}
      <a
        href="/sourcing/architectes"
        className="inline-flex h-8 items-center rounded-md border border-line bg-white px-3 text-xs text-muted hover:text-ink"
      >
        Réinitialiser
      </a>
    </form>
  );
}

/**
 * Tableau principal des architectes.
 *
 * Colonnes : cabinet, contact, email, département, badges.
 * Si admin : lien « Éditer » sur chaque ligne.
 */
function ArchitectsTable({
  architects: rows,
  isAdmin: adminUser,
}: {
  architects: Architect[];
  isAdmin: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-line bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface border-b border-line">
            <th className="px-4 py-2.5 text-left font-medium text-ink">Cabinet</th>
            <th className="px-4 py-2.5 text-left font-medium text-ink">Contact</th>
            <th className="px-4 py-2.5 text-left font-medium text-ink">Email</th>
            <th className="px-4 py-2.5 text-left font-medium text-ink">Siège</th>
            <th className="px-4 py-2.5 text-left font-medium text-ink">Dép. projets</th>
            <th className="px-4 py-2.5 text-left font-medium text-ink">Badges</th>
            {adminUser ? (
              <th className="px-4 py-2.5 text-left font-medium text-ink">
                <span className="sr-only">Actions</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((archi) => (
            <ArchitectRow key={archi.id} architect={archi} isAdmin={adminUser} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Ligne de tableau pour un architecte.
 *
 * Badges :
 *  - 🤝 Tutoiement (colonne Gate 4)
 *  - ✓  Solicitable (email présent)
 *  - ⚠️  Opposition RGPD (art. 21)
 */
function ArchitectRow({
  architect: archi,
  isAdmin: adminUser,
}: {
  architect: Architect;
  isAdmin: boolean;
}) {
  return (
    <tr className="hover:bg-surface/60 border-b border-line last:border-0">
      <td className="px-4 py-2.5 font-medium text-ink">
        <a
          href={`/sourcing/architectes/${archi.id}`}
          className="focus:ring-brand-red/40 hover:underline focus:outline-none focus:ring-2"
        >
          {archi.cabinet}
        </a>
      </td>
      <td className="px-4 py-2.5 text-ink-2">{archi.contactName ?? "—"}</td>
      <td className="px-4 py-2.5 text-ink-2">
        {archi.email ? (
          <a
            href={`mailto:${archi.email}`}
            className="focus:ring-brand-red/40 text-brand-red hover:underline focus:outline-none focus:ring-2"
          >
            {archi.email}
          </a>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      {/* Siège — département dérivé du code postal */}
      <td className="px-4 py-2.5 font-mono text-xs text-ink-2">
        {deptFromZip(archi.zip) ?? <span className="text-muted">—</span>}
      </td>
      {/* Dép. projets — tous les geo_zones sous forme de badges */}
      <td className="px-4 py-2.5">
        {archi.geoZones.length === 0 ? (
          <span className="text-muted">—</span>
        ) : (
          <div className="flex flex-wrap gap-0.5">
            {archi.geoZones.map((dept) => (
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
      <td className="px-4 py-2.5">
        <div className="flex flex-wrap gap-1">
          {archi.tutoiement ? (
            <span
              className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700"
              title="Tutoiement"
            >
              TU
            </span>
          ) : null}
          {archi.solicitable ? (
            <span
              className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700"
              title="Solicitable (email renseigné)"
            >
              ✓ Sollicitable
            </span>
          ) : null}
          {archi.rgpdOpposition ? (
            <span
              className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700"
              title="Opposition RGPD art. 21"
            >
              RGPD
            </span>
          ) : null}
          {archi.preferred ? (
            <span
              className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700"
              title="Architecte préféré"
            >
              ★
            </span>
          ) : null}
        </div>
      </td>
      {adminUser ? (
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-3">
            <a
              href={`/sourcing/architectes/${archi.id}`}
              className="focus:ring-brand-red/40 text-xs text-muted hover:text-ink focus:outline-none focus:ring-2"
            >
              Éditer
            </a>
            <DeleteArchitectButton architectId={archi.id} cabinet={archi.cabinet} />
          </div>
        </td>
      ) : null}
    </tr>
  );
}

/** Barre de pagination simple — liens GET. */
function PaginationBar({
  page,
  totalPages,
  search,
  departement,
  implantation,
  tutoiement,
  solicitable,
  rgpdOpposition,
}: {
  page: number;
  totalPages: number;
  search?: string;
  departement?: string;
  implantation?: string;
  tutoiement?: boolean;
  solicitable?: boolean;
  rgpdOpposition?: boolean;
}) {
  // Construction des params communs (sans `page`)
  const buildHref = (p: number) => {
    const params = new URLSearchParams();
    params.set("page", String(p));
    if (search) params.set("search", search);
    if (departement) params.set("departement", departement);
    if (implantation) params.set("implantation", implantation);
    if (tutoiement !== undefined) params.set("tutoiement", String(tutoiement));
    if (solicitable !== undefined) params.set("solicitable", String(solicitable));
    if (rgpdOpposition !== undefined) params.set("rgpdOpposition", String(rgpdOpposition));
    return `/sourcing/architectes?${params.toString()}`;
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

/** État vide — aucun résultat. */
function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div
      role="status"
      className="rounded-md border border-line bg-white px-6 py-12 text-center text-sm text-muted"
    >
      {hasFilters
        ? "Aucun architecte ne correspond à ces filtres."
        : "L'annuaire est vide. Importez des architectes via Import CSV."}
    </div>
  );
}

/** Bannière d'erreur technique (DATABASE_URL absent ou Supabase blip). */
function ErrorBanner({ message }: { message: string }) {
  const isDev = process.env.NODE_ENV !== "production";
  return (
    <div
      role="alert"
      className="rounded-md border border-l-4 border-line border-l-error bg-error-bg px-6 py-8 text-center"
    >
      <div className="mb-2 text-3xl text-error opacity-60" aria-hidden="true">
        ⚠️
      </div>
      <h2 className="font-display text-base font-semibold text-error">Annuaire indisponible</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-2">
        Impossible de charger les architectes. Réessayez dans quelques instants — si le problème
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
