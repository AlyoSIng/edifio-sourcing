/**
 * Configuration data-driven de la sidebar `AppShell`.
 *
 * Source de vérité : maquettes Cowork (`design/maquettes/maquettes_v4_sourcing_modules.html`
 * lignes 191-210 + `maquettes_v5_admin_architectes.html` lignes 130-142).
 *
 * Format :
 *   - `NavSection[]` regroupé par bandeau (« Sourcing », « Pilotage », « Admin »)
 *   - Chaque `NavItem` porte un `href`, un `label` court, un `icon` (nom d'icône
 *     SVG AppIcons) et optionnellement `matchPrefix` pour détecter l'item actif
 *     même quand la route est imbriquée (ex. `/sourcing/admin/users/[id]`).
 *   - `adminOnly: true` masque l'item pour les rôles non-admin (rendu côté
 *     Server Component dans `Sidebar`).
 *
 * **Coordination Nadia (Tandem)** : ce fichier est le point d'extension prévu
 * pour les liens Tandem (« Cotraitance », « Architectes », « Notifications »…).
 * Ajouter une entrée dans le tableau ne nécessite AUCUNE modification du
 * composant `Sidebar`. Garder les sections existantes telles quelles.
 *
 * **Pourquoi pas de routing programmatique avec `usePathname` ?** L'AppShell
 * est un Server Component — détecter l'item actif côté serveur évite un flash
 * client-side et garantit un rendu SSR identique au final (a11y propre, pas
 * de layout shift). La détection se fait via `matchPrefix` côté Server.
 */

import type { IconName } from "@/components/icons/AppIcons";

export interface NavItem {
  /** Path absolu vers lequel pointer (ex. `/sourcing/ao-du-jour`). */
  href: string;
  /** Libellé visible (FR, naming strict). */
  label: string;
  /** Nom d'icône SVG AppIcons (cf. `src/components/icons/AppIcons.tsx`). */
  icon: IconName;
  /** Optionnel : badge numérique ou texte court (ex. compteur). */
  badge?: number | string;
  /**
   * Optionnel : préfixe utilisé pour détecter l'item actif. Si absent, on
   * fait un strict equals avec `href`. Utile pour les routes imbriquées
   * comme `/sourcing/admin/users/[id]/security`.
   */
  matchPrefix?: string;
  /** Si vrai, l'item n'est rendu que pour les utilisateurs `role === "admin"` ou `"superadmin"`. */
  adminOnly?: boolean;
  /** Si vrai, l'item n'est rendu que pour le rôle `"superadmin"` exclusivement. */
  superadminOnly?: boolean;
  /**
   * Optionnel : item désactivé visuellement (placeholder MVP). Utile pour
   * pré-câbler les liens Tandem en attendant l'implémentation Nadia.
   */
  comingSoon?: boolean;
}

export interface NavSection {
  /** Titre du bandeau (small caps mono, cf. maquette). */
  title: string;
  items: NavItem[];
}

/**
 * Configuration figée au MVP. Toute évolution doit rester data-driven ici —
 * pas de logique conditionnelle dans `Sidebar`.
 *
 * Mise à jour feat/nav-email-v3 (Nadia, 2026-05-26) :
 *  - Section "Sourcing" : AO du jour / Sélectionnés / Reportés
 *  - Section "Pilotage" : Cotraitance / Mandataire / Conception-Réalisation (comingSoon)
 *  - Section "Contacts" : Architectes / Bureaux d'Études (comingSoon) / Entreprises (comingSoon)
 *  - Section "Configuration" : inchangée (adminOnly)
 *  - Section "Admin" : inchangée (adminOnly)
 */
