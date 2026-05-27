import Link from "next/link";
import { redirect } from "next/navigation";

import { isAdmin, toUserProfile } from "@/lib/auth/types";
import { ALYOS_ORG_ID } from "@/lib/constants/organization";
import { db } from "@/db/client";
import {
  getActiveSearchProfileName,
  getTendersOfTheDay,
  type TenderSortOrder,
} from "@/lib/sourcing/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { EmptyState } from "./EmptyState";
import { ErrorBanner } from "./ErrorBanner";
import { formatTodayLongFr } from "./format";
import { TenderActionsErrorToast } from "./TenderActionsErrorToast";
import { TenderCard } from "./TenderCard";
import { TenderFilterToolbar } from "./TenderFilterToolbar";

export const metadata = {
  title: "AO du jour — edifio Sourcing",
};

/**
 * Cette page ne doit jamais être mise en cache : la liste d'AO change à chaque
 * cron run (6h30 Paris lun-ven) + après chaque action utilisateur (Sélectionner
 * / Différer / Rejeter — PR n°5). En forçant le rendu dynamique on garantit
 * la fraîcheur sans avoir à `revalidatePath` à chaque mutation.
 */
export const dynamic = "force-dynamic";

/**
 * Page « AO du jour » — refonte UI v1 (PR refonte-ui-pages-v1).
 *
 * Source de vérité visuelle :
 * `design/maquettes/maquettes_v4_sourcing_modules.html` lignes 187-333 (M-A)
 * + lignes 537-562 (M-E états vide/erreur).
 *
 * Périmètre fonctionnel (inchangé) :
 *  - Server Component
 *  - Auth check défensif
 *  - Filtre tenant explicite via `ALYOS_ORG_ID`
 *  - Liste verticale (un AO = une carte), tri par score serveur
 *  - Pattern de résilience runtime (hotfix PR #22) — try/catch absorbé
 *
 * **Changements UI vs PR n°4** :
 *  - Plus de logo/footer/EdifioLogo locaux : c'est l'AppShell global qui
 *    fournit la chrome (cf. `src/components/app-shell/AppShell.tsx`).
 *  - Header de page : eyebrow pill « date du jour » + h1 « AO du jour » +
 *    sous-titre dynamique (compteur + profil actif).
 *  - KPI row à 3 cases (Nouveaux / Score élevé / Clôture < 10 j) — calculée
 *    côté Server à partir de `tenders[]`.
 *  - Toolbar avec lien admin (visible admins uniquement) à droite.
 *  - Layout liste : `flex flex-col gap-3` (vertical) — la carte fait toute
 *    la largeur, conforme M-A (la grille 3 colonnes de la PR n°4 n'est pas
 *    dans la maquette définitive).
 */
