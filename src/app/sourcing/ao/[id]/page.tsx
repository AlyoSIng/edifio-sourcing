/**
 * Page de détail d'un AO — `/sourcing/ao/[id]`.
 *
 * Server Component protégé (middleware `@alyosingenierie.fr` + path `/sourcing/*`).
 *
 * Affiche toutes les informations d'un AO (titre, acheteur, deadline, score,
 * département, montant, CPV, plateforme, notes) ainsi que le bouton
 * « Récupérer le DCE » quand `dce_url` est renseigné.
 *
 * Accessible depuis :
 *  - les cartes AO du jour (futur deep-link)
 *  - les cartes sélectionnés / différés
 *  - la page « AO manuel » après création
 *
 * Résilience runtime (memory `feedback_nextjs_runtime_page_resilience`) :
 *   try/catch absorbé sur le fetch BDD → `<ErrorBanner>`.
 *
 * Navigation :
 *  - Lien « Dossier » si statut `selected_solo` ou `architect_accepted`
 *  - Lien « Short-list architectes » si statut `selected_tandem` ou
 *    `architect_accepted`
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";

import { BriefGenerator } from "@/app/sourcing/ao-du-jour/BriefGenerator";
import { ErrorBanner } from "@/app/sourcing/ao-du-jour/ErrorBanner";
import { isAuthorizedEmail } from "@/lib/auth/domain";
import { toUserProfile } from "@/lib/auth/types";
import { getRequiredOrgId } from "@/lib/auth/get-required-org-id";
import { db } from "@/db/client";
import { tenderBriefs } from "@/db/schema/ai";
import { platforms } from "@/db/schema/config";
import { tenderEvents, tenders } from "@/db/schema/tenders";
import { rcAnalysisSchema } from "@/lib/ai/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ALYOS_ORG_ID } from "@/lib/constants/organization";

import { RcAnalysisCard } from "./RcAnalysisCard";

import { formatAmount, formatDeadline } from "@/app/sourcing/ao-du-jour/format";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: `Détail AO — edifio Sourcing` };
}

const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Statuts pour lesquels le lien « Dossier » est pertinent. */
const DOSSIER_STATUSES = new Set([
  "selected_solo",
  "architect_accepted",
  "dossier_review_required",
  "dossier_ready",
]);
/** Statuts pour lesquels le lien « Short-list architectes » est pertinent. */
const TANDEM_STATUSES = new Set(["selected_tandem", "architect_accepted", "awaiting_architect"]);

/** Libellés FR des statuts du cycle de vie. */
const STATUS_LABELS: Record<string, string> = {
  sourced: "Sourcé",
  selected_solo: "Sélectionné — Mandataire",
  selected_tandem: "Sélectionné — Cotraitance",
  awaiting_architect: "En attente architecte",
  architect_accepted: "Architecte accepté",
  architect_declined: "Architecte décliné",
  architect_info_requested: "Info demandée",
  dossier_review_required: "Dossier à réviser",
  dossier_ready: "Dossier prêt",
  dossier_diffused: "Dossier diffusé",
  submitted: "Soumis",
  won: "Remporté",
  lost: "Perdu",
  dropped: "Abandonné",
};

