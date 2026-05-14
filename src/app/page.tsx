import Link from "next/link";

import { EdifioLogo } from "@/components/EdifioLogo";
import { HashErrorHandler } from "@/components/HashErrorHandler";

/**
 * Home publique — affichée à tous, y compris visiteurs anonymes.
 * Si l'utilisateur est connecté avec un email `@alyosingenierie.fr`,
 * le lien « Accéder à edifio Sourcing » pointe vers `/sourcing/ao-du-jour`
 * (protégé par le middleware).
 *
 * Inclut `HashErrorHandler` : intercepte le cas où Supabase Auth fait
 * fallback sur le Site URL (la home) avec un fragment d'erreur
 * (#error=…&error_code=otp_expired&…) — typiquement après qu'un scanner
 * email d'entreprise ait pré-cliqué le lien recovery. Cf. ADR-011.
 */
export default function Home() {
  const year = new Date().getFullYear();
  return (
    <main className="flex min-h-screen flex-col">
      <HashErrorHandler />
      <header className="border-b border-neutral-200 px-8 py-6">
        <EdifioLogo />
      </header>

      <section className="flex flex-1 flex-col items-center justify-center gap-8 px-8 py-16">
        <h1 className="max-w-2xl text-center font-display text-4xl font-bold tracking-tight">
          De l&apos;avis publié à l&apos;opportunité gagnée, sans rien tenir à la main.
        </h1>
        <p className="max-w-xl text-center text-neutral-600">
          Outil interne <strong>AlyoS Ingénierie</strong> pour le sourcing automatique de marchés
          publics BTP. Accès restreint aux emails{" "}
          <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-sm">
            @alyosingenierie.fr
          </code>
          .
        </p>
        <div className="flex gap-3">
          <Link
            href="/sourcing/ao-du-jour"
            className="rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800"
          >
            Accéder à edifio Sourcing →
          </Link>
          <Link
            href="/about"
            className="rounded-md border border-neutral-300 px-5 py-2.5 text-sm font-medium text-neutral-700 transition hover:border-neutral-400"
          >
            À propos
          </Link>
        </div>
      </section>

      <footer className="border-t border-neutral-200 px-8 py-6 text-center font-mono text-xs text-neutral-500">
        © AlyoS Ingénierie {year} — Outil interne
      </footer>
    </main>
  );
}
