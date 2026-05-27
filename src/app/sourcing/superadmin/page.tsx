/**
 * Dashboard Superadmin — edifio Sourcing
 *
 * 8 cartes de navigation vers les sous-modules :
 *   - Support       : gestion des tickets utilisateurs
 *   - Actualités    : publication des news produit
 *   - Tests guidés  : création et suivi des QCM formations
 *   - Formations    : CRUD des fiches formations (vidéo, doc, lien externe)
 *   - FAQ           : CRUD des questions fréquentes
 *   - Étude marché  : contenu (PDF, liens)
 *   - Plaquette     : upload PDF plaquette commerciale (Supabase Storage)
 *   - Roadmap       : upload PDF roadmap produit (Supabase Storage)
 *
 * Décision Board 2026-05-27 — module superadmin éditeur edifio.
 */

import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Superadmin — edifio Sourcing",
};

interface DashboardCard {
  href: string;
  label: string;
  description: string;
  /** Emoji de représentation (rôle décoratif, pas d'impact fonctionnel). */
  icon: string;
}

const CARDS: DashboardCard[] = [
  {
    href: "/sourcing/superadmin/support",
    label: "Support",
    description: "Consulter et répondre aux tickets d'aide des utilisateurs.",
    icon: "🎫",
  },
  {
    href: "/sourcing/superadmin/news",
    label: "Actualités",
    description: "Rédiger et publier les actualités produit visibles dans l'app.",
    icon: "📰",
  },
  {
    href: "/sourcing/superadmin/guided-tests",
    label: "Tests guidés",
    description: "Créer et gérer les QCM liés aux formations.",
    icon: "🧪",
  },
  {
    href: "/sourcing/superadmin/formations",
    label: "Formations",
    description: "Gérer les fiches formations visibles dans l'espace utilisateur.",
    icon: "🎓",
  },
  {
    href: "/sourcing/superadmin/faq",
    label: "FAQ",
    description: "Gérer les questions fréquentes visibles dans l'espace utilisateur.",
    icon: "❓",
  },
  {
    href: "/sourcing/superadmin/market-study",
    label: "Étude marché",
    description: "Contenu de la section étude de marché (liens, documents).",
    icon: "📊",
  },
  {
    href: "/sourcing/superadmin/pitch",
    label: "Plaquette",
    description: "Mettre à jour le PDF plaquette affiché aux utilisateurs.",
    icon: "📄",
  },
  {
    href: "/sourcing/superadmin/roadmap",
    label: "Roadmap",
    description: "Mettre à jour le PDF roadmap produit.",
    icon: "🗺️",
  },
];

export default function SuperadminDashboardPage() {
  return (
    <div>
      <p className="mb-6 text-sm text-muted">
        Bienvenue dans l&apos;espace éditeur edifio. Sélectionnez un module ci-dessous.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group flex flex-col gap-2 rounded-md border border-line bg-white p-4 transition hover:border-violet-400 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
          >
            <span className="text-2xl" aria-hidden="true">
              {card.icon}
            </span>
            <span className="font-semibold text-ink group-hover:text-violet-700">{card.label}</span>
            <span className="text-xs text-muted">{card.description}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
