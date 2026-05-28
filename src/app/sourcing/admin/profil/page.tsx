import { redirect } from "next/navigation";

import { db } from "@/db/client";
import { isAdmin, toUserProfile } from "@/lib/auth/types";
import { ALYOS_ORG_ID } from "@/lib/constants/organization";
import { getActiveSearchProfile } from "@/lib/profile/queries";
import { MARKET_TYPES, type MarketType } from "@/lib/profile/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { ProfileForm, type ProfileFormInitialValues } from "./ProfileForm";

export const metadata = {
  title: "Administration — Profil de recherche — edifio Sourcing",
};

/**
 * Cette page n'est jamais cachée :
 *  - le profil change rarement, mais quand il change, c'est via cette page
 *  - `revalidatePath` est déjà déclenché côté Server Action — `force-dynamic`
 *    en complément garantit que la lecture initiale post-redirect login soit
 *    toujours fraîche
 */
export const dynamic = "force-dynamic";

/**
 * Page admin — édition du profil de recherche AlyoS (P2 Gate 6, refonte UI v1).
 *
 * Source de vérité fonctionnelle :
 *  - `handoff/PLAN_ALEX_260522_REFONTE_UI.md` §P2
 *  - 5 recos Q1-Q5 Board 22/05 (cf. `DECISIONS.md`)
 * Source de vérité visuelle :
 *  - `design/maquettes/maquettes_v5_admin_architectes.html` ligne 218-275
 *    (M16-B fiche éditable — pattern sections + champs).
 *
 * Garde : middleware bloque déjà les non-admin — re-check côté Server Component
 * (défense en profondeur). Résilience runtime : try/catch absorbé aligné sur
 * `/sourcing/ao-du-jour/page.tsx` (hotfix PR #22, Board 2026-05-21).
 */
export default async function AdminProfilPage() {
  // 1. Auth check (le middleware aurait déjà redirigé sinon)
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/sourcing/admin/profil");

  const profile = toUserProfile(user);
  if (!isAdmin(profile)) redirect("/sourcing/ao-du-jour?error=forbidden");

  // 2. Fetch profil actif AlyoS — try/catch résilience (defense applicative)
  let activeProfile: Awaited<ReturnType<typeof getActiveSearchProfile>> = null;
  let fetchError: string | null = null;
  try {
    activeProfile = await getActiveSearchProfile(ALYOS_ORG_ID, db);
  } catch (err) {
    // TODO(Gate 8) : remplacer par Sentry.captureException — convention
    // alignée sur `src/lib/audit/index.ts` reportAuditFailure.
    console.error("[admin-profil:fetch:fail]", err);
    // NB : on ne passe PAS le message brut à l'UI (fuite d'info DB — cf. DECISIONS.md sécurité).
    fetchError = "Erreur base de données — réessayez dans quelques instants.";
  }

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink md:text-3xl">
          Profil de recherche
        </h1>
        <p className="mt-1 text-sm text-muted">
          Édite les critères qui pilotent la sélection « AO du jour » d&apos;AlyoS.
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
      ) : !activeProfile ? (
        <div
          role="alert"
          className="rounded-md border border-l-4 border-line border-l-warn bg-warn-bg px-4 py-3 text-sm text-warn"
        >
          Aucun profil de recherche actif trouvé pour AlyoS. Contacte un administrateur ou exécute{" "}
          <code className="font-mono">pnpm db:seed:prod</code>.
        </div>
      ) : (
        <ProfileForm
          profileName={activeProfile.name}
          initialValues={toFormInitialValues(activeProfile)}
        />
      )}
    </div>
  );
}

// ============================================================================
// Helpers — mapping DB row → valeurs initiales du form
// ============================================================================

/**
 * Convertit un row `SearchProfile` (Drizzle) vers `ProfileFormInitialValues`.
 *
 * Conversions :
 *  - `keywords.{positive,negative,exact}` : directs (JSONB déjà typé fort)
 *  - `cpvCodes` / `geoZones` : directs (text[] → string[])
 *  - `marketTypes` : filtrage défensif vers l'enum fermé (Q4 Board 22/05).
 *    Le seed prod historique contient `"maitrise d'oeuvre"` libre — on le
 *    map vers `moe` au passage UI (note la perte d'info ; la prochaine save
 *    re-normalise en BDD).
 *  - `amountMin` / `amountMax` : `string | null` (numeric Postgres) → `number
 *    | null` côté UI. `parseFloat` tolérant aux strings malformés (renvoie
 *    `NaN` → fallback `null`).
 */
function toFormInitialValues(
  row: Awaited<ReturnType<typeof getActiveSearchProfile>>,
): ProfileFormInitialValues {
  if (!row) {
    return {
      positive: [],
      negative: [],
      exact: [],
      cpv_codes: [],
      geo_zones: [],
      market_types: [],
      amount_min: null,
      amount_max: null,
    };
  }

  return {
    positive: row.keywords.positive,
    negative: row.keywords.negative,
    exact: row.keywords.exact,
    cpv_codes: row.cpvCodes,
    geo_zones: row.geoZones,
    market_types: normalizeMarketTypes(row.marketTypes),
    amount_min: parseNumericOrNull(row.amountMin),
    amount_max: parseNumericOrNull(row.amountMax),
  };
}

/**
 * Normalise les `marketTypes` BDD libres (legacy seed) vers l'enum fermé.
 * Mapping doux :
 *  - `"maitrise d'oeuvre"` / `"moe"` → `"moe"`
 *  - autres valeurs dans l'enum → conservées
 *  - valeurs HS → ignorées (drop silencieux pour ne pas crash l'UI)
 */
function normalizeMarketTypes(raw: string[]): MarketType[] {
  const out: MarketType[] = [];
  for (const item of raw) {
    const lc = item.toLowerCase().trim();
    if (lc === "maitrise d'oeuvre" || lc === "maîtrise d'œuvre" || lc === "moe") {
      if (!out.includes("moe")) out.push("moe");
      continue;
    }
    if ((MARKET_TYPES as readonly string[]).includes(lc)) {
      const mt = lc as MarketType;
      if (!out.includes(mt)) out.push(mt);
    }
    // sinon : drop silencieux (legacy libre)
  }
  return out;
}

function parseNumericOrNull(value: string | null): number | null {
  if (value === null) return null;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
}
