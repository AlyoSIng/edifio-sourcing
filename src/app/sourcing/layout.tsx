import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell/AppShell";
import { toUserProfile } from "@/lib/auth/types";
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

  return <AppShell user={profile}>{children}</AppShell>;
}
