/**
 * Page d'erreur token — `/archi/[token]` et `/archi/opposition/[token]`.
 *
 * Servie quand le JWT architecte (ou opposition) est :
 *   - malformé / signature invalide / mauvaise audience / mauvais issuer
 *   - expiré
 *   - révoqué (admin) ou inconnu (BDD nettoyée)
 *   - architecte inactif (opposé RGPD)
 *
 * **Sécurité — pas de leak d'info sur la cause** (cf. brief 2026-05-24) :
 * tous les cas affichent le même message générique « Ce lien n'est plus
 * actif ». Si on distinguait expiré vs révoqué côté UI, un attaquant pourrait
 * inférer l'existence du `jti` BDD via timing/comportement. Le détail (cause
 * technique) est uniquement dans les logs serveur.
 *
 * Server Component pur — pas d'I/O.
 */
export function TokenInvalidPage() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 py-12 text-center">
      <div
        className="rounded-md border border-l-4 border-line border-l-error bg-error-bg px-6 py-8"
        role="alert"
      >
        <div className="mb-2 text-3xl text-error opacity-60" aria-hidden>
          ⚠️
        </div>
        <h1 className="font-display text-xl font-semibold text-error">Lien expiré ou invalide</h1>
        <p className="mt-3 text-sm text-ink-2">
          Ce lien n&rsquo;est plus actif. Si vous souhaitez répondre à un appel d&rsquo;offres,
          contactez l&rsquo;équipe AlyoS qui vous l&rsquo;a transmis pour qu&rsquo;elle vous envoie
          un nouveau lien.
        </p>
        <p className="mt-6 text-xs text-muted">edifio Sourcing — AlyoS Ingénierie</p>
      </div>
    </main>
  );
}
