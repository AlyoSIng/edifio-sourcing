# Recette technique PR #115 (Lot 1) + PR #116 (Lot 1.5)

**Date** : 2026-06-08  
**Auteure** : Camille (QA / recette)  
**Branche auditée** : `chore/supabase-client-async` (HEAD `3578591`)  
**Périmètre** :  
- PR #115 — upgrade Next 14.2 → 15.5 / React 18.3 → 19.0 + codemod async params + 12 sites HTML link → Next Link  
- PR #116 — refactor `createSupabaseServerClient` sync → async + propagation `await` sur les call sites

Commits cumulés sur la branche :
```
3578591 refactor(supabase): createSupabaseServerClient async + propagate await 99 files
687e5fc chore(upgrade): pin versions exactes monorepo (next 15.5.18 + react 19.0.0)
f1a0164 test(upgrade): mock params en Promise.resolve pour next 15
cfaaa6f chore(upgrade): manual use-action-state migration react 19
76935b0 chore(upgrade): codemod next-async-request-api + fix html links
```

---

## 1. Tableau de synthèse S1–S9

| # | Scénario | Statut | Commentaire |
|---|----------|--------|-------------|
| S1 | Tout `createSupabaseServerClient()` est précédé d'un `await` | **OK** | 157 occurrences (105 fichiers) — aucune sans `await`. Définition unique `src/lib/supabase/server.ts:21`. |
| S2 | Tout `cookies()` / `headers()` est `await` dans Server Components / Actions / Route Handlers | **OK** | Aucune occurrence de `= cookies()` ou `= headers()` sans `await` dans `src/`. |
| S3 | Tous les `params` / `searchParams` sont en `Promise<…>` + `await` (Next 15) | **OK** | 18 fichiers `params: Promise<…>` + 7 fichiers `searchParams: Promise<…>`. Spot-check sur 5 pages dynamiques (`architectes/[id]`, `ao/[id]/dossier`, `archi/[token]`, `superadmin/organizations/[id]`, `ao/[id]/tandem/partage`) : pattern `const params = await props.params;` strict. Aucun `params: {` synchrone résiduel sur pages dynamiques. |
| S4 | Aucun `useFormState` orphelin (React 19 ⇒ `useActionState`) | **OK** | Seule occurrence : un **commentaire JSDoc** dans `src/app/sourcing/admin/profil/ProfileForm.tsx:98` qui justifie l'absence d'usage (« pas de useFormState car on … »). Aucun import / call. |
| S5 | Cohérence helper `src/lib/supabase/server.ts` | **OK** | `export async function createSupabaseServerClient()` (l.21), `const cookieStore = await cookies();` (l.22), import propre `import { cookies } from "next/headers";` (l.2) — **pas** d'`UnsafeUnwrappedCookies`. `createSupabaseAdminClient` reste **sync** (l.64) avec cookies no-op. |
| S6.a | Typecheck `tsc --noEmit` | **OK** | 0 erreur. Output vide. |
| S6.b | Vitest `pnpm test` | **OK** | **1218 / 1218 tests passed** sur 79 fichiers (12,84 s). |
| S7 | Playwright `pnpm test:e2e` (local) | **KO attendu / N/A local** | 4 specs `tender-actions.spec.ts` échouent au seed-session : `E2E_TEST_ROUTES_ENABLED=1` non posé sur le Next local et serveur non démarré (cf. `helpers/auth.ts:56` : « Vérifier que E2E_TEST_ROUTES_ENABLED=1 dans l'env du serveur Next »). **Doit être lancé en CI (preview Vercel ou job GH Actions dédié)** — pas reproductible offline sans infra. |
| S8 | Sécurité `src/middleware.ts` après refactor async | **OK** | Le middleware **n'utilise PAS** le helper async ; il instancie son propre `createServerClient` avec `getAll()`/`setAll()` sur `req.cookies` (Edge runtime). Toutes gardes intactes : (1) auth `getUser()` ligne 130, (2) `must_change_password` lignes 168-202, (3) `admin` lignes 206-220, (4) `superadmin` lignes 225-238. ADR-014 (suppression filtre domaine) respectée : section §5 commentée explicitement (lignes 146-153) — replace par `logAccessAttempt` traçabilité. Try/catch global lignes 50-260. |
| S9 | Resilience routes API après refactor async | **OK partiel** | • `/api/admin/users/route.ts` : try/catch global complet (l.44-214), `console.error` final + `jsonError 500`. **OK strict.**<br>• `/api/admin/users/[id]/regenerate-password/route.ts` : try/catch global ouvert l.47. **OK.**<br>• `/api/archi/[token]/respond/route.ts` : N'utilise PAS `createSupabaseServerClient` (route publique JWT). **N/A.**<br>• `/api/webhooks/brevo/route.ts` : N'utilise PAS `createSupabaseServerClient` (HMAC + db direct). **N/A.** |

**Bilan** : 8 scénarios OK / 0 KO bloquant / 1 N/A (S7 — déléguée CI).

---

## 2. Bloquants merge

**Aucun.**

- S1 → S6 sont tous verts.
- S8 (sécurité middleware) intact post-refactor.
- S9 (resilience API) conforme MEMORY `feedback_nextjs_runtime_page_resilience` pour les routes auditées.
- S7 (Playwright local) ne peut pas servir de bloquant : c'est une limite d'environnement, pas un échec applicatif (le serveur Next n'est pas lancé ni configuré `E2E_TEST_ROUTES_ENABLED=1`). Doit être validé en CI avant merge.

---

## 3. Reco follow-up

1. **CI obligatoire avant merge** : le job GH Actions doit lancer `pnpm test:e2e` avec `E2E_TEST_ROUTES_ENABLED=1` et serveur Next démarré (preview Vercel ou `pnpm dev` orchestré). Sans cette validation, la couverture E2E reste théorique. → `ps_operator`.
2. **Comptage call sites** : message de commit annonce « 99 files / 147 sites », l'audit relève **157 occurrences sur 105 fichiers**. Écart non bloquant (le diff a sans doute été enrichi entre la rédaction du message et le commit final) mais à noter pour la PR description.
3. **Test smoke de bout en bout post-merge** : sur preview Vercel, sanity-check manuel sur les 3 parcours critiques (login provisoire → reset → ao-du-jour ; admin/users invite ; archi `/archi/[token]` flow public) pour valider runtime async + cookies SSR sur Edge / Node. Recommandation : que Steve fasse ces 3 clics manuellement avant `vercel --prod`.
4. **`/api/archi/[token]/respond` & `/api/webhooks/brevo`** : pas concernés par ce refactor mais à inscrire au radar pour une PR future « resilience pattern uniforme » — actuellement la POST principale n'a pas de try/catch global au niveau fonction. Hors périmètre PR #115/#116.
5. **Suivi conformité MEMORY runtime page resilience** : les 5 pages spot-checkées (S3) incluent toutes le pattern `try/catch + ErrorBanner` (vu sur `ao/[id]/dossier/page.tsx` JSDoc l.18-21, `archi/[token]/page.tsx` JSDoc l.20-24, `ao-du-jour/page.tsx`). Bonne hygiène — aucune dérive du refactor.

---

## 4. Output commands

### S6.a — Typecheck
```
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
(output vide → 0 erreur)
```

### S6.b — Vitest
```
 RUN  v4.1.5 C:/Dev/edifio-sourcing

 Test Files  79 passed (79)
      Tests  1218 passed (1218)
   Start at  21:19:58
   Duration  12.84s
```

### S7 — Playwright (local)
```
node node_modules/@playwright/test/cli.js test e2e/tender-actions.spec.ts
  → 4 failed (seed-session E2E_TEST_ROUTES_ENABLED non posé)
  → throw at helpers/auth.ts:56
  → cause : `E2E_TEST_ROUTES_ENABLED=1` absent sur le serveur Next (et serveur non démarré localement)
```

### S1 — Comptage call sites
```
Grep "await createSupabaseServerClient()" sur src/
Found 157 total occurrences across 105 files.

Grep "createSupabaseServerClient()" sans "await"
→ aucune occurrence hors `src/lib/supabase/server.ts` (définition) et 2 JSDoc.
```

### S2 — cookies/headers sync
```
Grep "= cookies()" sans "await" → 0 match
Grep "= headers()" sans "await" → 0 match
```

### S4 — useFormState
```
Grep "useFormState" → 1 occurrence (commentaire JSDoc seul)
src/app/sourcing/admin/profil/ProfileForm.tsx:98:  // pas de useFormState car on...
```

### S5 — Helper supabase
```
src/lib/supabase/server.ts:1: import { createServerClient } from "@supabase/ssr";
src/lib/supabase/server.ts:2: import { cookies } from "next/headers";
src/lib/supabase/server.ts:21: export async function createSupabaseServerClient() {
src/lib/supabase/server.ts:22:   const cookieStore = await cookies();
src/lib/supabase/server.ts:64: export function createSupabaseAdminClient() {
→ UnsafeUnwrappedCookies absent. OK.
```
