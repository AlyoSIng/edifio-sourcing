# CC 2026-05-24 18:00 — Nadia — Tandem step 2 sous-étape 4 (recovery post fausse alerte stash)

## Contexte

Reprise après diagnostic Yann (`handoff/DIAGNOSTIC_260524_1756_STASH_NADIA.md`).
Aucun fichier perdu : les 11 fichiers métier + tests sont présents en untracked
sur `feat/tandem-engine-step2` (commit `db4b4c1`). Ma thèse « silently dropped
par un linter Next.js » était erronée — checkout sans stash par Camille pendant
recette PR #39 plus probable.

## Statut auth/routes (clarification demandée par le Board)

Les 2 fichiers modifiés non-stagés sont **bien à moi** — intégration du flow
JWT architecte dans le router d'auth principal :

- `src/lib/auth/routes.ts` : ajoute `PUBLIC_ARCHITECT_PREFIX` (`/archi/`),
  `PUBLIC_ARCHITECT_API_PREFIX` (`/api/archi/`), `PUBLIC_BREVO_WEBHOOK_PATH`
  (`/api/webhooks/brevo`). `isPublicRoute()` couvre désormais ces routes pour
  bypasser la garde `@alyosingenierie.fr` du middleware Supabase. Auth
  cryptographique côté handler (JWT RS256 / HMAC Brevo) — pas de session.
- `src/lib/auth/routes.test.ts` : 3 tests constantes + 4 cas publics positifs
  (`/archi/abc.def.ghi`, `/archi/opposition/<jwt>`, `/api/archi/<token>/respond`,
  `/api/webhooks/brevo`) + 4 cas anti-bypass négatifs (`/archi` sans slash,
  `/api/archi` sans slash, `/api/webhooks/brevoo` typo, `/api/webhooks/brevo/extra`
  pas exact-match).

À **inclure dans le commit sous-étape 4**.

## Fichiers à committer (19 entrées)

### Modifiés (2)
- `src/lib/auth/routes.ts`
- `src/lib/auth/routes.test.ts`

### Untracked (16 fichiers métier + tests)
- `src/lib/tandem/opposition-jwt.ts` + `.test.ts`
- `src/lib/tandem/architect-page-data.ts` + `.test.ts`
- `src/lib/brevo/webhook-hmac.ts` + `.test.ts`
- `src/app/archi/[token]/page.tsx`
- `src/app/archi/[token]/ArchitectResponseForm.tsx`
- `src/app/archi/[token]/ArchitectTandemPageBody.tsx`
- `src/app/archi/[token]/TokenInvalidPage.tsx`
- `src/app/archi/[token]/OppositionForm.tsx`
- `src/app/archi/opposition/[token]/page.tsx`
- `src/app/archi/opposition/[token]/actions.ts`
- `src/app/api/archi/[token]/respond/route.ts`
- `src/app/api/webhooks/brevo/route.ts`
- (+ tests E2E `e2e/archi-token*.spec.ts` si présents — à confirmer par Yann)

### Notes/handoff (1, hors commit feature)
- `handoff/DIAGNOSTIC_260524_1756_STASH_NADIA.md` (Yann)
- `notes-de-suivi/CC_260524_1657_HUGO_PR39_REVIEW.md` (Hugo)
- Cette note `CC_260524_1800_NADIA_*.md`

## Résultats tests

| Suite | Résultat | Détail |
|---|---|---|
| `vitest run` | **716/716 PASS** | 47 fichiers, durée 11.38 s |
| `tsc --noEmit` | **1 erreur** | `src/lib/odoo/opportunities.test.ts:29` — `Promise<number>` not assignable to `Promise<T>` sur `noopClient.executeKw`. **Pré-existante** (commit `db4b4c1` sous-étape 3), pas introduite cette tranche. À fixer en patch séparé. |
| `eslint .` | **0 warning** | clean |
| `next build` env-clean | **NON LANCÉ** | bash bloque `$env:VAR=$null`. **À LANCER PAR YANN AVANT PUSH** (memory critique `feedback_nextjs_build_env_clean`). |
| Playwright E2E | **NON LANCÉ** | infra seed cassée sur PR #39 (Hugo l'a noté). À tenter en post-merge sur un container Fly.io neuf. |

