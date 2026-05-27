/**
 * Page Profil — Actualités
 *
 * Squelette Phase 1 — affiche un placeholder "En cours de développement".
 * Phase 2 : liste des `news_items` publiés + marquage de lecture
 * (badge non-lu dans la navigation latérale).
 *
 * Décision Board 2026-05-27 — module profil utilisateur edifio Sourcing.
 */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Actualités — Mon profil — edifio Sourcing",
};

export default function ProfilNewsPage() {
  return (
    <div>
      <h2 className="mb-4 font-display text-xl font-semibold text-ink">Actualités produit</h2>
      <div className="rounded-md border border-line bg-paper-2 px-6 py-10 text-center text-sm text-muted">
        Module en cours de développement — Phase 2.
        <p className="mt-2 text-xs">
          Les dernières actualités d&apos;edifio Sourcing apparaîtront ici.
        </p>
      </div>
    </div>
  );
}
