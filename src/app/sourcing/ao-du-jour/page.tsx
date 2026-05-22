import { redirect } from "next/navigation";

import { isAdmin, toUserProfile } from "@/lib/auth/types";
import { ALYOS_ORG_ID } from "@/lib/constants/organization";
import { db } from "@/db/client";
import { getActiveSearchProfileName, getTendersOfTheDay } from "@/lib/sourcing/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { EmptyState } from "./EmptyState";
import { ErrorBanner } from "./ErrorBanner";
import { formatTodayLongFr } from "./format";
import { TenderActionsErrorToast } from "./TenderActionsErrorToast";
import { TenderCard } from "./TenderCard";

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
export default async function AoDuJourPage() {
  // Auth check défensif (le middleware a normalement déjà filtré).
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/sourcing/ao-du-jour");
  const profile = toUserProfile(user);

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
      getTendersOfTheDay(ALYOS_ORG_ID, db),
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
  const closingSoonCount = tenders.filter((t) => isClosingSoon(t.deadline)).length;

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
              , triés par score de pertinence.
            </>
          )}
        </p>
      </header>

      {/* KPI row — 3 cases (cf. M-A lignes 216-221, on retire « différés » MVP) */}
      {!fetchError ? (
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KpiCard label="Nouveaux AO sourcés" value={tendersCount} accent />
          <KpiCard label="Score élevé (≥ 75)" value={highScoreCount} />
          <KpiCard label="Clôture < 10 jours" value={closingSoonCount} />
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
 * Compte un AO comme « clôture < 10 jours » si sa deadline tombe dans les 10
 * jours à venir. Null = pas de clôture renseignée, ne compte pas.
 */
function isClosingSoon(deadline: Date | null): boolean {
  if (!deadline) return false;
  const now = Date.now();
  const diffMs = deadline.getTime() - now;
  if (diffMs < 0) return false;
  const tenDaysMs = 10 * 24 * 3600 * 1000;
  return diffMs <= tenDaysMs;
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
