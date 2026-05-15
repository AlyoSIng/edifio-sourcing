# CONTEXTE PROJET — edifio Sourcing

Cette application est un **outil interne AlyoS Ingénierie** développé au sein de la
chaîne **DEV TEAM** (TEISSIER). Le pilotage stratégique se fait dans Cowork
(CEO Marc, CTO Sophie, CMO Léa, Graphiste Théo). Claude Code exécute le code
et les opérations système via deux sub-agents :

- `dev` — **Alex**, développement applicatif, tests, migrations BDD, documentation
- `ps_operator` — **Yann**, opérations Windows / PowerShell, Git (commit + push), déploiement

> **Naming strict** :
> - Marque : `edifio` (lowercase strict, jamais EDIFIO / Edifio / Édifio)
> - Produit : `edifio Sourcing` (composition « edifio + nom »)
> - Fratrie : `edifio Suivi`, `edifio AO`, `edifio ACT`, `edifio Sourcing`
> - Éditeur : `AlyoS Ingénierie` (S majuscule final, pas Alyos)

## Décisions d'architecture actées le 2026-05-10 (PIVOT FINAL)

> **Cette section surclasse les Phases 0 et 5 — voir `DECISIONS.md`.**

1. **Repo dédié et indépendant** : `AlyoSIng/edifio-sourcing` sur GitHub (anciennement
   `edifio-platform` vide, renommé). **Aucun lien avec `edifio-site`** (qui est le site
   public marketing edifio.fr — repo distinct, vie distincte).
2. **Pas de monorepo** : repo Next.js standalone classique (un seul `package.json`,
   un seul `pnpm-lock.yaml`, un seul `apps/`). Si une fratrie de modules edifio
   internes émerge plus tard et justifie une factorisation `@edifio/ui`,
   ce sera un sujet de Phase 2+.
3. **Usage 100 % interne AlyoS Ingénierie** : MVP utilisé exclusivement par les
   collaborateurs AlyoS. Multi-tenancy SaaS multi-clients reportée en Phase 2.
   Le schéma BDD reste multi-tenant (RLS + `organization_id`) pour préparer
   l'ouverture sans dette technique. **1 seule organisation au démarrage : AlyoS.**
4. **Accès restreint au domaine email `@alyosingenierie.fr`** :
   - **Auth Supabase email + mot de passe** *(pivot 2026-05-10 — abandon magic-link bloqué par scanner email entreprise, parité edifio Suivi)*
   - Workflow : admin crée le compte avec email/nom/rôle → mot de passe provisoire 16 car. envoyé via Resend → première connexion force changement de mot de passe → session JWT durable 30 jours
   - **Mot de passe provisoire expire 24 heures**, régénérable par admin (bouton « Renvoyer » dans interface admin)
   - **Règles password définitif : min 16 caractères, 1 maj + 1 min + 1 chiffre + 1 symbole** (passphrases encouragées)
   - Rate-limit login : 5 tentatives échouées → blocage 15 min (default Supabase)
   - MFA admin optionnel au MVP, activable dans les paramètres user
   - Lien « Mot de passe oublié » via Supabase reset password flow standard
   - Middleware Next.js (`middleware.ts`) qui rejette toute session dont
     `email.endsWith('@alyosingenierie.fr') === false` *(inchangé)*
   - Audit log de chaque tentative d'accès (autorisée / refusée)
5. **Déploiement Vercel** : URL initiale `https://edifio-sourcing.vercel.app`
   (ou similaire). Custom domain `sourcing.alyosingenierie.fr` ou
   `app.alyosingenierie.fr/sourcing` à arbitrer en Gate 7.

## Sources de vérité (dans le repo `edifio-sourcing`)

- `/specs/` — specs fonctionnelles validées par le CTO
- `/design/` — maquettes, design tokens, copy validés par le Graphiste et le CMO
- `/gates/` — documents PDF de gate validés par le Board
- `/notes-de-suivi/` — comptes-rendus de réunion Cowork
- `DECISIONS.md` — log de toutes les décisions techniques (qui, quand, pourquoi)
- `CLAUDE.md` — ce fichier

## État du projet au démarrage Gate 6

**Phase 0 + Gates 1 à 5 toutes VALIDÉES par le Board le 2026-05-07.**
**Pivot final acté le 2026-05-10 : repo dédié, usage 100 % AlyoS interne, déploiement Vercel.**

- Stack : Next.js 14 App Router, TypeScript, Tailwind, shadcn/ui hybride,
  Supabase EU (Postgres + Auth + Storage + Realtime + Edge Functions),
  Vercel EU, Brevo, Resend, Anthropic API (Sonnet 4.6 + Haiku 4.5),
  Odoo XML-RPC, Playwright sur container Fly.io EU.
- **Repo de travail : `AlyoSIng/edifio-sourcing` (greenfield Next.js 14 standalone).**
- **Auth email + mot de passe durable**, restreinte au domaine `@alyosingenierie.fr` (middleware Next.js). Workflow admin-create + mot de passe provisoire Resend.
- **ORM Drizzle vs Prisma** : décision REPORTÉE → spike de 2 jours par Alex
  en début Gate 6. AUCUNE MIGRATION COMMITTÉE AVANT DÉCISION.

## Règles globales

1. **Lecture obligatoire avant toute action** : le sub-agent concerné lit
   `CLAUDE.md`, les specs (`/specs/`), le `DECISIONS.md`, et le dernier document de
   gate validé (`/gates/05_ARCHI/`).
