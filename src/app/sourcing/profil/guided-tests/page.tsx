/**
 * Page Profil — Tests guidés
 *
 * Squelette Phase 1 — affiche un placeholder "En cours de développement".
 * Phase 2 : liste des `guided_tests` actifs + formulaire de soumission des
 * réponses QCM + affichage du score.
 *
 * Décision Board 2026-05-27 — module profil utilisateur edifio Sourcing.
 */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Tests guidés — Mon profil — edifio Sourcing",
};

export default function ProfilGuidedTestsPage() {
  return (
    <div>
      <h2 className="mb-4 font-display text-xl font-semibold text-ink">Tests guidés</h2>
      <div className="rounded-md border border-line bg-paper-2 px-6 py-10 text-center text-sm text-muted">
        Module en cours de développement — Phase 2.
        <p className="mt-2 text-xs">
          Les QCM de validation des formations edifio Sourcing seront disponibles ici.
        </p>
      </div>
    </div>
  );
}
