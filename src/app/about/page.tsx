import Link from "next/link";

import { EdifioLogo } from "@/components/EdifioLogo";

export const metadata = {
  title: "À propos — edifio Sourcing",
};

/**
 * Page publique « À propos » — contexte du produit, équipe, statut interne.
 *
 * V1 sobre. Sera enrichie ultérieurement par le CMO (Léa) avec section équipe,
 * statut RGPD détaillé, mentions légales (cf. backlog Cowork B5).
 *
 * Habillage DS edifio : header + section texte + footer mono, alignés sur la
 * landing publique (mêmes surfaces `paper`, `line`, typo).
 */
export default function About() {
  const year = new Date().getFullYear();
  return (
    <main className="flex min-h-screen flex-col bg-paper">
      <header className="border-b border-line px-8 py-6">
        <Link href="/" className="inline-block" aria-label="edifio Sourcing — Accueil">
          <EdifioLogo />
        </Link>
      </header>

      <section className="flex flex-1 flex-col items-start gap-6 px-8 py-16 md:mx-auto md:max-w-2xl">
        <span className="pill-eyebrow">À propos</span>
        <h1 className="font-display text-[32px] font-bold leading-[1.15] tracking-[-0.8px] text-ink">
          À propos d&apos;edifio Sourcing
        </h1>
        <p className="text-[16px] leading-[1.6] text-ink-2">
          edifio Sourcing est un outil interne AlyoS Ingénierie dédié au sourcing automatique de
          marchés publics du BTP. L&apos;application orchestre la veille (BOAMP, PLACE,
          Francmarchés, MP.info), la sélection assistée des AO, la sollicitation des architectes
          cotraitants et la préparation du dossier de candidature avec un copilote IA.
        </p>
        <p className="text-[16px] leading-[1.6] text-ink-2">
          MVP réservé aux collaborateurs d&apos;AlyoS Ingénierie (adresses email{" "}
          <code className="rounded-xs bg-paper-2 px-1.5 py-0.5 font-mono text-sm text-ink">
            @alyosingenierie.fr
          </code>
          ). Mentions légales et politique RGPD posées à l&apos;arrivée en production (Gate 9).
        </p>
        <Link
          href="/"
          className="text-sm text-muted underline-offset-4 hover:text-brand-red hover:underline"
        >
          ← Retour à l&apos;accueil
        </Link>
      </section>

      <footer className="border-t border-line px-8 py-6 text-center font-mono text-xs text-muted">
        © AlyoS Ingénierie {year} — Outil interne
      </footer>
    </main>
  );
}
