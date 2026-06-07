import Link from "next/link";

import { EdifioLogo } from "@/components/EdifioLogo";

export const metadata = {
  title: "Tarifs — edifio Sourcing",
};

/**
 * Page tarifs publique (Steve 2026-06-05, Stripe minimal MVP).
 *
 * Affiche le pack Solo à 99 €/mois HT + un CTA mailto vers sebastien@edifio.fr.
 * Pas de checkout self-service au MVP — la souscription se fait via :
 *   1. Le client envoie un mail à sebastien@edifio.fr
 *   2. Steve / sebastien@edifio.fr crée le customer + subscription dans Stripe Dashboard
 *   3. Stripe envoie l'invoice email automatiquement
 *   4. Steve marque `subscription_status = 'active'` dans
 *      /sourcing/superadmin/organizations/[id]/billing
 *
 * À la migration vers le monorepo edifio (T3), cette page sera remplacée par
 * la page tarifs commune `/pricing` du module common avec checkout Stripe
 * intégré.
 */
export default function PricingPage() {
  const year = new Date().getFullYear();
  return (
    <main className="min-h-screen bg-paper-2">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:py-20">
        <div className="mb-10 flex justify-center">
          <EdifioLogo />
        </div>

        <header className="mb-12 text-center">
          <h1 className="font-display text-4xl font-bold tracking-tight text-ink md:text-5xl">
            Un tarif simple.
          </h1>
          <p className="mt-3 text-lg text-muted">
            Pour démarrer dès aujourd&apos;hui sur les marchés publics BTP.
          </p>
        </header>

        {/* Card pack Solo */}
        <section className="rounded-2xl border border-line bg-white p-8 shadow-card md:p-10">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="font-mono text-xs uppercase tracking-wider text-brand-red">Pack Solo</p>
              <h2 className="mt-1 font-display text-2xl font-bold text-ink">
                Pour les indépendants et petites structures
              </h2>
            </div>
            <div className="text-right">
              <p className="font-display text-4xl font-bold text-ink">
                99 € <span className="text-base font-normal text-muted">HT/mois</span>
              </p>
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
                Essai gratuit 30 jours
              </p>
            </div>
          </div>

          <ul className="mb-8 space-y-2.5 text-sm text-ink-2">
            <Feature>1 profil de recherche actif (mots-clés + départements + CPV)</Feature>
            <Feature>Veille quotidienne BOAMP + 6 plateformes régionales</Feature>
            <Feature>Brief AO assisté IA (Claude Sonnet 4.6)</Feature>
            <Feature>Annuaires architectes / BE / acheteurs avec enrichissement auto</Feature>
            <Feature>Sollicitation cotraitance Tandem (mails Brevo + relance J+3)</Feature>
            <Feature>
              Compile dossier de candidature en ZIP (DC1 / DC2 / pièces matching IA)
            </Feature>
            <Feature>Bibliothèque entreprise avec matching auto par mots-clés</Feature>
            <Feature>Jusqu&apos;à 100 AO sélectionnés / mois inclus</Feature>
            <Feature>Hébergement strict UE (Supabase Frankfurt + Vercel EU)</Feature>
            <Feature>Support par email — réponse sous 1 jour ouvré</Feature>
          </ul>

          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center">
            <a
              href="mailto:sebastien@edifio.fr?subject=Souscription%20Pack%20Solo%20edifio%20Sourcing&body=Bonjour,%0A%0AJe%20souhaite%20souscrire%20au%20Pack%20Solo%20(99%E2%82%AC%20HT/mois)%20d'edifio%20Sourcing.%0A%0ANom%20du%20cabinet%20:%0ASIRET%20:%0AContact%20principal%20:%0A%0AMerci%20de%20me%20transmettre%20la%20procédure.%0A%0ACordialement"
              className="rounded-full bg-brand-red px-6 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-brand-red-dark"
            >
              ✉️ Souscrire — sebastien@edifio.fr
            </a>
            <Link
              href="/login"
              className="rounded-full border border-line bg-transparent px-6 py-3 text-center text-sm font-semibold text-ink transition-colors hover:bg-paper-2"
            >
              Se connecter
            </Link>
          </div>
        </section>

        {/* Notes */}
        <div className="mt-8 space-y-2 text-center text-xs text-muted">
          <p>
            Souscription manuelle pour démarrer (auto via Stripe Checkout post-migration T3 2026).
          </p>
          <p>
            Packs supérieurs (Tandem 199 €, Cabinet 399 €) disponibles à la demande pour les
            structures plus grandes.
          </p>
          <p className="font-mono text-[10px]">© edifio {year} · édité par AlyoS Ingénierie</p>
        </div>
      </div>
    </main>
  );
}

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span aria-hidden className="mt-0.5 shrink-0 text-success">
        ✓
      </span>
      <span>{children}</span>
    </li>
  );
}
