import Link from "next/link";

import { EdifioLogo } from "@/components/EdifioLogo";

/**
 * Header navigation de la landing publique (M15 — `design/maquettes/maquettes_v3_landing.html`).
 *
 * Conserve la nav inline pour ancres internes (« La suite edifio », « Comment ça marche »,
 * etc.) — les ancres « Tarifs » / « Contact » pointent en `#` pour le moment (V1 sobre,
 * Léa enrichira post-Gate 9).
 *
 * Le CTA « Se connecter » route directement vers `/login`. Le CTA secondaire « Demander
 * un accès » est neutralisé en `#contact` tant qu'on n'a pas de route dédiée (l'app est
 * en usage 100 % interne AlyoS, les comptes sont créés par admin).
 */
export function LandingHeader() {
  return (
    <header className="flex items-center justify-between border-b border-line bg-paper px-8 py-4">
      <Link href="/" className="inline-flex items-center" aria-label="edifio Sourcing — Accueil">
        <EdifioLogo />
      </Link>

      <nav className="hidden gap-8 md:flex" aria-label="Navigation principale">
        <a
          href="#suite"
          className="text-sm font-medium text-ink transition-colors hover:text-brand-red"
        >
          La suite edifio
        </a>
        <a
          href="#fonctionnement"
          className="text-sm font-medium text-ink transition-colors hover:text-brand-red"
        >
          Comment ça marche
        </a>
        <a
          href="#contact"
          className="text-sm font-medium text-ink transition-colors hover:text-brand-red"
        >
          Contact
        </a>
      </nav>

      <div className="flex items-center gap-3">
        <Link
          href="/login"
          className="rounded-full border border-line bg-transparent px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-paper-2"
        >
          Se connecter
        </Link>
        <a
          href="mailto:it@alyosingenierie.fr?subject=Demande%20d%27acc%C3%A8s%20%E2%80%94%20edifio%20Sourcing"
          className="hidden rounded-full bg-brand-red px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-red-dark md:inline-block"
        >
          Demander un accès
        </a>
      </div>
    </header>
  );
}
