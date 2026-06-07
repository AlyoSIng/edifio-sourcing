import type { Metadata } from "next";

import { HashErrorHandler } from "@/components/HashErrorHandler";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingHero } from "@/components/landing/LandingHero";
import { LandingMarqueBox } from "@/components/landing/LandingMarqueBox";
import { LandingSpotlight } from "@/components/landing/LandingSpotlight";
import { LandingSuiteSection } from "@/components/landing/LandingSuiteSection";

/**
 * Landing publique edifio Sourcing — refonte M15 (Board 2026-05-22 soir).
 *
 * Source design : `design/maquettes/maquettes_v3_landing.html` (M15 v1.0, Théo, 14/05).
 * Patterns marketing edifio.fr : cf. ADR-012 (`specs/adr_012_alignment_edifio_fr_visual.md`).
 *
 * Composition :
 *   1. `LandingHeader` — header nav + CTA « Se connecter »
 *   2. `LandingHero` — pill eyebrow + H1 split-color + lead + 2 CTAs
 *   3. `LandingMarqueBox` — section « Que recouvre la marque ? »
 *   4. `LandingSuiteSection` — 4 cards produits edifio (Suivi/Sourcing/AO/ACT)
 *   5. `LandingSpotlight` — section ink avec stats
 *   6. `LandingFooter` — footer 4 colonnes
 *
 * Le `HashErrorHandler` (mount-only, sans rendu visible) intercepte le cas Supabase
 * Auth fallback sur Site URL avec fragment d'erreur (typiquement scanner email
 * d'entreprise qui pré-consomme un token recovery — cf. ADR-011).
 *
 * Image OG (`/og-image-placeholder.png`) à fournir par Théo (Cowork B3) — le lien
 * pointe vers un placeholder qui n'existe pas encore dans `/public`, sera enrichi
 * dans une PR séparée.
 */

export const metadata: Metadata = {
  title: "edifio Sourcing — AO publics, du sourcing au pli",
  description:
    "edifio Sourcing — plateforme SaaS de sourcing automatique des marchés publics BTP, copilote IA pour répondre en Mandataire ou en Co-traitant. Édité par AlyoS Ingénierie.",
  openGraph: {
    title: "edifio Sourcing",
    description: "AO publics, du sourcing au pli",
    type: "website",
    locale: "fr_FR",
    images: [
      {
        url: "/og-image-placeholder.png",
        width: 1200,
        height: 630,
        alt: "edifio Sourcing",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "edifio Sourcing",
    description: "AO publics, du sourcing au pli",
  },
};

export default function Home() {
  return (
    <>
      <HashErrorHandler />
      <LandingHeader />
      <main className="bg-paper">
        <LandingHero />
        <LandingMarqueBox />
        <LandingSuiteSection />
        <LandingSpotlight />
      </main>
      <LandingFooter />
    </>
  );
}
