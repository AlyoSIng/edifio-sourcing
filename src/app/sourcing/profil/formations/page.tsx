/**
 * Page Profil — Formations
 *
 * Squelette Phase 1 — affiche un placeholder "En cours de développement".
 * Phase 2 : grille des `formations` actives (vidéo, doc, lien externe)
 * avec durée estimée et lien vers le test guidé associé.
 *
 * Décision Board 2026-05-27 — module profil utilisateur edifio Sourcing.
 */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Formations — Mon profil — edifio Sourcing",
};

export default function ProfilFormationsPage() {
  return (
    <div>
      <h2 className="mb-4 font-display text-xl font-semibold text-ink">Formations</h2>
      <div className="rounded-md border border-line bg-paper-2 px-6 py-10 text-center text-sm text-muted">
        Module en cours de développement — Phase 2.
        <p className="mt-2 text-xs">
          Les fiches de formation edifio Sourcing (vidéos, documents, liens) seront disponibles ici.
        </p>
      </div>
    </div>
  );
}
