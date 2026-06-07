import Link from "next/link";

import { EdifioLogo } from "@/components/EdifioLogo";

export const metadata = {
  title: "Essai expiré — edifio Sourcing",
};

/**
 * Page affichée quand l'app est verrouillée pour cause de trial expiré
 * ou d'abonnement annulé. Le middleware/layout redirige ici les utilisateurs
 * non-superadmin de l'org concernée.
 *
 * Le superadmin (`contact@edifio.fr`, role 'superadmin') reste autorisé à
 * accéder à l'app pour gérer le statut billing depuis
 * `/sourcing/superadmin/organizations/[id]/billing`.
 */
export default function TrialExpiredPage() {
  const year = new Date().getFullYear();
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper-2 px-4 py-12">
      <div className="w-full max-w-lg rounded-lg border border-line bg-white p-10 text-center shadow-card">
        <div className="mb-6 flex justify-center">
          <EdifioLogo />
        </div>

        <div className="mb-6 text-5xl" aria-hidden>
          ⏳
        </div>

        <h1 className="marketing-h1 mb-4 text-ink">Votre essai a expiré</h1>

        <p className="mb-4 text-ink-2">
          La période d&apos;essai gratuite de votre organisation est terminée. Les fonctionnalités
          d&apos;edifio Sourcing sont temporairement verrouillées.
        </p>
        <p className="mb-8 text-ink-2">
          Contactez l&apos;éditeur pour activer un abonnement et débloquer immédiatement votre
          accès. Vos données sont conservées pendant 30 jours.
        </p>

        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/pricing"
            className="rounded-full border border-line bg-transparent px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-paper-2"
          >
            Voir les offres
          </Link>
          <a
            href="mailto:contact@edifio.fr?subject=Souscription%20edifio%20Sourcing"
            className="rounded-full bg-brand-red px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-red-dark"
          >
            ✉️ Contacter contact@edifio.fr
          </a>
        </div>

        <p className="mt-8 text-xs text-muted">
          <span className="font-mono text-[10px]">
            © edifio {year} · édité par AlyoS Ingénierie
          </span>
        </p>
      </div>
    </main>
  );
}
