/**
 * Page dossier IA — `/sourcing/ao/[id]/dossier`.
 *
 * Server Component **protégé** (middleware `@alyosingenierie.fr` + path
 * `/sourcing/*`). Accessible pour deux statuts :
 *   - `architect_accepted` : cotraitance validée — eyebrow « Tandem »
 *   - `selected_solo`      : réponse en propre  — eyebrow « Solo »
 *
 * Source de vérité :
 *   - Spec PR-B module dossier IA (brief Board 2026-05-25)
 *   - Parcours utilisateur G2 §3 « Préparation dossier IA — Sandrine desktop »
 *
 * Contraintes techniques :
 *   - `runtime = "nodejs"` : requis pour pdf-parse (CommonJS natif) et
 *     Anthropic SDK dans les Server Actions (pas d'Edge runtime ici).
 *   - `maxDuration = 60` : timeout Vercel Pro pour couvrir l'analyse IA (~30-60 s).
 *   - `dynamic = "force-dynamic"` : page non mise en cache (état dossier mutable).
 *
 * Résilience runtime (memory `feedback_nextjs_runtime_page_resilience`) :
 *   try/catch absorbé autour de `loadDossierPageData` → `<ErrorBanner>`.
 */

import Link from "next/link";
import { redirect } from "next/navigation";

import { ErrorBanner } from "@/app/sourcing/ao-du-jour/ErrorBanner";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getRequiredOrgId } from "@/lib/auth/get-required-org-id";
import { ALYOS_ORG_ID } from "@/lib/constants/organization";

import { AcceptedArchitectsSelector } from "./AcceptedArchitectsSelector";
import { DossierClient } from "./DossierClient";
import { loadDossierPageData } from "./page-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** 60 s — timeout Vercel Pro pour couvrir l'analyse Claude Sonnet 4.6 */
export const maxDuration = 60;

export const metadata = {
  title: "Dossier de candidature · edifio Sourcing",
};

/**
 * Statuts autorisant l'accès au dossier de candidature.
 * - `architect_accepted`      : flux Tandem (architecte partenaire accepté)
 * - `selected_solo`           : flux Solo (réponse AlyoS seule)
 * - `dossier_review_required` : dossier en révision (modification RC en cours)
 * - `dossier_ready`           : dossier finalisé, prêt à diffuser
 */
const DOSSIER_ALLOWED_STATUSES = [
  "architect_accepted",
  "selected_solo",
  "dossier_review_required",
  "dossier_ready",
] as const;
type DossierAllowedStatus = (typeof DOSSIER_ALLOWED_STATUSES)[number];

interface PageProps {
  params: Promise<{ id: string }>;
  /**
   * Query params :
   *   - `archi` : UUID de l'architecte sélectionné pour préparer son dossier
   *     en mode Tandem multi-archi. Ignoré si Solo / Cotraitance BE ou si
   *     l'UUID ne correspond à aucun architecte accepté pour cet AO.
   */
  searchParams?: Promise<{ archi?: string }>;
}

