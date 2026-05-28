import { redirect } from "next/navigation";

import { isAdmin, toUserProfile } from "@/lib/auth/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getShortlistCriteria } from "./actions";
import { ShortlistCriteriaForm } from "./ShortlistCriteriaForm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Short-list — Criteres — edifio Sourcing",
};

/**
 * Page admin — configuration des criteres de short-list (module Tandem).
 *
 * Source de verite :
 *  - src/db/schema/shortlist.ts
 *  - specs/module_tandem_engine_v1.md §short-list
 *  - Décision Nadia 2026-05-28
 *
 * Architecture :
 *  - Server Component : lit la session, charge les critères pour les 3 cibles
 *    en parallèle (Promise.all), passe au composant client.
 *  - `ShortlistCriteriaForm` (Client Component) : formulaire à onglets.
 *  - Résilience : try/catch absorbé (règle MEMORY — erreur non bloquante).
 */
export default async function ShortlistCriteriaPage() {
  // 1. Auth check
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/sourcing/admin/shortlist");

  const profile = toUserProfile(user);
  if (!isAdmin(profile)) redirect("/sourcing/ao-du-jour?error=forbidden");

  // 2. Chargement des critères pour les 3 cibles en parallèle
  let fetchError: string | null = null;
  let architectsCriteria = null;
  let cotraitantsCriteria = null;
  let companiesCriteria = null;

  try {
    const [archResult, cotrResult, compResult] = await Promise.all([
      getShortlistCriteria("architects"),
      getShortlistCriteria("cotraitants"),
      getShortlistCriteria("companies"),
    ]);

    architectsCriteria = archResult.ok ? archResult.criteria : null;
    cotraitantsCriteria = cotrResult.ok ? cotrResult.criteria : null;
    companiesCriteria = compResult.ok ? compResult.criteria : null;

    // Si une des requetes a echoue, on note l'erreur mais on ne bloque pas la page
    if (!archResult.ok || !cotrResult.ok || !compResult.ok) {
      console.error("[shortlist-page:partial-fetch-fail]", {
        arch: !archResult.ok ? archResult.error : null,
        cotr: !cotrResult.ok ? cotrResult.error : null,
        comp: !compResult.ok ? compResult.error : null,
      });
    }
  } catch (err) {
    console.error("[shortlist-page:fetch-fail]", err);
    fetchError = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="mx-auto max-w-3xl">
      {/* En-tete */}
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink md:text-3xl">
          Short-list — Criteres
        </h1>
        <p className="mt-1 text-sm text-muted">
          Configure les seuils et filtres appliques lors de la generation des short-lists Tandem
          (Architectes, Cotraitants, Entreprises/Majors). Le filtrage automatique est prevu en Phase
          2 — ces criteres seront consommes par le moteur de matching.
        </p>
      </header>

      {/* Erreur chargement */}
      {fetchError ? (
        <div
          role="alert"
          className="rounded-md border border-l-4 border-line border-l-error bg-error-bg px-4 py-3 text-sm text-error"
        >
          <strong className="mr-1 font-semibold">Erreur de chargement :</strong>
          {fetchError}
        </div>
      ) : (
        <div className="rounded-md border border-line bg-white p-6">
          <ShortlistCriteriaForm
            initialArchitects={architectsCriteria}
            initialCotraitants={cotraitantsCriteria}
            initialCompanies={companiesCriteria}
          />
        </div>
      )}
    </div>
  );
}
