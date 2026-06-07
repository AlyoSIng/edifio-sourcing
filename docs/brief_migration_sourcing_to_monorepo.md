# Brief de migration — edifio Sourcing → monorepo `alyos-suivi-chantier`

> Document de cadrage technique destiné à **l'équipe de développement Suivi + ACT**
> pour préparer l'absorption d'edifio Sourcing comme 3ᵉ module du monorepo edifio.
> **Auteur :** session de travail Claude Code (Steve TEISSIER, dirigeant AlyoS Ingénierie / SAS edifio).
> **Date :** 7 juin 2026
> **Version :** v2 — révisée après lecture du handover `docs/HANDOVER_EQUIPE_EXT.md`
> du repo `alyos-suivi-chantier` (7 juin 2026).
> **Statut :** brouillon v2 — à challenger conjointement par les 2 équipes
> en visioconférence de cadrage (90 min, semaine du 8 juin), avant verrouillage du plan définitif.

---

## ⚠️ Note de gouvernance (décision Steve, 7 juin 2026)

**Lead de la migration : équipe Suivi + ACT.**

L'équipe Sourcing (Claude Code en sub-agent `dev`) code sous leur direction :
- Sébastien (Suivi+ACT) arbitre les décisions d'archi
- Sébastien valide les conventions de naming, les garde-fous (pattern boundary
  Client/Server, ESLint `import/no-restricted-paths`, lib/db pattern)
- Sébastien revue les PR avant merge sur `feat/sourcing-merge`
- Pair programming + standup quotidien 30 min

Le présent document est un **brief d'entrée**, pas un plan exécutif imposé.
Toutes les recommandations marquées « 🟢 Recommandation Sourcing » sont
discutables — l'équipe Suivi+ACT a le dernier mot.

---

## ⚠️ Corrections critiques v1 → v2 (apprises du handover)

| Item | v1 (faux ou imprécis) | v2 (handover) |
|---|---|---|
| **Région Supabase Suivi+ACT** | « à confirmer Frankfurt probable » | **Paris eu-west-3** — projet `vlhirdzvewzqgtnhcjft`. Sourcing est sur Frankfurt → migration inter-région nécessaire (pg_dump/pg_restore + downtime 1-3 h, OU déménagement du projet Suivi+ACT, OU acceptation latence cross-region) |
| **Stripe en prod Suivi+ACT** | « ✅ déjà câblé » | **🟡 Schémas BDD prêts (migration 0115), MAIS le Checkout + webhooks Stripe est « reste à faire » (Sprint 9.E, marqué priorité critique).** Mutualisation = bénéfique pour les 2 modules à la fois |
| **Multi-org `memberships`** | non précisé | **Suivi+ACT est en 1 user = 1 organization_id (pas de N-N).** Sourcing a déjà `memberships` (N-N). Harmonisation nécessaire — décision à arbitrer (cf. Q6) |
| **Tests Vitest chez Suivi+ACT** | « à confirmer » | **Pas de Vitest — uniquement Playwright E2E.** Sourcing a 1 218 tests vitest verts → introduction de Vitest à arbitrer (cf. Q7) |
| **Schémas Postgres Suivi+ACT** | non précisé | **2 schémas : `public` (Suivi + global) et `act`.** Sourcing aura son propre schéma `sourcing` à créer (cohérent) |
| **Entité juridique éditrice** | « AlyoS Ingénierie » | **SAS edifio** (SIREN 105 534 515, immatriculation 01/06/2026, siège 5 av. Verlaque 13009 Marseille). Stripe doit facturer au nom de SAS edifio, pas AlyoS Ingénierie |
| **Supabase CLI / migrations** | « migration auto via drizzle-kit » | **Aucun Supabase CLI chez Suivi+ACT — migrations 100 % manuelles via Studio.** Sourcing a un `tsx src/db/migrate.ts` automatisé. À harmoniser (cf. Q8) |
| **CI/CD GitHub Actions** | « Sourcing en a, Suivi+ACT inconnu » | **Suivi+ACT n'a pas de CI/CD GitHub Actions — juste Vercel auto-build.** Sourcing a un workflow Actions (lint + typecheck + tests + pgTAP). Adoption Vitest + Actions à arbitrer |
| **DNS** | « registrar à confirmer » | **OVH** — `edifio.fr` chez OVH compte AlyoS. Bascule de `sourcing.edifio.fr` se fait au registrar OVH |
| **Garde-fous Suivi+ACT** | non détaillés | **8 commandements documentés** (cf. handover §4) à respecter à la lettre. Le plus structurant : **pattern boundary Client/Server strict** (jamais `import type` depuis Client vers un module qui tire `next/headers`). Sourcing devra se conformer |

---

## ⚡ Lecture express (3 minutes)