export default async function AoDuJourPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  // Auth check défensif (le middleware a normalement déjà filtré).
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/sourcing/ao-du-jour");
  const profile = toUserProfile(user);

  // -------------------------------------------------------------------------
  // Parsing des searchParams (tri + filtres)
  // -------------------------------------------------------------------------
  const rawSort = String(searchParams.sort ?? "score");
  const sort: TenderSortOrder = (["score", "department", "deadline"] as const).includes(
    rawSort as TenderSortOrder,
  )
    ? (rawSort as TenderSortOrder)
    : "score";

  const rawDepts = searchParams.dept;
  const departments = Array.isArray(rawDepts) ? rawDepts : rawDepts ? [rawDepts] : [];

  const rawClosing = Number(searchParams.closing);
  const closingDays: 7 | 15 | 30 | null = ([7, 15, 30] as const).includes(rawClosing as never)
    ? (rawClosing as 7 | 15 | 30)
    : null;

  // -------------------------------------------------------------------------
  // Résilience runtime (hotfix PR #22, Board 2026-05-21) — INCHANGÉ
  // -------------------------------------------------------------------------
  // (a) try/catch absorbé pour les fetches BDD afin de ne pas casser CI E2E
  //     (DATABASE_URL absent) et de rendre une bannière dégradée en prod si
  //     Supabase blip 30s. (b) Comportement : stack tracée `console.error`,
  //     fallback `tenders = []` + `profileName = null` + `fetchError` non null,
  //     <ErrorBanner /> rendu. (c) Observabilité future Sentry Gate 8.
  let tenders: Awaited<ReturnType<typeof getTendersOfTheDay>> = [];
  let profileName: Awaited<ReturnType<typeof getActiveSearchProfileName>> = null;
  let fetchError: string | null = null;
  try {
    [tenders, profileName] = await Promise.all([
      getTendersOfTheDay(ALYOS_ORG_ID, db, { sort, departments, closingDays }),
      getActiveSearchProfileName(ALYOS_ORG_ID, db),
    ]);
  } catch (err) {
    // TODO(Gate 8) : Sentry.captureException — cf. `src/lib/audit/index.ts`.
    console.error("[ao-du-jour:fetch-failed]", err);
    fetchError = err instanceof Error ? err.message : String(err);
  }

  const todayLabel = formatTodayLongFr();
  const tendersCount = tenders.length;
  const highScoreCount = tenders.filter((t) => Number(t.score ?? "0") >= 75).length;
  // KPI "Clôture ≤ 15 j" — aligné avec les nouveaux filtres (était < 10 j avant)
  const closingSoonCount = tenders.filter((t) => isClosingSoon(t.deadline, 15)).length;

  // Départements disponibles dans le backlog courant (pour le multi-select)
  const availableDepts = [
    ...new Set(tenders.map((t) => t.department).filter(Boolean)),
  ].sort() as string[];

  return (
    <div className="mx-auto max-w-6xl">
      {/* En-tête de page */}
      <header className="mb-6">
        <span className="pill-eyebrow">{todayLabel}</span>
        <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-ink md:text-3xl">
          AO du jour
        </h1>
        <p className="mt-1 text-sm text-muted">
          {fetchError ? (
            "Erreur de chargement — voir détail ci-dessous."
          ) : tendersCount === 0 ? (
            "Aucun avis publié ne correspond à votre profil de recherche actif."
          ) : (
            <>
              {tendersCount} avis publié{tendersCount > 1 ? "s" : ""} depuis hier
              {profileName ? (
                <>
                  {" "}
                  · profil&nbsp;: <span className="text-ink">{profileName}</span>
                </>
              ) : null}
              , triés par{" "}
              {sort === "department"
                ? "département"
                : sort === "deadline"
                  ? "clôture imminente"
                  : "score de pertinence"}
              .
            </>
          )}
        </p>
      </header>

      {/* KPI row — 3 cases (cf. M-A lignes 216-221, on retire « différés » MVP) */}
      {!fetchError ? (
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KpiCard label="Nouveaux AO sourcés" value={tendersCount} accent />
          <KpiCard label="Score élevé (≥ 75)" value={highScoreCount} />
          <KpiCard label="Clôture ≤ 15 jours" value={closingSoonCount} />
        </div>
      ) : null}

      {/* Toolbar filtres — visible uniquement si pas d'erreur de chargement */}
      {!fetchError ? (
        <TenderFilterToolbar
          availableDepts={availableDepts}
          currentSort={sort}
          currentDepts={departments}
          currentClosingDays={closingDays}
        />
      ) : null}

      {/* Bouton "Ajouter un AO" — admins uniquement, consultation privée / gré à gré */}
      {isAdmin(profile) && !fetchError ? (
        <div className="mb-3 flex justify-end">
          <Link
            href="/sourcing/ao/nouveau"
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-paper-2"
          >
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5 shrink-0"
              aria-hidden
            >
              <path d="M8 3v10M3 8h10" />
            </svg>
            Ajouter un AO
          </Link>
        </div>
      ) : null}

      {/* Toast erreur server action (PR n°5) — toujours monté côté Client. */}
      <TenderActionsErrorToast />

      {/* Contenu principal */}
      {fetchError ? (
        <ErrorBanner message={fetchError} />
      ) : tendersCount === 0 ? (
        <EmptyState profileName={profileName} isAdmin={isAdmin(profile)} />
      ) : (
        <ul className="flex flex-col gap-3.5">
          {tenders.map((tender) => (
            <li key={tender.id}>
              <TenderCard tender={tender} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Compte un AO comme « clôture ≤ N jours » si sa deadline tombe dans les N
 * jours à venir. Null = pas de clôture renseignée, ne compte pas.
 * Défaut : 15 jours (aligné avec les filtres UI — était 10 jours avant).
 */
function isClosingSoon(deadline: Date | null, days = 15): boolean {
  if (!deadline) return false;
  const now = Date.now();
  const diffMs = deadline.getTime() - now;
  if (diffMs < 0) return false;
  return diffMs <= days * 24 * 3600 * 1000;
}

/**
 * Carte KPI réutilisable — chiffre en font-display + libellé en muted.
 * `accent` met le chiffre en `brand-red` (cf. M-A 1er KPI).
 */
function KpiCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="rounded-md border border-line bg-white px-4 py-3.5">
      <div
        className={`font-display text-3xl font-bold leading-none ${accent ? "text-brand-red" : "text-ink"}`}
      >
        {value}
      </div>
      <div className="mt-1.5 text-xs text-muted">{label}</div>
    </div>
  );
}
