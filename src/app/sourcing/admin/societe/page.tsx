import { redirect } from "next/navigation";

import { isAdmin, toUserProfile } from "@/lib/auth/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadOrgProfile, loadOrgSiret } from "./actions";
import { OrgProfileForm } from "./OrgProfileForm";

export const metadata = {
  title: "Administration — Présentation société — edifio Sourcing",
};

export const dynamic = "force-dynamic";

/**
 * Page admin — présentation société (Exigence D).
 *
 * Source de vérité :
 *  - `handoff/SPEC_ADDENDUM_260525_ARCHITECTES_MENU_ET_TRAME_MAIL.md` §Exigence D
 *  - Décision Board 2026-05-25
 *
 * Réssilience : try/catch absorbé (règle MEMORY). Seed MVP AlyoS dans le
 * placeholder du formulaire si aucune donnée en BDD.
 */
export default async function SocietePage() {
  // 1. Auth check
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/sourcing/admin/societe");

  const profile = toUserProfile(user);
  if (!isAdmin(profile)) redirect("/sourcing/ao-du-jour?error=forbidden");

  // 2. Chargement profil org et SIRET (try/catch dans les helpers)
  let orgProfile = null;
  let orgSiret: string | null = null;
  let fetchError: string | null = null;
  try {
    [orgProfile, orgSiret] = await Promise.all([loadOrgProfile(), loadOrgSiret()]);
  } catch (err) {
    console.error("[societe:fetch:fail]", err);
    fetchError = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink md:text-3xl">
          Présentation société
        </h1>
        <p className="mt-1 text-sm text-muted">
          Personnalise l&apos;identité AlyoS injectée dans les modèles d&apos;e-mail via{" "}
          <code className="rounded bg-paper-3 px-1 font-mono text-xs">
            {"{{presentation_societe}}"}
          </code>
          .
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
        <div className="rounded-md border border-line bg-white p-6">
          <OrgProfileForm initial={orgProfile} initialSiret={orgSiret} />
        </div>
      )}
    </div>
  );
}
