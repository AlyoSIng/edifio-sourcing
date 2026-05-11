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

## Sécurité

- Aucun secret commité (`.env.local` gitignored — `.env.example` est le template).
- Middleware Next.js sur `@alyosingenierie.fr` actif sur **toutes les routes protégées** (étape 2 Gate 6, bloquant CI).
- RLS Postgres `FORCE` sur 100 % des tables multi-tenant (politique standard cf. `gates/05_ARCHI/`).
- 12 actions sensibles auditées, log immutable rétention 5 ans.
