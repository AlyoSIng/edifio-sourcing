"use client";

/**
 * ProfileTabs — onglets de sélection du profil de recherche sur la page AO du jour.
 *
 * Tâche #29 : multi-profils par organisation. Chaque onglet correspond à un
 * profil de recherche actif. Cliquer sur un onglet navigue vers
 * `/sourcing/ao-du-jour?profile=<uuid>` en conservant les autres searchParams
 * (sort, dept, closing).
 *
 * Rendu conditionnel : ce composant n'est monté que si `profiles.length > 1`
 * (la page parente ne le rend pas avec un seul profil, pour ne pas polluer
 * l'UI V1 existante).
 *
 * Accessibilité :
 *  - `<nav aria-label="Profils de recherche">`
 *  - Onglet actif : `aria-current="page"` + style visuellement distinctif
 *  - Tabindex géré par le lien (comportement <a> natif)
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

interface ProfileTab {
  id: string;
  name: string;
  isDefault: boolean;
}

interface ProfileTabsProps {
  profiles: ProfileTab[];
  activeProfileId: string | null;
}

export function ProfileTabs({ profiles, activeProfileId }: ProfileTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const buildProfileUrl = useCallback(
    (profileId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("profile", profileId);
      return `${pathname}?${params.toString()}`;
    },
    [pathname, searchParams],
  );

  return (
    <nav
      aria-label="Profils de recherche"
      className="-mx-1 mb-5 flex flex-wrap gap-1 border-b border-line pb-0"
    >
      {profiles.map((p) => {
        const isActive = p.id === activeProfileId;
        return (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-current={isActive ? "page" : undefined}
            onClick={() => router.push(buildProfileUrl(p.id))}
            className={[
              "relative px-4 py-2 text-sm font-medium transition-colors",
              "rounded-t-sm border border-b-0",
              isActive
                ? "border-line bg-white text-ink after:absolute after:bottom-[-1px] after:left-0 after:h-[2px] after:w-full after:bg-brand-red"
                : "border-transparent text-muted hover:bg-paper-2 hover:text-ink",
            ].join(" ")}
          >
            {p.name}
            {p.isDefault ? (
              <span className="ml-1.5 text-[9px] font-semibold uppercase tracking-wide text-muted">
                défaut
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