/** Format court de date français (ex. 15/07/2026). */
function formatDateFr(date: Date | null): string {
  if (!date) return "—";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default async function TenderDetailPage({ params }: { params: { id: string } }) {
  // Auth check défensif
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/sourcing/ao/${params.id}`);
  const profile = toUserProfile(user);
  if (!isAuthorizedEmail(profile.email)) redirect("/forbidden");
  // Résolution dynamique de l'org (Phase A multi-tenant).
  // Try/catch propre : si la requête memberships échoue, fallback sur ALYOS_ORG_ID
  // plutôt que crash 500 de la page entière.
  let orgId: string;
  try {
    orgId = await getRequiredOrgId(user.id);
  } catch (err) {
    console.error("[ao-detail:org-resolution-failed]", err);
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

  // Chargement du tender — résilience runtime
  let tender: TenderRow | null = null;
  let fetchError: string | null = null;

  try {
    const rows = await db
      .select({
        id: tenders.id,
        title: tenders.title,
        buyer: tenders.buyer,
        amount: tenders.amount,
        deadline: tenders.deadline,
        questionsDeadline: tenders.questionsDeadline,
        cpv: tenders.cpv,
        score: tenders.score,
        status: tenders.status,
        dceUrl: tenders.dceUrl,
        sourceUrl: tenders.sourceUrl,
        externalRef: tenders.externalRef,
        postalCode: tenders.postalCode,
        department: tenders.department,
        rawData: tenders.rawData,
        createdAt: tenders.createdAt,
        platformCode: platforms.code,
        // Brief IA actif — LEFT JOIN pour éviter un aller-retour BDD supplémentaire.
        activeBrief: tenderBriefs.content,
      })
      .from(tenders)
      .innerJoin(platforms, eq(tenders.platformId, platforms.id))
      .leftJoin(
        tenderBriefs,
        and(eq(tenderBriefs.tenderId, tenders.id), eq(tenderBriefs.isActive, true)),
      )
      .where(and(eq(tenders.id, params.id), eq(tenders.organizationId, orgId)))
      .limit(1);

    tender = rows[0] ?? null;
  } catch (err) {
    console.error("[ao-detail:fetch-failed]", err);
    fetchError = err instanceof Error ? err.message : String(err);
  }

  if (fetchError) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-8">
        <ErrorBanner message={fetchError} />
      </main>
    );
  }

  if (!tender) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-8">
        <ErrorBanner message="Cet AO n'existe pas ou n'est pas accessible." />
      </main>
    );
  }

  // Chargement de l'analyse RC si disponible — silently ignore les erreurs
  let rcAnalysis: import("@/lib/ai/schemas").RcAnalysis | null = null;
  try {
    const evRows = await db
      .select({ data: tenderEvents.data })
      .from(tenderEvents)
      .where(
        and(
          eq(tenderEvents.tenderId, params.id),
          eq(tenderEvents.organizationId, orgId),
          eq(tenderEvents.eventType, "rc_analyzed"),
        ),
      )
      .orderBy(desc(tenderEvents.occurredAt))
      .limit(1);
    if (evRows[0]?.data) {
      // Structure écrite par analyzeRcAction : { extra: { rc_analysis: RcAnalysis, ... } }
      const extra = (evRows[0].data as Record<string, unknown>).extra as
        | Record<string, unknown>
        | undefined;
      const rcAnalysisRaw = extra?.rc_analysis;
      if (rcAnalysisRaw) {
        const parsed = rcAnalysisSchema.safeParse(rcAnalysisRaw);
        if (parsed.success) rcAnalysis = parsed.data;
      }
    }
  } catch {
    // optionnel — silently ignore
  }

  const scoreNum = tender.score ? Math.round(Number(tender.score)) : null;
  const deadlineLabel = formatDeadline(tender.deadline);
  const daysToDeadline = daysUntil(tender.deadline);
  const statusLabel = STATUS_LABELS[tender.status] ?? tender.status;

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      {/* Fil d'Ariane */}
      <nav className="mb-4 flex items-center gap-2 text-xs text-muted" aria-label="Fil d'Ariane">
        <Link href="/sourcing/ao-du-jour" className="hover:text-ink hover:underline">
          AO du jour
        </Link>
        <span aria-hidden>/</span>
        <span className="text-ink">Détail AO</span>
      </nav>

      {/* En-tête */}
      <header className="mb-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <span className="pill-eyebrow">
              {tender.platformCode.toUpperCase()} · Réf.&nbsp;{tender.externalRef}
            </span>
            <h1 className="mt-3 font-display text-2xl font-bold leading-snug tracking-tight text-ink md:text-3xl">
              {tender.title}
            </h1>
            <p className="mt-1 text-base text-ink-2">{tender.buyer}</p>
          </div>

          {/* Score ring — affiché à droite du header */}
          {scoreNum !== null && (
            <div
              className="relative grid h-16 w-16 shrink-0 place-items-center"
              role="img"
              aria-label={`Score de pertinence ${scoreNum} sur 100`}
            >
              <ScoreRing score={scoreNum} />
            </div>
          )}
        </div>
      </header>

      {/* Grille infos + actions DCE */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
        {/* Colonne principale — informations */}
        <div className="space-y-6">
          {/* Bloc infos clés */}
          <section className="rounded-md border border-line bg-white p-5">
            <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-wider text-muted">
              Informations clés
            </h2>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              <InfoRow label="Statut" value={statusLabel} />
              <InfoRow
                label="Clôture des offres"
                value={
                  daysToDeadline !== null ? `J-${daysToDeadline} · ${deadlineLabel}` : deadlineLabel
                }
                urgent={daysToDeadline !== null && daysToDeadline < 7}
              />
              {tender.questionsDeadline && (
                <InfoRow
                  label="Deadline questions"
                  value={formatDateFr(tender.questionsDeadline)}
                />
              )}
              <InfoRow label="Montant estimé" value={formatAmount(tender.amount)} />
              {tender.department && (
                <InfoRow
                  label="Département"
                  value={
                    tender.postalCode
                      ? `${tender.postalCode} · Dept. ${tender.department}`
                      : `Dept. ${tender.department}`
                  }
                />
              )}
              {tender.cpv.length > 0 && (
                <InfoRow label="Codes CPV" value={tender.cpv.join(", ")} mono />
              )}
              <InfoRow label="Plateforme" value={tender.platformCode.toUpperCase()} mono />
              <InfoRow label="Ajouté le" value={formatDateFr(tender.createdAt)} />
            </dl>
          </section>

          {/* Bloc description — extrait depuis rawData si disponible */}
          {extractDescription(tender.rawData) && (
            <section className="rounded-md border border-line bg-white p-5">
              <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-muted">
                Objet du marché
              </h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-ink-2">
                {extractDescription(tender.rawData)}
              </p>
            </section>
          )}

          {/* Brief IA — chargé via LEFT JOIN tender_briefs (is_active = true) */}
          <section className="rounded-md border border-line bg-white p-5">
            <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-muted">
              Brief IA
            </h2>
            {tender.activeBrief ? (
              <p className="whitespace-pre-line text-sm leading-relaxed text-ink-2">
                {tender.activeBrief}
              </p>
            ) : (
              <p className="text-sm text-muted">Aucun brief généré.</p>
            )}
            <BriefGenerator tenderId={tender.id} hasBrief={tender.activeBrief !== null} />
          </section>

          {/* Analyse RC — affichée uniquement si un événement rc_analyzed existe */}
          {rcAnalysis && <RcAnalysisCard analysis={rcAnalysis} tenderId={tender.id} />}
        </div>

        {/* Colonne latérale — actions */}
        <div className="space-y-4">
          {/* Bloc DCE */}
          <section className="rounded-md border border-line bg-white p-5">
            <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-wider text-muted">
              Dossier de consultation (DCE)
            </h2>
            {tender.dceUrl ? (
              <div className="space-y-3">
                <p className="text-xs text-ink-2">
                  Le DCE est disponible sur la plateforme source. Cliquez pour y accéder
                  directement.
                </p>
                <a
                  href={tender.dceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-primary inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2"
                >
                  {/* Icône téléchargement inline SVG */}
                  <svg
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4 shrink-0"
                    aria-hidden
                  >
                    <path d="M10 3v10m0 0-3-3m3 3 3-3" />
                    <path d="M3 14v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2" />
                  </svg>
                  Récupérer le DCE
                </a>
              </div>
            ) : (
              <p className="text-xs text-muted">DCE non disponible sur cette annonce.</p>
            )}
          </section>

          {/* Bloc lien source */}
          {tender.sourceUrl && (
            <section className="rounded-md border border-line bg-white p-5">
              <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-muted">
                Annonce source
              </h2>
              <a
                href={tender.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-brand-red underline-offset-2 hover:underline"
              >
                Consulter l&apos;avis ↗
              </a>
            </section>
          )}

          {/* Bloc navigation — dossier / tandem selon statut */}
          {(DOSSIER_STATUSES.has(tender.status) || TANDEM_STATUSES.has(tender.status)) && (
            <section className="rounded-md border border-line bg-white p-5">
              <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-muted">
                Actions
              </h2>
              <div className="flex flex-col gap-2">
                {DOSSIER_STATUSES.has(tender.status) && (
                  <Link
                    href={`/sourcing/ao/${tender.id}/dossier`}
                    className="inline-flex items-center justify-center gap-1.5 rounded-full border border-line bg-paper px-4 py-2 text-sm font-medium text-ink transition hover:bg-paper-2"
                  >
                    Dossier de candidature →
                  </Link>
                )}
                {TANDEM_STATUSES.has(tender.status) && (
                  <Link
                    href={`/sourcing/ao/${tender.id}/tandem`}
                    className="inline-flex items-center justify-center gap-1.5 rounded-full border border-line bg-paper px-4 py-2 text-sm font-medium text-ink transition hover:bg-paper-2"
                  >
                    Short-list architectes →
                  </Link>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}

// ============================================================================
// Types locaux
// ============================================================================

type TenderRow = {
  id: string;
  title: string;
  buyer: string;
  amount: string | null;
  deadline: Date | null;
  questionsDeadline: Date | null;
  cpv: string[];
  score: string | null;
  status: string;
  dceUrl: string | null;
  sourceUrl: string | null;
  externalRef: string;
  postalCode: string | null;
  department: string | null;
  rawData: import("@/db/types/jsonb").TenderRawData | null;
  createdAt: Date;
  platformCode: string;
  /** Brief IA actif (null si jamais généré). */
  activeBrief: string | null;
};

// ============================================================================
// Composants visuels
// ============================================================================

/** Ligne de définition dans la grille d'informations. */
function InfoRow({
  label,
  value,
  mono = false,
  urgent = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  urgent?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-wider text-muted">{label}</dt>
      <dd
        className={`mt-0.5 text-sm ${mono ? "font-mono" : ""} ${urgent ? "font-semibold text-brand-red-dark" : "text-ink"}`}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * Score ring SVG — identique à `TenderCard.ScoreRing`.
 * Dupliqué pour indépendance de module (pas de dépendance inverse vers `ao-du-jour/`).
 */
function ScoreRing({ score }: { score: number }) {
  const circumference = 175.9;
  const safeScore = Math.max(0, Math.min(100, score));
  const dashOffset = circumference * (1 - safeScore / 100);
  const strokeColor =
    score >= 75 ? "var(--brand-red)" : score >= 50 ? "var(--status-warn)" : "var(--line-2)";

  return (
    <>
      <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90">
        <circle cx="32" cy="32" r="28" fill="none" stroke="var(--paper-3)" strokeWidth="6" />
        <circle
          cx="32"
          cy="32"
          r="28"
          fill="none"
          stroke={strokeColor}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <span className="font-display text-[19px] font-bold text-ink">{score}</span>
    </>
  );
}

// ============================================================================
// Helpers
// ============================================================================

/** Nombre de jours entiers avant la deadline. `null` si passée ou absente. */
function daysUntil(deadline: Date | null): number | null {
  if (!deadline) return null;
  const diffMs = deadline.getTime() - Date.now();
  if (diffMs < 0) return null;
  return Math.ceil(diffMs / (24 * 3600 * 1000));
}

/**
 * Extrait une description courte du rawData BOAMP.
 * Priorité : description > objet > libelle. Tronque à 800 chars.
 */
function extractDescription(rawData: TenderRow["rawData"]): string | null {
  if (!rawData?.record) return null;
  const rec = rawData.record as Record<string, unknown>;
  const text =
    (typeof rec.description === "string" ? rec.description : null) ??
    (typeof rec.objet === "string" ? rec.objet : null) ??
    (typeof rec.libelle === "string" ? rec.libelle : null);
  if (!text) return null;
  return text.length > 800 ? text.slice(0, 797) + "…" : text;
}
