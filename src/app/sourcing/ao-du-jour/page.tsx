import Link from "next/link";
import { redirect } from "next/navigation";

import { EdifioLogo } from "@/components/EdifioLogo";
import { isAdmin, toUserProfile } from "@/lib/auth/types";
import { ALYOS_ORG_ID } from "@/lib/constants/organization";
import { db } from "@/db/client";
import { getActiveSearchProfileName, getTendersOfTheDay } from "@/lib/sourcing/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { EmptyState } from "./EmptyState";
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
  const [tenders, profileName] = await Promise.all([
    getTendersOfTheDay(ALYOS_ORG_ID, db),
    getActiveSearchProfileName(ALYOS_ORG_ID, db),
  ]);

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
            aria-label={`${tendersCount} AO listés`}
          >
            {tendersCount} AO
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

      {tendersCount === 0 ? (
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
