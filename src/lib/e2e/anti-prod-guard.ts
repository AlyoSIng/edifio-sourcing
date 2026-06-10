/**
 * Garde anti-prod pour les fixtures et helpers E2E.
 *
 * Contexte — incident 2026-06-10 : le job `ci-e2e` de `.github/workflows/ci.yml`
 * utilisait les secrets GitHub NON préfixés (`NEXT_PUBLIC_SUPABASE_URL` /
 * `SUPABASE_SERVICE_ROLE_KEY`) qui pointaient le projet Supabase PROD. Le seed
 * `e2e/fixtures/multi-org-seed.ts` a donc créé en prod 7 comptes de test (dont
 * un superadmin) avec un mot de passe public committé dans le repo. La seule
 * garde existante (`E2E_TEST_ROUTES_ENABLED === "1"`) vérifiait un flag, pas
 * la CIBLE — le flag était posé par la CI, la garde ne protégeait rien.
 *
 * Cette garde-ci vérifie la cible : toute URL Supabase contenant le project
 * ref PROD est refusée, quel que soit l'état des flags d'environnement.
 * Défense en profondeur avec le volet workflow (bascule de `ci-e2e` sur les
 * secrets `PREVIEW_*`). Cf. `DECISIONS.md` entrée 2026-06-10.
 *
 * Fichier placé dans `src/lib/e2e/` (et non `e2e/`) car la config Vitest
 * exclut `e2e/**` — ici la fonction pure est testable par `pnpm test`.
 */

/** Project ref Supabase du projet PROD edifio Sourcing. */
export const PROD_PROJECT_REF = "loogmtltwkhvczdiurqs";

/**
 * Refuse (throw) toute URL Supabase qui cible le projet PROD.
 *
 * À appeler AVANT toute création de client admin dans les fixtures E2E.
 * La comparaison est insensible à la casse (les project refs Supabase sont
 * lowercase, mais on ne laisse pas une URL en majuscules passer la garde).
 *
 * @param url URL Supabase résolue depuis l'environnement (ex. `NEXT_PUBLIC_SUPABASE_URL`).
 * @throws {Error} si l'URL contient le project ref PROD.
 */
export function assertNotProdUrl(url: string): void {
  if (url.toLowerCase().includes(PROD_PROJECT_REF)) {
    throw new Error(
      `[e2e anti-prod guard] REFUS : l'URL Supabase cible le projet PROD (${PROD_PROJECT_REF}). ` +
        "Les fixtures E2E ne doivent JAMAIS toucher la prod. Incident 2026-06-10 — cf. DECISIONS.md.",
    );
  }
}
