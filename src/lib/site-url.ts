/**
 * Détermine l'URL de base absolue du site selon l'environnement courant.
 *
 * Ordre de priorité :
 *   1. `NEXT_PUBLIC_SITE_URL` — custom domain explicite (ex. Gate 7 :
 *      `sourcing.alyosingenierie.fr`). À forcer aussi en local via `.env.local`.
 *   2. `VERCEL_URL` — auto-injecté par Vercel sur preview et production
 *      (server-side only, sans protocole — on préfixe `https://`).
 *   3. `http://localhost:3000` — fallback dev local.
 *
 * Utilisée notamment pour construire `emailRedirectTo` dans les Server
 * Actions Supabase Auth (cf. `src/app/login/actions.ts`) — la valeur doit
 * matcher exactement l'URL whitelistée dans Supabase → Auth → URL Configuration.
 *
 * NB : VERCEL_URL change à CHAQUE preview deployment (sufficient pour le
 * scope `Preview` Supabase via wildcard `https://*.vercel.app/auth/callback`).
 *
 * Toutes les sorties passent par `normalizeSiteUrl` qui retire :
 *   - les espaces en début/fin (saisie env var bâclée),
 *   - le trailing slash,
 *   - un préfixe schéma dupliqué `https://https://…` (erreur de saisie
 *     observée dans Vercel env vars / Supabase Site URL le 2026-05-14 —
 *     cf. ADR-011 specs/adr_011_reset_password_scanner.md).
 */
export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) {
    return normalizeSiteUrl(explicit);
  }
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) {
    return normalizeSiteUrl(`https://${vercelUrl}`);
  }
  return "http://localhost:3000";
}

/**
 * Normalise une URL de site pour résister aux erreurs de saisie env var
 * (défense en profondeur post-incident 2026-05-14, cf. ADR-011).
 *
 * Étapes :
 *   1. Trim espaces.
 *   2. Retire un préfixe schéma dupliqué (`https://https://…`,
 *      `http://http://…`, ou mixte — on garde le premier).
 *   3. Retire le trailing slash.
 *
 * Si un schéma dupliqué est détecté, log un warning côté serveur pour
 * signaler la config incorrecte sans faire planter l'app — l'admin verra
 * ainsi le problème dans les logs Vercel sans que le user en pâtisse.
 *
 * Exporté pour les tests unitaires (cf. `site-url.test.ts`).
 */
export function normalizeSiteUrl(input: string): string {
  let url = input.trim();
  const dupSchemeRegex = /^(https?:\/\/)(https?:\/\/)+/i;
  if (dupSchemeRegex.test(url)) {
    console.warn(
      "[site-url] schéma dupliqué détecté dans la configuration NEXT_PUBLIC_SITE_URL — normalisation appliquée :",
      { raw: input },
    );
    url = url.replace(dupSchemeRegex, "$1");
  }
  url = url.replace(/\/$/, "");
  return url;
}