const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Format court de date français (ex. 15/07/2026) */
function formatDate(date: Date | null): string {
  if (!date) return "—";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default async function DossierPage(props: PageProps) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  // Auth check défensif (le middleware a normalement déjà filtré)
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/sourcing/ao/${params.id}/dossier`);
  // ADR-014 (2026-06-05) — garde domaine `isAuthorizedEmail` retirée :
  // ouverture multi-tenant (PROTECT + orgs futures). Les autres gardes
  // restent (auth ci-dessus, tenant via `getRequiredOrgId` + RLS ci-dessous).
  // Résolution dynamique de l'org (Phase A multi-tenant).
  // Try/catch propre : si la requête memberships échoue, fallback sur ALYOS_ORG_ID
  // plutôt que crash 500 de la page entière.
  let orgId: string;
  try {
    orgId = await getRequiredOrgId(user.id);
  } catch (err) {
    console.error("[ao-dossier:org-resolution-failed]", err);
    orgId = ALYOS_ORG_ID;
  }

  // Validation UUID
  if (!UUID_SHAPE.test(params.id)) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-8">
        <ErrorBanner message="Identifiant d'AO invalide." />
      </main>
    );
  }

  // Chargement des données — résilience runtime
  let loadResult: Awaited<ReturnType<typeof loadDossierPageData>> | null = null;
  let fetchError: string | null = null;
  try {
    loadResult = await loadDossierPageData(params.id, orgId);
  } catch (err) {
    console.error("[dossier-page:unhandled]", err);
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
    if (loadResult.error === "tender_not_found") {
      return (
        <main className="mx-auto max-w-5xl px-6 py-8">
          <ErrorBanner message="Cet AO n'existe plus ou est inaccessible." />
        </main>
      );
    }
    return (
      <main className="mx-auto max-w-5xl px-6 py-8">
        <ErrorBanner message="Erreur de chargement du dossier." />
      </main>
    );
  }

  const { data } = loadResult;

  // Garde statut : architect_accepted (Tandem) ou selected_solo (Solo)
  if (!DOSSIER_ALLOWED_STATUSES.includes(data.tender.status as DossierAllowedStatus)) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-8">
        <ErrorBanner message="Ce dossier n'est pas encore accessible. Sélectionnez d'abord cet AO." />
      </main>
    );
  }

  const isSolo = data.tender.status === "selected_solo";
  const eyebrow = isSolo
    ? "Dossier de candidature — Mandataire"
    : "Dossier de candidature — Cotraitance";

  // Résolution archi sélectionné (Phase 2 — multi-archi Tandem).
  // Validation : UUID dans le query param ET présent dans la liste des
  // architectes acceptés pour cet AO. Sinon fallback null (sélecteur affiché).
  const archiParam = searchParams?.archi;
  const requestedArchiId = archiParam && UUID_SHAPE.test(archiParam) ? archiParam : null;
  const selectedArchitect = requestedArchiId
    ? (data.acceptedArchitects.find((a) => a.id === requestedArchiId) ?? null)
    : null;
  const hasAcceptedArchitects = data.acceptedArchitects.length > 0;

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      {/* En-tête AO */}
      <header className="mb-6">
        <nav className="mb-3 flex items-center gap-2 text-xs text-muted" aria-label="Fil d'Ariane">
          {isSolo ? (
            <>
              <Link
                href="/sourcing/reponse-solo"
                className="hover:text-ink hover:underline focus:outline-none"
              >
                Mandataire
              </Link>
              <span aria-hidden>/</span>
              <span className="text-ink">Dossier</span>
            </>
          ) : (
            <>
              <a
                href="/sourcing/cotraitance"
                className="hover:text-ink hover:underline focus:outline-none"
              >
                Cotraitance
              </a>
              <span aria-hidden>/</span>
              <a
                href={`/sourcing/ao/${params.id}/tandem`}
                className="hover:text-ink hover:underline focus:outline-none"
              >
                Short-list
              </a>
              <span aria-hidden>/</span>
              <span className="text-ink">Dossier</span>
            </>
          )}
        </nav>

        <span className="pill-eyebrow">{eyebrow}</span>
        <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-ink md:text-3xl">
          {data.tender.title}
        </h1>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2">
          <span>{data.tender.buyer}</span>
          {data.tender.deadline && (
            <span>
              Deadline : <strong className="text-ink">{formatDate(data.tender.deadline)}</strong>
            </span>
          )}
          {data.tender.sourceUrl && (
            <a
              href={data.tender.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-brand-red underline-offset-2 hover:underline"
              aria-label="Voir l'annonce officielle sur la plateforme source"
            >
              Voir l&apos;annonce en ligne ↗
            </a>
          )}
        </div>
      </header>

      {/* Sélecteur multi-archi (Phase 2 — affiché uniquement s'il y a au moins
          un architecte accepté). Pour Solo / Cotraitance BE : pas de sélecteur. */}
      {hasAcceptedArchitects && (
        <AcceptedArchitectsSelector
          architects={data.acceptedArchitects}
          selectedArchitectId={selectedArchitect?.id ?? null}
        />
      )}

      <DossierClient data={data} selectedArchitect={selectedArchitect} />
    </main>
  );
}
