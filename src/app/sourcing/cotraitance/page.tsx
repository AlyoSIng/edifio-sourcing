/**
 * Page Pipeline cotraitance — `/sourcing/cotraitance`.
 *
 * Vue cross-AO qui agrège tous les AOs en cours de processus Tandem :
 * de la sélection initiale (`selected_tandem`) jusqu'à la réponse architecte
 * (`architect_accepted` / `architect_declined` / `architect_info_requested`).
 *
 * Server Component protégé (middleware `@alyosingenierie.fr` + path
 * `/sourcing/*`). Résilience runtime via try/catch absorbé sur toutes
 * les opérations BDD (cf. memory `feedback_nextjs_runtime_page_resilience`).
 *
 * Source de vérité :
 *  - `specs/module_tandem_engine_v1.md` §3 (pipeline Tandem)
 *  - `handoff/BRIEF_TANDEM_260521.md` §vue cross-AO
 *  - `handoff/PLAN_TANDEM_NADIA_260522.md` §Pipeline cotraitance
 */

import { redirect } from "next/navigation";

import { ErrorBanner } from "@/app/sourcing/ao-du-jour/ErrorBanner";
import { toUserProfile } from "@/lib/auth/types";
import { getRequiredOrgId } from "@/lib/auth/get-required-org-id";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAuthorizedEmail } from "@/lib/auth/domain";
import { ALYOS_ORG_ID } from "@/lib/constants/organization";

import { CotraitancePipelineClient } from "./CotraitancePipelineClient";
import { PipelineStats } from "./PipelineStats";
import { loadCotraitancePipelineData } from "./page-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata = {
  title: "Pipeline cotraitance · edifio Sourcing",
};

export default async function CotraitancePipelinePage() {
  // Auth check défensif (le middleware a normalement déjà filtré).
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/sourcing/cotraitance");
  const profile = toUserProfile(user);
  if (!isAuthorizedEmail(profile.email)) redirect("/forbidden");
  // Résolution dynamique de l'org (Phase A multi-tenant).
  // Try/catch propre : si la requête memberships échoue, fallback sur ALYOS_ORG_ID
  // plutôt que crash 500 de la page entière.
  let orgId: string;
  try {
    orgId = await getRequiredOrgId(user.id);
  } catch (err) {
    console.error("[cotraitance:org-resolution-failed]", err);
    orgId = ALYOS_ORG_ID;
  }

  // Résilience runtime : try/catch absorbé sur l'I/O BDD.
  let loadResult: Awaited<ReturnType<typeof loadCotraitancePipelineData>> | null = null;
  let fetchError: string | null = null;

  try {
    loadResult = await loadCotraitancePipelineData(orgId);
  } catch (err) {
    console.error("[cotraitance-pipeline-page:unhandled]", err);
    fetchError = err instanceof Error ? err.message : String(err);
  }

  if (fetchError || !loadResult) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-8">
        <ErrorBanner message={fetchError ?? "Erreur inconnue"} />
      </main>
    );
  }

  if (!loadResult.ok) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-8">
        <ErrorBanner message="Erreur de chargement du pipeline cotraitance." />
      </main>
    );
  }

  const data = loadResult.data;

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <span className="pill-eyebrow">Tandem</span>
        <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-ink md:text-3xl">
          Pipeline cotraitance
        </h1>
        <p className="mt-2 text-sm text-ink-2">
          {data.length} AO{data.length > 1 ? "s" : ""} en cours
        </p>
      </header>

      {/* Chips de comptage par statut */}
      <PipelineStats entries={data} />

      {/* Liste des AOs avec tabs de filtre côté client */}
      <CotraitancePipelineClient entries={data} />
    </main>
  );
}
