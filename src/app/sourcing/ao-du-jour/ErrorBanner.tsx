/**
 * Bannière d'erreur de la page « AO du jour » — V1 read-only (PR n°4 hotfix).
 *
 * Affichée quand les fetches BDD (`getTendersOfTheDay` /
 * `getActiveSearchProfileName`) throw au runtime — typiquement :
 *  - en CI E2E où `DATABASE_URL` n'est PAS fourni au webServer Playwright
 *    (par design : le job `ci-e2e` couvre middleware + auth + Resend, pas le
 *    métier BDD — projet infra à part) ; le Proxy lazy `db` throw alors
 *    `Error: DATABASE_URL is not set` au premier `.select(...)`.
 *  - en prod si Supabase est down 30s (incident infra) — la page doit rester
 *    rendue avec une bannière dégradée plutôt que renvoyer un 500.
 *
 * Pattern de résilience aligné sur `src/lib/audit/index.ts` (try/catch absorbé,
 * `console.error` structuré, pas de propagation d'exception côté UI).
 *
 * **Distinct de `EmptyState`** (qui rend `role="status"` pour « zéro AO normal,
 * cron pas encore tourné »). Ce composant rend `role="alert"` pour signaler
 * une vraie erreur infra — la sémantique est différente côté lecteurs d'écran
 * (alert = annonce immédiate prioritaire, status = annonce polie).
 *
 * Server Component pur — aucune interactivité, aucun "use client".
 */
export function ErrorBanner({ message }: { message: string }) {
  const isDev = process.env.NODE_ENV !== "production";

  return (
    <div role="alert" className="rounded-md border border-red-300 bg-red-50 px-6 py-8 text-center">
      <h2 className="mb-2 font-display text-base font-semibold text-red-900">
        Impossible de charger les AO
      </h2>
      <p className="mx-auto max-w-md text-sm text-red-800">
        Une erreur est survenue lors de la récupération de la liste. Réessayez dans quelques
        instants. Si le problème persiste, contactez l&rsquo;administrateur.
      </p>
      {isDev ? (
        // Détails techniques visibles uniquement hors production (dev + CI) —
        // on évite ainsi de leak des détails infra (host BDD, code SQLSTATE,
        // stack interne) côté users finaux Vercel prod.
        <p className="mx-auto mt-4 max-w-xl break-words font-mono text-[11px] text-red-700">
          {message}
        </p>
      ) : null}
    </div>
  );
}
