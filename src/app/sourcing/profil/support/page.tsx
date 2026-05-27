/**
 * Page Profil — Support
 *
 * Squelette Phase 1 — affiche un placeholder "En cours de développement".
 * Phase 2 : formulaire de soumission de ticket + liste de ses tickets
 * avec statut et réponse superadmin.
 *
 * Décision Board 2026-05-27 — module profil utilisateur edifio Sourcing.
 */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Support — Mon profil — edifio Sourcing",
};

export default function ProfilSupportPage() {
  return (
    <div>
      <h2 className="mb-4 font-display text-xl font-semibold text-ink">Support</h2>
      <div className="rounded-md border border-line bg-paper-2 px-6 py-10 text-center text-sm text-muted">
        Module en cours de développement — Phase 2.
        <p className="mt-2 text-xs">
          Vous pourrez ici soumettre une demande d&apos;aide et suivre les réponses de l&apos;équipe
          edifio.
        </p>
      </div>
    </div>
  );
}
