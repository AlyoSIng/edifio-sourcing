"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { isItemActive, NAV_ITEMS, type NavItem } from "./nav-items";

/**
 * Drawer de navigation mobile — version slide-from-left de la `Sidebar`.
 *
 * Visible uniquement sur les viewports < `md` (768 px). Le bouton hamburger
 * déclenche l'ouverture ; un overlay backdrop sombre couvre le reste de l'écran.
 *
 * Source design : maquettes Cowork v4/v5 (sidebar desktop fond `--ink`,
 * réutilisée telle quelle en drawer mobile pour cohérence visuelle).
 *
 * **A11y** :
 *   - `role="dialog"` + `aria-modal="true"` quand ouvert
 *   - Touche `Escape` ferme le drawer
 *   - Click sur backdrop ou sur un lien ferme le drawer
 *   - Scroll body bloqué (`overflow: hidden`) tant que le drawer est ouvert
 *   - Focus auto sur le 1er lien à l'ouverture (focus management minimal —
 *     pas de focus-trap complet, suffisant pour le périmètre MVP)
 *   - Bouton hamburger porte `aria-expanded` et `aria-controls`
 *
 * **Data-driven** : réutilise `NAV_ITEMS` + `isItemActive` de la sidebar desktop.
 * Aucune duplication de logique de filtrage `adminOnly` / `comingSoon`.
 *
 * **Pourquoi un Client Component ?** State local d'ouverture + listeners
 * (`keydown` Escape, `useEffect` scroll lock) + `usePathname` pour item actif.
 *
 * **Pourquoi pas de lib externe (Radix Dialog, Headless UI) ?** Contrainte
 * brief A7 : pas de nouvelle dépendance npm. Le pattern drawer est simple à
 * implémenter avec React state + classes Tailwind `transition-transform`.
 */
interface SidebarMobileDrawerProps {
  /** Rôle de l'utilisateur connecté pour filtrer `adminOnly`. */
  role: "admin" | "user" | "viewer";
}

export function SidebarMobileDrawer({ role }: SidebarMobileDrawerProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() ?? "/sourcing/ao-du-jour";
  const isAdmin = role === "admin";
  const firstLinkRef = useRef<HTMLAnchorElement | null>(null);

  // Lock body scroll tant que le drawer est ouvert. On rétablit la valeur
  // précédente au cleanup pour ne pas écraser un autre composant qui aurait
  // déjà touché overflow (peu probable au MVP, mais propre).
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // Escape ferme le drawer. Listener attaché au document tant que le drawer
  // est ouvert pour éviter le coût quand fermé.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Focus sur le 1er lien à l'ouverture — courtoisie a11y minimale (pas un
  // focus-trap complet).
  useEffect(() => {
    if (!open) return;
    // Léger délai pour laisser le drawer terminer son slide-in avant de
    // déplacer le focus (sinon le scroll programmatique du navigateur peut
    // glitcher l'animation sur certains devices).
    const t = setTimeout(() => firstLinkRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      {/* Bouton hamburger — visible uniquement < md */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="grid h-9 w-9 place-items-center rounded-sm text-ink outline-none transition hover:bg-paper-2 focus-visible:ring-2 focus-visible:ring-brand-red md:hidden"
        aria-label="Ouvrir le menu de navigation"
        aria-expanded={open}
        aria-controls="mobile-nav-drawer"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden
        >
          <path
            d="M3 5h14M3 10h14M3 15h14"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {/* Backdrop overlay — semi-transparent ink ; click ferme. Présent dans
          le DOM uniquement quand ouvert, sinon `pointer-events` capturerait
          les clics du contenu sous-jacent. */}
      {open ? (
        <div className="bg-ink/60 fixed inset-0 z-40 md:hidden" onClick={close} aria-hidden />
      ) : null}

      {/* Drawer principal — toujours dans le DOM pour animer la sortie. La
          translation est purement CSS (`transition-transform`). */}
      <aside
        id="mobile-nav-drawer"
        role="dialog"
        aria-modal={open ? "true" : undefined}
        aria-label="Menu de navigation"
        aria-hidden={open ? undefined : true}
        className={`fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col bg-ink text-white shadow-modal transition-transform duration-200 ease-out md:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col px-4 py-5">
          {/* Header drawer — logo + bouton fermer */}
          <div className="mb-5 flex items-center justify-between">
            <Link
              href="/sourcing/ao-du-jour"
              onClick={close}
              className="flex items-center gap-2 rounded outline-none focus-visible:ring-2 focus-visible:ring-brand-red"
              aria-label="edifio Sourcing — Accueil"
              ref={firstLinkRef}
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
            <button
              type="button"
              onClick={close}
              className="grid h-8 w-8 place-items-center rounded-sm text-white/70 outline-none transition hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-brand-red"
              aria-label="Fermer le menu de navigation"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 18 18"
                fill="none"
                aria-hidden
              >
                <path
                  d="M4 4l10 10M14 4L4 14"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto">
            {NAV_ITEMS.map((section) => {
              const visible = section.items.filter((it) => !it.adminOnly || isAdmin);
              if (visible.length === 0) return null;
              return (
                <div key={section.title} className="mb-1">
                  <h2 className="mb-2 mt-5 font-mono text-[9px] uppercase tracking-[1px] text-white/40">
                    {section.title}
                  </h2>
                  <ul className="space-y-0.5">
                    {visible.map((item) => (
                      <li key={item.href}>
                        <DrawerLink
                          item={item}
                          active={isItemActive(item, pathname)}
                          onNavigate={close}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </nav>
        </div>
      </aside>
    </>
  );
}

/**
 * Lien interne au drawer — sémantique alignée sur `SidebarLink` desktop
 * (couleurs, padding, état actif). Click déclenche `onNavigate` pour fermer
 * le drawer avant la navigation.
 *
 * On garde une copie locale (et non un import depuis `Sidebar.tsx`) parce que
 * la sidebar desktop n'expose pas `SidebarLink`. Extraction d'un composant
 * partagé `NavLinkItem` envisageable en refacto ultérieur — pas justifié au
 * MVP (~25 lignes dupliquées, lisibilité OK).
 */
function DrawerLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate: () => void;
}) {
  if (item.comingSoon) {
    return (
      <span
        className="flex cursor-not-allowed items-center gap-2.5 rounded-sm px-2.5 py-2 text-[13px] text-white/40"
        aria-disabled
        title="Bientôt disponible"
      >
        <span className="text-sm opacity-90" aria-hidden>
          {item.icon}
        </span>
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
    <Link href={item.href} onClick={onNavigate} className={`${baseClasses} ${stateClasses}`}>
      <span className="text-sm opacity-90" aria-hidden>
        {item.icon}
      </span>
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
