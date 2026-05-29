/**
 * Page Pipeline Conception/Réalisation — edifio Sourcing.
 *
 * Server Component protégé (middleware `@alyosingenierie.fr` + `/sourcing/*`).
 *
 * Charge les données via `loadCrPipelineData()` et délègue l'affichage au
 * Client Component `CrKanbanBoard`. Résilience runtime : si `result.ok === false`
 * (DATABASE_URL absent en CI ou Supabase blip), affiche `<ErrorBanner>`.
 *
 * Source de vérité : `handoff/BRIEF_CHANTIER_260527.md` §Feature 1 Pipeline C/R
 */

import { redirect } from "next/navigation";

import { ErrorBanner } from "@/app/sourcing/ao-du-jour/ErrorBanner";
import { isAuthorizedEmail } from "@/lib/auth/domain";
import { toUserProfile } from "@/lib/auth/types";
import { getRequiredOrgId } from "@/lib/auth/get-required-org-id";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ALYOS_ORG_ID } from "@/lib/constants/organization";

import { CrKanbanBoard } from "./CrKanbanBoard";
import { loadCrPipelineData } from "./page-data";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: "Conception/Réalisation — edifio Sourcing" };
}

export default async function ConceptionRealisationPage() {
  // Auth check défensif — pattern aligné sur `/sourcing/ao-du-jour/page.tsx`
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/sourcing/conception-realisation");
  const profile = toUserProfile(user);
  if (!isAuthorizedEmail(profile.email)) redirect("/forbidden");
  // Résolution dynamique de l'org (Phase A multi-tenant).
  // Try/catch propre : si la requête memberships échoue, fallback sur ALYOS_ORG_ID
  // plutôt que crash 500 de la page entière.
  let orgId: string;
  try {
    orgId = await getRequiredOrgId(user.id);
  } catch (err) {
    console.error("[conception-realisation:org-resolution-failed]", err);
    orgId = ALYOS_ORG_ID;
  }

  // Chargement pipeline C/R — résilience runtime (memory `feedback_nextjs_runtime_page_resilience`)
  const result = await loadCrPipelineData(orgId);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
          Conception / Réalisation
        </h1>
        <p className="mt-2 text-sm text-muted">Pipeline de vos dossiers C/R</p>
      </header>

      {result.ok === false ? (
        <ErrorBanner message="Impossible de charger le pipeline Conception/Réalisation." />
      ) : (
        <CrKanbanBoard data={result.data} />
      )}
    </main>
  );
}
