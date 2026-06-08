import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { AppShell } from "@/components/app-shell/AppShell";
import { TrialBanner } from "@/components/app-shell/TrialBanner";
import { db } from "@/db/client";
import { organizations } from "@/db/schema/organizations";
import { ALYOS_ORG_ID } from "@/lib/constants/organization";
import { getRequiredOrgId } from "@/lib/auth/get-required-org-id";
import { isSuperAdmin, toUserProfile } from "@/lib/auth/types";
import { computeBrandingCss } from "@/lib/admin/branding";
import { getOrgBranding } from "@/lib/admin/branding-queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { computeTrialState } from "@/lib/billing/trial";

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
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Pas de session : on délègue au middleware via redirect /login. Le
  // middleware traitera le `?next=...` correctement à l'étape suivante.
  if (!user) {
    redirect("/login");
  }

  const profile = toUserProfile(user);

  // Résolution org (utilisée pour branding + billing).
  // Typage explicite `string` pour pouvoir réassigner (ALYOS_ORG_ID est une
  // const literal UUID — le TS strict refuserait l'union sinon).
  let orgId: string = ALYOS_ORG_ID;
  try {
    orgId = await getRequiredOrgId(user.id);
  } catch {
    // Fallback silencieux
  }

  // Chargement état billing (Steve 2026-06-05 — Stripe minimal MVP).
  // Si l'org est en trial expiré OU en statut expired/cancelled, on redirige
  // vers /trial-expired SAUF pour le superadmin éditeur (qui doit pouvoir
  // gérer le statut depuis /sourcing/superadmin/...).
  let trialBannerNode: React.ReactNode = null;
  try {
    const [orgRow] = await db
      .select({
        subscriptionStatus: organizations.subscriptionStatus,
        trialEndsAt: organizations.trialEndsAt,
      })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    if (orgRow) {
      const trialState = computeTrialState({
        subscriptionStatus: orgRow.subscriptionStatus,
        trialEndsAt: orgRow.trialEndsAt,
      });
      if (trialState.isLocked && !isSuperAdmin(profile)) {
        redirect("/trial-expired");
      }
      if (trialState.shouldShowBanner) {
        trialBannerNode = <TrialBanner state={trialState} />;
      }
    }
  } catch (err) {
    console.warn("[sourcing-layout:billing-check:fail]", err);
  }

  // Chargement branding organisation — best-effort.
  // Si la DB est indisponible ou si l'org n'a pas de branding, on sert
  // les CSS vars par défaut (couleur #ff0033 edifio, police Space Grotesk).
  let brandingCss = "";
  try {
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
      <AppShell user={profile} trialBanner={trialBannerNode}>
        {children}
      </AppShell>
    </>
  );
}
