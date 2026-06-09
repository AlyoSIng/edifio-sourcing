import { redirect } from "next/navigation";

import { db } from "@/db/client";
import { isAdmin, toUserProfile } from "@/lib/auth/types";
import { getRequiredOrgId, NoOrganizationMembershipError } from "@/lib/auth/get-required-org-id";
import { getDefaultSearchProfile, listSearchProfiles } from "@/lib/profile/search-profiles-queries";
import { listLearningEventsForSuggestions } from "@/lib/sourcing/learning/learning-events-queries";
import {
  computeSuggestions,
  type ProfileSuggestion,
} from "@/lib/sourcing/learning/suggest-profile-adjustment";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { listSearchProfilesAction } from "../profil/search-profiles-actions";
import { LearningSuggestions } from "./LearningSuggestions";
import { SearchProfilesClient } from "./SearchProfilesClient";

export const metadata = {
  title: "Administration — Profils de recherche — edifio Sourcing",
};

/**
 * Jamais mis en cache : les profils changent après chaque opération CRUD.
 */
export const dynamic = "force-dynamic";

/**
 * Page admin — gestion multi-profils de recherche (Tâche #29, 2026-05-27).
 *
 * Source de vérité fonctionnelle : Tâche #29 Board 2026-05-27.
 *
 * - Server Component : auth check + fetch profils
 * - Client Component `SearchProfilesClient` : liste + CRUD inline
 *
 * Résilience runtime : try/catch absorbé aligné sur le pattern PR #22.
 */
export default async function SearchProfilesPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/sourcing/admin/search-profiles");

  const profile = toUserProfile(user);
  if (!isAdmin(profile)) redirect("/sourcing/ao-du-jour?error=forbidden");
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

  let profiles: Awaited<ReturnType<typeof listSearchProfilesAction>> = {
    ok: true,
    profiles: [],
  };
  let fetchError: string | null = null;

  try {
    const rows = await listSearchProfiles(orgId, db, true);
    profiles = {
      ok: true,
      profiles: rows.map((r) => ({
        id: r.id,
        name: r.name,
        isDefault: r.isDefault,
        displayOrder: r.displayOrder,
        active: r.active,
        keywordsPositiveCount: r.keywords.positive.length,
        keywordsNegativeCount: r.keywords.negative.length,
        cpvCodesCount: r.cpvCodes.length,
        geoZonesCount: r.geoZones.length,
        keywords: r.keywords as { positive: string[]; negative: string[]; exact: string[] },
        cpvCodes: r.cpvCodes,
        geoZones: r.geoZones,
        marketTypes: r.marketTypes,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    };
  } catch (err) {
    console.error("[admin-search-profiles:fetch:fail]", err);
    // NB : on ne passe PAS le message brut à l'UI (fuite d'info DB — cf. DECISIONS.md sécurité).
    fetchError = "Erreur base de données — réessayez dans quelques instants.";
  }

  // Suggestions d'ajustement (Salve U — apprentissage par écartement).
  // Best-effort résilient : un échec ne casse jamais la page (try/catch absorbé).
  // On ne propose des suggestions que si l'org a un profil par défaut (la cible).
  let defaultProfileId: string | null = null;
  let suggestions: ProfileSuggestion[] = [];
  try {
    const defaultProfile = await getDefaultSearchProfile(orgId, db);
    if (defaultProfile) {
      defaultProfileId = defaultProfile.id;
      const events = await listLearningEventsForSuggestions(orgId, db);
      suggestions = computeSuggestions(
        events,
        {
          geoZones: defaultProfile.geoZones,
          amountMin: defaultProfile.amountMin,
          keywords: defaultProfile.keywords,
        },
        new Date(),
      );
    }
  } catch (err) {
    console.error("[admin-search-profiles:suggestions:fail]", err);
    // Suggestions optionnelles : on les masque simplement en cas d'erreur.
    suggestions = [];
  }

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink md:text-3xl">
          Profils de recherche
        </h1>
        <p className="mt-1 text-sm text-muted">
          Gère les profils de recherche d&apos;AlyoS. Chaque profil filtre les AO du jour
          différemment. Le profil par défaut est utilisé au chargement de la page.
        </p>
      </header>

      {fetchError ? (
        <div
          role="alert"
          className="rounded-md border border-l-4 border-line border-l-error bg-error-bg px-4 py-3 text-sm text-error"
        >
          <strong className="mr-1 font-semibold">Erreur de chargement :</strong>
          {fetchError}
        </div>
      ) : (
        <div className="space-y-6">
          {defaultProfileId && suggestions.length > 0 ? (
            <LearningSuggestions defaultProfileId={defaultProfileId} suggestions={suggestions} />
          ) : null}
          <SearchProfilesClient profiles={profiles.ok ? profiles.profiles : []} />
        </div>
      )}
    </div>
  );
}
