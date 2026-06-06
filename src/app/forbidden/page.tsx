import Link from "next/link";

import { EdifioLogo } from "@/components/EdifioLogo";

export const metadata = {
  title: "Accès refusé — edifio Sourcing",
};

/**
 * Page 403 — Maquette M8 (`design/maquettes/maquettes_v1_2_auth.html`).
 *
 * Affichée quand un utilisateur connecté tente d'accéder à une ressource pour
 * laquelle il n'a pas les droits (rôle insuffisant, organisation différente).
 * Depuis ADR-014 (2026-06-05), elle n'est plus liée au filtre domaine
 * `@alyosingenierie.fr` (supprimé) : l'app s'est ouverte aux organisations
 * clientes externes (PROTECT, ...). Cette page reste utilisée pour les refus
 * de rôle / d'organisation côté middleware ou côté actions sensibles.
 *
 * Détails techniques (email tenté, timestamp) volontairement absents de l'UI :
 * exposer l'email dans un query string serait un risque privacy. Les détails
 * sont tracés côté serveur via `audit_logs` (cf. `specs/audit_log_v1.md`).
 *
 * Habillage DS edifio : surfaces `paper-2` + `white` + `line` + accent `brand-red`.
 */
export default function Forbidden() {
  const year = new Date().getFullYear();
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper-2 px-4 py-12">
      <div className="w-full max-w-lg rounded-lg border border-line bg-white p-10 text-center shadow-card">
        <div className="mb-6 flex justify-center">
          <EdifioLogo />
        </div>

        <div className="mb-6 text-5xl" aria-hidden>
          🚫
        </div>

        <h1 className="marketing-h1 mb-4 text-ink">Accès refusé</h1>

        <p className="mb-4 text-ink-2">
          Vous n&apos;avez pas l&apos;autorisation d&apos;accéder à cette page.
        </p>
        <p className="mb-8 text-ink-2">
          Si vous pensez qu&apos;il s&apos;agit d&apos;une erreur, contactez l&apos;administrateur
          de votre organisation ou l&apos;éditeur à{" "}
          <a href="mailto:contact@edifio.fr" className="font-medium text-brand-red hover:underline">
            contact@edifio.fr
          </a>
          .
        </p>

        <div className="flex justify-center gap-3">
          <Link
            href="/"
            className="rounded-full border border-line bg-transparent px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-paper-2"
          >
            ← Retour à l&apos;accueil
          </Link>
          <a
            href="mailto:contact@edifio.fr"
            className="rounded-full bg-brand-red px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-red-dark"
          >
            Contacter le support
          </a>
        </div>

        <p className="mt-8 text-xs text-muted">
          Cet incident a été tracé dans le journal d&apos;audit pour la sécurité du système.
          <br />
          <span className="font-mono text-[10px]">© edifio · AlyoS Ingénierie {year}</span>
        </p>
      </div>
    </main>
  );
}
