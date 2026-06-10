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
- **ORM = Drizzle** *(décision ACTÉE 2026-05-18 — voir `specs/adr_013_orm_drizzle.md` + `gates/06_ORM/DECISION_ORM_260518.md`)*.
  Stack ORM : `drizzle-orm@0.39` + `drizzle-kit@0.30` + `postgres@3.4` (Deno-natif Edge Functions).
  Score pondéré Gate 5 : Drizzle 7,80 / 10 vs Prisma 5,30 / 10 (écart 2,50 points).
  3 conditions formelles CTO : (1) bench cold start Edge Function réel bloquant pré-Gate 9,
  (2) re-seed payload Opendatasoft réel 25 KB médiane à la 1re PR module sourcing,
  (3) conservation branches spike jusqu'au 2026-06-17.

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
5. **`dev`** : ~~spike ORM Drizzle vs Prisma~~ **TRANCHÉ 2026-05-18 → Drizzle retenu**
   (cf. `specs/adr_013_orm_drizzle.md`). Place à la **1re PR module sourcing engine** :
   (a) migration `0000_init.sql` enum `subscription_tier` + colonne `organizations.tier`,
   (b) schema Drizzle v1 (22+ tables), (c) RLS FORCE 12 policies SQL natif,
   (d) seed payload Opendatasoft réel 25 KB médiane. Effort ~9-13 jours / 2-2.5 semaines.
6. **`ps_operator`** : setup container Fly.io EU pour Playwright (déclenché par
   message Supabase Realtime depuis l'orchestrateur).
7. **`ps_operator`** : configuration GitHub Actions (lint + typecheck + tests + build
   + RLS pgTAP + check middleware domaine actif) + Vercel preview deploys par PR.
8. **`ps_operator`** : connecter le repo à Vercel (compte AlyoS), preview deploy
   sur la branche `feat/sourcing-mvp`. URL preview servira aux premiers tests.

## ⚠️ Migration vers le monorepo `alyos-suivi-chantier` (ACCÉLÉRÉE — juin 2026)

Une migration de `edifio-sourcing` vers le monorepo `alyos-suivi-chantier` (Suivi + ACT) est
en cours. **Visio cadrage du 10/06 : bascule AVANCÉE au week-end du 13-14 juin 2026**
(initialement 18 juillet) — cf. arbitrages A1-A8 dans `docs/VISIO_CADRAGE_MIGRATION_BRIEF_260610.md`
et plan compressé dans `DECISIONS.md` 2026-06-10. **GEL des migrations Drizzle et des features
Sourcing effectif depuis le 10/06** (hotfix only).

### Sub-agent reviewer obligatoire

Pendant toute la durée de la migration (à partir du 8 juin 2026), **toute PR concernant le code à porter** doit être validée par le sub-agent **`suivi_act_reviewer`** AVANT d'être soumise à Sébastien (équipe Suivi+ACT, lead migration).

→ Voir `.claude/agents/suivi_act_reviewer.md` pour le prompt système complet (8 garde-fous, conventions de code, 10 arbitrages Q1-Q10, 12 bugs historiques à éviter).

### Décisions structurantes actées (positions Suivi+ACT)

| # | Sujet | Position |
|---|---|---|
| Q1 | BDD partagée ou séparée | ✅ Partagée, projet Supabase unique |
| Q2 | ORM | ✅ supabase-js direct (pas Drizzle dans le monorepo final) |
| Q3 | Billing model | ✅ Adopter le modèle 0115 (drop 0049 Sourcing) |
| Q4 | Cron sourcing : Fly.io ou Vercel | ✅ Bench éclair Alex (A1, visio 10/06) ; non concluant → Fly.io conservé |
| Q5 | Calendrier bascule | ✅ **AVANCÉ : dimanche 14 juin 2026, 8h-11h** (visio 10/06, A8) |
| Q6 | Pack groupé Suivi + ACT + Sourcing | ✅ Modules séparés + rabais multi-modules (visio 10/06, A2) |
| Q7 | Vitest | ✅ Introduire avec la migration |
| Q8 | Workflow migrations BDD | ✅ Garder manuel (Sébastien applique) — gel migrations Sourcing depuis le 10/06 (A4) |
| Q9 | (cf. Q4) | ✅ cf. Q4 |
| Q10 | Planning | ✅ **COMPRESSÉ** : Lots 2-7 les 11-12/06 → recette + GO/NO-GO sam 13/06 → bascule dim 14/06 → post-mortem semaine du 16/06 |

### Brief de migration

Voir `docs/brief_migration_sourcing_to_monorepo.md` (v2, 964 lignes, ~32 pages) pour le détail complet du plan.

## Délégation & autonomie — niveau ÉQUILIBRÉ (décision Board 2026-05-21)

- 🟢 **Zone verte (faire sans demander)** : travail dans une spec validée — code, tests,
  migrations locales drizzle-kit, refacto, doc, préparation de commits. Plan court posté pour info.
- 🟠 **Zone orange (validation CTO Sophie, pas Board)** : choix technique non trivial, écart de
  spec, doute d'archi → `/handoff/REQUEST_*.md`.
- 🔴 **Zone rouge (Board obligatoire)** : passage de gate, action irréversible, déploiement prod,
  dépense, RGPD, changement de périmètre.

Filtres en boucle : Camille (`qa`) garantit les tests verts, Hugo (`reviewer`) relit chaque PR.

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
- **Désactiver les gardes du middleware racine** : auth (`getUser`) + `must_change_password` + rôles admin / superadmin. Le filtre de domaine `@alyosingenierie.fr` initial a été retiré par **ADR-014 (Board 2026-06-05 — ouverture multi-tenant PROTECT)**, mais TOUTES les autres gardes restent obligatoires.
- **Modifier le schéma BDD sans `drizzle-kit generate` puis revue CTO** *(décision ORM actée 2026-05-18 — toute migration passe désormais par Drizzle ; cf. `specs/adr_013_orm_drizzle.md`)*

## Commandes utiles

```powershell
# Vérifier l'état
git status
git log --oneline -10

# Drizzle (ORM acté 2026-05-18 — ADR-013)
pnpm drizzle-kit generate   # Génère une nouvelle migration depuis src/db/schema.ts
pnpm drizzle-kit migrate    # Applique les migrations en local / CI
pnpm db:seed                # Seed Opendatasoft réel (25 KB médiane)
pnpm db:reset               # TRUNCATE + reseed (dev/CI only — JAMAIS sur prod)

# Tests
pnpm test                # Vitest unit
pnpm test:e2e            # Playwright E2E
pnpm test:rls            # pgTAP RLS (SQL natif, hors ORM)

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
