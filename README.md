# edifio Sourcing

> Outil interne **AlyoS Ingénierie** pour le sourcing automatique de marchés publics BTP.
> Accès restreint au domaine email `@alyosingenierie.fr`.

## Statut

Phase 1 (Gates 1 à 5) validée par le Board le 2026-05-07.
Pivot final acté le 2026-05-10 : repo dédié, 100 % AlyoS interne, déploiement Vercel.

Gate 6 (MVP fonctionnel) en cours — voir `gates/05_ARCHI/` et `CLAUDE.md`.

## Stack

- **Next.js 14** (App Router) · **TypeScript strict** · **Tailwind 3**
- **Supabase EU** (Frankfurt) — Postgres + Auth magic-link + Storage + Edge Functions + Vault
- **Vercel EU** — hébergement Web + API Routes
- **Fly.io EU** — container Playwright (scraping plateformes AO)
- **Anthropic** Claude Sonnet 4.6 + Haiku 4.5 — analyse RC, mémoires, scoring
- **Brevo** + **Resend** — emails
- **Odoo XML-RPC** — sync CRM client (adapter unique 17/18/19)
- ORM **REPORTÉ** — spike Drizzle vs Prisma début Gate 6 (cf. `DECISIONS.md` arbitrage 3)

## Sources de vérité

| Dossier / fichier         | Contenu                                                          |
| ------------------------- | ---------------------------------------------------------------- |
| `CLAUDE.md`               | Règles projet, naming strict, décisions d'architecture           |
| `DECISIONS.md`            | Log opposable des décisions techniques (qui, quand, pourquoi)    |
| `specs/`                  | Spécifications fonctionnelles validées par le CTO                |
| `design/`                 | Tokens DTCG, maquettes haute-fidélité, copy Brevo                |
| `gates/`                  | PDFs validés Board (Gates 1 à 5)                                 |
| `notes-de-suivi/`         | Comptes-rendus Cowork                                            |
| `handoff/`                | Demandes de décision Cowork émises par les sub-agents            |

## Démarrage local

Prérequis : Node ≥ 20, pnpm ≥ 11 (via Corepack : `corepack enable pnpm`).

```bash
cp .env.example .env.local      # remplir au minimum les variables [REQUIS G6]
pnpm install
pnpm dev                        # http://localhost:3000
```

## Scripts

| Script               | Effet                                          |
| -------------------- | ---------------------------------------------- |
| `pnpm dev`           | Démarre Next.js en local (port 3000)           |
| `pnpm build`         | Build de production                            |
| `pnpm start`         | Sert le build de production                    |
| `pnpm lint`          | ESLint (config `next/core-web-vitals`)         |
| `pnpm typecheck`     | `tsc --noEmit`                                 |
| `pnpm format`        | Prettier en mode écriture                      |
| `pnpm format:check`  | Prettier en mode vérification                  |

## Conventions

- **Commits** : Conventional Commits obligatoires (validés par `commitlint` + hook husky).
  Format : `type(scope?): description en minuscules`.
- **Branches** : `main` + une branche `feat/<step>` par étape Gate 6.
- **Code** en anglais, **commentaires et documentation** en français.
- **Naming strict** :
  - Marque : `edifio` (lowercase exclusivement, jamais EDIFIO / Edifio / Édifio)
  - Produit : `edifio Sourcing` (composition « edifio + nom »)
  - Éditeur : `AlyoS Ingénierie` (S majuscule final, pas Alyos)

## CI/CD

Pipeline GitHub Actions (`.github/workflows/ci.yml`) déclenché sur **PR vers `main`** et **push direct `main`** (squash merges).

| Job | Vérification |
| --- | --- |
| `ci-lint` | ESLint (`next/core-web-vitals` + `next/typescript`) |
| `ci-typecheck` | `tsc --noEmit` (strict + `noUncheckedIndexedAccess`) |
| `ci-test` | Vitest unit + coverage (seuil 90 % sur `src/lib/auth/**`) |
| `ci-middleware-check` | **BLOQUANT** — présence `src/middleware.ts` + grep `@alyosingenierie.fr` + grep `isAuthorizedEmail` (cf. `specs/middleware_domain_gate.md` §5) |
| `ci-e2e` | **BLOQUANT** — 7 tests Playwright matrice middleware C2-C12 (cf. spec §4) |
| `ci-build` | `next build` (Validation du bundle production) |

**Branch protection `main`** : merge bloqué tant que tous les jobs ne sont pas verts. Pas de push direct main, pas de force-push.

### Vercel

Le repo est connecté à Vercel (compte AlyoS Ingénierie). Chaque PR déclenche un **preview deploy** automatique à l'URL `https://edifio-sourcing-git-<branch>-<hash>.vercel.app`. Le middleware `@alyosingenierie.fr` est actif sur ce preview dès l'ouverture — exposition publique safe.

Variables d'environnement (scope **`Preview` + `Development`** ; **`Production` reste vide jusqu'à Gate 9**) :

- `NEXT_PUBLIC_APP_ENV=preview`
- `ALLOWED_EMAIL_DOMAIN=alyosingenierie.fr`
- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` (projet `edifio-sourcing-preview`)
- `SUPABASE_SERVICE_ROLE_KEY` (marquée **Sensitive**)
- `SUPABASE_PROJECT_REF`
- `NEXT_PUBLIC_SITE_URL` laissé vide → `VERCEL_URL` auto-utilisée (cf. `src/lib/site-url.ts`)

**Production deploy** : `vercel --prod` est dans le `deny` de Claude Code — toute mise en prod passe par OK Board explicite (Gate 9).

## Sécurité

- Aucun secret commité (`.env.local` gitignored — `.env.example` est le template). En CI : GitHub Secrets.
- Middleware Next.js sur `@alyosingenierie.fr` actif sur **toutes les routes protégées** (étape 2 Gate 6, vérifié par `ci-middleware-check` et `ci-e2e`).
- RLS Postgres `FORCE` sur 100 % des tables multi-tenant (politique standard cf. `gates/05_ARCHI/`).
- 12 actions sensibles auditées, log immutable rétention 5 ans.
