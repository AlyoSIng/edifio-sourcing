import type { UserProfile } from "@/lib/auth/types";

import { Footer } from "./Footer";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

/**
 * AppShell — chrome global des pages authentifiées `/sourcing/*`.
 *
 * Structure :
 *   - Sidebar (220 px desktop, cachée mobile MVP) — fond `--ink`
 *   - Conteneur droit en colonne : Topbar + main (children) + Footer
 *
 * Source design : `design/maquettes/maquettes_v4_sourcing_modules.html`
 * lignes 190-211 + `maquettes_v5_admin_architectes.html` lignes 130-142.
 *
 * Server Component pour le rendu. La détection de l'item actif est déléguée
 * à la `Sidebar` (Client Component, `usePathname`) — voir JSDoc Sidebar pour
 * le rationale.
 *
 * **Mobile MVP** : la sidebar est masquée sur les viewports < `md`. Le menu
 * hamburger viendra dans une PR ultérieure (cf. notes Cowork Q1 sidebar
 * mobile). Le contenu reste accessible en pleine largeur. La nav admin est
 * accessible via `/sourcing/admin/*` directement (URL).
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

export function AppShell({ user, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar role={user.role} />
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
