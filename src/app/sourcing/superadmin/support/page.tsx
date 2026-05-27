/**
 * Page Superadmin — Support
 *
 * Squelette Phase 1 — affiche un placeholder "En cours de développement".
 * Phase 2 : liste des tickets `support_tickets` avec réponse inline.
 *
 * Décision Board 2026-05-27 — module superadmin éditeur edifio.
 */

import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Support — Superadmin — edifio Sourcing",
};

export default function SuperadminSupportPage() {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold text-ink">Support utilisateurs</h2>
        <Link
          href="/sourcing/superadmin"
          className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
        >
          Retour au dashboard
        </Link>
      </div>
      <div className="rounded-md border border-line bg-paper-2 px-6 py-10 text-center text-sm text-muted">
        Module en cours de développement — Phase 2.
      </div>
    </div>
  );
}
