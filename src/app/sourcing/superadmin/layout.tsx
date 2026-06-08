/**
 * Layout du module Superadmin — edifio Sourcing
 *
 * Triple garde d'authentification :
 *   1. Session Supabase valide
 *   2. Email sur domaine autorisé (via `isAuthorizedEmail`)
 *   3. Rôle `superadmin` (via `isSuperAdmin`)
 *
 * Si l'une des conditions n'est pas remplie → redirect `/sourcing/ao-du-jour?error=forbidden`.
 * Le middleware assure déjà ces vérifications, mais la défense en profondeur
 * est maintenue ici au niveau layout.
 *
 * Décision Board 2026-05-27 — rôle superadmin éditeur edifio.
 */

import { redirect } from "next/navigation";

import { isAuthorizedEmail } from "@/lib/auth/domain";
import { isSuperAdmin, toUserProfile } from "@/lib/auth/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SuperadminLayout({ children }: { children: React.ReactNode }) {
  // Garde 1 — session
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/sourcing/superadmin");
  }

  // Garde 2 — domaine autorisé
  if (!isAuthorizedEmail(user.email)) {
    redirect("/forbidden");
  }

  // Garde 3 — rôle superadmin
  const profile = toUserProfile(user);
  if (!isSuperAdmin(profile)) {
    redirect("/sourcing/ao-du-jour?error=forbidden");
  }

  const displayName =
    [profile.firstName, profile.lastName].filter(Boolean).join(" ") || profile.email;

  return (
    <div className="mx-auto max-w-5xl">
      {/* En-tête superadmin */}
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div>
          <div className="mb-0.5 font-mono text-[10px] uppercase tracking-widest text-muted">
            edifio Sourcing · Éditeur
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Superadmin</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-violet-100 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-violet-700">
            superadmin
          </span>
          <span className="font-mono text-xs text-muted">{displayName}</span>
        </div>
      </header>

      {children}
    </div>
  );
}