export const NAV_ITEMS: NavSection[] = [
  {
    title: "Sourcing",
    items: [
      {
        href: "/sourcing/ao-du-jour",
        label: "AO du jour",
        icon: "ao",
        matchPrefix: "/sourcing/ao-du-jour",
      },
      {
        href: "/sourcing/selectionnes",
        label: "Sélectionnés",
        icon: "bookmark",
        matchPrefix: "/sourcing/selectionnes",
      },
      {
        href: "/sourcing/reportes",
        label: "Reportés",
        icon: "clock",
        matchPrefix: "/sourcing/reportes",
      },
    ],
  },
  {
    title: "Pilotage",
    items: [
      // Pipeline cotraitance — livré par PR feat/tandem-engine (Nadia, 2026-05-25).
      {
        href: "/sourcing/cotraitance",
        label: "Cotraitance",
        icon: "handshake",
        matchPrefix: "/sourcing/cotraitance",
      },
      // Mandataire MOE — ex-"Réponse solo" renommé pour clarté Tandem.
      {
        href: "/sourcing/reponse-solo",
        label: "Mandataire",
        icon: "file-text",
        matchPrefix: "/sourcing/reponse-solo",
      },
      // Conception/Réalisation — page stub activée PR feat/modal-mandataire-cr.
      {
        href: "/sourcing/conception-realisation",
        label: "Conception/Réalisation",
        icon: "layers",
        matchPrefix: "/sourcing/conception-realisation",
      },
    ],
  },
  {
    title: "Contacts",
    items: [
      // Annuaire architectes — visible tous rôles (lecture) ; édition filtrée
      // côté page via `isAdmin(profile)`. Migration Lot B (2026-05-25).
      {
        href: "/sourcing/architectes",
        label: "Architectes",
        icon: "building",
        matchPrefix: "/sourcing/architectes",
      },
      // Bureaux d'Études — livré feat/be-companies (Nadia, 2026-05-26).
      {
        href: "/sourcing/bureaux-etudes",
        label: "Bureaux d'Études",
        icon: "compass",
        matchPrefix: "/sourcing/bureaux-etudes",
      },
      // Entreprises/Majors — livré feat/be-companies (Nadia, 2026-05-26).
      {
        href: "/sourcing/entreprises",
        label: "Entreprises/Majors",
        icon: "hard-hat",
        matchPrefix: "/sourcing/entreprises",
      },
    ],
  },
  {
    title: "Mon espace",
    items: [
      {
        href: "/sourcing/profil",
        label: "Mon profil",
        icon: "users",
        matchPrefix: "/sourcing/profil",
      },
      {
        href: "/sourcing/superadmin",
        label: "Superadmin",
        icon: "sliders",
        matchPrefix: "/sourcing/superadmin",
        superadminOnly: true,
      },
    ],
  },
  {
    title: "Configuration",
    items: [
      {
        href: "/sourcing/admin/bibliotheque",
        label: "Bibliothèque",
        icon: "folder-open",
        matchPrefix: "/sourcing/admin/bibliotheque",
        adminOnly: true,
      },
      {
        href: "/sourcing/admin/search-profiles",
        label: "Profils de recherche",
        icon: "sliders",
        matchPrefix: "/sourcing/admin/search-profiles",
        adminOnly: true,
      },
      {
        href: "/sourcing/admin/modeles-email",
        label: "Modèles d'e-mail",
        icon: "mail",
        matchPrefix: "/sourcing/admin/modeles-email",
        adminOnly: true,
      },
      {
        href: "/sourcing/admin/societe",
        label: "Présentation société",
        icon: "briefcase",
        matchPrefix: "/sourcing/admin/societe",
        adminOnly: true,
      },
      {
        href: "/sourcing/admin/shortlist",
        label: "Critères short-list",
        icon: "sliders",
        matchPrefix: "/sourcing/admin/shortlist",
        adminOnly: true,
      },
      {
        href: "/sourcing/admin/settings",
        label: "Personnalisation",
        icon: "settings",
        matchPrefix: "/sourcing/admin/settings",
        adminOnly: true,
      },
    ],
  },
  {
    title: "Admin",
    items: [
      {
        href: "/sourcing/admin/users",
        label: "Utilisateurs",
        icon: "users",
        matchPrefix: "/sourcing/admin/users",
        adminOnly: true,
      },
      {
        href: "/sourcing/admin/ia-usage",
        label: "Coûts IA",
        icon: "sliders",
        matchPrefix: "/sourcing/admin/ia-usage",
        superadminOnly: true,
      },
      {
        href: "/sourcing/admin/tandem-activity",
        label: "Activité Tandem",
        icon: "users",
        matchPrefix: "/sourcing/admin/tandem-activity",
        adminOnly: true,
      },
    ],
  },
];

/**
 * Détermine si un item est l'item actif pour un pathname donné. Utilisé côté
 * Server Component `Sidebar` — pure function testable.
 */
export function isItemActive(item: NavItem, pathname: string): boolean {
  if (item.matchPrefix) return pathname.startsWith(item.matchPrefix);
  return pathname === item.href;
}
