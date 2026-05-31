"use client";

/**
 * Navigation latérale du profil utilisateur (Client Component).
 *
 * Extrait en composant séparé pour permettre l'utilisation de `usePathname`
 * (hook client) tout en gardant le layout parent en Server Component.
 *
 * Décision Board 2026-05-27 — module profil utilisateur edifio Sourcing.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavTab {
  href: string;
  label: string;
}

const TABS: NavTab[] = [
  { href: "/sourcing/profil/support", label: "Support" },
  { href: "/sourcing/profil/news", label: "Actualités" },
  { href: "/sourcing/profil/formations", label: "Formations" },
  { href: "/sourcing/profil/guided-tests", label: "Tests guidés" },
  { href: "/sourcing/profil/faq", label: "FAQ" },
  // Démo masquée jusqu'à réception de l'URL vidéo du Board (demo_video_url dans app_content).
];

export function ProfilNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Sections du profil" className="w-44 shrink-0">
      <ul className="flex flex-col gap-1">
        {TABS.map((tab) => {
          const isActive = pathname === tab.href || pathname.startsWith(tab.href + "/");
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={[
                  "block rounded-sm px-3 py-2 text-sm transition",
                  isActive
                    ? "bg-violet-50 font-semibold text-violet-700"
                    : "text-ink hover:bg-paper-2 hover:text-ink",
                ].join(" ")}
                aria-current={isActive ? "page" : undefined}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
