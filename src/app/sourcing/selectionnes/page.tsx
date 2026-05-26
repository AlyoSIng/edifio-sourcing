import Link from "next/link";
import { redirect } from "next/navigation";

import { ErrorBanner } from "@/app/sourcing/ao-du-jour/ErrorBanner";
import { TenderSummaryCard } from "@/app/sourcing/_shared/TenderSummaryCard";
import { isAuthorizedEmail } from "@/lib/auth/domain";
import { toUserProfile } from "@/lib/auth/types";
import { ALYOS_ORG_ID } from "@/lib/constants/organization";
import { db } from "@/db/client";
import { getTendersSelected } from "@/lib/sourcing/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Sélectionnés — edifio Sourcing",
};

/**
 * Page « Sélectionnés » — liste des AO avec statut `selected_solo` ou
 * `selected_tandem`, triés par deadline croissante.
 *
 * Server Component force-dynamic (les sélections changent après chaque action
 * sur la page « AO du jour »).
 *
 * Résilience runtime : try/catch absorbé + ErrorBanner fallback
 * (cf. memory `feedback_nextjs_runtime_page_resilience`).
 */
export const dynamic = "force-dynamic";

export default async function SelectionnesPage() {
  // Auth check défensif (le middleware a normalement déjà filtré).
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/sourcing/selectionnes");
  const profile = toUserProfile(user);
  if (!isAuthorizedEmail(profile.email)) redirect("/forbidden");

  // Résilience runtime : fetch encapsulé dans try/catch absorbé.
  let selectedTenders: Awaited<ReturnType<typeof getTendersSelected>> = [];
  let fetchError: string | null = null;
  try {
    selectedTenders = await getTendersSelected(ALYOS_ORG_ID, db);
  } catch (err) {
    console.error("[selectionnes:fetch-failed]", err);
    fetchError = err instanceof Error ? err.message : String(err);
  }

  // KPIs calculés côté serveur.
  const totalCount = selectedTenders.length;
  const soloCount = selectedTenders.filter((t) => t.status === "selected_solo").length;
  const tandemCount = selectedTenders.filter((t) => t.status === "selected_tandem").length;

  return (
    <div className="mx-auto max-w-6xl">
      {/* En-tête de page */}
      <header className="mb-6">
        <span className="pill-eyebrow">AOs sélectionnés</span>
        <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-ink md:text-3xl">
          Sélectionnés
        </h1>
        <p className="mt-1 text-sm text-muted">
          {fetchError ? (
            "Erreur de chargement — voir détail ci-dessous."
          ) : totalCount === 0 ? (
            "Aucun AO sélectionné pour le moment."
          ) : (
            <>
              {totalCount} AO sélectionné{totalCount > 1 ? "s" : ""} — {soloCount} Solo,{" "}
              {tandemCount} Tandem. Triés par date de clôture.
            </>
          )}
        </p>
      </header>

      {/* KPI row */}
      {!fetchError ? (
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KpiCard label="Total sélectionnés" value={totalCount} accent />
          <KpiCard label="En Solo" value={soloCount} />
          <KpiCard label="En Tandem" value={tandemCount} />
        </div>
      ) : null}

      {/* Contenu principal */}
      {fetchError ? (
        <ErrorBanner message={fetchError} />
      ) : totalCount === 0 ? (
        <EmptyStateSelectionnes />
      ) : (
        <ul className="flex flex-col gap-3.5">
          {selectedTenders.map((tender) => (
            <li key={tender.id}>
              <TenderSummaryCard
                tender={tender}
                cta={
                  <>
                    {/* Badge statut */}
                    <StatusBadge status={tender.status} />
                    {/* CTA contextuel selon le mode */}
                    {tender.status === "selected_solo" ? (
                      <Link
                        href={`/sourcing/ao/${tender.id}/dossier`}
                        className="inline-flex items-center justify-center gap-1 rounded-sm bg-brand-red px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-red-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red focus-visible:ring-offset-1"
                      >
                        Préparer le dossier →
                      </Link>
                    ) : (
                      <Link
                        href={`/sourcing/ao/${tender.id}/tandem`}
                        className="inline-flex items-center justify-center gap-1 rounded-sm border border-line-2 bg-white px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-paper-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red focus-visible:ring-offset-1"
                      >
                        Voir Tandem →
                      </Link>
                    )}
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

/**
 * Badge coloré indiquant le mode de sélection de l'AO.
 *   - Solo   → emerald (vert)
 *   - Tandem → blue
 */
function StatusBadge({ status }: { status: "selected_solo" | "selected_tandem" }) {
  const isSolo = status === "selected_solo";
  return (
    <span
      className={`self-end rounded-full px-2 py-0.5 text-right text-[11px] font-semibold ${
        isSolo ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
      }`}
    >
      {isSolo ? "Solo" : "Tandem"}
    </span>
  );
}

function EmptyStateSelectionnes() {
  return (
    <div role="status" className="rounded-md border border-line bg-white px-6 py-12 text-center">
      <div className="mb-3 text-4xl opacity-40" aria-hidden>
        🔖
      </div>
      <h2 className="font-display text-lg font-semibold text-ink">Aucun AO sélectionné</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">
        Sélectionnez des AOs depuis{" "}
        <Link href="/sourcing/ao-du-jour" className="text-brand-red underline underline-offset-2">
          AO du jour
        </Link>{" "}
        pour les retrouver ici.
      </p>
    </div>
  );
}
