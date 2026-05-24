/**
 * Page short-list Tandem — `/sourcing/ao/[id]/tandem`.
 *
 * Server Component **protégé** (middleware `@alyosingenierie.fr` + path
 * `/sourcing/*`). Affiche la liste des architectes proposés par le matcher
 * V1 pour un AO sélectionné en mode Tandem.
 *
 * Source de vérité :
 *  - `specs/module_tandem_engine_v1.md` §3.2 (short-list UI)
 *  - `handoff/PLAN_TANDEM_NADIA_260522.md` §sous-étape 5
 *  - Maquette M-D1 (short-list)
 *
 * Workflow utilisateur :
 *   1. AO du jour → clic « Sélectionner » → modale Solo/Tandem → choix Tandem
 *      → `selectTenderAction(tenderId, 'tandem')` bascule en `selected_tandem`
 *   2. Le caller redirige vers cette page (la redirection est gérée côté
 *      `TenderCardActions` après la Server Action — réf. sous-étape 5 §UI).
 *   3. Cette page rend les top N archis (3 par défaut), avec score, rationale,
 *      bouton « Préparer la sollicitation » → modale preview Brevo.
 *   4. Confirmation envoi → `sendArchitectSolicitation` → status archi devient
 *      « envoyé » dans l'UI sans rechargement complet.
 *
 * Résilience runtime : try/catch absorbé sur les fetches BDD
 * (cf. memory `feedback_nextjs_runtime_page_resilience`).
 */

import { redirect } from "next/navigation";

import { ErrorBanner } from "@/app/sourcing/ao-du-jour/ErrorBanner";
import { ALYOS_ORG_ID } from "@/lib/constants/organization";
import { toUserProfile } from "@/lib/auth/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAuthorizedEmail } from "@/lib/auth/domain";

import { TandemShortlistClient } from "./TandemShortlistClient";
import { loadTandemShortlistData } from "./page-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata = {
  title: "Cotraitance — short-list architectes · edifio Sourcing",
};

interface PageProps {
  params: { id: string };
}

const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export default async function TandemShortlistPage({ params }: PageProps) {
  // Auth check défensif (le middleware a normalement déjà filtré).
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/sourcing/ao/${params.id}/tandem`);
  const profile = toUserProfile(user);
  if (!isAuthorizedEmail(profile.email)) redirect("/forbidden");

  if (!UUID_SHAPE.test(params.id)) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-8">
        <ErrorBanner message="Identifiant d'AO invalide." />
      </main>
    );
  }

  // Résilience runtime : on encapsule tout l'I/O dans un try/catch.
  let loadResult: Awaited<ReturnType<typeof loadTandemShortlistData>> | null = null;
  let fetchError: string | null = null;
  try {
    loadResult = await loadTandemShortlistData(params.id, ALYOS_ORG_ID);
  } catch (err) {
    console.error("[tandem-shortlist-page:unhandled]", err);
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
    if (loadResult.error === "invalid_state") {
      return (
        <main className="mx-auto max-w-5xl px-6 py-8">
          <ErrorBanner message="Cet AO n'est pas en mode Tandem (statut incompatible)." />
        </main>
      );
    }
    return (
      <main className="mx-auto max-w-5xl px-6 py-8">
        <ErrorBanner message="Erreur de chargement de la short-list." />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <span className="pill-eyebrow">Cotraitance — Tandem</span>
        <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-ink md:text-3xl">
          Short-list architectes
        </h1>
        <p className="mt-2 text-sm text-ink-2">
          <strong className="text-ink">{loadResult.data.tender.title}</strong> ·{" "}
          {loadResult.data.tender.buyer}
        </p>
      </header>

      <TandemShortlistClient tenderId={params.id} initialData={loadResult.data} />
    </main>
  );
}