## Garde-fous memory respectés

- **`feedback_nextjs_runtime_page_resilience`** : `src/app/archi/[token]/page.tsx`
  encapsule `loadArchitectPageData` dans try/catch absorbé → `<ErrorBanner role="alert">`
  via `@/app/sourcing/ao-du-jour/ErrorBanner`. `architect-page-data.ts` a aussi
  son try/catch interne (Promise.all des 5 selects). Pas de 500 brutal en CI E2E.
- **`feedback_nextjs_build_env_clean`** : à faire par Yann avant push — la page
  importe transitivement `@/db/client`.
- **Webhook Brevo** : `webhook-hmac.ts` utilise `crypto.timingSafeEqual` (vérifié
  visuellement, couvert par 14 tests `.test.ts`).
- **Token opposition vs principal** : `opposition-jwt.ts` utilise `aud=opposition`,
  `jwt.ts` (existant) utilise `aud=architect` — séparation garantie.

## Audit A16

`src/app/api/archi/[token]/respond/route.ts` émet bien `action='architect_response'`
(code A16) à chaque réponse effective accept/decline. La page d'affichage seule
ne déclenche pas d'audit (cf. commentaire en tête de `architect-page-data.ts`).

## Message commit suggéré

```
feat(tandem): page tokenisee architecte + opposition + webhook brevo (etape 2 sous-4)

- src/lib/tandem/opposition-jwt.ts : JWT aud=opposition (separe du token principal)
- src/lib/tandem/architect-page-data.ts : data loader server component (try/catch absorbe)
- src/lib/brevo/webhook-hmac.ts : verification HMAC timingSafeEqual
- src/app/archi/[token]/* : page Server Component + form accept/decline + variants invalid
- src/app/archi/opposition/[token]/* : page opposition RGPD art.21
- src/app/api/archi/[token]/respond/route.ts : POST handler + audit A16
- src/app/api/webhooks/brevo/route.ts : webhook Brevo signature HMAC
- src/lib/auth/routes.ts : public prefixes /archi/ + /api/archi/ + /api/webhooks/brevo

Routes publiques (bypass garde @alyosingenierie.fr) — auth crypto cote handler.
RGPD : opposition art.21 + page invalid generique sans leak.
Memory : try/catch absorbe + ErrorBanner (resilience runtime CI E2E).
Build env-clean a verifier avant push (memory feedback_nextjs_build_env_clean).

Vitest 716/716 PASS. Tsc 1 erreur pre-existante (opportunities.test.ts, hors perimetre).
```

## Demande Yann

**OUI commit + push demandé**, conditions :

1. **AVANT push** : lancer `next build` sans `DATABASE_URL` ni `NEXT_PUBLIC_SUPABASE_URL`
   (memory critique). Si throw au top-level → STOP, je corrige.
2. **Inclure les 2 fichiers `routes.ts` + `routes.test.ts` modifiés** (validés
   au-dessus comme étant à moi).
3. **NE PAS toucher au stash `stash@{0}`** (vieux WIP Yann 16/05 spike Prisma).
4. Vérifier que les E2E specs `e2e/archi-token*.spec.ts` sont bien dans
   l'untracked (je n'ai pas pu les lister depuis le diff git status — Yann
   confirmera avec `git status --porcelain`).
5. Patch séparé suggéré post-commit pour fixer le typage `OdooClient`
   `executeKw<T>` dans `opportunities.test.ts:29` (pré-existant `db4b4c1`).

## Etat zone

🟢 **Zone verte** — tout est dans la spec Tandem validée
(`specs/module_tandem_engine_v1.md` §3.4-3.6). Pas d'écart spec, pas de
pondération matching incertaine, pas de schéma BDD modifié.

— Nadia
