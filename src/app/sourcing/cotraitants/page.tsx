/**
 * Page Bibliothèque Cotraitants — `/sourcing/cotraitants`.
 *
 * Server Component protégé (middleware @alyosingenierie.fr + /sourcing/*).
 * Charge la liste des cotraitants actifs et délègue le rendu interactif
 * à CotraitantsListClient.
 *
 * Résilience runtime : try/catch absorbé (cf. memory feedback_nextjs_runtime_page_resilience).
 *
 * Source de vérité : demande Board 2026-05-26 (bibliothèque cotraitants).
 */

import { redirect } from "next/navigation";

import { isAuthorizedEmail } from "@/lib/auth/domain";
import { isAdmin, toUserProfile } from "@/lib/auth/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { listCotraitants } from "./actions";
import { CotraitantsListClient } from "./CotraitantsListClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Cotraitants — edifio Sourcing",
};

export default async function CotraitantsPage() {
  // Auth check défensif (le middleware a normalement déjà filtré).
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/sourcing/cotraitants");
  const profile = toUserProfile(user);
  if (!isAuthorizedEmail(profile.email)) redirect("/forbidden");

  const adminUser = isAdmin(profile);

  // -------------------------------------------------------------------------
  // Résilience runtime : try/catch absorbé
  // -------------------------------------------------------------------------
  let rows: Awaited<ReturnType<typeof listCotraitants>> = [];
  let fetchError: string | null = null;

  try {
    rows = await listCotraitants();
  } catch (err) {
    console.error("[cotraitants-page:fetch-failed]", err);
    fetchError = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="mx-auto max-w-6xl">
      {/* En-tête */}
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink md:text-3xl">
            Cotraitants
          </h1>
          <p className="mt-1 text-sm text-muted">
            {fetchError
              ? "Erreur de chargement — voir détail ci-dessous."
              : `${rows.length} cabinet${rows.length !== 1 ? "s" : ""} dans l'annuaire`}
          </p>
        </div>
      </header>

      {/* Bannière erreur ou contenu interactif */}
      {fetchError ? (
        <ErrorBanner message={fetchError} />
      ) : (
        <CotraitantsListClient cotraitants={rows} isAdmin={adminUser} />
      )}
    </div>
  );
}

// ============================================================================
// Composant ErrorBanner (Server Component pur)
// ============================================================================

function ErrorBanner({ message }: { message: string }) {
  const isDev = process.env.NODE_ENV !== "production";
  return (
    <div
      role="alert"
      className="rounded-md border border-l-4 border-line border-l-error bg-error-bg px-6 py-8 text-center"
    >
      <h2 className="font-display text-base font-semibold text-error">Annuaire indisponible</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-2">
        Impossible de charger les cotraitants. Réessayez dans quelques instants.
      </p>
      {isDev ? (
        <p className="mx-auto mt-4 max-w-xl break-words font-mono text-[11px] text-error">
          {message}
        </p>
      ) : null}
    </div>
  );
}
