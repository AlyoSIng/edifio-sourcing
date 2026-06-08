# HANDOFF — Migration `edifio-sourcing` → monorepo `alyos-suivi-chantier`

> **Dossier de référence unique** pour le kickoff Sébastien (lead Suivi+ACT) — 1er juillet 2026.
> **Auteurs** : équipe Sourcing (Steve TEISSIER + sub-agents Claude Code).
> **Date** : 2026-06-08.
> **Statut** : v1 — exhaustif. Lecture obligatoire avant kickoff.
> **Cible bascule DNS** : samedi 18 juillet 2026 8h-11h.

---

## Sommaire

1. [État actuel post-Lot 1 / 1.5](#1-état-actuel-post-lot-1--15)
2. [Catalogue exhaustif des modules à porter](#2-catalogue-exhaustif-des-modules-à-porter)
3. [Dettes connues à porter](#3-dettes-connues-à-porter)
4. [Décisions Q1-Q10 visio cadrage 2026-06-07](#4-décisions-q1-q10-visio-cadrage-2026-06-07)
5. [Tests et qualité](#5-tests-et-qualité)
6. [Sub-agents équipe Sourcing](#6-sub-agents-équipe-sourcing) *(à venir commit 2)*
7. [Comptes externes / providers tiers](#7-comptes-externes--providers-tiers) *(à venir commit 2)*
8. [Risques migration](#8-risques-migration) *(à venir commit 2)*
9. [Procédure de bascule J0](#9-procédure-de-bascule-j0) *(à venir commit 2)*
10. [Annexes](#10-annexes) *(à venir commit 2)*

---

## 1. État actuel post-Lot 1 / 1.5

> **Lecture express** : Sourcing est **prêt code-wise** pour le portage. Versions alignées sur le monorepo, refactor async terminé, scripts ops livrés.

### 1.1 Versions stack

| Composant | Avant | Après Lot 1 (main 8106245) | Cible monorepo |
|---|---|---|---|
| Next.js | 14.2.35 | **15.5.18** | 15.5 |
| React | 18.3.1 | **19.0.0** | 19 |
| @types/react | 18.x | **19.2.17** | 19 |
| TypeScript | 5.x | **5.9.3** | aligné |
| @supabase/ssr | 0.5 | **0.10.3** | 0.10 |
| @supabase/supabase-js | 2.x | **2.105.4** | aligné |
| eslint-config-next | 14.x | **15.5.19** | aligné |
| @playwright/test | 1.49 | **1.59.1** | aligné |
| Vitest | (existant) | **4.1.5** | à introduire (cf. Q7) |
| Node | 22.13 | **22.13** | aligné |
| pnpm | 11.0 | **11.0.9** | aligné |

### 1.2 Pattern `createSupabaseServerClient` async (PR #116, Lot 1.5)

Le helper `src/lib/supabase/server.ts` est désormais **async** (cookies Next 15 retournent une Promise). Tous les call sites ont été audités :

- **157 occurrences `await createSupabaseServerClient()` sur 105 fichiers** — propagation 100% effective.
- Signature : `export async function createSupabaseServerClient()` (ligne 21).
- `await cookies()` ligne 22, pattern `getAll/setAll` `@supabase/ssr` v0.10 standard.
- `createSupabaseAdminClient` (service_role, cookies no-op) **reste sync** — correct, pas besoin de cookies.
- Helper `requireEnv` interne avec throw explicite si ENV manquantes.
- Override `COOKIE_DOMAIN` lignes 38-43 (SSO multi-modules — cf. dette §3.2).

**Match pattern monorepo (review suivi_act_reviewer PR #116)** :

| Aspect | Sourcing | Monorepo cible | Action Lot 2 |
|---|---|---|---|
| Signature | `createSupabaseServerClient()` | `createClient()` | Rename (sed sur 157 sites) |
| `await cookies()` | ✅ | ✅ | aligné |
| getAll/setAll | ✅ | ✅ | aligné |
| `COOKIE_DOMAIN` | dans `server.ts` | dans `middleware.ts` | arbitrage Sébastien |
| `requireEnv` | throw robuste | `!` non-null | porter helper Sourcing dans le monorepo |

### 1.3 Fix B5 — HTML `<a>` → Next `<Link>` (PR #115, Lot 1)

12 sites de navigation interne convertis de `<a href="/...">` à `<Link href="/...">` pour passer le pattern Next 15 strict. Aucun lien externe touché. Cf. commit `76935b0` (codemod next-async-request-api + fix html links).

### 1.4 PR mergées + scripts ops

| PR | Titre | Statut | Branche source |
|---|---|---|---|
| #115 | Lot 1 — upgrade Next 14.2 → 15.5 / React 18 → 19 | Mergée 2026-06-08 | `chore/upgrade-next15-react19` |
| #116 | Lot 1.5 — refactor `createSupabaseServerClient` async | Mergée 2026-06-08 | `chore/supabase-client-async` |
| #117 | Scripts ops backup db + vercel env + storage | Mergée 2026-06-08 | `ops/migration-scripts-clean` |
| #118 (en cours) | Suppression import UnsafeUnwrappedCookies inutilisé | À merger | `chore/supabase-client-async-v2` |

**Scripts ops disponibles** dans `scripts/migration/` (cf. `scripts/migration/README.md` 152 lignes) :

- `backup-sourcing-db.ps1` — pg_dump Sourcing Frankfurt (refus PGPORT=6543 + PGUSER `postgres.*` pour éviter PgBouncer)
- `backup-suiviact-db.ps1` — pg_dump Suivi+ACT Paris (mêmes garde-fous)
- `export-vercel-env.ps1` — `vercel env pull` preview + production
- `backup-supabase-storage.ps1` — backup tous buckets via API REST (SERVICE_ROLE_KEY obligatoire)

Posture : safe-by-default, refus si ENV manquantes, `backups/` dans `.gitignore` (ligne 67). Tous lancés par Steve dans SA session PowerShell (cf. MEMORY > `feedback_ops_prod_user_runs_migration.md`).

### 1.5 Ce qui n'a PAS encore été migré

- **Drizzle reste en place** côté Sourcing — `drizzle-orm@0.39.3` + `drizzle-kit@0.30.6` + `postgres@3.4.9`. 25 fichiers schema TS dans `src/db/schema/`, 50 migrations SQL dans `src/db/migrations/` (`0000_init.sql` à `0049_trial_billing.sql`).
- **`lib/db/<entity>.ts` pattern** monorepo non adopté — c'est précisément le périmètre du **Lot 2 monorepo** (réécriture des 25 schemas Drizzle en 25 loaders supabase-js).
- **`useFormState` → `useActionState`** : ProfileForm.tsx contient encore un commentaire JSDoc résiduel mentionnant le hook, mais 0 import / 0 call (cf. recette QA S4 OK).
- **Stripe full ecosystem** — Sourcing tourne sur le MVP minimal Option C (migration 0049). À jeter au profit du modèle 0115 monorepo (cf. §4 Q6 B-en-2-temps).
- **Tests E2E Playwright en CI** — les 8 specs `e2e/*.spec.ts` ne sont validables qu'en CI avec `E2E_TEST_ROUTES_ENABLED=1`. Non bloquant Lot 1, à câbler en GH Actions Lot 6bis.
- **Cron `sourcing-run` chromium-min** — POC `spike/cron-vercel-chromium` à livrer avant 25 juin 2026, résultat conditionne Q4 (Vercel vs Fly.io).
- **Sub-agents `suivi_act_reviewer`** installé côté Sourcing (cf. `.claude/agents/suivi_act_reviewer.md`) pour valider chaque PR portable avant soumission Sébastien.

---

## 2. Catalogue exhaustif des modules à porter

> Réf. complète : `docs/CATALOG_SCHEMAS_DRIZZLE_TO_MONOREPO.md` (Lot 0a, validé Sébastien 7 juin). Ce qui suit en est l'enveloppe agrégée avec **effort estimé**, **dépendances** et **risques**.

### 2.1 Vue d'ensemble

- **41 tables physiques** réparties sur 25 fichiers schema Drizzle (`src/db/schema/`)
- **31 tables → schema `sourcing.*`** (à créer monorepo)
- **4 tables → schema `public.*`** (existantes monorepo, à étendre ou arbitrer)
- **9 tables superadmin** → scénario C hybride (3 fusionnées, 6 cloisonnées) — cf. §4.6
- **12 enums Postgres** à créer en `sourcing.*` (sauf `membership_role` à harmoniser avec `public.role` monorepo, et `partnership_status` obsolète à dropper)
- **~40 policies RLS** (27 tenant_isolation + ~13 restrictives admin) à reproduire en SQL natif
- **Triggers** : `reject_audit_mutation()` (audit IMMUTABLE INSERT-only) + `touch_updated_at()` sur 8 tables
- **Helpers SQL** : `current_organization_id()` + `current_user_role()` à harmoniser avec helpers monorepo

### 2.2 Tables par module fonctionnel — effort / dépendances / risques

#### Module A — Veille AO (Sourcing engine)

| Table | Effort port loader | Dépendances | Risques |
|---|---|---|---|
| `sourcing.tenders` | M (3-4 h) | `platforms`, `search_profiles`, `organizations` | Index GIN trigram `title`, partiel `score DESC WHERE status='sourced'` à reposer. UNIQUE `(org, external_ref, platform_id)` critique pour idempotence cron 6h30. |
| `sourcing.tender_lots` | S (1 h) | `tenders` | RLS via EXISTS sur `tenders.organization_id` (pas de col `organization_id` directe). |
| `sourcing.tender_documents` | S (1 h) | `tenders`, Storage `tender_documents` | RLS direct `organization_id`. |
| `sourcing.tender_events` | S (1 h) | `tenders` | `event_type` text libre, `data` JSONB. |
| `sourcing.tender_briefs` | S (1 h) | `tenders`, `ai_runs` | 1 brief actif par AO via `is_active`. |
| `sourcing.search_profiles` | M (2 h) | `organizations` | `keywords` JSONB + `cpv_codes/geo_zones/market_types` text[]. Index partiel `is_default`. |
| `sourcing.platforms` | XS (30 min) | aucune | Référentiel 5 lignes (boamp/place/francmarches/mp_info/prive). Seed init. |
| `sourcing.platform_credentials` | S (1 h) | `organizations`, `platforms` | PK composite, `credentials_vault_ref` (jamais en clair). |
| `sourcing.cron_run_log` | S (1 h) | `organizations` (nullable, org-agnostique en pratique) | RLS service_role only (pas de policy authenticated). |

**Effort sous-total Module A** : ~13 h (1.5 j focus).
**Risques globaux** : (1) idempotence cron BOAMP via UNIQUE 3-tuple — ne pas casser. (2) Partial index `idx_tenders_deferred_until` à reposer mais prédicat IMMUTABLE (cf. JSDoc enums.ts — `now()` STABLE casse partiel).

#### Module B — Cotraitance Tandem

| Table | Effort port loader | Dépendances | Risques |
|---|---|---|---|
| `sourcing.architects` | L (4-6 h) | `organizations`, `architect_specialties` | 33 colonnes y compris DC1 (`address_line1/2`, `signature_city`, `legal_representative_*`, `legal_form`), `tutoiement BOOLEAN NOT NULL DEFAULT FALSE` (Gate 4), `solicitable` GENERATED `(email IS NOT NULL)`. Index GIN spécialités + géo + partiel `solicitable=TRUE AND active=TRUE`. |
| `sourcing.architect_specialties` | XS (30 min) | aucune | Référentiel 7 lignes UNIQUE `code`. |
| `sourcing.bureaux_etudes` | L (4-5 h) | `organizations` | Calqué sur `architects` + DC2 complet. RLS via mig. 0018 (4 policies). |
| `sourcing.companies` | M (2-3 h) | `organizations` | Entreprises BTP (CR/TCE/majors). **RLS non lue dans 4 mig RLS — à confirmer/écrire.** |
| `sourcing.selections` | S (1 h) | `tenders` | UNIQUE sur `tender_id`. `mode` enum (solo/tandem/conception_realisation). |
| `sourcing.match_proposals` | M (2 h) | `tenders`, `architects` | UNIQUE `(tender_id, architect_id)` + `score` + `rank` + `rationale` IA. |
| `sourcing.architect_tokens` | M (2 h) | `architects` | JWT révocables. `jwt_id` UNIQUE. Index partiel `revoked=FALSE`. **Logique JWT signing à porter (`lib/tandem/jwt.ts`)**. |
| `sourcing.architect_responses` | M (2 h) | `tenders`, `architects`, `architect_tokens` | `followup_sent_at` (cron J+3 idempotent). UNIQUE `(tender_id, architect_id)`. |
| `sourcing.architect_opposition_tokens` | M (2 h) | `architects` | RGPD art.21 — page publique `/archi/oppose/[token]`. Single-use `used_at`. Logique JWT `lib/tandem/opposition-jwt.ts`. |
| `sourcing.cotraitants` | M (2 h) | `organizations` | Annuaire global réutilisable. Admin restrictives mig. 0018. |
| `sourcing.tender_cotraitants` | S (1 h) | `tenders`, `cotraitants` | UNIQUE `(tender_id)` (1 cotraitant max par AO MVP). |
| `sourcing.cotraitant_documents` | S (1 h) | `cotraitants` | `kind` text contrôlé applicativement (7 valeurs). |
| `sourcing.cotraitant_shares` + `cotraitant_share_items` | M (3 h) | `cotraitants`, `presentation_library`, `architects` | Tokens publics partage. **RLS non lue dans 4 mig RLS — à confirmer/écrire.** |
| `sourcing.tender_be_cotraitants` | S (1 h) | `tenders`, `bureaux_etudes` | UNIQUE `(tender_id, be_id)`. |
| `sourcing.be_documents` | M (2 h) | `bureaux_etudes` | Bucket Storage `be-docs`. 12 kinds. |

**Effort sous-total Module B** : ~32 h (4 j focus).
**Risques globaux** : (1) JWT signing/verification logic (3 modules : architect_tokens, opposition, cotraitant_shares) — bugs subtils si secret ou algo divergent. (2) RLS manquantes à écrire pour `companies`, `cotraitant_shares`, `shortlist_criteria` (cf. §2.6 catalogue Drizzle §8.6). (3) Multi-archi Tandem multi-FK `response_files.{architect_id, be_id}` — partial indexes à respecter.

#### Module C — Dossier IA + CERFA

| Table | Effort port loader | Dépendances | Risques |
|---|---|---|---|
| `sourcing.response_files` | M (2 h) | `tenders`, `architects`, `bureaux_etudes` | Multi-archi DC1 (mig. 0036) + cotraitant BE DC2 (3 index partiels). |
| `sourcing.dossier_dispatches` | M (2 h) | `tenders`, `architects` | Envoi ZIP signed URL 7j. Soft cancel `cancelled_at` mig. 0044. |
| `sourcing.organization_profiles` | M (2 h) | `organizations` | 1 ligne par org. DC2 complet (mig. 0034/0040). Admin restrictives mig. 0009. |
| `sourcing.message_templates` | M (2 h) | `organizations` | 11 templates par org (7 Brevo + 4 Resend). UNIQUE `(org, key)`, `version` int. Admin restrictives mig. 0009. |

**Code applicatif Lot 3+4 du module C** (cf. CR visio §5 calendrier) :

- `lib/dossier/cerfa-prefill.ts` (logique pure portable telle quelle)
- `lib/dossier/cerfa-docx-generator.ts` + `docx-fill.ts` — **fflate + Mustache custom → docxtemplater** (réécriture ~100 lignes au lieu de 220)
- `lib/dossier/cerfa-pdf.ts` (génération PDF voie ancienne, à conserver fallback)
- `lib/dossier/zip-compile.ts` (assemblage ZIP final)
- `lib/dossier/pieces-match.ts` + `fiche-metier-match.ts` + `reference-fiche-match.ts` + `cv-match.ts` (logique pure portable)
- `lib/dossier/references-table-filter.ts` — **exceljs → xlsx sheetjs** (~50 lignes au lieu de 200)
- **33 balises Mustache** documentées `docs/variables_mustache_dc1_dc2.doc` à conserver à l'identique

**Effort sous-total Module C** : 8 h (BDD) + ~16 h (réécriture libs Lot 3/4) = ~24 h (3 j focus).
**Risques** : (1) swap fflate+Mustache → docxtemplater peut casser des balises edge-case (champs vides, conditions Mustache). (2) Swap exceljs → xlsx peut perdre formatage cellule du tableau de références. **Tests Vitest sur ces libs sont protecteurs — à porter en priorité Lot 6bis.**

#### Module D — Bibliothèque entreprise

| Table | Effort port loader | Dépendances | Risques |
|---|---|---|---|
| `sourcing.presentation_library` | M (2-3 h) | `organizations`, Storage `company_library` | 20 kinds dont 4 avec matching IA. `matching_keywords` text[] (mig. 0047). `valid_until` alertes expiry J-30/J-7/J-1. |
| `sourcing.library_item_index` | M (2 h) | `presentation_library`, `ai_runs` | UNIQUE sur `library_item_id`. `extracted_entities` JSONB. `source_hash` SHA-256 détection re-upload. |

**Code applicatif** : `lib/library/index-item.ts` (indexation Haiku 4.5), `lib/library/expiry-digest.ts` (cron J-30), `lib/library/expiry.ts` (logique pure).

**Effort sous-total Module D** : ~6 h.
**Risques** : (1) Haiku 4.5 calls — ajouter `logAiUsage` obligatoire au passage (cf. Lot 6 calendrier). (2) Bucket Storage path convention `{orgId}/{kind}/{ts}_{filename}` à conserver.

#### Module E — Annuaire acheteurs

| Table | Effort port loader | Dépendances | Risques |
|---|---|---|---|
| `sourcing.buyers` | M (2 h) | `organizations` | UNIQUE `(org, name_normalized)`. Fonction TS `normalizeBuyerName` exportée (lowercase + NFD sans accents). |

**Effort sous-total Module E** : ~2 h.
**Risques** : Auto-upsert progressif via COALESCE sur saisie `tender.buyer_address` à conserver. Tests vitest existants (`src/db/schema/buyers.test.ts`).

#### Module F — IA + Audit

| Table | Effort port loader | Dépendances | Risques |
|---|---|---|---|
| `sourcing.ai_prompts` | S (1 h) | aucune (global) | Prompts versionnés (Gate 5 strict). UNIQUE `(name, version)`. Index partiel `active`. **Seed `0042_seed_library_index_prompt.sql` à porter.** |
| `sourcing.ai_runs` | M (2 h) | `ai_prompts`, `tenders` | Traçabilité Anthropic. `input_hash` SHA-256 (cache). `output` JSONB. **PAS de cascade FK→ai_prompts** (traçabilité). |
| `sourcing.audit_logs` | L (3-4 h) | `organizations` | IMMUTABLE INSERT-only (triggers `reject_audit_mutation`). Policy admin restrictive. `action` enum **22 valeurs** (ordre important — cf. JSDoc enums.ts). **Collision probable avec `public.audit_log` monorepo — arbitrer cloisonnement vs fusion.** |
| `sourcing.learning_events` | S (1 h) | `organizations` | Signaux apprentissage scoring (`selected/rejected`). |

**Effort sous-total Module F** : ~7 h.
**Risques** : (1) **Triggers `reject_audit_mutation` IMMUTABLE — à reposer en SQL natif intégralement, sinon UPDATE/DELETE possible sur prod = perte garantie 5 ans.** (2) Collision `audit_logs` vs `audit_log` (cf. brief §3 — décision Sébastien Lot 2). (3) Anthropic SDK 0.98 (Sourcing) vs 0.32 (monorepo) — bump SDK côté Suivi+ACT (cf. brief §3.1).

#### Module G — Intégrations (Odoo + Brevo + Notifications)

| Table | Effort port loader | Dépendances | Risques |
|---|---|---|---|
| `sourcing.odoo_opportunities` | M (2 h) | `tenders`, `architects` | CHECK `origin IN ('solo','tandem')`. 2 index partiels UNIQUE (`uniq_opp_solo` + `uniq_opp_tandem`). `last_error` traçabilité XML-RPC. |
| `sourcing.brevo_messages` | M (2 h) | `architects` | `events` JSONB NOT NULL DEFAULT `'[]'`. `register` enum brevo (`tu/vous/neutre`). |
| `sourcing.notifications` | M (2 h) | `organizations` + `user_id` | RLS dual org + user (pattern unique). Index partiel inbox non lues. **Collision possible avec `public.notifications` monorepo — à vérifier.** |

**Code applicatif** : `lib/odoo/client.ts` + `opportunities.ts` (tests vitest), `lib/brevo/client.ts` + `template-picker.ts` + `template-resolver.ts` + `variables.ts` + `webhook-hmac.ts` + `rgpd-block.ts` + `tutoiement-integration.ts` (tous testés vitest).

**Effort sous-total Module G** : ~6 h (BDD) + ~8 h (adaptation au module `common/email/` Suivi+ACT) = ~14 h.
**Risques** : (1) Webhook HMAC Brevo `/api/webhooks/brevo` n'utilise PAS `createSupabaseServerClient` (HMAC + db direct) — à conserver tel quel. (2) Tutoiement architectes (cf. Gate 4 + table `architects.tutoiement`) — logique template-picker préservée intacte.

#### Module H — Admin + Superadmin

Cf. §4.6 (décisions Q6 superadmin scénario C hybride).

**Code applicatif Admin** (`/sourcing/admin/*`) :
- `users/` (gestion users + invitation Resend) — route API `/api/admin/users/route.ts` + `regenerate-password/route.ts`
- `societe/`, `shortlist/`, `settings/` (branding), `modeles-email/`, `profil/`, `crons/`, `envois/`, `tandem-activity/`, `ia-usage/`, `bibliotheque/`, `acheteurs/`

**Code applicatif Superadmin** (`/sourcing/superadmin/*`) :
- `organizations/` (CRUD + billing), `support/`, `faq/`, `news/`, `formations/`, `guided-tests/`, `pitch/`, `roadmap/`, `market-study/`

**Effort sous-total Module H** : ~16 h (BDD via §4.6) + ~24 h (pages adaptation au module `common/auth/` invitation pure + adoption 0115 billing) = **~40 h (5 j focus)**.

### 2.3 Effort agrégé par module (récap)

| Module | Tables | Effort BDD (h) | Effort code (h) | Total (j focus) |
|---|---|---|---|---|
| A — Veille AO | 9 | 13 | 16 (orchestrator + scrapers) | 3.5 |
| B — Cotraitance Tandem | 15 | 32 | 24 (annuaires + JWT + Brevo) | 7 |
| C — Dossier IA | 4 | 8 | 16 (swap libs) | 3 |
| D — Bibliothèque | 2 | 6 | 8 (matching + Haiku) | 1.5 |
| E — Buyers | 1 | 2 | 4 (upsert progressif) | 1 |
| F — IA + Audit | 4 | 7 | 8 (prompts + audit IMMUTABLE) | 2 |
| G — Intégrations | 3 | 6 | 8 (Odoo + Brevo) | 2 |
| H — Admin + Superadmin | 7+ | 16 | 24 (auth pure + 0115) | 5 |
| **TOTAL** | **45+** | **~90 h** | **~108 h** | **~25 j focus** |

**Étalé** sur le calendrier consolidé visio cadrage (Lots 2 à 10, du 1er au 17 juillet) : **17 jours calendaires** dont ~12 jours ouvrés = **2-2.5 j/h en parallèle / jour** (Sébastien + Claude Code). Tient si pas de retard.

### 2.4 Ordre de portage suggéré (du plus simple au plus complexe)

1. **Référentiels statiques (1/2 jour)** — `platforms`, `architect_specialties`, `ai_prompts` (seed). 0 dépendance, débloque la suite.
2. **`organizations` + `memberships` extends (1 jour)** — comparer avec monorepo, ajouter colonnes manquantes (`siren`, `siret`, `odoo_config`, `subscription_tier`, `logo_url`, branding). Arbitrage Q4 N-N vs 1-1 (cf. §4).
3. **Module E — `buyers` (0.5 jour)** — petit, autonome, test vitest existant. Bon échauffement.
4. **Module A — Veille AO (3.5 jours)** — cœur du sourcing engine. À sécuriser tôt car cron 6h30 = visibilité quotidienne.
5. **Module B — Cotraitance Tandem (7 jours)** — gros morceau, mais pages publiques tokenisées critiques (`/archi/[token]`, `/cotraitant/[token]`, `/archi/opposition/[token]`).
6. **Module D — Bibliothèque (1.5 jour)** — pré-requis du Module C (matching pièces ↔ biblio).
7. **Module C — Dossier IA + CERFA (3 jours)** — dépend de B et D pour la compile ZIP.
8. **Module F — IA + Audit (2 jours)** — porter en fin avec `logAiUsage` obligatoire câblé (cf. Lot 6 calendrier).
9. **Module G — Intégrations (2 jours)** — Odoo + Brevo + Notifications.
10. **Module H — Admin + Superadmin (5 jours)** — en dernier, dépend de tout (users, billing 0115, branding).

### 2.5 Tables Sourcing sans RLS écrite — à confirmer/écrire au portage

D'après le catalogue Drizzle §8.6 :

- `sourcing.companies` (créée mig. 0011) — non RLS-isée dans 0018.
- `sourcing.cotraitant_shares` + `cotraitant_share_items` (créées mig. 0014).
- `sourcing.shortlist_criteria` (créée mig. 0027).
- `sourcing.tender_briefs` (créée mig. 0022).
- `sourcing.tender_be_cotraitants` (créée mig. 0037).
- `sourcing.dossier_dispatches` (créée mig. 0038).
- `sourcing.library_item_index` (créée mig. 0041).
- `sourcing.cron_run_log` (créée mig. 0046) — service_role uniquement (déclaré JSDoc, à acter en policy SQL).
- `sourcing.buyers` (créée mig. 0048).
- Tables superadmin (mig. 0019) — RLS posée dans 0019 mais non auditée par catalogue Lot 0a.

**Action portage** : écrire les policies manquantes EN MÊME TEMPS que le portage du loader pour ne pas reproduire la dette.

### 2.6 Helpers SQL à harmoniser

```sql
CREATE OR REPLACE FUNCTION current_organization_id() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb #>> '{app_metadata,organization_id}', '')::uuid
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION current_user_role() RETURNS membership_role AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb #>> '{app_metadata,role}', '')::membership_role
$$ LANGUAGE sql STABLE;
```

À harmoniser avec helpers existants du monorepo (Sébastien arbitre signatures). Monorepo est mono-tenant par user (Q6 visio) donc helper monorepo équivalent existe probablement sous une autre forme.

---

## 3. Dettes connues à porter

> Liste exhaustive des arbitrages techniques différés à régler au passage Lot 2-10. Aucune n'est bloquante pour Lot 1 / 1.5, mais toutes doivent être tranchées avant le 18 juillet.

### 3.1 Rename `createSupabaseServerClient` → `createClient` (cosmétique)

- **Périmètre** : 157 occurrences sur 105 fichiers (uniformes : tous `await createSupabaseServerClient()`).
- **Méthode** : codemod sed safe car nom unique dans le repo. `git ls-files | xargs sed -i 's/createSupabaseServerClient/createClient/g'`.
- **Risque** : nul (refactor purement mécanique).
- **Effort** : 30 minutes (script + relance typecheck + commit).
- **À placer** : début Lot 2, juste après création de la branche `feat/sourcing-merge`.

### 3.2 Arbitrage emplacement `COOKIE_DOMAIN`

- **Situation** : Sourcing pose le domaine cookie dans `src/lib/supabase/server.ts` (lignes 38-43). Monorepo le pose dans `app/src/middleware.ts`.
- **Question** : on remonte la logique dans middleware (pattern monorepo) ou on porte le pattern Sourcing enrichi dans le monorepo ?
- **Recommandation suivi_act_reviewer** : Sourcing plus robuste (helper `requireEnv` avec throw explicite vs `!` non-null monorepo). **Porter le helper Sourcing dans le monorepo**.
- **À acter Lot 2 avec Sébastien.**

### 3.3 Fusion `createSupabaseAdminClient` avec helper monorepo

- **Situation** : Sourcing a `createSupabaseAdminClient()` sync (ligne 64 `server.ts`) qui retourne un client service_role avec cookies no-op. Monorepo a probablement son équivalent dans `app/src/modules/common/supabase/`.
- **Action portage** : comparer les 2 helpers et fusionner — préserver le pattern Sourcing si plus robuste, sinon adopter celui du monorepo.
- **Effort** : 1 h (audit + fusion + ajustement call sites).

### 3.4 Migration vers `lib/db/<entity>.ts` pattern Suivi+ACT (vs Drizzle pur actuel)

- **Situation** : Sourcing utilise Drizzle (schema TS + `db.select()`). Monorepo utilise `lib/db/<entity>.ts` (47 fichiers existants) au-dessus de supabase-js direct.
- **Action portage** : **C'est le cœur du Lot 2** — réécrire les 25 schemas Drizzle en 25 loaders `modules/sourcing/db/<entity>.ts` style Suivi+ACT. Cf. catalogue Drizzle §2 pour le mapping détaillé.
- **Effort** : 3-5 jours (estimation brief §3.3).
- **Risque** : élevé (sous-jacent à TOUT le code Sourcing). Mitigation : tests vitest pour chaque loader réécrit, tests pgTAP RLS portés.

### 3.5 ESLint `import/no-restricted-paths` à activer au portage

- **Situation** : la règle ESLint `import/no-restricted-paths` qui interdit aux Client Components d'importer (même via `import type`) un module qui tire `next/headers` côté Server → fournie par Sébastien au kickoff 1er juillet (cf. CR visio §2 G3).
- **Action portage** : activer EN MÊME TEMPS que la première PR module Sourcing porté pour ne pas laisser dériver. Cf. handover Suivi+ACT §4 garde-fou #5 (pattern boundary Client/Server).
- **Test** : lint:strict avant chaque merge sur `feat/sourcing-merge`.

### 3.6 Reconfig Husky `pre-push` ESLint full + `pre-commit` léger

- **Situation** : actuellement Sourcing fait `lint-staged` (Prettier + ESLint `--max-warnings 0`) en `pre-commit`. Coût ~3-10 secondes selon le périmètre.
- **Dette PR #115** : remontée au passage par Hugo (cf. review PR #115 §C, à archiver) — décaler ESLint full en `pre-push` et garder Prettier + format en `pre-commit` pour gagner en vitesse.
- **Action portage** : à reproduire côté monorepo si pas déjà en place (Sébastien arbitre — handover §4 garde-fou #6 est strict sur la non-désactivation des hooks).
- **Effort** : 1 h.

### 3.7 Audit cache Next 15 sur futurs route handlers GET

- **Situation Next 15** : route handlers GET sont **uncached par défaut** (changement vs Next 14 qui les cachait). Impact direct : un `route.ts GET` qui faisait `revalidate=0` implicite en 14 doit maintenant déclarer `export const dynamic = 'force-dynamic'` ou utiliser `unstable_cache` explicitement.
- **État actuel** :
  - `/api/cron/sourcing-run` — OK (cron, jamais cacheable).
  - `/api/cron/tandem-followup` — OK (cron).
  - `/api/admin/users/route.ts` — OK (POST, pas GET).
  - `/api/webhooks/brevo/route.ts` — OK (POST HMAC).
  - `/api/archi/[token]/respond/route.ts` — OK (POST).
  - `/api/test/seed-session/route.ts` — OK (POST, gated `E2E_TEST_ROUTES_ENABLED`).
- **Action** : au Lot 2, audit systematic des futurs route handlers GET portés. Pas de risque immédiat car aucun GET cacheable actuel.

### 3.8 Rotation des secrets post-incident 2026-05-21

- **Situation** : password BDD prod leaké 2× (chat + stack trace postgres-js) le 21 mai. Rotation finale reportée post-MVP. Cf. MEMORY > `followup_post_mvp_security_rotations.md`.
- **À faire avant mise en service réelle (post-bascule monorepo)** :
  - Rotation DB password + règle URI-safe-only (jamais de char non-URI dans le password)
  - Hardening `migrate.ts` (masking systematic des erreurs postgres-js)
  - Rotation `RESEND_API_KEY`, `BREVO_API_KEY`, `ANTHROPIC_API_KEY`, `CRON_SECRET`
  - Documenter rotation 90 jours dans `docs/SECURITY.md` (à créer)
- **Effort** : 2 h Steve + 1 h dev.
- **Bloqueur potentiel** : si Sébastien n'a pas adopté le pattern URI-safe-only côté monorepo, à harmoniser.

### 3.9 Stripe minimal MVP (migration 0049) — drop au profit du modèle 0115

- **Situation** : Sourcing a livré 5 juin un MVP minimal Stripe (Option C) avec `organizations.{trial_started_at, trial_ends_at, subscription_status, stripe_customer_id}`. C'est un sous-ensemble dégradé du modèle 0115 (`organization_billing_lifecycle`) déjà câblé en BDD monorepo.
- **Action portage** : DROP migration 0049 Sourcing + adoption du modèle 0115. **Q6 visio = B-en-2-temps acté Steve** (cf. §4) :
  - **18 juillet (bascule)** : Scénario A simplifié = 3 abos `price_id` distincts (Sourcing/Suivi/ACT autonomes), pas de remise pack. Migration zéro.
  - **Sprint 9.E (août-septembre 2026)** : Scénario B complet = Subscription Stripe multi-items + coupon « Suite edifio -20 % ». Migration `0NNNN_subscription_multi_items.sql` à écrire le moment venu.
- **Effort portage** : 4 h (drop colonnes 0049 + adoption helpers `lib/billing/trial.ts` style 0115).

### 3.10 Dettes UX/produit reportées (non bloquantes migration)

- **Édition inline des `matching_keywords` absente** — suppression + ré-upload nécessaire actuellement. Backlog Sprint 9.F.
- **Pas de versioning du tableau Excel des références** — upload = remplacement. Backlog Sprint 9.F.
- **Cron `sourcing-run` 60% échec semaine du 29 mai au 5 juin** — probablement résolu par migrations 0047/0048 appliquées 5 juin, à confirmer en monitoring continu **et résoudre formellement avant 18 juillet** (sinon migration retardée).

---

## 4. Décisions Q1-Q10 visio cadrage 2026-06-07

> Source : `docs/CR_visio_cadrage_migration_2026-06-07.md` (validé Sébastien). 9 questions gelées sauf escalade Board.

### 4.1 Tableau récap

| Q | Sujet | Position actée | Statut |
|---|---|---|---|
| Q1 | BDD partagée vs séparée | **Partagée d'emblée**, projet Supabase unique, migrations Sourcing renumérotées 0138+ | ✅ confirmé |
| Q2 | ORM cible monorepo | **supabase-js direct + `lib/db/<entity>.ts`**, drop Drizzle au Lot 2 | ✅ confirmé |
| Q3 | Billing model | **Adopter modèle 0115 monorepo**, drop 0049 Sourcing | ✅ confirmé (sous réserve Q6) |
| Q4 | Cron sourcing : Vercel ou Fly.io | **Bench POC chromium-min** avant arbitrage. Seuils : <50s durée + <500Mo RAM = Vercel ; ≥ = Fly.io | ⚖️ à arbitrer (livrable POC avant 25 juin) |
| Q5 | Bascule J0 | **Samedi 18 juillet 2026, 8h-11h** | ✅ confirmé |
| Q6 | Pack groupé Suite edifio | **B-en-2-temps acté Steve 7 juin** : phase 1 (18/7) = 3 abos `price_id` autonomes ; phase 2 (Sprint 9.E août-septembre) = Subscription multi-items + coupon -20 % | ✅ acté |
| Q7 | Vitest dans monorepo | **OUI introduit Lot 6bis**, tests `*.test.ts` colocated | ✅ confirmé |
| Q8 | Workflow migrations DB | **Manuel via Studio**, Sébastien applique. Sourcing fournit les fichiers SQL. | ✅ confirmé |
| Q9 | (= Q4) | bench | ⚖️ même que Q4 |
| Q10 | Calendrier | Visio 7-14 juin → kickoff 1/7 → bascule 18/7 → post-mortem 25/7 | ✅ confirmé |

### 4.2 Détail Q6 — B-en-2-temps (acté Steve 7 juin)

**Phase 1 — 18 juillet 2026 (bascule)** :
- 3 abos Stripe distincts, 1 `price_id` par produit (`price_sourcing`, `price_suivi`, `price_act`).
- `contract_summary` reste scalaire compatible 0115 actuel.
- Pas de remise pack. Stripe Subscription = 1 par produit.
- **Risque migration : zéro.** Le modèle 0115 supporte déjà cette mécanique.

**Phase 2 — Sprint 9.E (août-septembre 2026)** :
- Stripe Subscription multi-items unique pour les clients qui ont 2 ou 3 modules.
- Coupon « Suite edifio -20 % » appliqué à la Subscription entière.
- Migration `0NNNN_subscription_multi_items.sql` :
  - Ajoute table `contract_items (id, contract_id, price_id, quantity, started_at, ended_at)`
  - Migre `contract_summary.price_id` scalaire → 1 row `contract_items` par module actif
  - Hook webhook `subscription_items.created/deleted` pour sync `modules_actifs` JSONB

**Refus explicite du Scénario C au MVP** (bundle dynamique prorata = bugs et tickets support, reporté Phase 2+ si pertinent).

### 4.3 Calendrier consolidé Lots 1-12

```
Lot 0     12-14 juin     Préparation (Sourcing en cours — FAIT)
Lot 0a    Catalogue Drizzle → loaders monorepo (FAIT)
Lot 0b    12-25 juin     POC cron Vercel chromium-min (livrable AVANT 1/7)
Lot 1     12-17 juin     Upgrade Next 15 / React 19 sur Sourcing.main (FAIT)
Lot 1.5   Refactor createSupabaseServerClient async (FAIT)

— Kickoff Sébastien 1er juillet matin —

Lot 2     1-7 juillet    Drizzle → supabase-js + 25 loaders lib/db/
Lot 2bis  8 juillet      Suppression Drizzle + nettoyage db/schema
Lot 4     9-10 juillet   Swap libs (exceljs→xlsx, fflate→docxtemplater)
Lot 3    11-12 juillet   Modules pures portables
Lot 5    13-14 juillet   Sourcing engine cron + arbitrage Q4 final
Lot 6    14-15 juillet   IA Anthropic + logAiUsage obligatoire
Lot 6bis 15 juillet AM   Vitest setup + tests critiques portés
Lot 7    15-16 juillet   Cotraitance Tandem
Lot 8    16 juillet      Dossier IA
Lot 9    16 juillet      Bibliothèque (parallèle Lot 8)
Lot 10   17 juillet      Admin + Superadmin
GEL      17 juillet PM   Code freeze, derniers smoke tests
Lot 11   18 juillet 8-11h  Bascule DNS
Lot 12   25 juillet      Post-mortem
```

**3 ajustements actés vs proposition initiale** :
- ❌ Lot 4 swap libs en parallèle Lot 3 = risqué → **séquencé AVANT Lot 3**
- ❌ Lot 5 cron + bench Vercel 12-14 juillet = trop tard → **POC livré AVANT 25 juin**
- ❌ Lots 7+8+9+10 concentrés 15-17 juillet = stress et bugs → **étalé**

### 4.4 Q6 Superadmin (Point 6 CR visio) — Scénario C hybride

| Table | Stratégie | Justification |
|---|---|---|
| `formations` | **Fusion** (`public.formations` + col `module text[]`) | Cross-module naturel |
| `news_items` + `user_news_reads` | **Fusion** avec `module text[]` sur news_items | Centre de notifications unifié |
| `support_tickets` | **Fusion** avec colonne `module text` | Un seul backoffice support |
| `roadmap_items` | **Cloisonnement** (`sourcing.roadmap_items`) | Roadmap métier différente par module |
| `guided_tests` + `guided_test_submissions` | **Cloisonnement** (`sourcing.guided_tests`) | Spécifique parcours Sourcing |
| `pitch_blocks` | **Cloisonnement** | Spécifique métier |
| `market_study_blocks` | **Cloisonnement** | Spécifique métier |
| `app_content` | À arbitrer (probable cloisonnement) | Clés métier 'pitch_pdf_url' etc. |
| `user_notifications` | À arbitrer (probable fusion avec notifications) | Vérifier collision avec module commune `common/notifications/` |

**Conséquence migration** :
- 3 tables fusionnées → migration `0NNNN_merge_superadmin_tables.sql` avec backfill `module='sourcing'`.
- RLS sur tables fusionnées : `(module = ANY(array_intersect_with_user_modules())) OR is_superadmin()`. Helper SQL à créer dans `common/`.
- 4 tables cloisonnées → migration habituelle schema `sourcing` (cf. catalogue Drizzle §5).

**Action Sébastien (en cours)** : inventaire des tables monorepo (existence réelle de `support_tickets` et `formations` côté Suivi+ACT) — d'ici 11 juin.

---

## 5. Tests et qualité

### 5.1 Inventaire Vitest (75 fichiers, 1218 tests verts)

**Par catégorie** (basé sur audit recette PR #115/#116 — 1218/1218 OK, 12.84s) :

| Catégorie | Nb fichiers | Exemples clés |
|---|---|---|
| **Logique IA Dossier** | 8 | `cerfa-prefill`, `cerfa-docx-generator`, `pieces-match`, `fiche-metier-match`, `reference-fiche-match`, `cv-match`, `references-table-filter`, `docx-fill`, `zip-compile` |
| **Auth + middleware** | 8 | `domain`, `common-passwords`, `common-passwords-full`, `parse-hash-error`, `types`, `password`, `routes`, `get-required-org-id` |
| **Sourcing engine** | 10 | `orchestrator`, `connectors/boamp`, `scoring`, `dedup`, `filter`, `insert`, `queries`, `types`, `export-csv`, `baseline-profiles`, `normalize` |
| **Tandem (cotraitance)** | 7 | `jwt`, `opposition-jwt`, `matching`, `ai-rationale`, `followup-cron`, `architect-page-data`, `actions` |
| **Brevo + emails** | 8 | `client`, `template-picker`, `template-resolver`, `variables`, `webhook-hmac`, `rgpd-block`, `tutoiement-integration`, `resend` |
| **Odoo intégration** | 2 | `client`, `opportunities` |
| **Library + bibliothèque** | 4 | `index-item`, `expiry`, `expiry-digest`, `dossier/*-match` (cross) |
| **Billing + trial** | 2 | `billing/trial`, `admin/branding` |
| **Audit + logs** | 3 | `audit/schemas`, `audit/index`, `cron/log-cron-run`, `cron/notify-error` |
| **Profile + Admin pages** | 7 | `profile/schema`, `profile/queries`, `admin/_shared/RangeFilter`, `admin/crons/CronsFilters`, `admin/crons/actions`, `admin/ao\[id]/tandem/page-data`, ... |
| **Routes API + cron** | 6 | `api/admin/users`, `api/archi/[token]/respond`, `api/cron/sourcing-run`, `api/cron/tandem-followup`, `api/webhooks/brevo`, `api/test/seed-session` |
| **DB seeds + schema** | 3 | `seed/prod`, `seed/ai-prompts`, `schema/buyers` |
| **Login form + UX** | 3 | `login/rate-limit`, `login/useCountdown`, `archi/opposition/[token]/actions` |
| **Site URL + divers** | 4 | `site-url`, `text/normalize`, `sourcing/cotraitance/page-data`, `app-shell/actions` |

**Portage Lot 6bis (15 juillet AM)** :
- Logique pure (matching, computeTrialState, normalizeBuyerName, fiche-metier-match) → portable telle quelle.
- Tests Server Actions (`actions.ts`) → adaptation mineure aux conventions monorepo (imports `@/modules/sourcing/...` au lieu de `@/lib/...`).
- Tests routes API → portage conjoint avec les routes (Lot 5+6+7).
- **Cible** : 100% des 1218 tests verts après portage = critère de bascule J0.

### 5.2 Couverture pgTAP RLS (13 fichiers, `test:rls`)

| Fichier | Périmètre | Importance |
|---|---|---|
| `00_helpers.sql` | Helpers `current_organization_id()` + `current_user_role()` | Critique |
| `01_force_rls.sql` | Vérifie FORCE RLS actif sur 19 tables | Critique |
| `02_tenant_isolation.sql` | Test cross-tenant : AlyoS ne voit pas data PROTECT | Critique multi-tenant |
| `03_insert_by_member.sql` | Policy RESTRICTIVE architects INSERT | Élevée |
| `04_audit_immutable.sql` | Triggers `reject_audit_mutation` UPDATE/DELETE | Critique audit 5 ans |
| `05_tenders_insert_idempotence.sql` | UNIQUE `(org, external_ref, platform_id)` | Critique cron 6h30 |
| `06_ai_prompts_seed.sql` | Présence des 4 prompts seedés | Élevée |
| `07_tenders_resource_status_preservation.sql` | Préservation status sur UPDATE concurrent | Moyenne |
| `08_tender_actions_cross_tenant.sql` | Server Actions tender cross-org refusées | Critique |
| `09_tandem_tables.sql` | RLS architect_responses + match_proposals + architect_tokens | Critique tandem |
| `10_audit_a16.sql` | Action a16 = `tender_select` correctement loggée | Élevée |
| `11_shortlist_criteria_tender_briefs.sql` | RLS shortlist_criteria + tender_briefs | Moyenne |
| `12_tender_briefs_constraints.sql` | Contraintes `is_active` 1 brief / AO | Moyenne |

**Total = 12 policies forced × ~50 assertions = ~600 assertions pgTAP.** Toutes vertes au 5 juin 2026.

**Portage Lot 7+** : ces 13 fichiers SQL sont **portables tels quels** modulo renommage schema `sourcing.*` (cf. catalogue §8). Le harness `pg_prove --ext .sql tests/rls/` est trivial à reproduire dans le monorepo.

### 5.3 Tests E2E Playwright (8 specs)

| Spec | Périmètre | Statut local | Statut CI |
|---|---|---|---|
| `auth-password.spec.ts` | Login + mot de passe + reset flow | KO local (E2E_TEST_ROUTES_ENABLED=1 absent) | À câbler GH Actions |
| `middleware-domain.spec.ts` | Middleware redirige hors domaine (historique pre-ADR-014) | KO local | À câbler / adapter post-ADR-014 |
| `admin-profil.spec.ts` | Page admin profil + édition | KO local | À câbler |
| `admin-users-session-expired.spec.ts` | Session expirée → redirect login | KO local | À câbler |
| `ao-du-jour.spec.ts` | File AO du jour + sélection/report | KO local | À câbler |
| `sidebar-mobile.spec.ts` | Sidebar mobile + responsive | KO local | À câbler |
| `tandem.spec.ts` | Flow cotraitance Tandem (shortlist → sollicitation) | KO local | À câbler |
| `tender-actions.spec.ts` | Server Actions sélection/report/exclusion | KO local | À câbler |

**Reco follow-up (cf. recette PR #115/#116 §3)** : CI obligatoire avant merge sur preview Vercel ou job GH Actions dédié avec `E2E_TEST_ROUTES_ENABLED=1` + serveur Next démarré.

**Portage post-bascule** : conserver les 8 specs telles quelles modulo adaptation chemins (`/sourcing/` reste).

### 5.4 Migrations Drizzle 0000-0049 documentées

50 migrations numérotées séquentiellement. Liste consolidée :

| # | Migration | Domaine |
|---|---|---|
| 0000 | `init.sql` | enum `subscription_tier`, ext `pg_trgm`, helpers |
| 0001 | `schema_v1.sql` | 21 tables base (organizations, users, memberships, tenders, architects, ai_*, audit_logs, brevo_messages, odoo_opportunities, notifications, etc.) |
| 0002 | `rls.sql` | **19 FORCE RLS + 20 policies + triggers** (foundation multi-tenant) |
| 0003 | `fk_supabase.sql` | FK vers `auth.users` |
| 0004 | `tender_deferral.sql` | colonne `deferred_until` + index partiel |
| 0005-0006 | `tandem_engine.sql` + `tandem_rls.sql` | Tandem complet + RLS |
| 0007 | `abnormal_ares.sql` | Fix migration historique (incident pooler PgBouncer) |
| 0008 | `chief_the_order.sql` | Réordonnancement post-incident |
| 0009 | `rls_messaging.sql` | message_templates + organization_profiles + RLS admin restrictives |
| 0010 | `architect_budget_concours.sql` | Champs concours archi |
| 0011 | `be_companies.sql` | bureaux_etudes + companies |
| 0012 | `selectionmode_cr.sql` | enum `selection_mode` (CR mode) |
| 0013 | `tender_excluded.sql` | colonne `excluded_at` |
| 0014 | `cotraitant_sharing.sql` | cotraitant_shares + items |
| 0015 | `cotraitant_library.sql` | presentation_library 20 kinds |
| 0016 | `be_documents.sql` | be_documents + 12 kinds |
| 0017 | `architect_annual_revenue.sql` | revenue_n1/n2/n3 archi |
| 0018 | `rls_cotraitants_be.sql` | RLS 4 tables cotraitants + BE |
| 0019 | `superadmin_module.sql` | 9 tables superadmin + RLS |
| 0020 | `tenders_department.sql` | colonne `department` |
| 0021 | `audit_action_library_dce.sql` | enum action +2 valeurs |
| 0022 | `tender_briefs.sql` | tender_briefs + IA Sonnet 4.6 |
| 0023 | `add_siret.sql` | architects.siret + bureaux_etudes.siret |
| 0024 | `platform_prive.sql` | enum platform `prive` |
| 0025 | `search_profiles_multi.sql` | is_default + display_order multi-profils |
| 0026 | `platform_prive_seed.sql` | Seed plateforme privée |
| 0027 | `shortlist_criteria.sql` | Critères shortlist paramétrables |
| 0028 | `fix_current_organization_id.sql` | Patch helper (typage) |
| 0029 | `tender_notice_type.sql` | colonne `notice_type` |
| 0030 | `formations_slug_content.sql` | Pivot 2026-05-29 (slug + content_md inline) |
| 0031 | `tender_is_exclusive.sql` | Drapeau exclusivité |
| 0032 | `org_branding.sql` | logo_url + primary_color + font_family |
| 0033 | `architects_dc1_fields.sql` | address + legal_representative + signature_city |
| 0034 | `org_profiles_dc2_fields.sql` | DC2 complet organization_profiles |
| 0035 | `be_dc2_fields.sql` | DC2 complet bureaux_etudes |
| 0036 | `response_files_architect_id.sql` | FK nullable multi-archi Tandem |
| 0037 | `tender_be_cotraitants.sql` | N-N tenders ↔ BE |
| 0038 | `dossier_dispatches.sql` | Envoi ZIP signed URL |
| 0039 | `normalize_dc2_architect_id.sql` | Normalisation FK |
| 0040 | `legal_form_field.sql` | Forme juridique DC1 |
| 0041 | `library_item_index.sql` | Indexation IA Haiku |
| 0042 | `seed_library_index_prompt.sql` | Seed prompt `library_index` |
| 0043 | `drop_legacy_logo_url.sql` | Cleanup colonne dépréciée |
| 0044 | `dossier_dispatches_cancellable.sql` | Soft cancel cancelled_at |
| 0045 | `user_notifications_seen.sql` | architect_notifications_seen_at |
| 0046 | `cron_run_log.sql` | Cron observability |
| 0047 | `revenue_buyer_address_matching_keywords.sql` | Multi-colonnes consolidation |
| 0048 | `buyers_directory.sql` | Annuaire acheteurs |
| 0049 | `trial_billing.sql` | **Stripe MVP Option C — À JETER (cf. §3.9)** |

**Plan de renumérotation Sourcing 0138+** (cf. brief migration §5.4) :
- 0138 → init enums sourcing + schema sourcing
- 0139 → 19 tables base sourcing.*
- 0140 → 27+13 policies RLS
- 0141 → tables superadmin scénario C (fusion + cloison)
- 0142 → seeds (platforms, ai_prompts, formations 17 guides)
- 0143+ → reste des dettes Sourcing fusionnées (0010-0048 condensés)
- ❌ 0049 jeté

---

<!-- SECTIONS 6-10 + ANNEXES : ajoutées au commit suivant -->