2. **Aucune action en dehors du repo sans approbation Board** :
   - pas de modif de fichiers utilisateur hors du dossier projet ;
   - pas de modification de la config Windows ;
   - pas d'installation logicielle système.
3. **Tout est tracé** : chaque action significative génère une entrée
   dans `DECISIONS.md` (date, agent, action, motif).
4. **Communication avec Cowork** : via fichiers committés. Quand un sub-agent a
   besoin d'une décision Cowork, il :
   - rédige une demande dans `/handoff/REQUEST_AAMMJJ_HHMM_SUJET.md`
   - commit + push (via `ps_operator`)
   - signale au Board dans le chat Claude Code : « → Demande Cowork postée : [titre] »
5. **Sécurité par défaut** :
   - secrets dans `.env.local` (jamais committés — `.env.example` à maintenir comme template)
   - dépendances vérifiées (`pnpm audit` à chaque ajout)
   - pas de `--force` git, pas de `rm -rf` hors du dossier projet
   - **vérifier que le middleware de domaine `@alyosingenierie.fr` est actif sur 100 % des routes protégées en CI**
6. **Stack** : celle figée Gate 5, sauf veto CTO (escalade Board).
7. **Hébergement** : Vercel EU + Supabase Frankfurt + Fly.io EU.
   Données sensibles → UE strict.
8. **Langue** : code en anglais (variables, fonctions, commits), commentaires et
   documentation en français.

## Premières actions Gate 6 (parallélisables)

1. **`ps_operator`** : `git status` + `git log --oneline -5` + initialiser
   le projet Next.js 14 (App Router, TypeScript, Tailwind) avec `pnpm create next-app`
   ou structure manuelle alignée Gate 5.
2. **`ps_operator`** : créer la branche `feat/sourcing-mvp` depuis `main`.
3. **`dev`** : architecture du `src/app/` avec route groups :
   `(public)/...` (page d'accueil minimale, login) et `(app)/...` (module Sourcing
   authentifié). Tout sera servi sous `/` puisque le repo est dédié.
4. **`dev`** : ajouter Supabase Auth (**email + mot de passe**) + middleware Next.js
   `middleware.ts` avec gate sur `@alyosingenierie.fr` pour TOUTES les routes
   `(app)/*`. Interface admin `/sourcing/admin/users` pour créer les comptes.
   Flow first-login obligatoire (force changement password). Test E2E qui prouve
   qu'un email hors domaine est rejeté et que le flow admin-create + first-login
   fonctionne.
5. **`dev`** : spike ORM Drizzle vs Prisma (2 jours). Prototype `tenders`
   + `architects` + `architect_responses` avec RLS strict + JSON columns
   + cron Edge Function exécutant scoring sur 100 AO. Critères pondérés :
   cold start (50 %), DX migrations + types (25 %), compat Supabase + RLS (15 %),
   maturité (10 %).
6. **`ps_operator`** : setup container Fly.io EU pour Playwright (déclenché par
   message Supabase Realtime depuis l'orchestrateur).
7. **`ps_operator`** : configuration GitHub Actions (lint + typecheck + tests + build
   + RLS pgTAP + check middleware domaine actif) + Vercel preview deploys par PR.
8. **`ps_operator`** : connecter le repo à Vercel (compte AlyoS), preview deploy
   sur la branche `feat/sourcing-mvp`. URL preview servira aux premiers tests.

## Workflow standard pour une tâche

1. Le Board ou le sub-agent reçoit une demande.
2. Le sub-agent concerné lit le contexte nécessaire.
3. Il propose un plan court (3 à 7 étapes) au Board → attend OK.
4. Il exécute, en signalant les actions critiques avant de les faire.
5. Il met à jour `DECISIONS.md`.
6. Il rédige une mini-note de suivi dans `/notes-de-suivi/CC_AAMMJJ_HHMM.md`.

## Limites strictes (à NE JAMAIS franchir sans OK Board explicite)

- Modifier des fichiers hors du dossier projet `edifio-sourcing`
- Modifier la configuration Windows (registre, services, GPO, pare-feu)
- Installer ou désinstaller un logiciel système
- Supprimer une branche Git non locale, force-push, rebase d'historique partagé
- Pousser un secret en clair dans le repo (`.env.local` jamais committé)
- Déployer en production sans validation Gate 9
- Communiquer avec un service tiers payant non autorisé
- **Désactiver le middleware de domaine `@alyosingenierie.fr`** (même temporairement)
- **Committer une migration BDD avant la décision ORM (Drizzle vs Prisma)**

## Commandes utiles

```powershell
# Vérifier l'état
git status
git log --oneline -10

# Tests (à adapter une fois le spike ORM tranché)
pnpm test                # Vitest unit
pnpm test:e2e            # Playwright E2E
pnpm test:rls            # pgTAP RLS

# Lancer en local
pnpm dev                 # Next.js + Supabase local
pnpm build               # Build prod

# Vercel
vercel                   # preview deploy depuis la branche courante
vercel --prod            # production deploy (Gate 9 uniquement, OK Board obligatoire)
```

## Identité de marque dans le code

- Strings UI : exclusivement « edifio Sourcing », « Solo », « Tandem »
- Footer : `© AlyoS Ingénierie {{year}} — Outil interne`
- Email signature : « via edifio Sourcing »
- 14 libellés de statut FR validés Gate 4 (cf. `/design/copy/templates_brevo_v1.md`).
