# E2E Playwright sur preview Vercel — procédure

Ce document décrit le workflow GitHub Actions `ci-e2e-preview` qui exécute la
suite Playwright contre la **preview Vercel** déployée pour chaque PR. Il solde
la dette signalée dans la recette PR #115/#116 (Camille, qa) :

> Playwright : non exécutable en local sans infra — à valider en CI obligatoire
> avant merge.

## TL;DR

- 1 PR ouverte → Vercel déploie une preview → ce workflow attend la preview
  prête, lance Playwright contre l'URL preview, upload le rapport HTML si KO.
- Pas besoin de token Vercel — on utilise l'API GitHub Deployments.
- Skip via label `skip-e2e-preview` sur la PR.

## Vue d'ensemble

```
┌──────────────┐    1. push commit     ┌──────────────────┐
│ Dev pousse   │ ────────────────────► │  GitHub PR       │
│ commit       │                       └────────┬─────────┘
└──────────────┘                                │
                                                │ 2. trigger
                                                ▼
                  ┌─────────────────────────────────────────┐
                  │ Vercel : build + deploy preview         │
                  │ URL : edifio-sourcing-git-…vercel.app   │
                  └────────────┬────────────────────────────┘
                               │ 3. status `Deployment` posé
                               ▼
                  ┌─────────────────────────────────────────┐
                  │ ci-e2e-preview (GH Actions) :           │
                  │  a) poll Deployments API jusqu'à        │
                  │     `success` + récup `environment_url` │
                  │  b) PLAYWRIGHT_BASE_URL=<preview-url>   │
                  │  c) pnpm test:e2e                       │
                  │  d) upload report si failure            │
                  └─────────────────────────────────────────┘
```

## Fichiers du repo concernés

| Fichier | Rôle |
|---|---|
| `.github/workflows/ci-e2e-preview.yml` | Workflow lui-même |
| `playwright.config.ts` | Flag `PLAYWRIGHT_SKIP_WEB_SERVER=1` qui désactive le webServer local |
| `src/lib/auth/test-routes.ts` | Triple-gate sécurité de `/api/test/seed-session` |
| `e2e/helpers/auth.ts` | Helper `signInWith` qui appelle la route gated côté preview |
| `e2e/helpers/password.ts` | Helpers admin Supabase (parlent en direct à Supabase preview, pas via Vercel) |

## Secrets GitHub à configurer (Steve)

À poser dans **Settings → Secrets and variables → Actions → New repository secret** :

| Nom | Valeur | Pourquoi |
|---|---|---|
| `PREVIEW_SUPABASE_URL` | URL du projet Supabase **preview** | Helpers `e2e/helpers/password.ts` attaquent l'admin SDK directement |
| `PREVIEW_SUPABASE_ANON_KEY` | Clé anon du projet Supabase preview | Idem (cohérence stack côté runner) |
| `PREVIEW_SUPABASE_SERVICE_ROLE_KEY` | Clé service_role du projet Supabase preview | Création / suppression des users E2E (admin SDK) |

> **Important** : ces secrets doivent pointer sur le MÊME projet Supabase que
> celui utilisé par la preview Vercel — sinon les users créés par les helpers
> ne seront pas visibles par la preview, et `signInWith` échouera.

## Variables Vercel preview à configurer (Steve)

À poser dans **Vercel → Project edifio-sourcing → Settings → Environment Variables**
sur l'environnement **Preview** :

| Nom | Valeur | Critique ? |
|---|---|---|
| `E2E_TEST_ROUTES_ENABLED` | `1` (string exact) | **OUI** — sans ça la route `/api/test/seed-session` renvoie 404 et `signInWith` casse. La triple-gate côté serveur empêche l'activation en prod même si la var est posée par erreur (cf. `src/lib/auth/test-routes.ts`). |
| `NEXT_PUBLIC_APP_ENV` | `preview` | Active la branche non-prod du triple-gate |
| `DATABASE_URL` | Connection string Supabase preview | Sert au serveur Vercel (pas au runner) pour rendre les pages métier |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Cohérent avec `PREVIEW_*` ci-dessus | Le serveur preview a besoin de Supabase pour l'auth/admin |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Idem prod ou clé sandbox Resend | Forgot-password flow |

