import Link from "next/link";
import { redirect } from "next/navigation";

import { ErrorBanner } from "@/app/sourcing/ao-du-jour/ErrorBanner";
import { TenderSummaryCard } from "@/app/sourcing/_shared/TenderSummaryCard";
import { isAuthorizedEmail } from "@/lib/auth/domain";
import { toUserProfile } from "@/lib/auth/types";
import { ALYOS_ORG_ID } from "@/lib/constants/organization";
import { db } from "@/db/client";
import { getTendersSolo } from "@/lib/sourcing/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Réponse solo — edifio Sourcing",
};

/**
 * Page « Réponse solo » — AOs sélectionnés en mode Solo, avec accès direct
 * au dossier de candidature.
 *
 * Server Component force-dynamic.
 * Résilience runtime : try/catch absorbé + ErrorBanner fallback.
 */
export const dynamic = "force-dynamic";

export default async function ReponseSoloPage() {
  // Auth check défensif.
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/sourcing/reponse-solo");
  const profile = toUserProfile(user);
  if (!isAuthorizedEmail(profile.email)) redirect("/forbidden");

  // Résilience runtime.
  let soloTenders: Awaited<ReturnType<typeof getTendersSolo>> = [];
  let fetchError: string | null = null;
  try {
    soloTenders = await getTendersSolo(ALYOS_ORG_ID, db);
  } catch (err) {
    console.error("[reponse-solo:fetch-failed]", err);
    fetchError = err instanceof Error ? err.message : String(err);
  }

  const totalCount = soloTenders.length;

  return (
    <div className="mx-auto max-w-6xl">
      {/* En-tête de page */}
      <header className="mb-6">
        <span className="pill-eyebrow">Dossiers en cours</span>
        <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-ink md:text-3xl">
          Réponse solo
        </h1>
        <p className="mt-1 text-sm text-muted">
          {fetchError ? (
            "Erreur de chargement — voir détail ci-dessous."
          ) : totalCount === 0 ? (
            "Aucun AO en réponse solo pour le moment."
          ) : (
            <>
              {totalCount} dossier{totalCount > 1 ? "s" : ""} solo en cours — triés par date de
              clôture.
            </>
          )}
        </p>
      </header>

      {/* Contenu principal */}
      {fetchError ? (
        <ErrorBanner message={fetchError} />
      ) : totalCount === 0 ? (
        <EmptyStateReponseSolo />
      ) : (
        <ul className="flex flex-col gap-3.5">
          {soloTenders.map((tender) => (
            <li key={tender.id}>
              <TenderSummaryCard
                tender={tender}
                cta={
                  <Link
                    href={`/sourcing/ao/${tender.id}/dossier`}
                    className="inline-flex items-center justify-center gap-1 rounded-sm bg-brand-red px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-red-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red focus-visible:ring-offset-1"
                  >
                    Préparer le dossier →
                  </Link>
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

function EmptyStateReponseSolo() {
  return (
    <div role="status" className="rounded-md border border-line bg-white px-6 py-12 text-center">
      <div className="mb-3 text-4xl opacity-40" aria-hidden>
        📄
      </div>
      <h2 className="font-display text-lg font-semibold text-ink">Aucun AO en réponse solo</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">
        Sélectionnez un AO en solo depuis{" "}
        <Link href="/sourcing/ao-du-jour" className="text-brand-red underline underline-offset-2">
          AO du jour
        </Link>{" "}
        pour préparer un dossier de candidature.
      </p>
    </div>
  );
}
