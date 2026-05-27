"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon } from "@/components/icons/AppIcons";
import { isItemActive, NAV_ITEMS, type NavItem } from "./nav-items";

/**
 * Sidebar de l'AppShell — fond `--ink`, navigation hiérarchisée par sections,
 * item actif sur fond `--brand-red`.
 *
 * Source design : `design/maquettes/maquettes_v4_sourcing_modules.html`
 * lignes 191-210 (M-A) et `maquettes_v5_admin_architectes.html` lignes 130-142
 * (M16).
 *
 * **Pourquoi Client Component ?** On a besoin de `usePathname()` pour détecter
 * l'item actif. Next 14 Server Components n'exposent pas le pathname courant
 * de façon stable (le `headers().get('x-pathname')` dépend d'une injection
 * côté middleware qu'on ne veut pas ajouter dans cette PR pour rester dans le
 * périmètre visuel pur). Le coût client est minime — la Sidebar est statique
 * en dehors du surlignage actif.
 *
 * Filtrage `adminOnly` : si `role !== "admin"`, on masque les items concernés.
 * Pour les `comingSoon`, on rend un item désactivé (utile pour Nadia/Tandem).
 */
interface SidebarProps {
  /** Rôle de l'utilisateur connecté pour filtrer `adminOnly`. */
  role: "admin" | "user" | "viewer" | "superadmin";
}

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname() ?? "/sourcing/ao-du-jour";
  // Le superadmin bénéficie également de l'accès aux items adminOnly.
  const isAdmin = role === "admin" || role === "superadmin";
  const isSuperAdmin = role === "superadmin";

  return (
    <aside
      className="hidden w-[220px] shrink-0 bg-ink text-white md:flex md:flex-col"
      aria-label="Navigation principale"
    >
      <div className="flex h-full flex-col px-4 py-5">
        {/* Logo edifio — wordmark + libellé produit en mono muted */}
        <Link
          href="/sourcing/ao-du-jour"
          className="mb-7 flex items-center gap-2 rounded outline-none focus-visible:ring-2 focus-visible:ring-brand-red"
          aria-label="edifio Sourcing — Accueil"
        >
          <span
            className="grid h-7 w-7 place-items-center rounded-full bg-brand-red shadow-logo"
            aria-hidden
          >
            <svg viewBox="0 0 20 24" fill="none" className="h-[17px] w-[14px]">
              <path
                d="M 10 0 C 16 0 20 4 20 10 C 20 17 10 24 10 24 C 10 24 0 17 0 10 C 0 4 4 0 10 0 Z"
                fill="white"
              />
              <circle cx="10" cy="10" r="4" fill="#ff0033" />
            </svg>
          </span>
          <span className="leading-tight">
            <span className="block font-display text-[20px] font-bold tracking-tight text-white">
              edifio
            </span>
            <span className="block font-mono text-[10px] uppercase tracking-[1px] text-white/45">
              Sourcing
            </span>
          </span>
        </Link>

        <nav className="flex-1 overflow-y-auto">
          {NAV_ITEMS.map((section) => {
            const visible = section.items.filter(
              (it) => (!it.adminOnly || isAdmin) && (!it.superadminOnly || isSuperAdmin),
            );
            if (visible.length === 0) return null;
            return (
              <div key={section.title} className="mb-1">
                <h2 className="mb-2 mt-5 font-mono text-[9px] uppercase tracking-[1px] text-white/40">
                  {section.title}
                </h2>
                <ul className="space-y-0.5">
                  {visible.map((item) => (
                    <li key={item.href}>
                      <SidebarLink item={item} active={isItemActive(item, pathname)} />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  // Item « coming soon » : rendu désactivé (link clickable mais visuellement
  // dégradé). On garde un <Link> pour ne pas casser le crawl Next, mais on
  // affiche un libellé secondaire.
  if (item.comingSoon) {
    return (
      <span
        className="flex cursor-not-allowed items-center gap-2.5 rounded-sm px-2.5 py-2 text-[13px] text-white/40"
        aria-disabled
        title="Bientôt disponible"
      >
        <Icon name={item.icon} size={20} aria-hidden />
        <span className="flex-1 truncate">{item.label}</span>
        <span className="font-mono text-[8px] uppercase tracking-wider text-white/30">soon</span>
      </span>
    );
  }

  const baseClasses =
    "flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-[13px] outline-none transition focus-visible:ring-2 focus-visible:ring-brand-red focus-visible:ring-offset-2 focus-visible:ring-offset-ink";
  const stateClasses = active
    ? "bg-brand-red text-white"
    : "text-white/75 hover:bg-white/5 hover:text-white";

  return (
    <Link href={item.href} className={`${baseClasses} ${stateClasses}`}>
      <Icon name={item.icon} size={20} aria-hidden />
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge !== undefined ? (
        <span
          className={`ml-auto rounded-full px-1.5 py-0.5 font-mono text-[9px] ${
            active ? "bg-white text-brand-red" : "bg-brand-red text-white"
          }`}
          aria-label={`${item.badge} notifications`}
        >
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}
