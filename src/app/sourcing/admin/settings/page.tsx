import { redirect } from "next/navigation";

import { db } from "@/db/client";
import { ALYOS_ORG_ID } from "@/lib/constants/organization";
import { isAuthorizedEmail } from "@/lib/auth/domain";
import { isAdmin, toUserProfile } from "@/lib/auth/types";
import { getRequiredOrgId } from "@/lib/auth/get-required-org-id";
import { getOrgBranding } from "@/lib/admin/branding-queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { OrgBrandingForm } from "./OrgBrandingForm";

export const metadata = {
  title: "Personnalisation — edifio Sourcing",
};

export const dynamic = "force-dynamic";

/**
 * Page admin — Personnalisation organisation (branding).
 *
 * Permet à l'admin org de configurer :
 *  - Logo (PNG/JPEG/WebP/SVG, bucket `org-assets`)
 *  - Couleur dominante (override `--brand-red` via CSS vars)
 *  - Police d'affichage (override `--font-display`)
 *
 * Guard : admin org uniquement.
 * Résilience : try/catch absorbé sur les appels BDD.
 */
export default async function SettingsPage() {
  // 1. Auth check
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/sourcing/admin/settings");

  const profile = toUserProfile(user);
  if (!isAuthorizedEmail(profile.email)) redirect("/forbidden");
  if (!isAdmin(profile)) redirect("/sourcing");

  // 2. Résolution org
  let orgId: string;
  try {
    orgId = await getRequiredOrgId(user.id);
  } catch (err) {
    console.error("[admin:settings:org-resolution-failed]", err);
    orgId = ALYOS_ORG_ID;
  }

  // 3. Chargement branding actuel
  let branding = null;
  try {
    branding = await getOrgBranding(orgId, db);
  } catch (err) {
    console.error("[admin:settings:branding-load-failed]", err);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-8">
        <span className="pill-eyebrow">Administration</span>
        <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-ink md:text-3xl">
          Personnalisation
        </h1>
        <p className="mt-1 text-sm text-muted">
          Adaptez l&apos;apparence de l&apos;application à votre organisation. Les modifications
          prennent effet immédiatement pour tous les membres connectés.
        </p>
      </header>

      <div className="rounded-md border border-line bg-white p-6 shadow-sm">
        <OrgBrandingForm branding={branding} />
      </div>
    </div>
  );
}
