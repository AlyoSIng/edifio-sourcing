import Link from "next/link";

/**
 * État vide de la page « AO du jour » — refonte UI v1.
 *
 * Source de vérité : `design/maquettes/maquettes_v4_sourcing_modules.html`
 * lignes 540-545 (M-E « rien ce matin »).
 *
 * Affiché quand `getTendersOfTheDay()` retourne `[]`. Cas typiques :
 *  - le cron BOAMP n'a pas tourné aujourd'hui (avant 6h30 Paris)
 *  - le cron a tourné mais aucun AO ne matche le profil de recherche actif
 *  - tous les AO ont une deadline dépassée (filtre `deadline > now()`)
 *
 * Si l'utilisateur est admin, on lui propose un lien direct vers
 * `/sourcing/admin/profil` pour ajuster les filtres de recherche.
 *
 * Server Component pur — aucune interactivité.
 */
export function EmptyState({
  profileName,
  isAdmin = false,
}: {
  profileName: string | null;
  isAdmin?: boolean;
}) {
  return (
    <div role="status" className="rounded-md border border-line bg-white px-6 py-12 text-center">
      {/* Glyphe minimal — emoji ☕ comme dans la maquette M-E (ligne 541). */}
      <div className="mb-3 text-4xl opacity-40" aria-hidden>
        ☕
      </div>
      <h2 className="font-display text-lg font-semibold text-ink">Rien de neuf ce matin</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">
        Aucun nouvel AO ne correspond à votre profil de recherche depuis hier. Le prochain sourcing
        tourne demain à 6h30 (lun-ven).
      </p>
      {profileName ? (
        <p className="mt-4 font-mono text-[11px] text-muted">
          Profil actif&nbsp;: <span className="text-ink">{profileName}</span>
        </p>
      ) : null}
      {isAdmin ? (
        <Link
          href="/sourcing/admin/profil"
          className="mt-5 inline-flex items-center gap-1.5 rounded-sm border border-line-2 bg-white px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-paper-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red focus-visible:ring-offset-1"
        >
          Ajuster les filtres du profil →
        </Link>
      ) : null}
    </div>
  );
}
