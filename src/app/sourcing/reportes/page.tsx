import Link from "next/link";
import { redirect } from "next/navigation";

import { ErrorBanner } from "@/app/sourcing/ao-du-jour/ErrorBanner";
import { TenderSummaryCard } from "@/app/sourcing/_shared/TenderSummaryCard";
import { isAuthorizedEmail } from "@/lib/auth/domain";
import { toUserProfile } from "@/lib/auth/types";
import { getRequiredOrgId } from "@/lib/auth/get-required-org-id";
import { db } from "@/db/client";
import { getTendersDeferred } from "@/lib/sourcing/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Reportés — edifio Sourcing",
};

/**
 * Page « Reportés » — AOs mis en attente par l'utilisateur (deferred_until
 * IS NOT NULL AND deferred_until > now()), triés par date de retour croissante.
 *
 * Server Component force-dynamic.
 * Résilience runtime : try/catch absorbé + ErrorBanner fallback.
 */
export const dynamic = "force-dynamic";

export default async function ReportesPage() {
  // Auth check défensif.
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/sourcing/reportes");
  const profile = toUserProfile(user);
  if (!isAuthorizedEmail(profile.email)) redirect("/forbidden");
  const orgId = await getRequiredOrgId(user.id);

  // Résilience runtime.
  let deferredTenders: Awaited<ReturnType<typeof getTendersDeferred>> = [];
  let fetchError: string | null = null;
  try {
    deferredTenders = await getTendersDeferred(orgId, db);
  } catch (err) {
    console.error("[reportes:fetch-failed]", err);
    fetchError = err instanceof Error ? err.message : String(err);
  }

  const totalCount = deferredTenders.length;

  return (
    <div className="mx-auto max-w-6xl">
      {/* En-tête de page */}
      <header className="mb-6">
        <span className="pill-eyebrow">AOs mis en attente</span>
        <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-ink md:text-3xl">
          Reportés
        </h1>
        <p className="mt-1 text-sm text-muted">
          {fetchError ? (
            "Erreur de chargement — voir détail ci-dessous."
          ) : totalCount === 0 ? (
            "Aucun AO reporté pour le moment."
          ) : (
            <>
              {totalCount} AO reporté{totalCount > 1 ? "s" : ""} — triés par date de retour.
            </>
          )}
        </p>
      </header>

      {/* Contenu principal */}
      {fetchError ? (
        <ErrorBanner message={fetchError} />
      ) : totalCount === 0 ? (
        <EmptyStateReportes />
      ) : (
        <ul className="flex flex-col gap-3.5">
          {deferredTenders.map((tender) => (
            <li key={tender.id}>
              <TenderSummaryCard
                tender={tender}
                cta={
                  <>
                    {/* Badge « Reporté jusqu'au [date] » */}
                    {tender.deferredUntil ? (
                      <DeferredBadge deferredUntil={tender.deferredUntil} />
                    ) : null}
                    {/* CTA : retour vers AO du jour pour retraiter */}
                    <Link
                      href="/sourcing/ao-du-jour"
                      className="inline-flex items-center justify-center gap-1 rounded-sm border border-line-2 bg-white px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-paper-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red focus-visible:ring-offset-1"
                    >
                      Retraiter maintenant →
                    </Link>
                  </>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ============================================================================
// Sous-composants locaux
// ============================================================================

/**
 * Badge amber indiquant la date à laquelle l'AO reviendra dans le digest.
 * Format : « Reporté jusqu'au 28 mai »
 */
function DeferredBadge({ deferredUntil }: { deferredUntil: Date }) {
  const label = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
  }).format(deferredUntil);

  return (
    <span className="self-end rounded-full bg-amber-100 px-2 py-0.5 text-right text-[11px] font-semibold text-amber-700">
      Reporté jusqu&apos;au {label}
    </span>
  );
}

function EmptyStateReportes() {
  return (
    <div role="status" className="rounded-md border border-line bg-white px-6 py-12 text-center">
      <div className="mb-3 text-4xl opacity-40" aria-hidden>
        ⏸
      </div>
      <h2 className="font-display text-lg font-semibold text-ink">Aucun AO reporté</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">
        Utilisez le bouton « Reporter » sur un AO depuis{" "}
        <Link href="/sourcing/ao-du-jour" className="text-brand-red underline underline-offset-2">
          AO du jour
        </Link>{" "}
        pour reporter un AO.
      </p>
    </div>
  );
}
