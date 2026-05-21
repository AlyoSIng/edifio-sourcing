import Link from "next/link";
import { redirect } from "next/navigation";

import { EdifioLogo } from "@/components/EdifioLogo";
import { isAdmin, toUserProfile } from "@/lib/auth/types";
import { ALYOS_ORG_ID } from "@/lib/constants/organization";
import { db } from "@/db/client";
import { getActiveSearchProfileName, getTendersOfTheDay } from "@/lib/sourcing/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { EmptyState } from "./EmptyState";
import { ErrorBanner } from "./ErrorBanner";
import { formatTodayLongFr } from "./format";
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
 * Page « AO du jour » — V1 read-only (PR n°4).
 *
 * Source de vérité : `design/maquettes/maquettes_v1.html` lignes 173-225
 * (Maquette 1 mobile « AO du jour » persona Patrick + Maquette 2 desktop).
 *
 * Périmètre V1 :
 *  - Server Component, pas de `"use client"` (aucune interactivité)
 *  - Auth check défensif (redirect /login si pas de session)
 *  - Filtre tenant explicite via `ALYOS_ORG_ID` (mono-tenant MVP V1 — cf.
 *    `src/lib/constants/organization.ts` JSDoc pour le rationale Phase 2)
 *  - Liste responsive : 1 col mobile, 2 cols md, 3 cols lg
 *  - Pas de filtres / tri interactif (PR ultérieure)
 *  - Pas d'actions (Sélectionner / Différer / Rejeter — PR n°5)
 *
 * Pattern Server Component aligné sur `src/app/sourcing/admin/users/page.tsx`
 * (auth-check + `EdifioLogo` + footer mono).
 */
export default async function AoDuJourPage() {
  // Auth check défensif (le middleware a normalement déjà filtré, mais on
  // re-vérifie ici car Next 14 n'invoque pas systématiquement le middleware
  // en mode RSC streaming sur certains chemins).
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/sourcing/ao-du-jour");
  const profile = toUserProfile(user);

  // Données — appel uniquement dans la fonction async (jamais en module-scope)
  // pour que le Proxy lazy de `db` ne déclenche pas la lecture de
  // `DATABASE_URL` à l'import (env-clean `next build`).
  //
  // -------------------------------------------------------------------------
  // Résilience runtime (hotfix PR #22, Board 2026-05-21)
  // -------------------------------------------------------------------------
  // (a) Pourquoi : on encapsule les fetches BDD dans un try/catch absorbé,
  //     pattern aligné sur `src/lib/audit/index.ts` (cf. JSDoc en-tête).
  //     Motivations :
  //       1. CI E2E — le job `ci-e2e` ne fournit PAS `DATABASE_URL` au
  //          webServer Playwright (par design — il couvre middleware/auth/
  //          Resend, pas le métier BDD). Sans ce try/catch, le Proxy lazy
  //          `db` throw `Error: DATABASE_URL is not set` au premier `.select`,
  //          la page plante en 500, le <h1> n'est jamais rendu → 4 tests E2E
  //          rouges (le nouveau ao-du-jour + 3 auth-password qui font
  //          `waitForURL` sur cette page).
  //       2. Prod — si Supabase plante 30s, on préfère rendre une page
  //          dégradée plutôt que renvoyer un 500 brutal. C'est la même
  //          logique « defense applicative » qu'audit/index.ts.
  // (b) Comportement en cas d'erreur :
  //       - stack complète tracée via `console.error` structuré (capté
  //         par Vercel logs aujourd'hui ; futur Sentry — cf. ci-dessous).
  //       - `tenders = []` + `profileName = null` + `fetchError` non null.
  //       - JSX bascule sur <ErrorBanner /> (role="alert", visuellement
  //         distinct de <EmptyState /> qui est role="status").
  //       - Le <h1>AO du jour</h1> est TOUJOURS rendu — c'est l'invariant
  //         qui débloque les 4 tests E2E.
  // (c) Observabilité future : quand `@sentry/nextjs` sera branché en
  //     Gate 8, remplacer le `console.error` ci-dessous par :
  //         Sentry.captureException(err, {
  //           tags: { route: "ao-du-jour", fetch_failed: true },
  //           contexts: { fetch: { organizationId: ALYOS_ORG_ID } },
  //         });
  //     Convention de tags alignée sur `reportAuditFailure()`.
  let tenders: Awaited<ReturnType<typeof getTendersOfTheDay>> = [];
  let profileName: Awaited<ReturnType<typeof getActiveSearchProfileName>> = null;
  let fetchError: string | null = null;
  try {
    [tenders, profileName] = await Promise.all([
      getTendersOfTheDay(ALYOS_ORG_ID, db),
      getActiveSearchProfileName(ALYOS_ORG_ID, db),
    ]);
  } catch (err) {
    // TODO(Gate 8) : remplacer par Sentry.captureException — cf. note (c) supra.
    console.error("[ao-du-jour:fetch-failed]", err);
    fetchError = err instanceof Error ? err.message : String(err);
  }

  const todayLabel = formatTodayLongFr();
  const tendersCount = tenders.length;
  const year = new Date().getFullYear();

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4 sm:mb-8">
        <div>
          <EdifioLogo />
          <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-neutral-900">
            AO du jour
          </h1>
          <p className="text-sm text-neutral-600">
            {todayLabel}
            {profileName ? (
              <>
                {" · "}
                <span className="text-neutral-500">profil&nbsp;: {profileName}</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span
            className="font-mono text-xs text-neutral-500"
            aria-label={fetchError ? "Nombre d'AO indisponible" : `${tendersCount} AO listés`}
          >
            {fetchError ? "—" : `${tendersCount} AO`}
          </span>
          {isAdmin(profile) ? (
            <Link
              href="/sourcing/admin/users"
              className="font-mono text-[11px] uppercase tracking-wider text-neutral-500 underline-offset-4 hover:text-neutral-900 hover:underline"
            >
              Administration
            </Link>
          ) : null}
        </div>
      </header>

      {fetchError ? (
        <ErrorBanner message={fetchError} />
      ) : tendersCount === 0 ? (
        <EmptyState profileName={profileName} />
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tenders.map((tender) => (
            <li key={tender.id} className="contents">
              <TenderCard tender={tender} />
            </li>
          ))}
        </ul>
      )}

      <p className="mt-12 text-center font-mono text-[10px] text-neutral-500">
        © AlyoS Ingénierie {year} — Outil interne
      </p>
    </main>
  );
}
