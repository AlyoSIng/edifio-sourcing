/**
 * État vide de la page « AO du jour » — V1 read-only.
 *
 * Affiché quand `getTendersOfTheDay()` retourne `[]`. Cas typiques :
 *  - le cron BOAMP n'a pas tourné aujourd'hui (avant 6h30 Paris)
 *  - le cron a tourné mais aucun AO ne matche le profil de recherche actif
 *  - tous les AO ont une deadline dépassée (filtre `deadline > now()`)
 *
 * Server Component pur — aucune interactivité.
 */
export function EmptyState({ profileName }: { profileName: string | null }) {
  return (
    <div
      role="status"
      className="rounded-md border border-neutral-200 bg-white px-6 py-10 text-center"
    >
      <div className="mb-3 text-3xl" aria-hidden>
        {/* Glyphe minimal — pas d'icône SVG dépendante d'un pack externe. */}·
      </div>
      <h2 className="mb-2 font-display text-base font-semibold text-neutral-900">
        Aucun AO aujourd&rsquo;hui
      </h2>
      <p className="mx-auto max-w-md text-sm text-neutral-600">
        Le sourcing automatique tournera à 6h30 (lun-ven). Aucun AO correspondant à votre profil de
        recherche n&rsquo;a été identifié.
      </p>
      {profileName ? (
        <p className="mt-4 font-mono text-[11px] text-neutral-500">Profil actif : {profileName}</p>
      ) : null}
    </div>
  );
}
