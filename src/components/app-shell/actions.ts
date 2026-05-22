"use server";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Server Action de déconnexion utilisateur — appelée par `SignOutButton`
 * dans le Topbar de l'AppShell.
 *
 * Flow :
 *   1. Invalide la session Supabase côté serveur (cookies sb-* effacés via
 *      le pattern `setAll` du `createServerClient`).
 *   2. Redirige vers `/login` — `redirect()` throw un `NEXT_REDIRECT` qui
 *      est intercepté par Next pour propager les cookies sortants.
 *
 * Pas de garde-fou domain ici : le bouton n'est rendu qu'à l'intérieur du
 * layout `/sourcing/*` (donc derrière le middleware @alyosingenierie.fr).
 * Si la session est déjà absente, `signOut` est idempotent (no-op).
 *
 * Convention : la Server Action vit dans le dossier composant car elle est
 * un détail d'implémentation de `SignOutButton` (couplage attendu).
 */
export async function signOutAction(): Promise<void> {
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
