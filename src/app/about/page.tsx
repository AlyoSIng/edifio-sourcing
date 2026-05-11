import Link from "next/link";

import { EdifioLogo } from "@/components/EdifioLogo";

export const metadata = {
  title: "À propos — edifio Sourcing",
};

/**
 * Page publique « À propos » — contexte du produit, équipe, statut interne.
 * Minimale à l'étape 2 Gate 6 ; sera enrichie post-Gate 9 (mentions légales,
 * RGPD, contact support).
 */
export default function About() {
  const year = new Date().getFullYear();
  return (
    <main className="flex min-h-screen flex-col">
      <header className="border-b border-neutral-200 px-8 py-6">
        <Link href="/" className="inline-block">
          <EdifioLogo />
        </Link>
      </header>

      <section className="flex flex-1 flex-col items-start gap-6 px-8 py-16 md:mx-auto md:max-w-2xl">
        <h1 className="font-display text-3xl font-bold tracking-tight">
          À propos d&apos;edifio Sourcing
        </h1>
        <p className="text-neutral-700">
          edifio Sourcing est un outil interne AlyoS Ingénierie dédié au sourcing automatique de
          marchés publics du BTP. L&apos;application orchestre la veille (BOAMP, PLACE,
          Francmarchés, MP.info), la sélection assistée des AO, la sollicitation des architectes
          cotraitants et la préparation du dossier de candidature avec un copilote IA.
        </p>
        <p className="text-neutral-700">
          MVP réservé aux collaborateurs d&apos;AlyoS Ingénierie (adresses email{" "}
          <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-sm">
            @alyosingenierie.fr
          </code>
          ). Mentions légales et politique RGPD posées à l&apos;arrivée en production (Gate 9).
        </p>
        <Link href="/" className="text-sm text-neutral-600 underline-offset-4 hover:underline">
          ← Retour à l&apos;accueil
        </Link>
      </section>

      <footer className="border-t border-neutral-200 px-8 py-6 text-center font-mono text-xs text-neutral-500">
        © AlyoS Ingénierie {year} — Outil interne
      </footer>
    </main>
  );
}