| Item | Valeur |
|---|---|
| **Repo source** | `AlyoSIng/edifio-sourcing` (greenfield, mono-package) |
| **Repo cible** | `AlyoSIng/alyos-suivi-chantier` (monorepo `app/` pnpm workspaces déjà initialisés, contient Suivi + ACT) |
| **Volumétrie code à migrer** | ~110 k lignes TS/TSX, 72 routes, 39 Server Actions, 10 routes API, 50 migrations BDD, 76 fichiers de tests, 17 guides utilisateurs |
| **Modules métier** | 7 grandes sections (Veille AO / Cotraitance Tandem / Dossier IA / Bibliothèque entreprise / Annuaires / Admin / Superadmin) |
| **Stack source** | Next.js 14.2, React 18, Drizzle ORM, supabase-js, Anthropic SDK, fflate + Mustache, exceljs, pdf-lib, pdf-parse |
| **Stack cible** | Next.js 15.5, React 19, **supabase-js direct (pas d'ORM)**, Anthropic SDK, **docxtemplater + xlsx (sheetjs) + Stripe + Upstash Redis** |
| **Effort total estimé v1** | 13–19 j/h focus |
| **Effort total estimé v2** (après handover Suivi+ACT) | **22–37 j/h focus** selon arbitrages — médiane recommandée 30 j/h sur 3-4 semaines |
| **Délai de bascule prod** | T3 2026 — visée **3ᵉ samedi de juillet 2026** (~ 18 juillet), saison creuse AO publics |
| **Décisions structurantes à prendre en visio cadrage** | **10 questions** (cf. §9) |
| **Lead migration** | Équipe Suivi+ACT (Sébastien). Claude Code en support pour le portage des modules métier Sourcing. |

### Pourquoi migrer

1. **Mutualisation de l'infrastructure SaaS** : Stripe / trial / paywall / quotas / ratelimit Upstash sont déjà câblés dans Suivi+ACT — y porter Sourcing évite 2-3 semaines de redéveloppement.
2. **1 seul superadmin `sebastien@edifio.fr`** sur les 3 modules, 1 facturation unifiée par organisation, 1 design system commun.
3. **Cohérence produit** edifio à 3 modules pour les clients (AlyoS, PROTECT, futurs cabinets).
4. **Maintenance** : 1 seul pipeline CI/CD, 1 seule équipe d'astreinte, 1 seul backlog technique.

### Pourquoi maintenant (juin/juillet 2026)

- Sourcing vient d'ouvrir en multi-tenant (ADR-014 du 5 juin) avec 2 clients réels (AlyoS, PROTECT) — le moment idéal pour basculer avant que le code Sourcing diverge davantage.
- Suivi+ACT a déjà Stripe câblé en prod (cf. migration 0115 `organization_billing_lifecycle`) — la phase la plus risquée de la stack SaaS est derrière.
- Stripe minimal MVP livré sur Sourcing le 5 juin (Option C du plan hybride) est jetable post-migration → 1 j de dev qui assumé.

---

## 0. Table des matières

1. [Inventaire du repo source `edifio-sourcing`](#1-inventaire-du-repo-source-edifio-sourcing)
2. [Inventaire du repo cible `alyos-suivi-chantier`](#2-inventaire-du-repo-cible-alyos-suivi-chantier)
3. [Comparatif technique des stacks](#3-comparatif-technique-des-stacks)
4. [Inventaire fonctionnel détaillé à porter](#4-inventaire-fonctionnel-d%C3%A9taill%C3%A9-%C3%A0-porter)
5. [Méthodologie de migration recommandée](#5-m%C3%A9thodologie-de-migration-recommand%C3%A9e)
6. [Lots de migration détaillés avec estimations](#6-lots-de-migration-d%C3%A9taill%C3%A9s-avec-estimations)
7. [Risques techniques et mitigations](#7-risques-techniques-et-mitigations)
8. [Stratégie de bascule prod et rollback](#8-strat%C3%A9gie-de-bascule-prod-et-rollback)
9. [Questions à débattre avec l'équipe Suivi+ACT](#9-questions-%C3%A0-d%C3%A9battre-avec-l%C3%A9quipe-suiviact)
10. [Annexes — variables ENV, secrets, providers tiers](#10-annexes)

---

## 1. Inventaire du repo source `edifio-sourcing`

### 1.1 Identité et historique

- **GitHub :** `https://github.com/AlyoSIng/edifio-sourcing`
- **Branche principale :** `main` (production directement déployée Vercel)
- **Démarrage :** Phase 0 — décembre 2025
- **Pivot architecture final :** 10 mai 2026 (repo dédié indépendant — abandon idée monorepo @edifio/* précoce)
- **Stack figée Gate 5 :** 18 mai 2026 (ADR-013 ORM Drizzle retenu)
- **Mise en service multi-tenant :** 5 juin 2026 (ADR-014 ouverture PROTECT)

### 1.2 Stack technique

```
Frontend       : Next.js 14.2.35 App Router, TypeScript 5.9, Tailwind 3.4, shadcn/ui hybride
Backend BDD    : Supabase EU Frankfurt (Postgres 15 + RLS FORCE)
ORM            : Drizzle 0.39.3 + drizzle-kit 0.30.6 + postgres 3.4.9 (Deno-natif Edge Functions)
Auth           : Supabase Auth email + password durable, invitation pure (ADR-014)
Hébergement    : Vercel EU
Worker scrap   : Fly.io EU (Playwright pour plateformes régionales)
Emails         : Brevo (utilisateurs) + Resend (admin/comptes)
IA             : Anthropic API Sonnet 4.6 (analyse RC PDF natif) + Haiku 4.5 (indexation biblio)
PDF / Excel    : fflate + Mustache custom (docx CERFA), pdf-lib, pdf-parse, exceljs 4.4
Tests          : Vitest 4.1 unitaire + Playwright 1.59 E2E + pgTAP RLS
CI/CD          : GitHub Actions (lint + typecheck + tests + build + RLS pgTAP)
Node / pnpm    : Node 22.13, pnpm 11.0
```

### 1.3 Métriques quantitatives (au 7 juin 2026)

| Item | Valeur |
|---|---|
| Lignes de code TS/TSX | **110 558** |
| Pages Next.js (`page.tsx`) | **72** |
| Server Actions (`actions.ts`) | **39** |
| Routes API REST (`route.ts`) | **10** |
| Migrations BDD | **50** (`0000_init.sql` à `0049_trial_billing.sql`) |
| Tables Drizzle | **25+ fichiers schema** (env. 30 tables physiques en prod) |
| Modules `src/lib/` | **27** (admin, ai, architects, audit, auth, billing, brevo, buyers, constants, cron, db, dossier, email, library, notifications, odoo, pappers, profile, sourcing, storage, supabase, superadmin, tandem, text + 3 fichiers racine) |
| Tests | **76 fichiers** vitest + Playwright + pgTAP (≈ 1 218 tests verts au 5 juin) |
| Guides utilisateurs intégrés (`formations` table) | **17** au format markdown rendu HTML |
| Commits dans `main` depuis ADR-014 | 10+ (multi-tenant + branding + Stripe minimal + CV + buyers + ...) |
| Couverture tests | 100 % verte sur la suite — pas de skip ni de flaky |

### 1.4 Schéma BDD — tables principales

Ordre de complexité décroissante :

| Domaine | Tables |
|---|---|
| **Multi-tenant racine** | `organizations`, `users`, `memberships`, `audit_log` |
| **Sourcing / Veille** | `tenders`, `tender_documents`, `tender_events`, `search_profiles`, `keywords`, `tender_briefs`, `tender_be_cotraitants` |
| **Cotraitance** | `architects`, `bureaux_etudes`, `entreprises`, `architect_responses`, `architect_competences`, `architect_solicitations`, `past_collabs` |
| **Annuaires complémentaires** | `buyers` (annuaire acheteurs, 0048), `message_templates` |
| **Dossier IA / Bibliothèque** | `presentation_library`, `library_item_index`, `response_files`, `dossier_dispatches`, `dossier_zip_compositions` |
| **Configuration org** | `organization_profiles`, `org_branding`, `shortlist_criteria`, `app_settings` |
| **Superadmin / Contenu app** | `support_tickets`, `news_items`, `user_news_reads`, `formations`, `guided_tests`, `roadmap_items`, `pitch_blocks`, `market_study_blocks` |
| **IA / Audit** | `ai_prompts`, `ai_runs`, `ai_usage_logs` (à la marge) |
| **Notifications** | `user_notifications`, `cron_run_log` |
| **Facturation (Stripe minimal MVP)** | `organizations.{trial_started_at, trial_ends_at, subscription_status, stripe_customer_id}` (0049) |

**RLS** : 12 policies `FORCE ROW LEVEL SECURITY` SQL natif testées via pgTAP. Toutes scopées par `organization_id` via JOIN sur `memberships`.

### 1.5 Modules fonctionnels (vue produit)

1. **Veille et tri AO** — Cron quotidien 6h30 BOAMP + 6 plateformes régionales (Fly.io worker Playwright), profils de recherche multi-critères, brief IA Sonnet 4.6, file `AO du jour` / `Sélectionnés` / `Reportés`, saisie manuelle.
2. **Cotraitance (Tandem)** — Annuaire architectes / BE / entreprises avec enrichissement Pappers + Sirene, shortlist criteria, sollicitation mail Brevo, relance auto J+3, badge cotraitance.
3. **Dossier de candidature** — Analyse RC Sonnet 4.6 PDF natif, pré-remplissage DC1/DC2 multi-archi/multi-BE, génération CERFA via templates `.docx` Mustache (33 balises documentées), matching pièces RC ↔ biblio, compile ZIP avec arborescence pro, envoi archi, historique.
4. **Bibliothèque entreprise** — 20 catégories dont 4 avec matching IA (fiche_metier, reference_fiche, cv, references_table Excel filtré auto par profil de recherche), indexation Claude Haiku, expiration J-30/J-7/J-1.
5. **Annuaire acheteurs** — auto-enrichi à la saisie d'adresse acheteur sur un AO (livré 4 juin), recherche normalisée, export CSV.
6. **Admin** — gestion utilisateurs (admin-create + mot de passe provisoire Resend), modèles email Brevo, présentation société (DC2), critères short-list, personnalisation branding, profils de recherche multi.
7. **Superadmin éditeur** — création d'organisations, billing 0049 (trial 30j + status + cus_XXX), dashboard coûts IA, dashboard activité Tandem, support tickets, news, formations, tests guidés, roadmap publique, pitch éditeur, market study.

### 1.6 Décisions d'architecture marquantes (`DECISIONS.md`)

- **ADR-011** (12 mai 2026) — Pivot magic-link → password durable (scanner email entreprise bloquait les links)
- **ADR-012** (15 mai 2026) — Alignment visuel edifio.fr (design tokens partagés)
- **ADR-013** (18 mai 2026) — ORM Drizzle retenu vs Prisma (score pondéré 7,80/10 vs 5,30/10)
- **ADR-014** (5 juin 2026) — Levée du filtre `@alyosingenierie.fr` du middleware → ouverture multi-tenant (PROTECT)

### 1.7 Dette technique connue

- Édition inline des `matching_keywords` absente (suppression + ré-upload nécessaire)
- Pas de versioning du tableau Excel des références (upload = remplacement)
- Stripe minimal MVP (Option C, livré 5 juin) = à jeter à la migration
- Rotation des secrets post-incident 2026-05-21 reportée (à finaliser avant mise en service réelle)
- Hardening `migrate.ts` + règle password URI-safe à appliquer
- Cron `sourcing-run` a observé 60 % d'échec sur la semaine du 29 mai au 5 juin (audit interne) — probablement résolu par migrations 0047/0048 appliquées le 5 juin, à confirmer en monitoring continu

---

## 2. Inventaire du repo cible `alyos-suivi-chantier`

> Données issues d'un audit local du repo le 7 juin 2026.

### 2.1 Structure

```
alyos-suivi-chantier/
├── ACT                          # Documents ACT (hors code)
├── LINKEDIN                     # Visuels marketing
├── README.md
├── app/                         # ★ Application Next.js monorepo pnpm workspaces
│   ├── src/
│   │   ├── app/                 # 116 pages Next.js 15 App Router
│   │   │   ├── act/             # Module ACT
│   │   │   ├── chantier/        # Module Suivi
│   │   │   ├── admin/, contacts/, calendrier/, formation/, ...
│   │   ├── modules/             # ★ Organisation par produit
│   │   │   ├── act/             # Logique métier ACT
│   │   │   ├── suivi/           # Logique métier Suivi
│   │   │   └── common/          # ★ Code partagé multi-modules
│   │   └── lib/                 # Couches abstraction
│   ├── db/migrations/           # 137 migrations SQL natif
│   ├── scripts/                 # Scripts ops (capture-demo, migrate-imports, etc.)
│   ├── e2e/                     # Tests Playwright
│   ├── pnpm-workspace.yaml      # Monorepo prêt
│   └── vercel.json              # 4 crons configurés
├── docs/
└── wireframes/
```

### 2.2 Stack technique

```
Frontend       : Next.js 15.5.18 App Router, React 19, TypeScript, Tailwind 3.4
Backend BDD    : Supabase (à confirmer région) — supabase-js direct
Couche données : Custom `lib/db/<entity>.ts` au-dessus de supabase-js (pas d'ORM)
Auth           : @supabase/ssr 0.10
Hébergement    : Vercel
Emails         : (à confirmer — Resend probable vu présence dans common/email)
IA             : Anthropic SDK 0.32
PDF / Excel    : docxtemplater 3.68, pdf-lib, pdf-parse, mammoth, xlsx (sheetjs CDN)
PDF render     : @react-pdf/renderer 4.5, puppeteer-core 23 + @sparticuz/chromium-min (PDF dynamique)
Paiement       : Stripe 22.1 (SDK serveur, webhook probable)
Cache + ratelimit : @upstash/redis 1.38 + @upstash/ratelimit 2.0
Tests          : Playwright 1.49 E2E (pas de vitest vu en surface — à confirmer)
PWA            : Sharp + scripts/generate-pwa-icons
```

### 2.3 Métriques quantitatives

| Item | Valeur |
|---|---|
| Pages Next.js | **116** |
| Migrations BDD | **137** |
| Fichiers `lib/db/<entity>.ts` | **47** (couche abstraction supabase-js) |
| Modules `src/modules/common/` | **15** (ai, auth, contacts, email, log, notifications, pdf, quota, ratelimit, storage, stripe, supabase, types) |
| Crons Vercel | **4** : `/api/cron/rappels` (8h), `/api/cron/changelog-draft` (6h), `/api/cron/relance-trial` (7h), `/api/cron/purge-trial-expired` (4h) |

### 2.4 Modules `common/` déjà disponibles à réutiliser

| Module | Statut | Avantage pour Sourcing |
|---|---|---|
| `common/stripe/` | ✅ Câblé en prod | Évite le Stripe minimal MVP (Option C jetable) |
| `common/auth/` | ✅ Câblé en prod | Pattern d'invitation pure déjà éprouvé |
| `common/quota/` | ✅ Câblé en prod | Gestion des limites par pack (Solo 100 AO/mois, ...) |
| `common/ratelimit/` | ✅ Upstash Redis | Anti-abus sur les Server Actions sensibles |
| `common/notifications/` | ✅ Câblé en prod | Système in-app à réutiliser |
| `common/pdf/` | ✅ Câblé en prod | Rendu PDF via puppeteer / react-pdf |
| `common/storage/` | ✅ Câblé en prod | Wrapper Supabase Storage |
| `common/email/` | ✅ Câblé en prod | Templates email + envoi |
| `common/ai/` | ✅ Câblé en prod | Wrappers Anthropic SDK + retry + audit |
| `common/contacts/` | ✅ Câblé en prod | Annuaire générique → à intégrer avec architects/BE/buyers |
| `common/log/` | ✅ Câblé en prod | Logger structuré commun |

### 2.5 Cycle de vie billing (migration 0115 `organization_billing_lifecycle`)

D'après le SQL de la migration 0115, le repo cible possède déjà :

- `organizations.contract_summary` (jsonb) — capture les choix tarifaires faits à la conversion prospect → client (formule mensuel/annuel, nombre d'utilisateurs, packs additionnels IA/Pappers/STT/Offline+/Chantier+, durée d'engagement, montants HT/TTC, devise)
- `organizations.trial_status` (text enum) — `actif`, `expire_bientot`, `trial_expired`, `a_supprimer`, `client_payant`
- Cron `/api/cron/relance-trial` (J-15, J-3, J0 mail à l'admin)
- Cron `/api/cron/purge-trial-expired` (J+30 RGPD)
- Stripe customer + subscription pilotés par le module `common/stripe/`

→ **Le modèle Sourcing 0049 est un sous-ensemble dégradé de ce modèle 0115.** À la migration, on jette 0049 et on adopte 0115.

---

## 3. Comparatif technique des stacks

### 3.1 Divergences majeures

| Aspect | Sourcing | Suivi+ACT | Action de migration | Effort |
|---|---|---|---|---|
| **Next.js** | 14.2 | **15.5** | ⬆️ Upgrade Sourcing (Server Actions API stable, Turbopack par défaut) | 1-2 j |
| **React** | 18.3 | **19** | ⬆️ Upgrade (inclus dans Next 15 + `useActionState` + `use()` hook) | inclus |
| **ORM/BDD** | **Drizzle** + schemas TS + migrations générées | **supabase-js direct** + `lib/db/<entity>.ts` + migrations SQL natif | 🔄 Refonte de la couche d'accès : porter ~25 schemas Drizzle vers 25 fichiers `lib/db/<entity>.ts` style Suivi+ACT | 3-5 j |
| **Anthropic SDK** | 0.98 (latest) | 0.32 | ⬆️ Bump SDK côté Suivi+ACT ou downgrade côté Sourcing (à arbitrer) | 0.5 j |
| **Excel** | `exceljs` 4.4 | `xlsx` (sheetjs CDN 0.20) | 🔄 Refactor du module références (salve R) Excel filtré : exceljs → sheetjs | 1 j |
| **DOCX CERFA** | `fflate` + Mustache custom (livré H1) | `docxtemplater` (lib dédiée) | 🔄 Refactor du moteur docx-fill : fflate+Mustache custom → docxtemplater | 1-2 j |
| **PDF natif Claude** | Sonnet 4.6 (analyse RC PDF direct) | `pdf-parse` + mammoth + puppeteer | 🟢 Garder le pattern Sourcing (PDF natif Claude) — c'est techniquement supérieur | 0 j |
| **Excel SDK** | npm `exceljs` propre | sheetjs CDN URL → faille npm-publish docs | 🟡 À débattre — sheetjs CDN a des limites de licence/source |
| **Imports** | `@/db/...`, `@/lib/...` | `@/common/...`, `@/modules/...` | 🔄 Renommage massif imports (≈ 600 occurrences) | 1 j |
| **Stripe** | absent | ✅ déjà intégré | 🟢 Gain énorme — jeter le Stripe MVP Option C livré 5 juin | 0 j |
| **Upstash Redis** | absent | ✅ déjà en place | 🟢 Réutiliser le ratelimit pour les Server Actions Sourcing | 0 j |
| **Trial/billing** | 0049 minimal | 0115 complet (cron, RGPD purge) | 🔄 Adopter le modèle 0115 + drop colonnes 0049 | 0.5 j |
| **Tests vitest** | 76 fichiers / 1 218 tests | (Playwright E2E uniquement ? à confirmer) | 🔄 Garder les vitest de Sourcing — couvre la logique pure (matching, computeTrialState, fiche-metier-match, etc.) | 0 j (déjà fait) |
| **Tests pgTAP RLS** | 12 policies testées | (statut à confirmer) | 🔄 Porter la batterie pgTAP avec les nouvelles tables Sourcing | 1 j |
| **Convention naming migrations** | `NNNN_<nom>.sql` (50 numéros) | `NNNN_<nom>.sql` (137 numéros) | ✅ Compatible. Sourcing repart à 0138+ | 0 j |

### 3.2 Compatibilité positive (rien à faire)

- Supabase comme backend
- Supabase Storage pour les fichiers
- Anthropic API pour l'IA
- Vercel comme hébergement
- Tailwind 3.4 (même version)
- TypeScript strict
- Pattern Server Actions Next.js (juste l'upgrade de version)
- Tests Playwright E2E
- ESLint + Prettier (configs à harmoniser mais structures proches)

### 3.3 Effort de refonte (synthèse)

| Lot | Description | Effort | Risque |
|---|---|---|---|
| Lot 1 — Next.js 14 → 15 / React 18 → 19 | Upgrade Sourcing avant migration | 2-3 j | 🟡 Moyen (breaking changes Server Actions, `cookies()` async) |
| Lot 2 — Drizzle → supabase-js + `lib/db/<entity>.ts` | Refonte couche d'accès BDD | 3-5 j | 🔴 Élevé (sous-jacent à TOUT le code) |
| Lot 3 — exceljs → sheetjs + docxtemplater | 2 modules à réécrire | 1-2 j | 🟢 Faible (modules isolés, tests les couvrent) |
| Lot 4 — Renommage imports `@/db`, `@/lib` → `@/common`, `@/modules` | Bulk find/replace + ajustements | 1 j | 🟢 Faible (mécanique) |
| Lot 5 — Structure routes : `app/sourcing/*` + `modules/sourcing/*` | Réorganisation dans monorepo | 2-3 j | 🟡 Moyen |
| Lot 6 — Adoption billing 0115 + suppression 0049 | Drop Stripe minimal MVP | 0.5 j | 🟢 Faible |
| Lot 7 — Portage tests + RLS pgTAP | Garder la suite de tests verte | 3-5 j | 🟡 Moyen |
| **Total** | | **13-19 jours/homme focus** | |

---

## 4. Inventaire fonctionnel détaillé à porter

Pour chaque section produit, on liste : tables BDD impliquées, routes UI, Server Actions, libs, dépendances IA / tiers.

### 4.1 Sourcing / Veille AO

**Tables :** `tenders`, `tender_documents`, `tender_events`, `tender_briefs`, `search_profiles`, `keywords`

**Routes UI :**
- `/sourcing/ao-du-jour` (file du jour)
- `/sourcing/selectionnes`, `/sourcing/reportes`
- `/sourcing/ao/[id]` (détail AO)
- `/sourcing/ao/nouveau` (saisie manuelle)
- `/sourcing/admin/search-profiles`
- `/sourcing/admin/sourcing-debug`

**Server Actions / API :**
- `ao-du-jour/actions.ts` (sélection, report, export CSV)
- `ao-du-jour/export-actions.ts`
- `ao/[id]/actions.ts` (update buyer address → buyers directory upsert)
- `ao/nouveau/page.tsx`
- `api/cron/sourcing-run/route.ts` (cron 6h30)

**Libs :**
- `lib/sourcing/queries.ts`
- `lib/sourcing/orchestrator.ts` (BOAMP + plateformes régionales)
- `lib/sourcing/boamp-fetcher.ts` (API gratuite data.gouv.fr)
- `lib/sourcing/regional-scrapers/*` (Fly.io worker Playwright)
- `lib/buyers/upsert-buyer.ts`
- `lib/ai/haiku-rationale-client.ts` (brief AO court)

**Dépendances :**
- Anthropic API Sonnet 4.6 (brief)
- Fly.io worker Playwright (scraping plateformes régionales sans JS)
- API BOAMP (data.gouv.fr)
- Opendatasoft (réf CPV + départements)

### 4.2 Cotraitance Tandem

**Tables :** `architects`, `architect_responses`, `architect_solicitations`, `architect_competences`, `bureaux_etudes`, `entreprises`, `past_collabs`, `tender_be_cotraitants`, `message_templates`

**Routes UI :**
- `/sourcing/architectes` (annuaire + édition)
- `/sourcing/bureaux-etudes`, `/sourcing/entreprises`
- `/sourcing/cotraitance` (pipeline Kanban)
- `/sourcing/cotraitants`
- `/sourcing/ao/[id]/tandem/*` (shortlist, partage, cotraitant)
- `/archi/[token]` (page publique cotraitant invité)
- `/cotraitant/[token]`

**Server Actions :**
- `tandem/actions.ts`, `tandem/partage/actions.ts`, `tandem/cotraitant/page.tsx`
- `architectes/actions.ts`, `bureaux-etudes/actions.ts`, `entreprises/actions.ts`
- `cotraitants/actions.ts`
- `api/archi/[token]/respond/route.ts` (réponse cotraitant via lien tokenisé)

**Libs :**
- `lib/tandem/followup-cron.ts` (relance J+3)
- `lib/architects/*`
- `lib/pappers/*` (enrichissement Sirene)

**Dépendances :**
- Brevo (templates emails sollicitation + relance)
- API Pappers (enrichissement société)
- JWT tokens pour les pages publiques cotraitant (lib token signing)

### 4.3 Dossier de candidature IA

**Tables :** `presentation_library`, `library_item_index`, `response_files`, `dossier_dispatches`, `dossier_zip_compositions`, `organization_profiles`, `ai_prompts`, `ai_runs`

**Routes UI :**
- `/sourcing/ao/[id]/dossier` (page hub)
- `/sourcing/ao/[id]/dossier/cerfa` (formulaire DC1/DC2)
- `/sourcing/ao/[id]/dossier/pieces` (matching pièces + compile ZIP)

**Server Actions :**
- `dossier/cerfa/actions.ts` (analyzeRcAction, validateCerfaAction)
- `dossier/pieces/actions.ts` (matchPiecesAction, compileDossierAction)
- `dossier/pieces/dispatch-actions.ts` (envoyer ZIP à l'architecte)
- `dossier/be-cotraitants/actions.ts`

**Libs :**
- `lib/dossier/cerfa-prefill.ts` (logique pure de pré-remplissage)
- `lib/dossier/cerfa-pdf.ts` (génération PDF — voie ancienne)
- `lib/dossier/cerfa-docx-generator.ts` (génération via templates `.docx` Mustache)
- `lib/dossier/docx-fill.ts` (moteur Mustache custom au-dessus de fflate)
- `lib/dossier/zip-compile.ts` (assemblage ZIP final)
- `lib/dossier/pieces-match.ts` (matching IA pièces RC ↔ biblio)
- `lib/dossier/fiche-metier-match.ts`
- `lib/dossier/reference-fiche-match.ts`
- `lib/dossier/cv-match.ts`
- `lib/dossier/references-table-filter.ts` (filtre Excel par profil de recherche)
- `lib/library/index-item.ts` (indexation IA d'un doc biblio)
- `lib/library/expiry-digest.ts` (cron J-30)

**Dépendances :**
- Anthropic Sonnet 4.6 PDF natif (analyse RC — 0,07 €/AO)
- Anthropic Haiku 4.5 (indexation biblio — 0,02 €/doc)
- fflate (zip + docx) — à remplacer par jszip + docxtemplater
- exceljs (filtre tableau Excel références) — à remplacer par xlsx sheetjs
- pdf-lib + pdf-parse (génération + extraction)

### 4.4 Bibliothèque entreprise

**Tables :** `presentation_library` (matchingKeywords text[], 20 kinds), `library_item_index` (extraction IA)

**Routes UI :**
- `/sourcing/admin/bibliotheque` (page admin avec 20 sections : DC1, DC2, DC4, Pouvoir, Kbis, URSSAF, attestations fiscale/RC/honneur/CA/effectifs, RIB, présentation, moyens humains, références marchés, **tableau Excel références**, **fiches référence A4**, mémoire RSE, **fiches métiers**, **CV intervenants**, autre)

**Server Actions :**
- `admin/bibliotheque/actions.ts` (upload, delete, singleton replacement)
- `admin/bibliotheque/index-actions.ts` (indexation IA Haiku batch)

**Logique d'inclusion auto au ZIP (matching keywords) :**
- `fiche_metier` → `shouldIncludeFicheMetier(matchingKeywords, profilePositives)`
- `reference_fiche` → `shouldIncludeReferenceFiche(...)`
- `cv` → `shouldIncludeCv(...)`
- `references_table` → filtré ligne par ligne via colonne « Mots-clés » du tableau Excel

**Dépendances :**
- Anthropic Haiku 4.5 (indexation)
- Supabase Storage bucket `company_library` (privé, RLS tenant)
- exceljs (tableau filtré) — à migrer xlsx

### 4.5 Annuaire acheteurs

**Tables :** `buyers` (id, organization_id, name, name_normalized UNIQUE par org, address, siret, siren, contact_email, contact_phone, notes)

**Routes UI :**
- `/sourcing/admin/acheteurs` (annuaire + recherche + export CSV)

**Logique :**
- Auto-upsert depuis la saisie de `tender.buyer_address` sur un AO
- `normalizeBuyerName` (NFD + lowercase + compact spaces + trim) pour matching
- COALESCE-based progressive enrichment

### 4.6 Admin organisation

**Tables :** `organization_profiles`, `org_branding`, `shortlist_criteria`, `app_settings`, `message_templates`

**Routes UI :**
- `/sourcing/admin/users`
- `/sourcing/admin/societe` (Présentation société = DC2 AlyoS)
- `/sourcing/admin/shortlist`
- `/sourcing/admin/settings` (branding)
- `/sourcing/admin/modeles-email` (templates Brevo)
- `/sourcing/admin/profil` (édition profil utilisateur courant)
- `/sourcing/admin/crons` (observabilité crons)
- `/sourcing/admin/envois` (historique envois ZIP)
- `/sourcing/admin/tandem-activity`
- `/sourcing/admin/ia-usage`

**Server Actions :**
- `admin/societe/actions.ts`, `admin/shortlist/actions.ts`, `admin/settings/actions.ts`
- `admin/modeles-email/actions.ts`
- `admin/crons/actions.ts` (déclenchement manuel cron)
- `api/admin/users/route.ts` (invitation), `api/admin/users/[id]/regenerate-password/route.ts`

### 4.7 Superadmin éditeur

**Tables :** `support_tickets`, `news_items`, `user_news_reads`, `formations`, `guided_tests`, `roadmap_items`, `pitch_blocks`, `market_study_blocks`, + tout le module `organizations` (création, billing)

**Routes UI :** 12+ pages sous `/sourcing/superadmin/*`

---

## 5. Méthodologie de migration recommandée

### 5.1 Modèle « Strangler Fig » (Martin Fowler)

Plutôt qu'un big-bang risqué :

1. On garde **edifio-sourcing en prod** sur `sourcing.edifio.fr` pendant toute la durée de la migration (3 semaines)
2. On porte progressivement les modules dans le repo `alyos-suivi-chantier` sous une branche `feat/sourcing-merge`
3. On déploie cette branche sur une URL preview Vercel (`sourcing-preview.edifio.fr`)
4. À chaque module porté, on **lance les tests vitest** sur la version migrée → ils doivent rester verts
5. À la fin, on bascule le DNS `sourcing.edifio.fr` du repo Sourcing vers le repo Suivi+ACT en 1 manipulation Vercel
6. On archive le repo `edifio-sourcing` (read-only sur GitHub)

### 5.2 Freeze des features Sourcing pendant la migration

- **Hard freeze** sur `edifio-sourcing.main` : aucune nouvelle feature, uniquement des fixes critiques
- Tous les fixes critiques sont portés à la fois sur `main` et sur `feat/sourcing-merge` (double-commit)
- Steve communique le freeze à l'équipe AlyoS le 2026-06-15

### 5.3 Synchronisation BDD pendant la migration

Pendant les 3 semaines, AlyoS et PROTECT continuent à utiliser sourcing.edifio.fr. La BDD Supabase Sourcing reçoit donc des écritures (nouveaux AO, sélections, dossiers compilés, etc.). À la bascule finale :

**Option A — BDD partagée d'emblée** : Suivi+ACT et Sourcing pointent vers le **même projet Supabase**. Plus simple pour les users multi-modules à terme. Effort : merge des 50 migrations Sourcing dans le projet Suivi+ACT au démarrage, puis double migration pendant le freeze.

**Option B — BDD séparées + script de migration au switch-over** : Sourcing garde sa BDD, on dump-restore vers le projet Suivi+ACT le jour J. Effort : script `pg_dump` + import + UPDATE references. Plus risqué mais découplé.

**🟢 Recommandation : Option A.** Cohérent avec l'archi multi-modules cible et évite un dump-restore irréversible.

### 5.4 Gestion des migrations BDD à la fusion

Sourcing a 50 migrations (0000 à 0049). Suivi+ACT en a 137 (0001 à 0137).

**Plan pragmatique :**
1. **Préfixer toutes les migrations Sourcing** avec un préfixe distinctif : `0001_init.sql` → `0001_sourcing_init.sql`, etc.
2. **Renuméroter à partir de 0138** : Sourcing migrations deviennent `0138_sourcing_init.sql` à `0186_sourcing_trial_billing.sql`
3. **Stripper le 0049_trial_billing** (remplacé par le modèle 0115 existant)
4. **Ajouter une migration `0187_sourcing_trial_alignment.sql`** qui transforme `subscription_status` Sourcing → enum `trial_status` Suivi+ACT
5. **Conserver 12 RLS policies Sourcing** dans `0188_sourcing_rls.sql`
6. **Conserver les seed data** (formations 17 guides, ai_prompts, etc.) dans `0189_sourcing_seed.sql`

### 5.5 Stratégie de tests

- **Tests vitest unitaires** : les 76 fichiers de tests Sourcing sont parfaitement portables (logique pure). Les conserver tels quels après renommage imports.
- **Tests Playwright E2E** : porter progressivement, en parallèle des modules. Les scénarios critiques (login multi-tenant, compile dossier complet) doivent rester verts.
- **Tests pgTAP RLS** : porter les 12 policies + ajouter des tests d'isolation AlyoS ⊥ PROTECT (déjà faits côté Sourcing, à porter intégralement).
- **Smoke tests post-bascule** : checklist manuelle de 30 minutes le jour J (login chaque org, lecture biblio, compile ZIP, envoi mail, paywall trial visible).

---

## 6. Lots de migration détaillés avec estimations

### Lot 0 — Préparation (2 j, équipe Suivi+ACT)

- Audit complet du repo Sourcing par l'équipe receveuse (lecture des 17 guides utilisateurs, des `DECISIONS.md`, des spécifications dans `specs/`).
- Inventaire des collisions de naming potentielles (tables, libs, routes).
- Setup d'une branche `feat/sourcing-merge` sur `alyos-suivi-chantier`.
- Provisionnement d'un environnement preview Vercel.
- Décision sur les 5 points clés du §9.

### Lot 1 — Upgrade Sourcing Next.js 14 → 15 (2-3 j, équipe Sourcing)

- À faire **sur `edifio-sourcing.main` AVANT le merge** pour réduire le delta technique.
- Upgrade Next 14.2 → 15.5 (Server Actions stable API, `cookies()` async, `params` async, etc.)
- Upgrade React 18 → 19 (`useActionState` au lieu de `useFormState`, etc.)
- Mise à jour `@supabase/ssr`
- Test E2E complet sur preview Vercel
- Merge `main`, déploiement prod

### Lot 2 — Schéma BDD + Drizzle → supabase-js (3-5 j, équipe mixte)

- Création d'un projet Supabase unique (ou réutilisation du projet Suivi+ACT)
- Application des migrations Sourcing renumérotées (0138-0189)
- Pour chaque schema Drizzle Sourcing → réécriture en `lib/db/<entity>.ts` style Suivi+ACT
  - 25 entités à porter : `tenders`, `architects`, `bureauxEtudes`, `entreprises`, `buyers`, `searchProfiles`, `presentationLibrary`, `libraryItemIndex`, `responseFiles`, `dossierDispatches`, `tenderEvents`, `tenderBriefs`, `tenderBeCotraitants`, `architectResponses`, `architectCompetences`, `architectSolicitations`, `pastCollabs`, `messageTemplates`, `organizationProfiles`, `orgBranding`, `shortlistCriteria`, `appSettings`, `cronRunLog`, `userNotifications`, `aiPrompts` + `aiRuns`
- Validation : tests pgTAP RLS verts contre la nouvelle structure

### Lot 3 — Modules pures portables (1 j, équipe Sourcing)

Code 100 % réutilisable tel quel (logique pure, pas d'I/O) :
- `lib/dossier/cerfa-prefill.ts`
- `lib/dossier/fiche-metier-match.ts`, `reference-fiche-match.ts`, `cv-match.ts`
- `lib/buyers/upsert-buyer.ts` (juste switch ORM)
- `lib/billing/trial.ts`
- Tests vitest des 4 ci-dessus

### Lot 4 — Modules avec swap de lib (1-2 j, équipe Sourcing)

- `lib/dossier/docx-fill.ts` (fflate + Mustache) → réécriture avec `docxtemplater` (~ 100 lignes au lieu de 220)
- `lib/dossier/cerfa-docx-generator.ts` → adaptation au nouveau moteur
- `lib/dossier/references-table-filter.ts` (exceljs) → réécriture avec `xlsx` sheetjs (~50 lignes au lieu de 200)
- Conservation des 33 balises Mustache documentées (cf. `docs/variables_mustache_dc1_dc2.doc`)

### Lot 5 — Sourcing engine (cron BOAMP + Fly.io) (1-2 j, équipe mixte)

- Portage de `lib/sourcing/orchestrator.ts` et `lib/sourcing/regional-scrapers/*`
- Adaptation au cron pattern Vercel (au lieu de Supabase Realtime trigger)
- Migration du worker Fly.io EU vers la même org Fly (ou maintien dédié — à arbitrer)
- Test : cron `/api/cron/sourcing-run` répond OK avec 5+ AO ingérés

### Lot 6 — IA Anthropic (1 j, équipe Sourcing)

- Portage des 4 prompts (`rc_analysis_full`, `ao_brief`, `library_index`, `pieces_match_boost`)
- Adaptation au wrapper `common/ai/` (retry + audit + ratelimit Upstash)
- Validation : un AO complet (sélection → analyse RC → compile ZIP) coûte ≤ 0,10 €

### Lot 7 — Cotraitance (Tandem) (2-3 j, équipe Sourcing)

- Portage des pages `/archi/[token]`, `/cotraitant/[token]` (pages publiques tokenisées)
- Portage des annuaires architectes, BE, entreprises
- Portage du pipeline Kanban cotraitance
- Adaptation au système d'invitation Brevo du repo cible (templates email)

### Lot 8 — Dossier IA (3-4 j, équipe Sourcing)

- Portage du flow CERFA complet (analyse RC → pré-remplissage → validation → génération `.docx`)
- Portage du matching pièces et de la compile ZIP
- Adaptation aux helpers `common/pdf/` et `common/storage/`
- Test E2E : compile un dossier complet (DC1 + DC2 + RC + pieces + biblio matchante)

### Lot 9 — Bibliothèque entreprise (1-2 j, équipe Sourcing)

- Portage des 20 catégories de documents
- Portage de l'indexation Haiku
- Portage du bandeau d'expiration
- Validation : upload + indexation + matching → bouton "Compile dossier" inclut les bons docs

### Lot 10 — Admin + Superadmin (2-3 j, équipe Sourcing)

- Portage de toutes les pages `/sourcing/admin/*` et `/sourcing/superadmin/*`
- Intégration avec le module `common/auth/` (invitation pure, gestion utilisateurs)
- Adoption du module trial/billing 0115 (au lieu de 0049 jeté)
- Validation : un nouvel utilisateur invité reçoit son mot de passe provisoire et accède à son org

### Lot 11 — Bascule DNS + smoke tests (0.5 j, équipe mixte)

- Configuration `sourcing.edifio.fr` côté Vercel sur le nouveau repo
- Mise à jour `NEXT_PUBLIC_SITE_URL`
- Smoke tests 30 min : login AlyoS, login PROTECT, lecture biblio, compile ZIP, envoi mail, trial banner visible
- Archive du repo `edifio-sourcing` (read-only GitHub)

### Lot 12 — Post-mortem + doc (0.5 j, équipe mixte)

- Documentation des décisions prises pendant la migration (nouveau ADR-015 « Migration Sourcing → monorepo edifio »)
- Mise à jour de `CLAUDE.md` (chemin du projet, structure des modules)
- Communication équipe et clients

**Total agrégé v1 : 18-26 j/h**

### Mise à jour v2 (post-handover Suivi+ACT)

Lots additionnels identifiés après lecture du handover :

| Lot ajouté | Description | Effort |
|---|---|---|
| **Lot 0bis** — Migration région Supabase Frankfurt → Paris (si Q2 = oui) | pg_dump du projet Sourcing + pg_restore vers projet Suivi+ACT Paris + reroute connection strings + downtime 1-3 h | 1-2 j |
| **Lot 4bis** — Harmonisation multi-org `memberships` (si Q4 = N-N) | Refacto du modèle `profiles.organization_id` (1-1) de Suivi+ACT vers table pivot `memberships` (N-N). Ajout d'un sélecteur d'org dans le header AppShell. Cookie de contexte courant | 3-4 j |
| **Lot 5bis** — Sprint 9.E Stripe coordonné (si Q5 = oui) | Câblage Checkout Stripe + webhooks (`/api/webhooks/stripe`) + intégration avec table `contract_summary` existante. Pilotage Sébastien sur backend Stripe, Claude Code sur UI tarifs / paywall / bannière trial | 3-4 j (mutualisé pour les 2 modules) |
| **Lot 7bis** — Introduction Vitest dans le monorepo (si Q7 = oui) | Setup config Vitest + scripts `package.json` + portage des 1 218 tests Sourcing + ajustement CI Vercel (pré-build hook si nécessaire) | 0.5 j |
| **Lot 9bis** — Bench cron BOAMP Vercel vs Fly.io (si Q9 = test) | Création d'un cron Vercel `/api/cron/sourcing-run` avec `@sparticuz/chromium-min` et bench sur 7 jours. Si OK → décommissionnement Fly.io worker | 1 j de dev + 7 j d'observation passive |

**Total agrégé v2 : 22-37 j/h** selon les arbitrages des questions Q1-Q10 — à répartir sur **3 à 4 semaines calendaires** en équipe restreinte (Sébastien + Claude Code + éventuel dev support).

Borne basse (22 j/h) si on minimise les ambitions (BDD séparée Q1=non, on garde Frankfurt Q2=non, pas de multi-org refacto Q4=Sourcing dégrade, Stripe différé Q5=non, pas de Vitest Q7=non).

Borne haute (37 j/h) si on prend tout (BDD partagée Q1=oui, migration Paris Q2=oui, multi-org `memberships` Q4=oui, Sprint 9.E coordonné Q5=oui, Vitest adopté Q7=oui, bench cron Q9=oui).

**🟢 Recommandation Sourcing** : viser le scénario médian à 30 j/h avec les Q2, Q4, Q5, Q7 = oui, et Q1 = arbitrage à voir.

---

## 7. Risques techniques et mitigations

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| **Refonte Drizzle → supabase-js casse silencieusement** | Élevée | Très élevé | Tests vitest portés + tests E2E sur les flows critiques (compile ZIP, login multi-tenant, cotraitance archi) avant chaque merge |
| **Bug RLS lors de la fusion des schémas** (collision de policies, organization_id mal scopé) | Moyenne | Très élevé | Suite pgTAP exhaustive + tests d'isolation forcés (user AlyoS ne voit jamais data PROTECT et vice versa) |
| **Cron `sourcing-run` plante après bascule Fly.io / cron Vercel** | Moyenne | Élevé | Smoke test obligatoire J0 + monitoring 7 jours suivants + plan B = scrap manuel à la demande |
| **Stripe : transition Sourcing trial (0049) → Suivi (0115) perd des dates** | Faible | Moyen | Script de migration explicite + validation : AlyoS toujours active, PROTECT toujours en trial avec bonne date de fin |
| **Régression UX au upgrade Next 15 / React 19** | Moyenne | Moyen | Lot 1 livré sur Sourcing AVANT la migration → 1 semaine de prod test avant le merge |
| **Conflits de naming entre modules** (`organizations.contract_summary` vs `organizations.subscription_status` Sourcing) | Élevée | Faible | Audit Lot 0 + script de fusion documenté |
| **Performance régresse** (Drizzle prepared statements perdus) | Faible | Moyen | Bench avant/après sur 3 requêtes critiques (compile dossier, indexation biblio) |
| **Suivi+ACT freeze nécessaire** pendant Lots 2-5 | Élevée (intentionnelle) | Faible | Concertation calendrier avec l'équipe Suivi+ACT en amont |
| **Coût IA explose pendant les tests** | Faible | Faible | Limite d'env de test (Anthropic dev key avec quota), check ai_runs.cost_usd quotidien |

---

## 8. Stratégie de bascule prod et rollback

### 8.1 Plan de bascule (J0)

**Pré-requis :**
- Tous les lots 1-10 livrés en preview Vercel
- Suite vitest verte (1 200+ tests)
- Smoke tests E2E verts sur preview
- DNS edifio.fr maîtrisé par Steve (registrar accessible)

**Séquence J0 (recommandation : un samedi matin, faible activité AO) :**

1. **08h00** : freeze écritures sur sourcing.edifio.fr (mode read-only via env var + banner UI)
2. **08h15** : dump-restore final de la BDD Sourcing vers BDD Suivi+ACT (si Option B). Si Option A (BDD partagée d'emblée), ce step est nul.
3. **09h00** : bascule DNS Vercel — `sourcing.edifio.fr` pointe vers le projet `alyos-suivi-chantier`
4. **09h05** : propagation DNS (5-30 min selon TTL)
5. **09h30** : smoke tests utilisateur (Steve + un membre PROTECT volontaire)
   - Login AlyoS → voit ses AO sourcés
   - Login PROTECT → voit ses AO sourcés (différents)
   - Compile un dossier test → ZIP téléchargé OK
   - Bibliothèque visible
   - Page billing accessible (superadmin)
6. **10h30** : si OK → décommissionnement du repo Sourcing (déploiement Vercel coupé)
7. **11h00** : communication clients (AlyoS + PROTECT) : « migration réussie, aucune action nécessaire »

### 8.2 Plan de rollback (si J0 plante)

- **Critère de déclenchement** : si à 10h30 un smoke test critique fail (ZIP non généré, login impossible, données absentes)
- **Action** : repointer le DNS `sourcing.edifio.fr` vers l'ancien projet Vercel `edifio-sourcing`
- **Délai de retour à la normale** : 5-30 min (TTL DNS)
- **Sortie de crise** : on retravaille pendant la semaine et on retente le samedi suivant
- **Sécurité supplémentaire** : si Option B (BDD séparées), la BDD Sourcing originale est intacte. Si Option A (BDD partagée), les memberships et organisations Sourcing sont dans la BDD partagée mais les anciennes pages Vercel Sourcing y accèdent toujours → service continue.

### 8.3 Plan de continuité pendant la migration

Pour la période de freeze (~3 semaines) :

- Aucune nouvelle feature Sourcing
- Fixes critiques uniquement (sécurité, bug bloquant)
- Communication AlyoS : « Steve travaille sur l'unification edifio — pas de nouveauté avant le X » (date à fixer)
- PROTECT en trial → la date de fin de trial est figée avant freeze, prolongeable manuellement si nécessaire

---

## 9. Questions à débattre avec l'équipe Suivi+ACT

> Ces 8 questions structurent la **visioconférence de cadrage** à organiser
> **entre Steve, l'équipe Suivi+ACT (Sébastien lead), et Claude Code (sub-agent dev)** la semaine du 8 juin 2026 — durée 90 min.

### Q1 — BDD partagée d'emblée ou séparée jusqu'à J0 ?

🟢 **Recommandation Sourcing** : partagée (Option A) — projet Suivi+ACT Paris devient l'unique référence.
**À débattre** : risque d'introduire des migrations Sourcing dans un projet Supabase déjà chargé (137 migrations + 27 tables `act.*`). L'équipe Suivi+ACT peut préférer isoler avec un schéma dédié `sourcing.*`.

### Q2 — Région Supabase : Paris (cible) ou Frankfurt (source) ?

🟢 **Recommandation Sourcing** : **adopter Paris eu-west-3** (la cible). Frankfurt n'a aucun avantage RGPD vs Paris pour des clients français — c'est juste un héritage Sourcing.
**Coût** : pg_dump/pg_restore du projet Sourcing Frankfurt → Paris, downtime estimé 1-3 h selon volume (à mesurer). À planifier côté SQL Ops.
**À débattre** : si Sébastien préfère garder le projet Suivi+ACT séparé et Sourcing en Frankfurt, on perd la mutualisation BDD (cf. Q1).

### Q3 — Stack ORM cible : on garde supabase-js + `lib/db/<entity>.ts` ou on introduit Drizzle ?

🟢 **Recommandation Sourcing** : adopter le pattern Suivi+ACT (supabase-js + lib/db/). Cohérence du repo, pas de double maintenance. Coût pour Sourcing : 3-5 j de refonte des 25 schemas Drizzle → 25 fichiers `lib/db/<entity>.ts`.
**À débattre** : si l'équipe Suivi+ACT envisage de migrer vers Drizzle à terme (pour bénéficier des types stricts), il vaut mieux le faire au moment de la fusion. Mais ce serait un sprint à part — pas dans la migration.

### Q4 — Modèle multi-org : harmoniser sur N-N `memberships` (Sourcing) ou rester 1-1 user/org (Suivi+ACT) ?

🟢 **Recommandation Sourcing** : **adopter le pattern N-N `memberships`** dans tout le monorepo. Justification : c'est l'avenir SaaS (un cabinet peut avoir Suivi + ACT + Sourcing actifs sous le même user). Sourcing l'a déjà implémenté avec 12 RLS pgTAP validées.
**Coût** : refacto léger de Suivi+ACT pour passer de `profiles.organization_id` (1-1) à un sélecteur d'org en header + cookie de contexte. Le handover §10.3 estime ce sprint à ~3-4 h.
**Alternative** : Sourcing dégrade vers 1-1, perte de la fonctionnalité multi-org (impact : `sebastien@edifio.fr` ne peut plus être superadmin AlyoS ET PROTECT sans 2 comptes séparés).

### Q5 — Stripe : co-développer le Sprint 9.E pendant la migration Sourcing ?

🟢 **Recommandation Sourcing** : **OUI** — coordonner le Sprint 9.E (Stripe Checkout + webhooks) avec la migration Sourcing. Les schémas BDD Suivi+ACT (`organizations.contract_summary`, `trial_status`, crons `relance-trial` / `purge-trial-expired`) sont prêts mais le câblage HTTP Stripe est en attente. Sourcing apporte un MVP 0049 jetable + le flow design `/pricing` + `/trial-expired` (réutilisables UX).
**À débattre** : qui pilote Sprint 9.E ? Suggestion : Sébastien sur webhooks Stripe + customer creation, Claude Code sur l'UI tarifs + paywall + bannière trial.

### Q6 — Stratégie billing produit : Sourcing autonome ou pack groupé edifio Suite ?

🟢 **Recommandation Sourcing** : **pack groupé** — un client peut souscrire à Suivi (14,99 €/utilisateur), à ACT (crédits 99-249 €/mois), et/ou à Sourcing (à arbitrer). Pack « Suite edifio » avec remise possible.
**Grille tarifaire Suivi+ACT existante** :
- Suivi : 14,99 €/mois HT par utilisateur, sans engagement, 3 mois offerts jusqu'au 31/12/2026
- ACT : 99 € (2 crédits) / 149 € (4 crédits) / 249 € (8 crédits) / 39 € à l'unité — 1 crédit = 1 analyse 16 lots × 5 entreprises
**Sourcing actuel (MVP 5 juin)** : pack Solo 99 €/mois HT, trial 30j, 100 AO/mois inclus
**À débattre** : tarification Sourcing à confirmer (par profil de recherche actif ? par utilisateur ? flat ? pack 99 €/199 €/399 € comme évoqué dans le brief global).

### Q7 — Tests Vitest : on introduit dans Suivi+ACT pendant la migration ?

🟢 **Recommandation Sourcing** : **OUI**, introduire Vitest comme test framework standard du monorepo. Justification : Sourcing a 1 218 tests verts qui couvrent toute la logique pure (matching keywords, computeTrialState, normalizeBuyerName, fiche-metier-match, etc.). Les jeter serait un gâchis. Coût de setup côté monorepo : ~2 h (config vitest + vitest.config + scripts package.json).
**À débattre** : Sébastien préfère peut-être garder Playwright E2E comme test framework unique pour limiter la maintenance. Compromis : on garde Vitest pour les libs pures (`lib/*`, `modules/common/*` non-React) + Playwright pour les flows end-to-end.

### Q8 — Workflow migrations BDD : manuel (Studio) ou automatisé (script `tsx db/migrate.ts`) ?

🟢 **Recommandation Sourcing** : adopter le workflow Sourcing automatisé (`tsx src/db/migrate.ts` qui applique les migrations en transaction et tient un journal `__drizzle_migrations`). Plus sûr, plus rapide, traçable. Sébastien garde la main pour les migrations sensibles (DDL) en mode "lancer le script avec PG* posés dans sa session" comme actuel.
**À débattre** : Sébastien a un workflow Studio bien rodé (cf. handover §11.2) et préfère peut-être garder la main pour des raisons RGPD/audit. Compromis : automation en dev/staging, manuel en prod.

### Q9 — Cron sourcing 6h30 : on garde Fly.io worker ou on bascule sur cron Vercel + serverless Playwright ?

🟢 **Recommandation Sourcing** : tester `@sparticuz/chromium-min` en cron Vercel (déjà présent dans les dépendances Suivi+ACT). Économie Fly.io ~10 €/mois. Suivi+ACT a déjà 4 crons Vercel actifs (`rappels`, `changelog-draft`, `relance-trial`, `purge-trial-expired`) → le cron `sourcing-run` rejoint la liste.
**À débattre** : la complexité des scrapers régionaux (6 plateformes Playwright) peut nécessiter un environnement plus persistant que la Vercel Function (limite 60 s timeout, 1 GB RAM). Bench à faire avant arbitrage.

### Q10 — Calendrier de bascule : juillet, août, ou septembre ?

🟢 **Recommandation Sourcing** : **3ᵉ samedi de juillet 2026** (~ 18 juillet). Saison creuse AO publics, mais pas en plein cœur d'été. Tests possibles avant les vacances.
**À débattre** : calendrier vacances de l'équipe Suivi+ACT, calendrier des clients AlyoS / PROTECT / cabinets pilotes ACT, calendrier de release de nouvelles features Suivi+ACT (notamment le Sprint 9.E Stripe).

---

## 10. Annexes

### 10.1 Variables d'environnement Sourcing (à porter)

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=         # storage admin + auth admin

# BDD (Drizzle migrate)
DATABASE_URL=                       # postgres://... avec password URI-encoded

# Auth
RESET_PASSWORD_REDIRECT_URL=https://sourcing.edifio.fr/reset-password
COOKIE_DOMAIN=                      # .edifio.fr en prod (SSO multi-modules)

# Site / SEO
NEXT_PUBLIC_SITE_URL=https://sourcing.edifio.fr

# IA
ANTHROPIC_API_KEY=

# Brevo (emails utilisateurs : cotraitance, dossier envoyé)
BREVO_API_KEY=
BREVO_SENDER_EMAIL=
BREVO_SENDER_NAME="edifio Sourcing"

# Resend (emails admin : mot de passe provisoire, alertes cron)
RESEND_API_KEY=
RESEND_SENDER_EMAIL=

# Sourcing tiers
BOAMP_API_BASE=https://boamp-datadila.opendatasoft.com
OPENDATASOFT_API_BASE=
PAPPERS_API_KEY=                    # enrichissement société (mode dégradé si absent)

# Cron sécurité
CRON_SECRET=                        # protège /api/cron/* via Bearer

# Fly.io worker (scrap plateformes régionales)
FLY_PLAYWRIGHT_WORKER_URL=
FLY_PLAYWRIGHT_WORKER_TOKEN=

# Stripe (minimal MVP Sourcing — à jeter post-migration)
# (À remplacer par les variables Stripe du module common Suivi+ACT)
```

### 10.2 Buckets Supabase Storage Sourcing

| Bucket | Privé/Public | RLS scope | Contenu |
|---|---|---|---|
| `company_library` | Privé | `{orgId}/{kind}/{ts}_{filename}` | Documents bibliothèque entreprise (Kbis, DC1/DC2 templates, fiches métiers, CV, références, tableau Excel, etc.) |
| `response_files` | Privé | `{orgId}/{tenderId}/...` | CERFA générés (DC1, DC2 multi-archi/BE) + ZIP dossier compilé |
| `tender_documents` | Privé | `{orgId}/{tenderId}/...` | RC et DCE des AO (uploadés ou téléchargés depuis le source) |
| `app-assets` | Public read | `{orgId}/...` | Logos organisation custom |

À fusionner ou réutiliser tels quels selon la politique du module `common/storage/`.

### 10.3 Providers tiers actifs

| Provider | Usage | Coût mensuel actuel (audit 5 juin) | Critique ? |
|---|---|---|---|
| **Supabase Pro EU Frankfurt** | BDD + Auth + Storage + Realtime + Edge | 25 € | 🔴 Critique |
| **Vercel Pro EU** | Hébergement Next.js | 20 € | 🔴 Critique |
| **Anthropic API** | Claude Sonnet 4.6 + Haiku 4.5 | **0,14 €** (audit semaine 29 mai – 5 juin) | 🔴 Critique |
| **Brevo** | Emails utilisateurs (cotraitance, dossier) | 25 € | 🟠 Élevé |
| **Resend** | Emails admin (mot de passe provisoire, alertes) | 0-20 € | 🟠 Élevé |
| **Fly.io worker EU** | Playwright scrap plateformes régionales | 10-15 € | 🟡 Moyen (BOAMP officiel suffit en plan B) |
| **Pappers API** | Enrichissement Sirene/SIRET | (consommation à la demande) | 🟢 Optionnel |
| **Stripe** | Facturation | 0 € (commission 1,4 % + 0,25 €/transaction CB EU) | 🔴 Critique (à activer post-migration) |
| **Upstash Redis (Suivi+ACT)** | Cache + ratelimit | (à porter sur usage Sourcing) | 🟡 Moyen |

**Total infra mensuelle Sourcing audit du 5 juin** : ~86-121 €/mois pour AlyoS + PROTECT en MVP. Voir le brief global `docs/brief_global_edifio_sourcing.md` pour la projection V2 SaaS (940-1 960 €/mois à 50 organisations).

### 10.4 Décisions documentées dans le repo Sourcing

- `CLAUDE.md` — instructions projet
- `DECISIONS.md` — log chronologique de toutes les décisions techniques
- `specs/adr_011_*` à `specs/adr_014_*` — ADR formalisés
- `specs/` — 30+ specs fonctionnelles validées par le Board
- `gates/` — documents PDF de gate Board (Phase 0 à Gate 7)
- `notes-de-suivi/` — comptes-rendus de réunion Cowork
- `handoff/` — demandes/réponses Cowork

### 10.5 Documentation utilisateur (`formations` table)

17 guides intégrés dans l'app sous `/sourcing/formation/[slug]` :

1. Prendre en main edifio Sourcing en 10 minutes
2. Traiter sa file « AO du jour »
3. Répondre en cotraitance avec un architecte
4. Gérer les contacts et le coffre documentaire BET
5. Choisir ton mode de réponse à un AO
6. *(autres — liste complète à extraire de `seed-formations.ts`)*
14. Debug sourcing
15. Fiches métiers : utiliser le matching auto
16. Références : matching auto via tableau Excel + fiches A4
17. CV : sélection auto des intervenants par mots-clés

À porter telles quelles (markdown rendu HTML, pur contenu).

### 10.6 Documents transmissibles à l'équipe Suivi+ACT

- `docs/brief_global_edifio_sourcing.md` — brief produit + technique + financier (~18 pages)
- `docs/brief_migration_sourcing_to_monorepo.md` — ce document (~25 pages)
- `docs/variables_mustache_dc1_dc2.doc` — 33 balises Mustache des CERFA
- `docs/DEPLOY.md` — procédure de déploiement actuelle
- `specs/adr_013_orm_drizzle.md` — décision ORM (à reconsidérer)
- `specs/adr_014_levee_filtre_middleware.md` — décision multi-tenant
- L'arbre `src/` complet (consultable via GitHub)

### 10.7 Entité juridique éditrice (mise à jour 7 juin)

**SAS edifio**
- SIREN 105 534 515
- RCS Marseille
- Immatriculation 01/06/2026
- Siège : 5 av. Verlaque, 13009 Marseille
- Capital 5 000 €

→ Toutes les **factures Stripe et pages légales** (mentions légales, CGU, politique de confidentialité) doivent **strictement correspondre au Kbis SAS edifio** — pas AlyoS Ingénierie qui reste l'entité d'opération produit / R&D.

### 10.8 Garde-fous Suivi+ACT à respecter dans le code Sourcing migré

> Issus du handover Suivi+ACT §4 (« 8 commandements »). Non négociables sans approbation explicite Sébastien.

1. **Branche `prod-suivi` figée** — pas de touche au code Suivi (`/chantier/*`, `/admin/*`, `/cr/*`) sans concertation.
2. **Feature flag `organizations.modules_actifs`** (JSONB) — middleware filtre l'accès par module. Sourcing devra ajouter `'sourcing'` à la liste. Sans flag, redirect vers `/module-non-active`.
3. **ESLint `import/no-restricted-paths`** — empêche `modules/act/*` d'importer depuis `modules/suivi/*` et inversement. Sourcing devra respecter ces restrictions.
4. **E2E Playwright cloisonné Suivi** — 5 routes critiques sous tests (`/login`, `/chantier/[dossier]`, `/chantier/[dossier]/cr`, `/diffusion`, `/admin/users`). À faire tourner avant tout merge qui touche au code partagé.
5. **README à jour** — chaque nouveau module/feature doit mettre à jour `docs/DELIVERY_ACT.md` §99 + le RUNBOOK.
6. **VS Code multi-root** — Sébastien utilise un workspace multi-root pour cloisonner mentalement Suivi vs ACT. Sourcing s'y ajoute.
7. **Naming clair** — préfixer les nouvelles tables `sourcing.xxx` (schéma dédié). Préfixer les Server Actions par leur domaine (`createTenderAction`, `compileDossierAction`).
8. **Git hors OneDrive** — repo à `C:\Dev\alyos-suivi-chantier` (jamais dans OneDrive — risque de fichiers tronqués + lock `.git`).

### 10.9 Bugs et workarounds connus du repo cible (handover §13)

Sourcing devra éviter ces écueils dans le code porté :

- **Modal focus loss** — pattern ref obligatoire dans `components/Modal.tsx`
- **PostgREST relation array** — supabase-js v2 retourne `project` en array même pour relation many-to-one
- **React-PDF typage `renderToBuffer`** — cast explicite `as unknown as React.ReactElement<DocumentProps>`
- **SheetJS vs openpyxl** — formules avancées perdues. Pour le `references-table-filter.ts` de Sourcing, faire un test sur 5-10 tableaux clients pour valider
- **docxtemplater Word split runs** — taper d'un seul jet puis appliquer la mise en forme
- **`.gitignore` patterns ancrés** — toujours `/DOSSIER/` avec slash initial
- **Index partiel Postgres** — `now()` interdit dans le `WHERE` (check côté code)

### 10.10 Terminologie BTP commune (handover §14)

- **RC** = ambigu : peut être Règlement de Consultation (Sourcing) OU Réunion de Chantier (Suivi). Préciser systématiquement le contexte
- **MOA** = Maître d'Ouvrage
- **MOE** = Maître d'Œuvre
- **BET** = Bureau d'Études Techniques (= « BE » Sourcing — harmoniser ?)
- **DPGF** = Décomposition du Prix Global et Forfaitaire (ACT)
- **DCE** = Dossier de Consultation des Entreprises
- **CCTP** = Cahier des Clauses Techniques Particulières
- **DLRO** = Date Limite de Remise des Offres
- **PV** = Procès-Verbal (réception)

### 10.11 Sous-domaines edifio à organiser (post-migration)

| Sous-domaine | Module | Statut |
|---|---|---|
| `suivi.edifio.fr` | Suivi | ✅ en prod |
| `act.edifio.fr` | ACT (rewrite middleware vers `/act/*`) | ✅ en prod |
| `sourcing.edifio.fr` | Sourcing | ✅ en prod (repo Sourcing actuel) — à basculer vers monorepo |
| `edifio.fr` | Vitrine commerciale | ✅ en prod (Vercel séparé) |
| **À arbitrer** | `app.edifio.fr` unique avec router host-based pour tous les modules ? | Décision Q10b |

---

## 11. Contact

**Steve TEISSIER**
Dirigeant / CTO de fait — AlyoS Ingénierie
Email : `steissier@alyosingenierie.fr`
Superadmin éditeur edifio : `sebastien@edifio.fr` (depuis 2026-06-05)

---

*Document v1 — 7 juin 2026. Brouillon à challenger conjointement par l'équipe edifio Sourcing et l'équipe Suivi+ACT avant verrouillage du plan définitif. À mettre à jour à chaque jalon de la migration.*
