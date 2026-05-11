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
 */
export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) {
    return `https://${vercelUrl}`;
  }
  return "http://localhost:3000";
}
