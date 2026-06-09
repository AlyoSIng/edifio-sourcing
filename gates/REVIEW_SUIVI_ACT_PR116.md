# Review suivi_act_reviewer — PR #116

> **PR** : https://github.com/AlyoSIng/edifio-sourcing/pull/116
> **Branche** : `chore/supabase-client-async` (base `chore/upgrade-next15-react19`)
> **Commit** : `3578591`
> **Reviewer** : `suivi_act_reviewer` (sub-agent posture Suivi+ACT)
> **Date** : 2026-06-08

## Verdict

**CHANGEMENT REQUIS (mineur, cosmétique)** — 1 ligne à nettoyer avant merge. Le refactor lui-même est correct, le pattern matche le monorepo et la portabilité juillet est OK.

---

## 1. Match pattern monorepo — OK avec 2 écarts notés

Comparaison `src/lib/supabase/server.ts` (PR) vs `C:\Dev\alyos-suivi-chantier\app\src\modules\common\supabase\server.ts` (monorepo cible) :

| Aspect | Sourcing PR #116 | Monorepo `alyos-suivi-chantier` | Verdict |
|---|---|---|---|
| Signature export | `export async function createSupabaseServerClient()` | `export async function createClient()` | ✅ même pattern, rename à prévoir Lot 2 |
| `await cookies()` | ✅ ligne 22 | ✅ ligne 17 | ✅ identique |
| `cookies.getAll/setAll` | ✅ pattern `@supabase/ssr` v0.10 | ✅ pattern identique | ✅ identique |
| try/catch silencieux setAll | ✅ ligne 33-49 | ✅ ligne 28-35 | ✅ identique |
| `requireEnv` helper | ✅ throw explicite si manquant | ❌ utilise `!` non-null | ⚠️ Sourcing plus robuste — à porter dans le monorepo (pas l'inverse) |
| `COOKIE_DOMAIN` env extension | ✅ ligne 38-43, override domain SSO | ❌ géré dans `middleware.ts` côté monorepo | ⚠️ **écart d'archi** : monorepo pose le domaine cookie au niveau middleware (cf. `app/src/middleware.ts`). À reconvergér Lot 2 — soit on supprime ici et on bascule en middleware au moment du port, soit on remonte le pattern dans le monorepo. Décision à acter avec Sébastien lors du Lot 2. |

→ Aucun écart bloquant pour Juillet. Les 2 différences sont des arbitrages d'archi à trancher au Lot 2 (rename `createClient` + emplacement `COOKIE_DOMAIN`).

## 2. Signature `export async function createSupabaseServerClient()` — OK

Confirmée ligne 21 de `src/lib/supabase/server.ts`. Pattern Next 15 correct.

## 3. Spot-check 5 call sites propagation `await` — OK

| Fichier | Ligne | Pattern |
|---|---|---|
| `src/app/sourcing/ao/[id]/page.tsx:100` | `const supabase = await createSupabaseServerClient();` | ✅ |
| `src/app/sourcing/architectes/page.tsx:58` | `const supabase = await createSupabaseServerClient();` | ✅ |
| `src/app/sourcing/reponse-solo/page.tsx:33` | `const supabase = await createSupabaseServerClient();` | ✅ |
| `src/lib/audit/index.ts:205` | `const supabase = await createSupabaseServerClient();` | ✅ |
| `src/app/sourcing/ao/[id]/dossier/cerfa/page.tsx:74` | `const supabase = await createSupabaseServerClient();` | ✅ |

Comptage global : 158 occurrences de `createSupabaseServerClient()` vs 157 avec `await` — la différence vient du commentaire JSDoc `src/app/sourcing/ao-du-jour/actions.ts:18` (`Auth check via 'await createSupabaseServerClient().auth.getUser()'`), **pas un call site oublié**. Propagation 100% effective.

## 4. `createSupabaseAdminClient` reste sync — OK

Ligne 64 : `export function createSupabaseAdminClient()` (sans `async`). Confirmé non modifié — correct car l'admin n'a pas besoin de cookies (no-op).

## 5. Impact garde-fous G1-G8 — RAS

| Garde-fou | Impact PR #116 |
|---|---|
| G1 prod-suivi figée | ✅ N/A (PR sur repo Sourcing) |
| G2 feature flag `modules_actifs` | ✅ Non touché |
| G3 ESLint `no-restricted-paths` | ✅ Non touché (refactor à l'intérieur de Sourcing uniquement) |
| G4 E2E Playwright Suivi | ✅ N/A (repo séparé) |
| G5 boundary Client/Server | ✅ Aucun Client Component n'importe `server.ts` |
| G6 naming/convention | ⚠️ rename `createSupabaseServerClient` → `createClient` à prévoir Lot 2 (cosmétique, sed-friendly sur 99 fichiers) |
| G7 migrations DB | ✅ Non touché |
| G8 path OneDrive | ✅ Repo bien sous `C:\Dev\` |

## Points à corriger avant merge

1. **`src/lib/supabase/server.ts:2`** — import `type UnsafeUnwrappedCookies` désormais inutilisé (le hack a été retiré du body). À supprimer pour éviter warning ESLint `unused-imports`/`@typescript-eslint/no-unused-vars`. Patch trivial :

   ```diff
   - import { cookies, type UnsafeUnwrappedCookies } from "next/headers";
   + import { cookies } from "next/headers";
   ```

## Notes Lot 2 (migration Juillet)

À reporter dans `docs/DELIVERY_SOURCING_MIGRATION.md` §99 :

- **Rename à scripter** : `createSupabaseServerClient` → `createClient` (157 call sites). Codemod sed safe car nom unique.
- **`COOKIE_DOMAIN`** : décider si on remonte la logique dans `middleware.ts` (pattern monorepo) ou si on porte le pattern `server.ts` enrichi dans le monorepo. Sébastien arbitre.
- **`requireEnv`** : helper plus robuste que le `!` non-null du monorepo. Recommandé de porter dans `modules/common/supabase/server.ts` au passage.

## Reporting (6 lignes)

- Refactor `createSupabaseServerClient` async + `await cookies()` correct, match pattern monorepo.
- Propagation `await` 100% effective sur 157/157 call sites réels (158ème = JSDoc commentaire, faux positif).
- `createSupabaseAdminClient` correctement laissé sync.
- 1 nettoyage cosmétique : retirer `type UnsafeUnwrappedCookies` inutilisé ligne 2.
- 2 écarts à reporter au Lot 2 : rename `createClient` (cosmétique) + arbitrage emplacement `COOKIE_DOMAIN` (archi).
- Garde-fous G1-G8 non impactés. Portabilité Juillet : VERTE après le 1 fix cosmétique.
