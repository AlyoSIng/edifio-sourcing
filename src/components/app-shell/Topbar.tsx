import type { UserProfile } from "@/lib/auth/types";

import { SidebarMobileDrawer } from "./SidebarMobileDrawer";
import { SignOutButton } from "./SignOutButton";

/**
 * Topbar minimale — avatar utilisateur (lettre dans rond) + bouton déconnexion.
 * En mobile, intègre également le bouton hamburger + drawer de navigation
 * (cf. `SidebarMobileDrawer`).
 *
 * Source design : pattern récurrent dans les maquettes Cowork (header en haut
 * du `.main-content`). Le breadcrumb dynamique n'est PAS livré en MVP — la
 * page render son propre titre dans le `<main>`.
 *
 * Server Component pour le rendu, avec sous-composants Client
 * `SignOutButton` (déconnexion) et `SidebarMobileDrawer` (nav mobile). Le state
 * d'ouverture du drawer reste interne à `SidebarMobileDrawer` — la Topbar n'a
 * pas besoin de connaître son état (le bouton hamburger est rendu DANS le
 * drawer-component, à gauche du flex-row).
 */
interface TopbarProps {
  user: UserProfile;
}

export function Topbar({ user }: TopbarProps) {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
  const initials = computeInitials(user.firstName, user.lastName, user.email);

  return (
    <header
      className="flex items-center justify-between gap-3 border-b border-line bg-white px-4 py-3 md:justify-end md:px-6"
      role="banner"
    >
      {/* Bouton hamburger + drawer mobile — masqués en md+ via classes internes */}
      <SidebarMobileDrawer role={user.role} />

      <div className="flex items-center gap-3">
        <div className="text-right leading-tight">
          <p className="text-xs font-medium text-ink">{fullName}</p>
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted">{user.role}</p>
        </div>
        <span
          className="grid h-9 w-9 place-items-center rounded-full bg-ink font-display text-sm font-semibold text-white"
          aria-hidden
        >
          {initials}
        </span>
        <SignOutButton />
      </div>
    </header>
  );
}

/**
 * Initiales utilisateur — privilégie prénom+nom, fallback sur les 2 premières
 * lettres de la partie locale de l'email. Toujours upper-case.
 *
 * `firstName` / `lastName` sont des `string` (jamais null, cf. `toUserProfile`
 * qui défalt vers `""`) — on traite donc le cas string vide.
 */
function computeInitials(firstName: string, lastName: string, email: string): string {
  const fi = firstName.trim()[0];
  const li = lastName.trim()[0];
  if (fi && li) return `${fi}${li}`.toUpperCase();
  if (fi) return fi.toUpperCase();
  const local = email.split("@")[0] ?? "";
  return (local.slice(0, 2) || "??").toUpperCase();
}
