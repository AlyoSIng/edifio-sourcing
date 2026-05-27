/**
 * Page Superadmin — Plaquette
 *
 * Squelette Phase 1 — affiche un placeholder "En cours de développement".
 * Phase 2 : upload PDF vers Supabase Storage + mise à jour de `app_content`
 * clé `pitch_pdf_url`.
 *
 * Décision Board 2026-05-27 — module superadmin éditeur edifio.
 */

import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Plaquette — Superadmin — edifio Sourcing",
};

export default function SuperadminPitchPage() {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold text-ink">Plaquette commerciale</h2>
        <Link
          href="/sourcing/superadmin"
          className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
        >
          Retour au dashboard
        </Link>
      </div>
      <div className="rounded-md border border-line bg-paper-2 px-6 py-10 text-center text-sm text-muted">
        Module en cours de développement — Phase 2.
        <p className="mt-2 text-xs">
          Permettra d&apos;uploader le PDF plaquette dans Supabase Storage et de mettre à jour
          l&apos;URL affichée aux utilisateurs.
        </p>
      </div>
    </div>
  );
}
