/**
 * Triple-gate sécurité utilisé par les routes de test E2E (ex.
 * `/api/test/seed-session`).
 *
 * **Pourquoi ce module vit ici plutôt qu'à côté de la route consommatrice ?**
 *
 * Next.js 14 (App Router) impose un contrat strict sur les fichiers
 * `app/**\/route.ts` : seuls les handlers HTTP (GET, POST, PATCH, …) et un
 * petit set de config keys (`dynamic`, `revalidate`, `runtime`, `preferredRegion`,
 * `fetchCache`, `dynamicParams`) peuvent être exportés au top-level. Exporter
 * une fonction utilitaire arbitraire (`isTestRouteEnabled`) depuis un `route.ts`
 * fait échouer `next build` avec :
 *   "isTestRouteEnabled is not a valid Route export field"
 *
 * On extrait donc la garde dans `src/lib/auth/` :
 *   - emplacement cohérent avec les autres helpers de sécurité d'auth
 *     (`domain.ts`, `password-server.ts`, `routes.ts`, `constants.ts`)
 *   - permet à la route consommatrice de l'importer sans violer le contrat
 *   - permet à Vitest de tester le triple-gate en unit sans toucher au handler
 *
 * Sémantique du triple-gate (cf. brief Board 2026-05-16, option α) :
 *   1. `NODE_ENV !== "production"` (runtime dev/test)
 *   2. **OU** `NEXT_PUBLIC_APP_ENV !== "production"` (preview Vercel —
 *      Vercel pose toujours `NODE_ENV=production` même sur les preview deploys,
 *      donc on a besoin d'un second canal pour ouvrir les routes de test sur
 *      les preview URL où tournent les E2E)
 *   3. **ET** `E2E_TEST_ROUTES_ENABLED === "1"` (opt-in EXPLICITE, valeur
 *      exacte — pas `"true"`, pas `"yes"`)
 *
 * Si l'une des deux premières conditions échoue OU si la troisième n'est pas
 * posée → la route consommatrice doit répondre **404** (pas 403). Anti-
 * énumération : on ne révèle pas l'existence d'une route de test à un attaquant
 * qui balaie l'API en prod.
 */
export function isTestRouteEnabled(): boolean {
  const isNonProdRuntime = process.env.NODE_ENV !== "production";
  const isNonProdApp = process.env.NEXT_PUBLIC_APP_ENV !== "production";
  const optedIn = process.env.E2E_TEST_ROUTES_ENABLED === "1";
  return (isNonProdRuntime || isNonProdApp) && optedIn;
}