## Comment fonctionne le polling Vercel

GH Actions reçoit l'event `pull_request`. À l'étape `Wait for Vercel preview
deployment`, on :

1. Appelle `GET /repos/{repo}/deployments?sha={head_sha}` (API GitHub) et filtre
   les deployments dont `environment` commence par `Preview` (convention Vercel).
2. Si aucun deployment trouvé → on attend 10 s et on retente (jusqu'à 90 fois =
   15 minutes max).
3. Sinon, on lit `GET /repos/{repo}/deployments/{id}/statuses` et on regarde
   `state` :
   - `success` → on extrait `environment_url` (l'URL preview Vercel) et on
     passe à l'étape suivante.
   - `failure` / `error` → on sort en erreur (la preview elle-même est cassée,
     pas la peine de lancer Playwright).
   - autre (`pending`, `in_progress`, `queued`) → on retente.

Aucun token Vercel nécessaire — l'API GitHub Deployments est alimentée par
l'intégration Vercel-GitHub côté repo.

## Hack `DATABASE_URL` côté runner

Plusieurs specs (`admin-profil`, `sidebar-mobile`, `tender-actions`, `tandem`)
contiennent un `test.skip(!hasDatabase, ...)` avec :

```ts
const hasDatabase = Boolean(process.env.DATABASE_URL);
```

Côté workflow `ci-e2e-preview`, on pose `DATABASE_URL` à une valeur placeholder
**non-vide reconnaissable** (`postgresql://e2e-preview-flag@unused.local/edifio-sourcing`).
Le runner Playwright n'utilise **jamais** cette URL : il parle au serveur
Vercel preview en HTTP, et c'est ce serveur qui a le vrai `DATABASE_URL` dans
son env Vercel.

Pourquoi ce hack ? Parce que dans le job `ci-e2e` (ci.yml) historique, `DATABASE_URL`
était absente pour signaler « pas de BDD disponible côté webServer local » et
le scaffold des tests métier était attendu pour skipper. Sur preview Vercel,
la BDD EST disponible — mais via Vercel, pas via le runner. Le flag est donc
sémantiquement « est-ce qu'une couche BDD est joignable par le SUT ? », pas
« est-ce que le runner a accès direct à PG ». On pourrait à terme renommer
en `E2E_BACKEND_HAS_DB=1` mais ça impacte 4 specs — refacto à arbitrer.

## Comment skipper le workflow temporairement

Poser le label `skip-e2e-preview` sur la PR. Le job a une condition `if:`
qui exclut les PR portant ce label. Cas légitimes :

- PR docs-only (modifs `*.md` exclusivement)
- PR config CI elle-même qui ne change rien à l'app
- Hotfix critique où Vercel preview est down

> **Ne pas en abuser.** La règle d'or de la recette : aucune feature applicative
> ne mergé sans preuve E2E verte.

## Comment debugger un échec

1. Aller sur la PR → onglet **Checks** → cliquer `ci-e2e-preview`.
2. Étape qui échoue :
   - `Wait for Vercel preview deployment` → la preview elle-même est cassée.
     Aller voir le check Vercel pour comprendre (build error, env var manquante…).
   - `Verify required secrets are set` → un secret GitHub manque. Voir
     section « Secrets GitHub » plus haut.
   - `Run E2E against Vercel preview` → un ou plusieurs tests cassent.
     Télécharger l'artifact `playwright-report-preview-pr-{N}` (en bas du run)
     puis :

```bash
unzip playwright-report-preview-pr-115.zip
npx playwright show-report playwright-report
# Ouvre un rapport HTML interactif avec timeline, captures, traces.
```

3. Pour reproduire un test précis en local **contre la même preview** (rare
   mais utile pour bug investigation) :

```powershell
$env:PLAYWRIGHT_BASE_URL = "https://edifio-sourcing-git-<branch>.vercel.app"
$env:PLAYWRIGHT_SKIP_WEB_SERVER = "1"
$env:E2E_TEST_ROUTES_ENABLED = "1"
$env:NEXT_PUBLIC_SUPABASE_URL = "<preview supabase URL>"
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY = "<preview anon key>"
$env:SUPABASE_SERVICE_ROLE_KEY = "<preview service_role key>"
$env:DATABASE_URL = "postgresql://e2e-preview-flag@unused.local/edifio-sourcing"

pnpm test:e2e -- e2e/middleware-domain.spec.ts --headed
```

> Le `--headed` ouvre Chromium en mode visible, utile pour voir ce qui se passe.

## Inventaire des tests E2E et compat preview

| Spec | # tests | Compat preview | Note |
|---|---|---|---|
| `middleware-domain.spec.ts` | 7 actifs | OUI | Couvre la gate domaine — invariant CI bloquant |
| `auth-password.spec.ts` | 6 actifs | OUI | Helpers `password.ts` nécessitent `SUPABASE_SERVICE_ROLE_KEY` côté runner |
| `ao-du-jour.spec.ts` | 2 actifs | OUI | Le test sans login (redirect /login) tourne toujours |
| `admin-profil.spec.ts` | 5 (tous `test.fixme`) | OUI une fois levés du fixme | Camille à étoffer (Q5 du brief) |
| `admin-users-session-expired.spec.ts` | 3 actifs + 1 fixme | OUI | C3 nécessite encore le helper signInAsAdmin |
| `tandem.spec.ts` | 7 actifs (1 skip si !DB) | OUI | Surfaces publiques + cron auth |
| `sidebar-mobile.spec.ts` | 5 actifs | OUI (avec DB flag) | Pattern aria-modal/inert |
| `tender-actions.spec.ts` | 4 actifs | OUI (avec DB flag) | Dépend d'au moins 1 tender en status `sourced` côté Supabase preview |

**Tests qui pourraient ne PAS être 100% green sur preview** :

- `tender-actions.spec.ts` : son `beforeEach` skippe si aucune card visible.
  Si la Supabase preview ne contient pas de tender en status `sourced`, les 3
  tests d'action sont skippés (le seul qui reste vraiment vert est le verrou
  wording). **Action Steve / Camille** : seed Supabase preview avec
  `pnpm db:seed` au moins une fois, ou intégrer un cron de re-seed hebdo
  côté preview.
