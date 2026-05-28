/**
 * Bannière d'erreur générique — refonte UI v1, rendue générique le 2026-05-29.
 *
 * Source de vérité visuelle : `design/maquettes/maquettes_v4_sourcing_modules.html`
 * lignes 555-560 (M-E « Sourcing indisponible »).
 *
 * Affichée quand les fetches BDD throw au runtime :
 *  - en CI E2E sans `DATABASE_URL` (le Proxy lazy `db` throw au premier `.select`)
 *  - en prod si Supabase est down 30s
 *
 * Pattern aligné sur `src/lib/audit/index.ts` : try/catch absorbé,
 * `console.error` structuré, pas de propagation côté UI.
 *
 * `title` et `description` sont optionnels — les valeurs par défaut correspondent
 * à la page « AO du jour » (usage historique). Les autres pages passent leurs
 * propres libellés pour éviter les messages hors-contexte.
 *
 * **Distinct de `EmptyState`** :
 *   - `EmptyState` rend `role="status"` (annonce polie : « zéro AO normal »).
 *   - `ErrorBanner` rend `role="alert"` (annonce immédiate prioritaire :
 *     « erreur infra à traiter »).
 *
 * `message` = détail technique, affiché UNIQUEMENT hors production (dev + CI)
 * pour éviter de leaker des infos infra (host BDD, SQLSTATE, stack) côté users.
 *
 * Server Component pur.
 */
export function ErrorBanner({
  message,
  title = "Sourcing indisponible",
  description = "Impossible de charger les AO du jour. Les AO déjà connus restent consultables. Réessayez dans quelques instants — si le problème persiste, contactez l'administrateur.",
}: {
  message: string;
  title?: string;
  description?: string;
}) {
  const isDev = process.env.NODE_ENV !== "production";

  return (
    <div
      role="alert"
      className="rounded-md border border-l-4 border-line border-l-error bg-error-bg px-6 py-8 text-center"
    >
      <div className="mb-2 text-3xl text-error opacity-60" aria-hidden>
        ⚠️
      </div>
      <h2 className="font-display text-base font-semibold text-error">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-2">{description}</p>
      {isDev ? (
        // Détails techniques visibles uniquement hors production (dev + CI) —
        // on évite ainsi de leak des détails infra (host BDD, code SQLSTATE,
        // stack interne) côté users finaux Vercel prod.
        <p className="mx-auto mt-4 max-w-xl break-words font-mono text-[11px] text-error">
          {message}
        </p>
      ) : null}
    </div>
  );
}
