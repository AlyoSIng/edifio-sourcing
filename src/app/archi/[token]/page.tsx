/**
 * Page tokenisée publique architecte — `/archi/[token]`.
 *
 * Source de vérité :
 *  - `specs/module_tandem_engine_v1.md` §3.4
 *  - Maquette M4 (TU) / M4 v1.1 (VOUS)
 *  - Brief Board 2026-05-24 (sous-étape 4 Tandem)
 *
 * Server Component **public** (hors middleware Supabase — cf.
 * `src/lib/auth/routes.ts` `PUBLIC_ARCHITECT_PREFIX`).
 *
 * Sécurité :
 *  - JWT architecte vérifié côté serveur (signature RS256 + `aud=architect`
 *    + expiration + révocation BDD).
 *  - Tous les cas d'erreur (malformé, expiré, révoqué, archi inactif, tender
 *    introuvable) sont collapsés en `<TokenInvalidPage />` générique pour
 *    ne pas leaker d'info (cf. brief 24/05 « pas de leak d'info sur la cause »).
 *  - Aucune session Supabase requise — l'architecte n'est PAS un user AlyoS.
 *
 * Résilience runtime (cf. memory `feedback_nextjs_runtime_page_resilience`) :
 *  - try/catch absorbé autour du `loadArchitectPageData` (qui fait des
 *    `db.select`). En CI E2E sans `DATABASE_URL` ou si Supabase blip, on
 *    rend `<ErrorBanner role="alert">` au lieu de crasher 500.
 *
 * Force-dynamic : la page change à chaque requête (status response peut
 * avoir évolué entre 2 visites de l'archi). Pas de cache.
 */

import { ErrorBanner } from "@/app/sourcing/ao-du-jour/ErrorBanner";

import { ArchitectResponseForm } from "./ArchitectResponseForm";
import { ArchitectTandemPageBody } from "./ArchitectTandemPageBody";
import { TokenInvalidPage } from "./TokenInvalidPage";
import {
  loadArchitectPageData,
  type ArchitectPageData,
  type LoadArchitectPageError,
} from "@/lib/tandem/architect-page-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // crypto natif RS256 — pas Edge

export const metadata = {
  title: "Cotraitance architecte — edifio Sourcing",
  // robots: noindex pour les pages tokenisées (RGPD + bonne pratique SEO).
  robots: { index: false, follow: false },
};

interface PageProps {
  params: { token: string };
}

export default async function ArchitectTokenPage({ params }: PageProps) {
  // Résilience runtime : on encapsule tout l'I/O dans un try/catch. En CI
  // sans DATABASE_URL ou en cas de blip Supabase, on rend ErrorBanner au lieu
  // d'un 500 brutal.
  let loadResult: Awaited<ReturnType<typeof loadArchitectPageData>> | null = null;
  let fetchError: string | null = null;
  try {
    loadResult = await loadArchitectPageData(params.token);
  } catch (err) {
    console.error("[archi-page:unhandled]", err);
    fetchError = err instanceof Error ? err.message : String(err);
  }

  if (fetchError || !loadResult) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <ErrorBanner message={fetchError ?? "Erreur inconnue"} />
      </main>
    );
  }

  if (!loadResult.ok) {
    // Tous les cas d'erreur logiques (malformed/expired/revoked/unknown_jti/
    // architect_inactive/tender_not_found) → page générique sans détail.
    // `internal_error` (failure BDD pendant le fetch des entités) → idem :
    // on ne distingue pas pour ne pas leaker.
    return <TokenInvalidPage />;
  }

  return <ArchitectPageContent data={loadResult.data} token={params.token} />;
}

function ArchitectPageContent({ data, token }: { data: ArchitectPageData; token: string }) {
  const { architect, response } = data;
  const register = architect.tutoiement ? "tu" : "vous";

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <ArchitectTandemPageBody data={data} register={register} />
      <div className="mt-8">
        <ArchitectResponseForm
          token={token}
          register={register}
          alreadyResponded={response !== null && response.status !== "pending"}
          existingStatus={response?.status}
        />
      </div>
      <footer className="mt-10 border-t border-line pt-4 text-center text-xs text-muted">
        edifio Sourcing — AlyoS Ingénierie. Outil interne.
      </footer>
    </main>
  );
}

export type { LoadArchitectPageError };