- `admin-profil.spec.ts` : tous les tests sont `test.fixme` — Camille doit
  les compléter (Task #16 du brief E2E Tandem étape 2).
- `admin-users-session-expired.spec.ts` C3 : `test.fixme` en attente du
  helper `signInAsAdminWith`. Sortie de scope de ce workflow.

## Risques connus

1. **Vercel ne crée pas de deployment pour les PR de forks externes** → le
   workflow filtre déjà ces PR (`head.repo.full_name == base.repo.full_name`).
2. **Timing race** : si le commit pousse 2 fois en moins de 10 s, le `concurrency.cancel-in-progress`
   annule le run précédent — mais la preview Vercel du SHA initial pourrait
   être encore en cours, créant un deployment « pending » que le nouveau run
   verra. Le poll filtre déjà sur le SHA exact de la tête PR donc cas couvert.
3. **Supabase preview rate-limits** : les helpers `password.ts` font
   `listUsers` à chaque appel (paginé sur 200 users). Si la Supabase preview
   se remplit de users de test orphelins (cleanup `afterAll` qui foire),
   on peut taper le plafond pagination. Mitigation : prévoir un cron de
   purge hebdo (TODO ops Steve).
4. **Long de bout en bout** : build Vercel ~3-5 min + Playwright 7 specs ~5-8 min.
   Total ~15 min par PR. Acceptable pour PR feature, lourd pour PR docs (d'où
   le label `skip-e2e-preview`).
