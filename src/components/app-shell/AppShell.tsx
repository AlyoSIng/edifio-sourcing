import type { UserProfile } from "@/lib/auth/types";

import { db } from "@/db/client";
import { countNewArchitectResponses } from "@/lib/notifications/architect-responses";
import { getRequiredOrgId } from "@/lib/auth/get-required-org-id";
import { Footer } from "./Footer";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

/**
 * AppShell — chrome global des pages authentifiées `/sourcing/*`.
 *
 * Structure :
 *   - Sidebar (220 px desktop, drawer hamburger mobile) — fond `--ink`
 *   - Conteneur droit en colonne : Topbar + main (children) + Footer
 *
 * Source design : `design/maquettes/maquettes_v4_sourcing_modules.html`
 * lignes 190-211 + `maquettes_v5_admin_architectes.html` lignes 130-142.
 *
 * Server Component pour le rendu. La détection de l'item actif est déléguée
 * à la `Sidebar` (Client Component, `usePathname`) — voir JSDoc Sidebar pour
 * le rationale.
 *
 * **Mobile (< md)** : la sidebar inline est masquée (`hidden md:flex`). La
 * navigation est servie via `SidebarMobileDrawer` (drawer slide-from-left
 * déclenché par bouton hamburger), rendu depuis la Topbar. Cf. Q1 Board
 * 2026-05-22.
 *
 * **Pas d'AppShell** sur :
 *   - `/` `/about` `/login` `/forbidden` `/forgot-password` `/reset-password`
 *     `/auth/callback` `/auth/error` (pages publiques sans chrome app)
 *   Ces pages utilisent leur propre layout simple.
 */
interface AppShellProps {
  user: UserProfile;
  children: React.ReactNode;
}

export async function AppShell({ user, children }: AppShellProps) {
  // H7 — compteur de nouvelles réponses architectes pour le badge sidebar.
  // Best-effort : si la BDD rate, on passe 0 et on continue (la page rend
  // toujours).
  let newArchitectResponsesCount = 0;
  if (user.role === "admin" || user.role === "superadmin") {
    try {
      const orgId = await getRequiredOrgId(user.id);
      newArchitectResponsesCount = await countNewArchitectResponses(db, orgId, user.id);
    } catch (err) {
      console.warn("[app-shell:notif-count:fail]", err);
    }
  }
  const dynamicBadges: Record<string, string | number> = {};
  if (newArchitectResponsesCount > 0) {
    dynamicBadges["/sourcing/admin/tandem-activity"] = newArchitectResponsesCount;
  }

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar role={user.role} dynamicBadges={dynamicBadges} />
      <div className="flex min-h-screen flex-1 flex-col">
        <Topbar user={user} />
        <main id="main-content" className="flex-1 px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
        <Footer />
      </div>
    </div>
  );
}
