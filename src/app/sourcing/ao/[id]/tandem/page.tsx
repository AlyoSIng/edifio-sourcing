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
import { getRequiredOrgId, NoOrganizationMembershipError } from "@/lib/auth/get-required-org-id";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { TandemShortlistClient } from "./TandemShortlistClient";
import { loadTandemShortlistData } from "./page-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata = {
  title: "Cotraitance — short-list architectes · edifio Sourcing",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Noms courts des 52 départements les plus fréquents en BTP français. */
const DEPT_LABELS: Record<string, string> = {
  "01": "Ain",
  "02": "Aisne",
  "03": "Allier",
  "04": "Alpes-de-Haute-Provence",
  "05": "Hautes-Alpes",
  "06": "Alpes-Maritimes",
  "07": "Ardèche",
  "08": "Ardennes",
  "13": "Bouches-du-Rhône",
  "14": "Calvados",
  "17": "Charente-Maritime",
  "21": "Côte-d'Or",
  "22": "Côtes-d'Armor",
  "25": "Doubs",
  "29": "Finistère",
  "30": "Gard",
  "31": "Haute-Garonne",
  "33": "Gironde",
  "34": "Hérault",
  "35": "Ille-et-Vilaine",
  "38": "Isère",
  "42": "Loire",
  "44": "Loire-Atlantique",
  "45": "Loiret",
  "54": "Meurthe-et-Moselle",
  "56": "Morbihan",
  "57": "Moselle",
  "59": "Nord",
  "62": "Pas-de-Calais",
  "63": "Puy-de-Dôme",
  "64": "Pyrénées-Atlantiques",
  "67": "Bas-Rhin",
  "69": "Rhône",
  "75": "Paris",
  "76": "Seine-Maritime",
  "77": "Seine-et-Marne",
  "78": "Yvelines",
  "80": "Somme",
  "83": "Var",
  "84": "Vaucluse",
  "85": "Vendée",
  "91": "Essonne",
  "92": "Hauts-de-Seine",
  "93": "Seine-Saint-Denis",
  "94": "Val-de-Marne",
  "95": "Val-d'Oise",
  "971": "Guadeloupe",
  "972": "Martinique",
  "973": "Guyane",
  "974": "La Réunion",
  "2A": "Corse-du-Sud",
  "2B": "Haute-Corse",
};

export default async function TandemShortlistPage(props: PageProps) {
  const params = await props.params;
  // Auth check défensif (le middleware a normalement déjà filtré).
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/sourcing/ao/${params.id}/tandem`);
  // ADR-014 (2026-06-05) — garde domaine `isAuthorizedEmail` retirée :
  // ouverture multi-tenant (PROTECT + orgs futures). Les autres gardes
  // restent (auth ci-dessus, tenant via `getRequiredOrgId` + RLS ci-dessous).
  // Résolution dynamique de l'org (Phase A multi-tenant).
  // Lot 1.6-bis (Hugo, 2026-06-09) — suppression du fallback ALYOS_ORG_ID.
  // Si pas de membership : redirect /no-org (ne JAMAIS fallback — fuite CC-2).
  let orgId: string;
  try {
    orgId = await getRequiredOrgId(user.id);
  } catch (err) {
    if (err instanceof NoOrganizationMembershipError) {
      redirect("/no-org");
    }
    throw err;
  }

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
    loadResult = await loadTandemShortlistData(params.id, orgId);
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
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-2">
          {loadResult.data.tender.department ? (
            <span>
              <span className="font-medium text-ink">Département</span>{" "}
              <span className="font-mono text-xs">{loadResult.data.tender.department}</span>
              {DEPT_LABELS[loadResult.data.tender.department] ? (
                <span className="ml-1 text-muted">
                  ({DEPT_LABELS[loadResult.data.tender.department]})
                </span>
              ) : null}
            </span>
          ) : null}
          {loadResult.data.tender.amount ? (
            <span>
              <span className="font-medium text-ink">Estimation</span>{" "}
              <span className="font-mono text-xs">
                ~{" "}
                {new Intl.NumberFormat("fr-FR", {
                  style: "currency",
                  currency: "EUR",
                  maximumFractionDigits: 0,
                }).format(parseFloat(loadResult.data.tender.amount))}
              </span>
            </span>
          ) : null}
        </div>
      </header>

      <TandemShortlistClient tenderId={params.id} initialData={loadResult.data} />
    </main>
  );
}
