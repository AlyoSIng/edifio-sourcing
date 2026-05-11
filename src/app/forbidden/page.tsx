import Link from "next/link";

import { EdifioLogo } from "@/components/EdifioLogo";

export const metadata = {
  title: "Accès réservé — edifio Sourcing",
};

/**
 * Page 403 — Maquette M8 (`design/maquettes/maquettes_v1_2_auth.html`).
 *
 * Affichée quand un utilisateur connecté avec un email hors `@alyosingenierie.fr`
 * tente d'accéder à `/sourcing/*`. Le middleware racine l'invalide côté Supabase
 * (`signOut`) puis redirige ici. Pas de lien vers `/sourcing` (l'utilisateur n'y
 * a pas accès), seul `/` est proposé.
 *
 * Détails techniques (email tenté, timestamp) volontairement absents de l'UI :
 * exposer l'email dans un query string serait un risque privacy. Les détails
 * sont tracés côté serveur via `audit_logs` (cf. `specs/audit_log_v1.md`).
 */
export default function Forbidden() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-12">
      <div className="w-full max-w-lg rounded-lg border border-neutral-200 bg-white p-10 text-center shadow-sm">
        <div className="mb-6 flex justify-center">
          <EdifioLogo />
        </div>

        <div className="mb-6 text-5xl" aria-hidden>
          🚫
        </div>

        <h1 className="mb-4 font-display text-3xl font-bold tracking-tight">Accès réservé</h1>

        <p className="mb-4 text-neutral-700">
          <strong>edifio Sourcing</strong> est un outil interne réservé aux membres d&apos;
          <strong>AlyoS Ingénierie</strong> (adresse email en{" "}
          <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-sm">
            @alyosingenierie.fr
          </code>
          ).
        </p>
        <p className="mb-8 text-neutral-700">
          Votre session a été clôturée. Si vous pensez qu&apos;il s&apos;agit d&apos;une erreur,
          contactez l&apos;équipe IT d&apos;AlyoS.
        </p>

        <div className="flex justify-center gap-3">
          <Link
            href="/"
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:border-neutral-400"
          >
            ← Retour à l&apos;accueil
          </Link>
          <a
            href="mailto:it@alyosingenierie.fr"
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800"
          >
            Contacter le support
          </a>
        </div>

        <p className="mt-8 text-xs text-neutral-500">
          Cet incident a été tracé dans le journal d&apos;audit pour la sécurité du système.
          <br />
          <span className="font-mono text-[10px]">© AlyoS Ingénierie 2026</span>
        </p>
      </div>
    </main>
  );
}
