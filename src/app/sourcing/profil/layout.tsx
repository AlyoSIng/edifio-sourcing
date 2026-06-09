/**
 * Layout Profil utilisateur — edifio Sourcing (Server Component)
 *
 * Garde d'authentification : session valide uniquement.
 * (Le middleware `/sourcing/*` gère déjà l'auth — re-check défensif ici
 * pour la profondeur de sécurité.)
 * ADR-014 (2026-06-05) — garde domaine `isAuthorizedEmail` retirée :
 * ouverture multi-tenant (PROTECT + orgs futures).
 *
 * Structure : en-tête + navigation latérale (`ProfilNav`, client) + contenu.
 * Sections disponibles :
 *   - Support      : soumettre et suivre ses tickets d'aide
 *   - Actualités   : lire les news produit
 *   - Formations   : fiches de formation
 *   - Tests guidés : QCM liés aux formations
 *   - FAQ          : questions fréquentes
 *   - Démo         : accéder à la démo vidéo
 *
 * Décision Board 2026-05-27 — module profil utilisateur edifio Sourcing.
 */

import { redirect } from "next/navigation";

import { toUserProfile } from "@/lib/auth/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { ProfilNav } from "./ProfilNav";

export const dynamic = "force-dynamic";

export default async function ProfilLayout({ children }: { children: React.ReactNode }) {
  // Garde défensive — session (le middleware a déjà traité la case absente)
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/sourcing/profil");
  }

  const profile = toUserProfile(user);
  const displayName =
    [profile.firstName, profile.lastName].filter(Boolean).join(" ") || profile.email;

  return (
    <div className="mx-auto max-w-5xl">
      {/* En-tête */}
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Mon profil</h1>
        <p className="mt-1 text-sm text-muted">
          {displayName} · Support, actualités, formations et ressources edifio Sourcing.
        </p>
      </header>

      <div className="flex gap-6">
        {/* Navigation latérale (Client Component — usePathname) */}
        <ProfilNav />

        {/* Contenu de la section active */}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
