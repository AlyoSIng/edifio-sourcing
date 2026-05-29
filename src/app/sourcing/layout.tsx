import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell/AppShell";
import { db } from "@/db/client";
import { ALYOS_ORG_ID } from "@/lib/constants/organization";
import { getRequiredOrgId } from "@/lib/auth/get-required-org-id";
import { toUserProfile } from "@/lib/auth/types";
import { computeBrandingCss } from "@/lib/admin/branding";
import { getOrgBranding } from "@/lib/admin/branding-queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Layout nested pour toutes les routes `/sourcing/*` — wrappe les pages
 * authentifiées dans le `AppShell` (Sidebar + Topbar + Footer).
 *
 * Auth-check défensif : le middleware gère déjà la garde domaine
 * `@alyosingenierie.fr` + le rôle admin sur `/sourcing/admin/*`, mais on
 * re-checke ici la présence d'une session pour ne pas rendre l'AppShell
 * sans utilisateur connecté (cas pathologique où le middleware aurait été
 * désactivé — défense en profondeur).
 *
 * Pas de chargement BDD ici : on lit uniquement `auth.users` (déjà en cache
 * Supabase SSR par `getUser`) — la page enfant fera ses propres fetches.
 *
 * `dynamic = "force-dynamic"` : la session utilisateur doit toujours être
 * lue à la volée (pas de cache layout) pour éviter qu'un layout statique
 * affiche un mauvais profil après changement de session.
 */
export const dynamic = "force-dynamic";

export default async function SourcingLayout({ children }: { children: React.ReactNode }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Pas de session : on délègue au middleware via redirect /login. Le
  // middleware traitera le `?next=...` correctement à l'étape suivante.
  if (!user) {
    redirect("/login");
  }

  const profile = toUserProfile(user);

  // Chargement branding organisation — best-effort.
  // Si la DB est indisponible ou si l'org n'a pas de branding, on sert
  // les CSS vars par défaut (couleur #ff0033 edifio, police Space Grotesk).
  let brandingCss = "";
  try {
    const orgId = await getRequiredOrgId(user.id).catch(() => ALYOS_ORG_ID);
    const branding = await getOrgBranding(orgId, db);
    brandingCss = computeBrandingCss(branding);
  } catch {
    // Silencieux : le branding est non critique, pas de crash 500.
  }

  return (
    <>
      {/* Injection CSS branding organisation — override --brand-red et --font-display
       * uniquement si l'organisation a configuré des valeurs custom.
       * La balise <style> est placée AVANT l'AppShell pour que les CSS vars
       * soient disponibles dès le premier rendu. */}
      {brandingCss ? <style dangerouslySetInnerHTML={{ __html: brandingCss }} /> : null}
      <AppShell user={profile}>{children}</AppShell>
    </>
  );
}
