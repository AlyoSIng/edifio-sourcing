/**
 * Page Superadmin — Étude marché
 *
 * Squelette Phase 1 — affiche un placeholder "En cours de développement".
 * Phase 2 : gestion du contenu étude de marché via `app_content` (liens, docs).
 *
 * Décision Board 2026-05-27 — module superadmin éditeur edifio.
 */

import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Étude marché — Superadmin — edifio Sourcing",
};

export default function SuperadminMarketStudyPage() {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold text-ink">Étude marché</h2>
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
