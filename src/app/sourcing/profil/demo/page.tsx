/**
 * Page Profil — Démo
 *
 * Squelette Phase 1 — affiche un placeholder "En cours de développement".
 * Phase 2 : player vidéo de démo (URL depuis `app_content` clé `demo_video_url`)
 * ou redirect vers la démo externe.
 *
 * Décision Board 2026-05-27 — module profil utilisateur edifio Sourcing.
 */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Démo — Mon profil — edifio Sourcing",
};

export default function ProfilDemoPage() {
  return (
    <div>
      <h2 className="mb-4 font-display text-xl font-semibold text-ink">Démo vidéo</h2>
      <div className="rounded-md border border-line bg-paper-2 px-6 py-10 text-center text-sm text-muted">
        Module en cours de développement — Phase 2.
        <p className="mt-2 text-xs">
          La vidéo de démonstration d&apos;edifio Sourcing sera accessible ici.
        </p>
      </div>
    </div>
  );
}
