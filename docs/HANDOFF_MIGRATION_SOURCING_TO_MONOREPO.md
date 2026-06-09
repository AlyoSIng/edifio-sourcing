# HANDOFF — Migration `edifio-sourcing` → monorepo `alyos-suivi-chantier`

> **Dossier de référence unique** pour le kickoff Sébastien (lead Suivi+ACT) — 1er juillet 2026.
> **Auteurs** : équipe Sourcing (Steve TEISSIER + sub-agents Claude Code).
> **Date** : 2026-06-09 (v2 — rework post-review Sébastien `gates/REVIEW_SUIVI_ACT_PR121.md`).
> **Statut** : v2 — densité technique. Lecture obligatoire avant kickoff.
> **Cible bascule DNS** : samedi 18 juillet 2026 8h-11h.

---

## Sommaire

1. [État actuel post-Lot 1 / 1.5](#1-état-actuel-post-lot-1--15) — versions stack, refactor async, scripts ops, périmètre non migré
2. [Catalogue exhaustif des modules à porter](#2-catalogue-exhaustif-des-modules-à-porter) — 8 modules, 41 tables, ~25 j focus, ordre suggéré
3. [Dettes connues à porter](#3-dettes-connues-à-porter) — 10 arbitrages techniques (rename, COOKIE_DOMAIN, Drizzle drop, ESLint, etc.)
4. [Décisions Q1-Q10 visio cadrage 2026-06-07](#4-décisions-q1-q10-visio-cadrage-2026-06-07) — récap + Q6 B-en-2-temps + calendrier Lots 1-12
5. [Tests et qualité](#5-tests-et-qualité) — 1218 vitest verts, 15 pgTAP RLS, 8 specs E2E, 51 migrations Drizzle (récap)
6. [Comptes externes / providers tiers](#6-comptes-externes--providers-tiers) — Supabase, Vercel, Anthropic, Brevo, Resend, Fly.io, Pappers, Stripe, Upstash, OVH, 1Password
7. [Risques migration](#7-risques-migration) — 5 résolus + 10 actifs Lot 2-10 + 4 BDD inter-région (R-FK détaillé) + 4 sécurité + 3 DNS + 5 nouveaux R11-R15 Sébastien
8. [Procédure de bascule J0](#8-procédure-de-bascule-j0) — J-7 (11/7) → J-1 (17/7) → J0 (18/7 8-11h, storage 4 buckets détaillé) → J+7 (25/7) post-mortem
9. [Annexes](#9-annexes) — docs référencés, scripts ops, gates, ENV, buckets, ADR, **17 guides formation listés**, entité juridique, contacts

> **⚠️ Point d'attention Sébastien** : la décision Q1 (BDD partagée d'emblée) + Q2 (adopter Paris monorepo) implique une **migration inter-région Frankfurt → Paris** non triviale. Le risque le plus subtil — facilement raté en lecture rapide — est la **réécriture des FK `auth.users.id`** (§7.3) : les UUIDs Frankfurt ≠ UUIDs Paris si l'export Supabase Auth ne préserve pas les IDs. **Test J-14 obligatoire** : créer 1 user via Auth API `auth.admin.createUser({ id: <uuid> })` et vérifier la préservation. Plan B si KO = mapping ancien→nouveau + UPDATE bulk sur toutes les FK AVANT `pg_restore`. À traiter en priorité Lot 2 sinon tout casse à la bascule.

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

- **Drizzle reste en place** côté Sourcing — `drizzle-orm@0.39.3` + `drizzle-kit@0.30.6` + `postgres@3.4.9`. 25 fichiers schema TS dans `src/db/schema/`, 51 migrations SQL dans `src/db/migrations/` (`0000_init.sql` à `0051_rls_fix_companies_cotraitant_shares_be.sql` post-Lot 1.7).
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

##### Sourcing engine — détail technique (lecture obligatoire Sébastien)

Le « Sourcing engine » désigne la chaîne de production du flux AO du jour : 6 fetchers → normalize → dedup → filter → score → insert. Source : `src/lib/sourcing/` + `specs/module_sourcing_engine_v1.md`.

**(1) Les 6 fetchers (1 ouvert + 5 scrapés)**

| Code plateforme | Endpoint / source | Auth | Rate-limit | Module |
|---|---|---|---|---|
| `boamp` | `https://boamp-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/boamp/records` (portail Opendatasoft DILA officiel) | Aucune (API ouverte) | ~500 req/min sans clé, pagination `limit=100` + `offset` max 100 v2.1, retry exponentiel 1/2/4s sur 429+5xx, garde-fou `MAX_PAGINATION_ITERATIONS=200` (~20K records) | `connectors/boamp.ts` (testé vitest) |
| `place` | `https://www.marches-publics.gouv.fr/` (PLACE État) | Aucune (scrape Playwright) | Worker Fly.io, throttle 1 req/3s | `connectors/scraping-client.ts` (HTTP POST vers worker Fly) |
| `francmarches` | `https://francemarches.com/` | Aucune (scrape) | idem | `connectors/scraping-client.ts` |
| `mp_info` | `https://www.marches-publics.info/` | Aucune (scrape) | idem | `connectors/scraping-client.ts` |
| `e_marchespublics` | `https://www.e-marchespublics.com/` | Aucune (scrape) | idem | `connectors/scraping-client.ts` |
| `prive` | Plateforme privée AlyoS (saisie manuelle / future intégration) | N/A | N/A (insertion humaine) | Pas de fetcher — INSERT direct via admin UI |

Tous les fetchers retournent un `RawTender` au format unifié (cf. `types.ts`). Le scrape worker tourne sur container Docker Fly.io EU dédié (`FLY_PLAYWRIGHT_WORKER_URL`), déclenché par message Supabase Realtime ou requête HTTP synchrone selon implémentation. **PR #3 BOAMP only mergée ; PLACE + 4 régionaux scrapés à intégrer post-bascule (cf. Q4 visio).**

**Fenêtre temporelle** : `FETCH_WINDOW_MS = 72h` glissantes (au lieu de 24h) pour couvrir les week-ends (BOAMP publie samedi+dimanche, cron ne tourne que lun-ven). L'idempotence INSERT garantit pas de doublon sur jours déjà traités.

**(2) Dedup — hash composite SHA-256**

Source : `src/lib/sourcing/dedup.ts` + spec §3.4.

- Hash = `SHA-256(buyer_norm | title_norm[:100] | deadline_date)`
- Normalisation = `lower + NFD diacritiques retirés + espaces compressés/retirés` (gère espaces fines U+202F + U+00A0)
- `deadline` tronqué au jour calendaire ISO `YYYY-MM-DD` (heure non signifiante cross-plateforme)
- `deadline IS NULL` → segment vide (AO sans deadline restent dé-doublonnables sur buyer+title seuls)
- À hash identique : **première occurrence conservée** dans le batch (ordre d'entrée stable), doublons écartés écrivent `audit_log.dedup_skip`
- Dedup intra-batch en V1 ; **cross-batch cross-plateforme** géré par UNIQUE `(organization_id, external_ref, platform_id)` + `onConflictDoUpdate` (idempotence cron)

**(3) Scoring V1 (règles, sans IA)**

Source : `src/lib/sourcing/scoring.ts` + spec §3.6. Barème entier additif, clamp [0, 100] :

| Composant | Bonus | Règle |
|---|---|---|
| **Base** | +50 | Tout AO ayant passé le filter part de 50 |
| **Exact match** | +20 | UNE expression `profile.keywords.exact` trouvée dans le `title` (1 hit suffit, non cumulable) |
| **Positif** | +10 par hit | Cumulable — un titre matchant 3 mots-clés `keywords.positive` récolte +30 |
| **CPV exact** | +15 | AU MOINS un code CPV du tender listé *exactement* dans `profile.cpv_codes` (pas de préfixe — c'est `filter.ts` qui gère le préfixe) |

Plafond pratique : 1 exact + 3 positifs + CPV exact = 50+20+30+15 = 115 → clamp 100. Scoring IA Haiku 4.5 (spec §3.6 `score_final = (score_rules + score_ai) / 2`) **reporté à une PR dédiée** (dépend `ai_prompts` table + branche audit `ai_runs`). En V1, `scoreTender()` retourne le score règles seul. Sortie `number.int()` cohérente avec audit log `tender_select.score`. La BDD stocke `numeric(5,2)`.

**(4) Persistence — `tenders` + `tender_events`**

- Table `sourcing.tenders` : insertion via `insertTender()` avec `onConflictDoUpdate` sur UNIQUE `(organization_id, external_ref, platform_id)` — UPDATE `raw_data` + `updated_at` + `score` si re-source idempotent.
- Table `sourcing.tender_events` : table d'audit applicatif (pas le `audit_logs` IMMUTABLE), trace `event_type` (`sourced`, `selected`, `excluded`, `deferred`, `reported`, `dispatched`, etc.) + `data` JSONB libre. RLS via EXISTS sur `tenders.organization_id`.
- **Erreur unitaire ne stoppe pas le batch** : un AO qui plante à `normalize` ou `insert` est comptabilisé `errors[]` mais batch continue (robustesse cron quotidien). Un AO BOAMP mal formé ne doit pas faire tomber 999 autres.
- **Erreur connecteur stoppe le profil** : si `fetchSinceLastRun` jette (rate-limit, schéma cassé), on remonte — la route cron caller intercepte et continue avec profil suivant.
- Trace côté `console.log` structuré (logs Vercel/Datadog) ; pas de table `sourcing_runs` en V1 (cf. `cron_run_log` table créée mig. 0046 pour observabilité minimale).

**(5) Cron 6h30 lun-ven**

- `app/api/cron/sourcing-run/route.ts` (Vercel Cron, protégé par Bearer `CRON_SECRET`)
- Lit `search_profiles` actifs (1+ par org), itère sur chaque profil, exécute pipeline complet, log `cron_run_log` (durée, volumes, errors).
- Cible Lot 5+Lot 11 bench Vercel chromium-min (Q4) : si POC OK <50s + <500Mo → cron Vercel, sinon Fly.io. **Smoke test obligatoire lundi 7h post-bascule** (cf. R12 §7).

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

### 2.5 État RLS Sourcing — point précis post-Lot 1.7

> **Correction factuelle vs v1** : la v1 du handoff listait `tender_briefs`, `shortlist_criteria`, `dossier_dispatches` comme « sans RLS » — c'est **faux**. Ces 3 tables ont leurs policies dans les migrations qui les créent (0022, 0027, 0038 respectivement). En revanche, `bureaux_etudes` (créée mig. 0011) manquait dans l'inventaire v1 et était bien sans RLS — fixé Lot 1.7.

**État actuel post-merge Lot 1.7 (PR #123 mergée 2026-06-08 — migration `0051_rls_fix_companies_cotraitant_shares_be.sql`)** :

| Table | Migration RLS | Statut post-Lot 1.7 | Pattern |
|---|---|---|---|
| `companies` | **0051** (Lot 1.7) | ✅ ENABLE + tenant_isolation | ENABLE seul (pas FORCE, cf. zone orange ci-dessous) |
| `bureaux_etudes` | **0051** (Lot 1.7) | ✅ ENABLE + tenant_isolation | idem (oubli historique — pas dans v1 handoff, ajouté Lot 1.7) |
| `cotraitant_shares` + `cotraitant_share_items` | **0051** (Lot 1.7) | ✅ ENABLE + tenant_isolation + flow public token | items hérite via EXISTS sur share_id |
| `tender_briefs` | 0022 (création) | ✅ RLS posée à la création | tenant_isolation FORCE |
| `shortlist_criteria` | 0027 (création) | ✅ RLS posée à la création | tenant_isolation FORCE |
| `dossier_dispatches` | 0038 (création) | ✅ RLS posée à la création | tenant_isolation FORCE |
| `tender_be_cotraitants` | 0037 (création) | ✅ RLS posée à la création | tenant_isolation FORCE |
| `library_item_index` | 0041 (création) | ✅ RLS posée à la création | tenant_isolation FORCE |
| `cron_run_log` | 0046 (création) | ⚠️ Service_role only déclaré JSDoc, **à acter en policy SQL explicite** | À traiter Lot 1.7-bis |
| `buyers` | 0048 (création) | ✅ RLS posée à la création | tenant_isolation FORCE |
| Tables superadmin (9) | 0019 | ⚠️ RLS posée mais non auditée par catalogue Lot 0a | À auditer Lot 2 |

**Choix Lot 1.7 — ENABLE seul (pas FORCE)** : décision pragmatique zone orange. Les Server Actions Sourcing tapent la BDD via Drizzle/postgres-js avec le rôle `postgres` (DATABASE_URL pooler). Si on pose FORCE RLS sur companies/bureaux_etudes/cotraitant_shares sans avoir d'abord wrap les call sites dans `withTenantContext()`, on régresse en prod (cf. bug fix PR #86 28 mai 2026 `fetchArchitectsPage`). Voir détail JSDoc dans `0051_rls_fix_companies_cotraitant_shares_be.sql` (l.17-54).

**Lot 1.7-bis (post wrap call sites) — à faire avant 1er juillet kickoff Sébastien** :

1. **FORCE ROW LEVEL SECURITY** sur les 3+1 tables fixées Lot 1.7 (CC-1 Camille préservé en CI déjà vert)
2. **Helper SQL `public.current_user_org_id()`** créé en alias vers `current_organization_id()` actuel (recommandation `gates/REVIEW_SUIVI_ACT_PATTERN_RLS_LOT17.md` §2.1 — évite ~3-4h de rework portage juillet)
3. **Naming `<table>_<action>`** : splitter `tenant_isolation FOR ALL` en 4 policies `_select/_insert/_update/_delete` par table (cohérence pattern monorepo `0104_act_schema_init.sql`)
4. **`cotraitant_shares` token public** : restreindre la policy `public_token_read` au flow service_role bypass + `SECURITY DEFINER` function (pattern `0044_cr_public_links.sql` monorepo) plutôt qu'à une policy `anon` directe — Sébastien refuserait au merge monorepo (cf. review §4)
5. **`cron_run_log`** : acter policy SQL explicite (`USING (false)` pour authenticated, service_role bypass uniquement)

**Effort Lot 1.7-bis** : ~1h sur migration `0052_rls_force_helper_alias_naming.sql` + ajustement tests pgTAP 13-14-15.

**Action portage juillet** : les policies RLS Sourcing sont à 90% écrites. Lot 7+ porte les 13+2 fichiers `tests/rls/XX_*.sql` tels quels modulo renommage schema `sourcing.*` (cf. §5.2).

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

### 4.4 Q6 Superadmin (Point 6 CR visio) — Scénario C hybride détaillé

**Principe** : éviter le tout-fusion (collisions naming + duplication backoffice) ET le tout-cloisonnement (3 menus Formations séparés pour le même user). Le scénario C arbitre **table par table** selon la dimension cross-module ou métier-spécifique.

#### Tables FUSION (3) — schema `public.*` + colonne `module`

| Table monorepo cible | Origine Sourcing | Colonne discriminante | Justification fusion | RLS post-fusion |
|---|---|---|---|---|
| `public.formations` | `formations` (Sourcing : 17 guides) | `module text[]` (ex: `['sourcing']`, `['suivi','act']`, `['sourcing','suivi','act']`) | Cross-module naturel — onboarding utilisateur unique cross-produit. Un user pack Suite voit ses 3 jeux de guides au même endroit. | `(module && current_user_modules()) OR is_superadmin()` — helper SQL `current_user_modules()` à créer dans `common/`, dérive depuis `organization_billing_lifecycle.modules_actifs` |
| `public.news_items` + `public.user_news_reads` | `news_items` + `user_news_reads` Sourcing | `module text[]` sur news_items | Centre de notifications unifié — un user voit la news edifio sans avoir à switch de module. `user_news_reads` non discriminé (clé `user_id + news_item_id`). | Idem (filtre module sur news_items, héritage user_news_reads via FK) |
| `public.support_tickets` | `support_tickets` Sourcing | `module text` (scalaire, pas array — un ticket = 1 module) | Un seul backoffice support à monitorer par AlyoS. Le ticket porte le module au moment de l'ouverture, immuable. | `(module = ANY(current_user_modules())) OR support_role()` |

**Migration fusion** : `0NNNN_merge_superadmin_tables.sql` côté monorepo (Sébastien) :
1. ALTER TABLE `public.formations` ADD COLUMN `module text[] NOT NULL DEFAULT ARRAY['suivi','act']` (les formations Suivi+ACT existantes restent visibles à leur audience actuelle)
2. INSERT des 17 formations Sourcing avec `module = ARRAY['sourcing']`
3. Idem `news_items` + `support_tickets`
4. Helper SQL `public.current_user_modules() RETURNS text[]` qui lit `organization_billing_lifecycle.modules_actifs` JSONB → text[]
5. Réécriture des policies RLS des 3 tables avec le filtre `module && current_user_modules()`

#### Tables CLOISONNEMENT (4) — schema `sourcing.*`

| Table | Justification cloisonnement |
|---|---|
| `sourcing.roadmap_items` | Roadmap métier 100 % spécifique — le sourcing veut afficher « bench cron Vercel », le suivi « migration MOE phase 4 ». Aucun chevauchement sémantique. |
| `sourcing.guided_tests` + `sourcing.guided_test_submissions` | Parcours guidé spécifique au flow AO/cotraitance/dossier. Pas de réutilisation possible côté Suivi+ACT. |
| `sourcing.pitch_blocks` | Pitch produit edifio Sourcing (slides) — réécrit par module quand le périmètre commercial change. |
| `sourcing.market_study_blocks` | Étude de marché BTP Sourcing — données chiffrées + sources spécifiques. |

**Migration cloisonnement** : `0NNNN_sourcing_superadmin_split.sql` côté monorepo (Sébastien) :
1. CREATE SCHEMA `sourcing` IF NOT EXISTS
2. CREATE TABLE `sourcing.roadmap_items` (LIKE `public.roadmap_items` INCLUDING ALL) puis INSERT depuis backup Sourcing → pas de collision avec `public.roadmap_items` monorepo qui reste isolé Suivi+ACT
3. Idem pour les 3 autres tables cloisonnées

#### Tables À ARBITRER (2) — décision Sébastien d'ici 11 juin

| Table | Hypothèse Steve | Justification |
|---|---|---|
| `app_content` | **Cloisonnement** probable (`sourcing.app_content`) | Clés métier `'pitch_pdf_url'`, `'onboarding_video_url'` etc. — risque de collision si fusion sur la même clé entre modules. |
| `user_notifications` | **Fusion** probable avec `public.notifications` | Vérifier d'abord l'existence et la signature de `public.notifications` côté monorepo. Si présente : fusion avec col `module` (1 inbox cross-module pour l'user) ; si absente : créer ou cloisonner. |

**Action Sébastien (en cours)** : inventaire des tables monorepo (existence réelle de `support_tickets`, `formations`, `notifications`, `news_items` côté Suivi+ACT) **d'ici 11 juin** — sans ça impossible de finaliser la migration de fusion. Si une table Sourcing fusionne avec une absente côté monorepo, c'est une CREATE TABLE pure (pas de merge).

#### Récap impact migration

- **3 tables fusionnées** → 1 migration `0NNNN_merge_superadmin_tables.sql` avec backfill `module='sourcing'` + helper `current_user_modules()` partagé `common/`
- **4 tables cloisonnées** → 1 migration `0NNNN_sourcing_superadmin_split.sql` (schema `sourcing.*`)
- **2 tables à arbitrer** → décision d'ici 11 juin Sébastien
- **0 perte de donnée** dans tous les cas (backfill ou copie)

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

### 5.2 Couverture pgTAP RLS (16 fichiers total dont 15 testant, `test:rls`)

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
| `13_companies_isolation.sql` | RLS companies isolation cross-tenant + INSERT force org_id (Lot 1.7) | Critique multi-tenant |
| `14_cotraitant_shares_isolation.sql` | RLS cotraitant_shares + flow public token + items hérite share_id (Lot 1.7) | Critique flow public |
| `15_bureaux_etudes_isolation.sql` | RLS bureaux_etudes isolation cross-tenant (Lot 1.7) | Critique multi-tenant |

**Total post-Lot 1.7 = ~15 policies × ~50 assertions = ~750 assertions pgTAP.** Toutes vertes au 8 juin 2026 (cf. `gates/RECETTE_RLS_LOT17_3_TABLES.md` 24 scénarios cadrés P0/P1).

**Portage Lot 7+** : ces 15+1 fichiers SQL sont **portables tels quels** modulo renommage schema `sourcing.*` (cf. catalogue §8). Le harness `pg_prove --ext .sql tests/rls/` est trivial à reproduire dans le monorepo.

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

### 5.4 Migrations Drizzle 0000-0051 — récap

51 migrations Drizzle séquentielles dans `src/db/migrations/0000_init.sql` → `0051_rls_fix_companies_cotraitant_shares_be.sql` (Lot 1.7). Journal d'application : `src/db/migrations/meta/_journal.json`. Voir le détail directement dans le repo plutôt que dupliquer ici.

**Renumérotation portage** : 0138+ côté monorepo (cf. brief migration §5.4). Plan de fusion : 0138 init enums + schema `sourcing` / 0139 tables base / 0140 RLS (27+13 policies + helpers) / 0141 superadmin scénario C fusion+cloison (cf. §4.4) / 0142 seeds (platforms, ai_prompts, 17 formations) / 0143+ dettes condensées 0010-0048. **0049 (Stripe MVP Option C) jeté** — adoption modèle 0115 monorepo (cf. §3.9 + Q6 visio B-en-2-temps).

---

## 6. Comptes externes / providers tiers

### 6.1 Supabase

| Projet | Région | Plan | Ref ID | Action migration |
|---|---|---|---|---|
| **Sourcing prod** | Frankfurt eu-central-1 | Pro 25 €/mois | `<sourcing-ref>` (1Password : « Supabase Sourcing prod ») | Q2 visio = adopter Paris monorepo → **migration inter-région nécessaire** (pg_dump/pg_restore + downtime 1-3 h) OU acceptation cross-region (latence ~30 ms) |
| **Suivi+ACT prod** | Paris eu-west-3 | Pro | `vlhirdzvewzqgtnhcjft` (1Password Sébastien) | Cible des migrations Sourcing renumérotées 0138+ |

**Pré-bascule J-7 + J-1** : pg_dump des deux projets via `scripts/migration/backup-*-db.ps1` (Direct connection port 5432, refus pooler 6543).

**Post-bascule** : décision Q1 = projet Suivi+ACT Paris devient l'unique référence. Le projet Sourcing Frankfurt est mis en read-only puis décommissionné (économie 25 €/mois).

### 6.2 Vercel

| Projet | Plan | Action migration |
|---|---|---|
| **edifio-sourcing** (compte AlyoSIng) | Pro EU 20 €/mois | Décommissionné après bascule DNS 18 juillet. Conserver `.env.production` exporté via `export-vercel-env.ps1` dans 1Password. |
| **alyos-suivi-chantier** (compte Sébastien probable) | Pro | Cible. Configurer `sourcing.edifio.fr` côté monorepo Vercel + redéployer branche `feat/sourcing-merge` → `main` au moment du switch DNS. |

**Pré-bascule J-7 + J-1** : `vercel env pull` via `export-vercel-env.ps1 -ProjectName "edifio-sourcing"` pour sauvegarder les ENV Sourcing.

### 6.3 Domaines + DNS

- **Registrar** : **OVH** (compte AlyoS, géré par Steve).
- **Domaine** : `edifio.fr` (zone DNS OVH).
- **Sous-domaine actuel Sourcing** : `sourcing.edifio.fr` (probable — à confirmer côté DNS OVH ; Sourcing prod initialement sur `https://edifio-sourcing.vercel.app`).
- **Bascule DNS J0** : repointer `sourcing.edifio.fr` du projet Vercel `edifio-sourcing` vers le projet Vercel `alyos-suivi-chantier`.
- **Procédure** : 1 manipulation côté OVH zone DNS (changer le CNAME `sourcing` vers la nouvelle URL Vercel monorepo) + 5-30 min de propagation TTL.

**MEMORY** : consignes DNS par clic exact dans le panel OVH (cf. `feedback_dns_consignes.md`).

### 6.4 Anthropic API

- **Clé** : `ANTHROPIC_API_KEY` (compte AlyoS).
- **Modèles utilisés** : Sonnet 4.6 (analyse RC PDF natif, brief AO) + Haiku 4.5 (indexation biblio).
- **Consommation audit semaine 29 mai – 5 juin** : ~0,14 € (très faible — MVP avec ~10 AlyoS + tests dev).
- **SDK** : Sourcing `@anthropic-ai/sdk@0.98` vs monorepo `@anthropic-ai/sdk@0.32` → **bump SDK côté monorepo** ou downgrade Sourcing (à arbitrer Lot 6, recommandation : bump monorepo).
- **Action portage** : intégration avec wrapper `common/ai/` du monorepo (retry + audit + ratelimit Upstash).

### 6.5 Brevo

- **Clé** : `BREVO_API_KEY`.
- **Sender** : `BREVO_SENDER_EMAIL` + `BREVO_SENDER_NAME="edifio Sourcing"` → à actualiser post-bascule en « edifio Suite ».
- **Templates** : 7 templates Brevo + 4 templates Resend par organisation (table `message_templates`).
- **Coût** : ~25 €/mois.
- **Action portage** : adoption du module `common/email/` monorepo. Templates `tutoiement TU vs VOUS` (Gate 4) conservés via `lib/brevo/template-picker.ts`.

### 6.6 Resend

- **Clé** : `RESEND_API_KEY`.
- **Sender** : `RESEND_SENDER_EMAIL`.
- **Usage** : emails admin (mot de passe provisoire 16 car., alertes cron, notifications system).
- **Coût** : 0-20 €/mois selon volume.
- **Action portage** : conservation OU fusion avec Brevo via module `common/email/` (Sébastien arbitre Lot 6).

### 6.7 Fly.io worker Playwright

- **Org** : Fly.io EU (compte AlyoS).
- **Worker** : image Docker dédiée (hors du repo Sourcing) qui reçoit `POST /v1/scrape` et lance Playwright headless sur les 6 plateformes régionales (PLACE, francmarches, mp_info, etc.).
- **Webhook** : retour résultats vers `/api/webhooks/scrape` du Next.js.
- **Coût** : ~10-15 €/mois (toujours up).
- **Action Q4 visio = bench POC chromium-min avant 25 juin** :
  - Si POC OK (<50s + <500Mo) → cron Vercel + décommissionnement Fly.io.
  - Si POC KO → conserver Fly.io, migration de l'org Fly vers org commune Suivi+ACT (ou maintien dédié — Sébastien arbitre).

### 6.8 Pappers API

- **Clé** : `PAPPERS_API_KEY`.
- **Usage** : enrichissement Sirene/SIRET sur saisie architecte / BE / cotraitant.
- **Coût** : pay-per-call, consommation à la demande.
- **Action portage** : conservation telle quelle (lib `lib/pappers/*` portable).

### 6.9 Stripe

- **Compte** : SAS edifio (SIREN 105 534 515) — différent d'AlyoS Ingénierie.
- **Statut Sourcing actuel** : MVP minimal Option C (migration 0049), à jeter (cf. §3.9).
- **Statut monorepo** : schémas BDD prêts (migration 0115 `organization_billing_lifecycle`), mais Checkout + webhooks « reste à faire » (Sprint 9.E).
- **Action portage Q6 visio = B-en-2-temps acté Steve** (cf. §4.2).

### 6.10 Upstash Redis (monorepo only)

- **Plan** : `@upstash/redis` + `@upstash/ratelimit`.
- **Usage monorepo** : cache + ratelimit anti-abus sur Server Actions sensibles.
- **Action portage** : réutiliser pour les Server Actions Sourcing sensibles (ex. `/api/cron/sourcing-run` ratelimit, `/api/admin/users` invitation, `/api/archi/[token]/respond` réponse cotraitant).

### 6.11 1Password — coffres référencés

| Coffre | Contenu critique |
|---|---|
| « Supabase Sourcing prod » | PGPASSWORD direct connection + SUPABASE_SERVICE_ROLE_KEY |
| « Supabase Suivi+ACT prod » | PGPASSWORD direct connection + SUPABASE_SERVICE_ROLE_KEY |
| « Vercel AlyoSIng » | Token CLI vercel + .env.production.backup post-bascule |
| « Anthropic » | ANTHROPIC_API_KEY |
| « Brevo » | BREVO_API_KEY |
| « Resend » | RESEND_API_KEY |
| « Fly.io » | API token + connexion machine |
| « OVH » | Identifiants compte registrar (zone DNS) |
| « Stripe SAS edifio » | Secret key + webhook signing secret |
| « Pappers » | API key |

**Action** : Steve transfère les accès nécessaires (sauf Stripe qui reste SAS edifio uniquement) à Sébastien post-bascule. Le compte 1Password lui-même reste géré par Steve.

---

## 7. Risques migration

> Inventaire consolidé des risques techniques majeurs. Pour chaque risque : probabilité, impact, mitigation actuelle. Audits sources : `gates/REVIEW_HUGO_PR121_RISQUES_SECU.md` (sécurité), `gates/RECETTE_PROTECT_OPENING_ADR014.md` (vuln CC-2 fixée), `gates/REVIEW_SUIVI_ACT_PR121.md` (review Sébastien).

### 7.1 Risques résolus par Lot 1 / 1.5 / 1.6 / 1.7 (filet déjà tendu)

| Risque | Statut | Mitigation |
|---|---|---|
| **Mismatch versions Next 14 vs 15** | ✅ Résolu | Lot 1 mergé (PR #115). Sourcing.main désormais Next 15.5.18 + React 19, aligné monorepo. |
| **Auth/session breaking par async cookies Next 15** | ✅ Résolu | Lot 1.5 mergé (PR #116). `createSupabaseServerClient` async + propagation `await` sur 157 sites. Recette QA 1218/1218 verte. Middleware intact (cf. recette §S8). |
| **Codemod `params` Promise échoué silencieusement** | ✅ Résolu | Recette S3 OK : 18 fichiers `params: Promise<…>` + 7 `searchParams: Promise<…>` validés manuellement. Aucun `params: {` synchrone résiduel. |
| **`useFormState` orphelin React 19** | ✅ Résolu | S4 OK : aucun import / call, juste 1 commentaire JSDoc résiduel ProfileForm.tsx ligne 98. |
| **Backup BDD prod foiré (pooler PgBouncer)** | ✅ Mitigé | Scripts ops PR #117 refusent PGPORT=6543 et PGUSER `postgres.*`. Direct connection forcée. |
| **3 tables Sourcing sans RLS (companies / bureaux_etudes / cotraitant_shares)** | ✅ Résolu | Lot 1.7 mergé (PR #123). Migration `0051_rls_fix_companies_cotraitant_shares_be.sql` + 3 nouveaux tests pgTAP 13-14-15 verts. Audit Camille `gates/RECETTE_PROTECT_OPENING_ADR014.md` confirme vuln CC-2 fixée. |
| **Vuln `getRequiredOrgId` (ADR-014 cleanup)** | ✅ Résolu | Lot 1.6 mergé (PR #122). Refactor `isAuthorizedEmail` + fix vuln élévation org_id. |

### 7.2 Risques actifs — phase de portage Lot 2-10

| # | Risque | Probabilité | Impact | Mitigation actuelle | Action restante |
|---|---|---|---|---|---|
| R1 | **Refonte Drizzle → supabase-js casse silencieusement** | Élevée | Très élevé | Tests vitest portés + tests E2E sur flows critiques (compile ZIP, login multi-tenant, cotraitance archi) | Chaque loader réécrit Lot 2 doit avoir son test vitest passant AVANT merge. Garde-fou : Camille (qa). |
| R2 | **Bug RLS lors fusion schémas** (collision policies, organization_id mal scopé) | Moyenne | Très élevé | Suite pgTAP exhaustive existante (15 fichiers testant + 1 helpers, ~750 assertions post-Lot 1.7) | Porter pgTAP intégralement Lot 7. Test cross-tenant AlyoS ⊥ PROTECT obligatoire. |
| R3 | **Cron `sourcing-run` plante après bascule Fly.io → cron Vercel** | Moyenne | Élevé | POC chromium-min `spike/cron-vercel-chromium` livrable AVANT 25 juin | Si POC KO → conserver Fly.io (plan B). Smoke test obligatoire J0 + monitoring 7 jours suivants. |
| R4 | **Cron sourcing 60% échec semaine 29 mai – 5 juin (incident historique)** | Faible mais résiduel | Élevé | Probablement résolu par migrations 0047/0048 du 5 juin | Confirmer monitoring continu + résoudre formellement AVANT 18 juillet. **Bloqueur potentiel de bascule.** |
| R5 | **Stripe transition Sourcing 0049 → 0115 perd des dates trial** | Faible | Moyen | Script de migration explicite à écrire Lot 6 + validation manuelle | Validation : AlyoS active conservée, PROTECT trial avec bonne date de fin. **Cas test à écrire.** |
| R6 | **Régression UX au upgrade Next 15 / React 19** | Faible | Moyen | Lot 1 livré 1 semaine avant migration → fenêtre de prod test | Smoke test manuel par Steve : 3 parcours (login provisoire → reset → ao-du-jour ; admin/users invite ; archi `/archi/[token]`) — recommandé. |
| R7 | **Conflits naming `organizations.contract_summary` vs `subscription_status`** | Élevée | Faible | Audit Lot 0 + script de fusion documenté | Catalogue Drizzle §3 documente les 4 collisions. Sébastien arbitre Lot 2. |
| R8 | **Performance régresse** (Drizzle prepared statements perdus) | Faible | Moyen | Bench avant/après sur 3 requêtes critiques | À mesurer Lot 5 (compile dossier, indexation biblio, cron sourcing). |
| R9 | **Suivi+ACT freeze partiel pendant Lots 2-5** | Élevée (intentionnelle) | Faible | Concertation calendrier amont (CR visio §5) | Communication équipe Sébastien en amont. |
| R10 | **Coût IA explose pendant tests** | Faible | Faible | Limite ENV dev (Anthropic dev key avec quota) | Check `ai_runs.cost_usd` quotidien Lot 6. Audit hebdo semaine 1-14 juillet. |

### 7.3 Risques migration BDD inter-région (Q1 + Q2)

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| **pg_dump → pg_restore Frankfurt → Paris** : downtime 1-3 h selon volume | Élevée (intentionnelle) | Moyen | Mesurer durée pg_dump complet sur backup J-7 (11 juillet) pour calibrer la fenêtre J0. |
| **Encodage UTF-8 sur restore** : caractères français dans données accentués | Faible | Élevé (corruption) | Tester restore vers projet Supabase staging avant J0. Validation : SELECT échantillon sur 5 tables avec caractères français. |
| **Storage Frankfurt → Paris** : 4 buckets à migrer | Moyenne | Élevé | Voir §7.3.1 ci-dessous + procédure §8.3. Risque R13 timing 3h cf. §7.6. |

#### 7.3.1 R-FK — Réécriture des FK `auth.users.id` (risque le plus subtil)

**Risque** : les FK Sourcing vers `auth.users.id` Frankfurt ne fonctionneront plus après migration Paris si les UUIDs ne sont pas préservés. Probabilité **Élevée**, impact **Très élevé** (tout casse).

**Stratégie principale — préserver les UUIDs via Auth API** :

Supabase expose `auth.admin.createUser({ id: <uuid_existant>, email, email_confirm: true, ... })` qui permet de créer un user en imposant un UUID custom. C'est le chemin propre :

```typescript
// Pseudo-code script `scripts/migration/migrate-auth-users.ts` à coder Lot 2
const sourcingUsers = await supabaseFrankfurt.auth.admin.listUsers();
for (const user of sourcingUsers.data.users) {
  await supabaseParis.auth.admin.createUser({
    id: user.id,                           // ← préservation UUID
    email: user.email,
    email_confirm: true,
    user_metadata: user.user_metadata,
    app_metadata: user.app_metadata,
    // password : utiliser flow reset_password ou import hash bcrypt si supporté
  });
}
```

**Test J-14 obligatoire (avant 4 juillet)** :
1. Créer 1 user test via Auth API sur un projet Supabase Paris staging avec un UUID imposé.
2. Vérifier `SELECT id FROM auth.users WHERE email = 'test@…'` retourne bien l'UUID imposé.
3. Si KO : Supabase a changé le contrat → bascule sur Plan B.

**Plan B — mapping ancien_uuid → nouveau_uuid + UPDATE bulk** :

Si la préservation d'UUID échoue, créer une table de mapping et faire un UPDATE bulk sur TOUTES les FK avant `pg_restore` final :

```sql
-- 1. Tabler les nouveaux UUIDs créés par Supabase Paris
CREATE TEMP TABLE auth_uuid_mapping (old_uuid uuid PRIMARY KEY, new_uuid uuid NOT NULL);
-- ... INSERT depuis le résultat de l'import Paris (1 ligne par user) ...

-- 2. UPDATE bulk sur TOUTES les tables Sourcing qui FK vers auth.users
UPDATE sourcing.memberships m SET user_id = mapping.new_uuid
  FROM auth_uuid_mapping mapping WHERE m.user_id = mapping.old_uuid;
UPDATE sourcing.tender_events SET user_id = mapping.new_uuid FROM auth_uuid_mapping mapping WHERE user_id = mapping.old_uuid;
UPDATE sourcing.audit_logs SET actor_user_id = mapping.new_uuid FROM auth_uuid_mapping mapping WHERE actor_user_id = mapping.old_uuid;
-- ... idem pour notifications.user_id, ai_runs.triggered_by, etc. ...
```

**Tables Sourcing avec FK vers `auth.users.id` à patcher** (audit Lot 2) : `memberships.user_id`, `audit_logs.actor_user_id`, `notifications.user_id`, `tender_events.user_id`, `ai_runs.triggered_by`, plus toutes les `*_created_by` / `*_updated_by` si présentes. **À inventorier exhaustivement Lot 2 par `grep references "auth.users"` sur `src/db/schema/`.**

**Important** : exécuter l'UPDATE bulk AVANT `pg_restore` final, pas après — sinon les contraintes FK rejetteront le restore.

### 7.4 Risques sécurité (post-incident 21/05)

| Risque | Statut | Mitigation |
|---|---|---|
| **Secrets non rotés** (password BDD prod, API keys) | 🟡 Reporté post-MVP | Rotation prévue avant mise en service réelle. Cf. §3.8. |
| **`.env.production.backup` en clair sur disque** | ✅ Mitigé | Script `export-vercel-env.ps1` `-Encrypt age` automatique avant J-7 (Hugo finding fixé PR #119). |
| **Hardening `migrate.ts` masking erreurs postgres-js** | 🟡 À faire avant mise en service réelle | Documenté MEMORY `followup_post_mvp_security_rotations.md`. |
| **Audit log 5 ans corruption** | ✅ Mitigé | Triggers `reject_audit_mutation` IMMUTABLE actifs. **À reposer SQL natif intact côté monorepo** — sinon perte garantie 5 ans. |

**Correction factuelle vs v1 (audit Hugo `gates/REVIEW_HUGO_PR121_RISQUES_SECU.md`)** : la liste « tables sans RLS » v1 contenait 3 erreurs (`tender_briefs`, `shortlist_criteria`, `dossier_dispatches` ont en réalité des RLS dès leur migration de création — 0022/0027/0038) et **1 oubli** (`bureaux_etudes`, fixé Lot 1.7 mig. 0051). Cf. §2.5 pour l'inventaire corrigé.

**Correction factuelle Anthropic SDK** : la mention « bump SDK monorepo 0.32 → 0.98 ou downgrade Sourcing » (§6.4) est sur-évaluée. Audit Hugo `gates/REVIEW_HUGO_PR121_RISQUES_SECU.md` : **aucune feature 0.98-only utilisée dans le code Sourcing** (pas d'`extended_thinking`, pas de `parallel_tool_use` natif côté SDK). Garder ou downgrader OK indifféremment. Recommandation simplifiée : adopter la version du monorepo au portage (downgrade Sourcing si version monorepo ≥ 0.32, sinon upgrade monorepo). Pas de blocker.

### 7.5 Risques DNS / continuité de service

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| **TTL DNS trop long ralentit bascule** | Moyenne | Moyen | Réduire TTL CNAME `sourcing.edifio.fr` à 300s (5 min) **48h avant J0** (15 juillet matin) côté OVH. |
| **Rollback DNS après bascule** | Moyenne | Élevé | Procédure documentée `scripts/migration/README.md` §Rollback. 5-30 min selon TTL. |
| **Smoke tests J0 fail → décision rollback** | Possible | Très élevé | Critères de rollback explicites : ZIP non généré OU login impossible OU données absentes. Décision par Steve à 10h30. |

### 7.6 Risques additionnels R11-R15 (review Sébastien `gates/REVIEW_SUIVI_ACT_PR121.md`)

5 risques opérationnels remontés par Sébastien suite à la review PR #121 — à traiter explicitement dans le plan de bascule :

| # | Risque | Probabilité | Impact | Fenêtre | Mitigation |
|---|---|---|---|---|---|
| **R11** | **Cookie SSO `.edifio.fr` durant bascule 9h-9h35** : les sessions actives sur l'ancien projet Vercel deviennent invalides après bascule DNS (cookie scopé `.edifio.fr` partagé entre projets) — l'user se retrouve « logout » côté nouveau projet sans réauth automatique. | Élevée | Moyen | Bascule 9h-9h35 | Pré-bascule : `COOKIE_DOMAIN=.edifio.fr` validé côté monorepo identique à Sourcing. Forcer logout préalable (R14). Communication user « reconnectez-vous » dans le mail 11h. Tester pendant smoke P1/P2. |
| **R12** | **Cron 6h30 du lundi 19/7 KO = AlyoS aveugle lundi** : si le cron Vercel ne tourne pas ou échoue silencieusement après bascule, AlyoS n'a pas son flux AO du jour à 7h lundi matin. **🔴 CRITIQUE COMMERCIAL** — AlyoS perd la valeur perçue principale du produit dès le 1er jour post-bascule. | Moyenne | Très élevé (commercial) | Lundi 20/7 7h00 | **Smoke test lundi 7h obligatoire** : Steve vérifie manuellement à 7h00 que `/sourcing/ao-du-jour` charge avec ≥1 AO Frais du jour. Si KO : déclenchement manuel `/api/cron/sourcing-run` avec `CRON_SECRET` + escalade Sébastien. Backup plan : importer le dump du dimanche 19/7 cron si POC Vercel KO. |
| **R13** | **Storage 4 buckets timing déborde 3h** : la migration des 4 buckets (cf. §8.3) peut prendre 2-4 h selon volume, ce qui dépasse la fenêtre 8h-11h prévue. | Moyenne | Élevé | J0 9h-12h | **Mesurer le volume J-7** (11/7) par bucket via `aws s3 ls --summarize` ou équivalent Supabase Storage API. Si total > 5 Go → pré-migrer les buckets immuables (`app-assets`, `bibliotheque`) en J-3 (mercredi soir 15/7), garder pour J0 uniquement les buckets actifs (`dossier-zip`, `dossier-pieces`). Détail procédure §8.3. |
| **R14** | **Sessions Supabase actives pendant migration** : si des users sont connectés au moment de la bascule, leur session JWT pointe encore vers le projet Frankfurt. Risque de comportement incohérent post-bascule. | Faible | Moyen | J0 8h-9h | **Forcer logout préalable** : Sébastien lance `supabase auth admin sign-out-all` (ou équivalent) à 8h05 simultanément avec le freeze écritures. Mail user envoyé à 18h J-1 prévient du logout forcé. |
| **R15** | **Webhook Brevo HMAC** : le secret HMAC `/api/webhooks/brevo` est scope projet Vercel. Post-bascule, le webhook Brevo continue de pinger l'ancienne URL Vercel (ou retombe sur la nouvelle via DNS) mais avec un secret HMAC potentiellement différent côté monorepo. | Moyenne | Moyen | J0 9h-11h | **Re-vérifier le secret HMAC** côté monorepo Vercel post-bascule : `BREVO_WEBHOOK_HMAC_SECRET` doit être identique entre l'ancien Sourcing et le nouveau monorepo, OU mise à jour côté Brevo Dashboard pour pointer vers le nouveau secret. Smoke test : envoyer 1 email Brevo manuellement à 10h00, vérifier la trace `brevo_messages.events` JSONB s'incrémente. |

---

## 8. Procédure de bascule J0

> Référence opérationnelle : `scripts/migration/README.md` (152 lignes, livré PR #117) pour les commandes PowerShell exactes. Ce qui suit est la **séquence consolidée J-7 → J0 → J+7**.

### 8.1 J-7 (samedi 11 juillet 2026) — Répétition générale

**Objectif** : valider toute la chaîne backup + restore + smoke en conditions réelles avant J0.

| Heure | Action | Acteur | Sortie |
|---|---|---|---|
| 09h00 | Backup Sourcing BDD (Direct connection Frankfurt) | Steve (PowerShell) | `backups/sourcing-prod-2026-07-11-0900.dump` |
| 09h15 | Backup Suivi+ACT BDD (filet de sécurité) | Steve (PowerShell) | `backups/suiviact-prod-2026-07-11-0915.dump` |
| 09h30 | Backup Vercel ENV preview + production | Steve (PowerShell) | `backups/edifio-sourcing/2026-07-11/.env.production.backup` |
| 09h45 | Backup Storage Sourcing 4 buckets | Steve (PowerShell) | `backups/storage/edifio-sourcing/{company_library,response_files,tender_documents,app-assets}/...` |
| 10h00 | Restore test BDD sur projet Supabase staging | Steve | Validation `SELECT count(*)` sur tables clés AlyoS + PROTECT |
| 10h30 | Smoke test E2E sur preview Vercel `feat/sourcing-merge` | Steve + Sébastien | 3 parcours critiques verts |
| 11h00 | Mesure durée pg_dump complète | Steve | Calibrage fenêtre J0 (objectif <60 min) |

**Critères GO/NO-GO post-J-7** :
- ✅ Restore staging réussit (5 tables validées)
- ✅ Smoke test 3 parcours vert
- ✅ Durée pg_dump <60 min
- Si KO sur l'un → décaler bascule à un samedi ultérieur, Sébastien arbitre.

### 8.2 J-1 (vendredi 17 juillet 2026 soir) — Backup officiel + freeze

| Heure | Action | Acteur |
|---|---|---|
| 17h00 | Code freeze sur `edifio-sourcing.main` : pas de merge sauf fix critique | Tous |
| 17h30 | Backup officiel Sourcing BDD + Vercel ENV + Storage (re-jeu des scripts J-7) | Steve |
| 18h00 | Communication AlyoS + PROTECT : « migration demain matin 8h-11h, indisponibilité possible » | Steve |
| 18h30 | Réduction TTL DNS CNAME `sourcing.edifio.fr` à 300s côté OVH | Steve (pas-à-pas MEMORY) |
| 19h00 | Validation finale branche `feat/sourcing-merge` côté monorepo : merge sur `main` + déploiement production Vercel | Sébastien |
| 19h30 | Smoke test final sur URL Vercel monorepo (pas encore sur sourcing.edifio.fr) | Steve + Sébastien |

### 8.3 J0 (samedi 18 juillet 2026, 8h-11h) — Bascule effective

| Heure | Action | Acteur | Critère succès |
|---|---|---|---|
| **08h00** | Annonce démarrage bascule dans Slack équipe | Steve | — |
| **08h05** | Freeze écritures `sourcing.edifio.fr` (mode read-only via env var + banner UI) + **logout forcé toutes sessions actives** (R14) | Sébastien | Banner visible + `auth.sessions` vidé |
| **08h15** | Dump-restore final BDD Sourcing → BDD Suivi+ACT Paris + **UPDATE bulk auth_uuid_mapping si Plan B FK** (cf. §7.3.1) | Steve | `pg_restore` exit 0, tables `sourcing.*` présentes, FK vers `auth.users` valides |
| **08h30** | Application des migrations Sourcing 0138-0144 sur projet Suivi+ACT (Sébastien applique en Studio manuel selon Q8) | Sébastien | Toutes migrations OK, RLS actif `\dn` shows `sourcing` schema |
| **08h45** | Re-seed des plateformes + ai_prompts + formations 17 guides | Sébastien | `SELECT count(*) FROM sourcing.platforms = 5`, idem ai_prompts, formations 17 lignes (cf. §9.7) |
| **08h00-09h00** | **Migration Storage 4 buckets** (parallèle des steps BDD, cf. §8.3.1) | Steve | Voir détail §8.3.1 — total <60 min visé |
| **09h00** | **Bascule DNS Vercel** — `sourcing.edifio.fr` repointé vers projet `alyos-suivi-chantier` | Steve (OVH panel par clic exact) | `dig CNAME sourcing.edifio.fr` retourne la nouvelle URL |
| **09h05-09h35** | Propagation DNS (TTL 300s → propagation rapide). **Vérif R15 webhook Brevo HMAC** : ping manuel 10h00 + check `brevo_messages.events` incrémenté | — | `curl -sI https://sourcing.edifio.fr` retourne du HTML monorepo |
| **09h30** | Smoke tests utilisateurs (Steve + un membre PROTECT volontaire) | Steve + utilisateur PROTECT | 5 parcours verts (cf. §8.4) |
| **10h30** | Décision GO/NO-GO continuation OU rollback | Steve | Si GO → poursuite ; si NO-GO → §8.5 |
| **10h45** | Décommissionnement deploy Vercel `edifio-sourcing` (URL vercel.app inactive) | Sébastien | Statut "removed" sur dashboard Vercel |
| **11h00** | Communication clients (AlyoS + PROTECT + observateurs) : « migration réussie, reconnectez-vous » (R11 cookie SSO) | Steve | Email Resend envoyé |

#### 8.3.1 Step Storage — migration des 4 buckets (détail R13)

**Buckets à migrer** (déclarations dans `src/lib/storage/buckets.ts`) :

| Bucket | Privé/Public | Volume estimé | Stratégie J0 | Acteur |
|---|---|---|---|---|
| `app-assets` | Public read | <100 Mo (logos org branding) | **Pré-migrer J-3** (mercredi 15/7 soir) — immuable, pas de risque de drift | Steve |
| `bibliotheque` | Privé | 500 Mo - 2 Go (presentation_library — kbis, fiches, CV, références) | **Pré-migrer J-3** — quasi-immuable, dernière sync vérifiée J-1 17h | Steve |
| `dossier-zip` | Privé | 200 Mo - 1 Go (response_files compilés) | **J0 8h00** (parallèle bascule BDD) | Steve |
| `dossier-pieces` | Privé | 1-3 Go (tender_documents RC + DCE) | **J0 8h00** (parallèle bascule BDD) | Steve |

**Méthode** : script `scripts/migration/backup-supabase-storage.ps1` (PR #117, livré) pour le DUMP côté Frankfurt + script inverse `restore-supabase-storage.ps1` **à coder Lot 2** pour le RESTORE côté Paris. API REST Supabase Storage (`SUPABASE_SERVICE_ROLE_KEY` obligatoire des deux côtés).

**Estimation temps** : ~30 min par bucket selon volume (mesure J-7 obligatoire pour calibrer — cf. R13). Si total >60 min, la pré-migration J-3 des 2 buckets immuables (`app-assets` + `bibliotheque`) ramène la fenêtre J0 à ~30 min pour les 2 buckets actifs (`dossier-zip` + `dossier-pieces`).

**Validation post-restore** :
1. `SELECT COUNT(*) FROM storage.objects WHERE bucket_id = ?` côté Paris == côté Frankfurt
2. SELECT random 10 fichiers par bucket, comparer SHA-256 ou size
3. Pour les buckets privés, vérifier les signed URLs fonctionnent (`createSignedUrl({ expiresIn: 60 })` retourne 200)

**⚠️ Risque résiduel R13** : si la mesure J-7 révèle un volume `dossier-pieces` >3 Go, retomber sur la pré-migration partielle (J-3 + sync delta J0). Décision à 11h le J-7 par Steve.

### 8.4 Smoke tests obligatoires J0 (5 parcours, 30 min)

| Parcours | Détail | Critère succès |
|---|---|---|
| **P1 — Login AlyoS** | Login `steissier@alyosingenierie.fr` → voit ses AO sourcés du jour | Dashboard `/sourcing/ao-du-jour` charge avec ≥1 AO |
| **P2 — Login PROTECT** | Login user PROTECT → voit SES AO sourcés (différents de AlyoS) | Pas d'AO AlyoS visible (test isolation RLS multi-tenant) |
| **P3 — Compile dossier complet** | Sur 1 AO sélectionné AlyoS : analyzeRcAction → cerfa validé → matching pieces → compile ZIP | ZIP téléchargé contient DC1+DC2+RC+pieces |
| **P4 — Page publique cotraitant** | Ouvrir lien `/archi/[token]` envoyé à un architecte de test (JWT signing OK) | Page charge, formulaire visible, signature JWT OK |
| **P5 — Page billing superadmin** | Login superadmin → `/sourcing/superadmin/organizations/{id}/billing` | Page accessible, trial_status correct pour AlyoS + PROTECT |

**Critères rollback** : si l'un de ces 5 parcours fail à 10h30 → rollback obligatoire (§8.5).

**Smoke test J+2 critique (R12)** : lundi 20/7 7h00 — Steve vérifie manuellement `/sourcing/ao-du-jour` charge avec ≥1 AO récent (date publication ≤ 24h). Si KO : déclenchement manuel `/api/cron/sourcing-run` + escalade Sébastien.

### 8.5 Plan de rollback (si bascule échoue à 10h30)

**Critère de déclenchement** : ≥1 smoke test critique fail (ZIP non généré, login impossible, données absentes, JWT public KO).

| Étape | Action | Délai | Acteur |
|---|---|---|---|
| 1 | Décision rollback annoncée Slack équipe | T0 | Steve |
| 2 | Repointer DNS `sourcing.edifio.fr` → ancien projet Vercel `edifio-sourcing` | T+2 min (OVH panel) | Steve |
| 3 | Si BDD partagée Q1=A : aucune action BDD (le DNS bascule suffit, anciennes pages re-tapent sur les rows partagées) | — | — |
| 4 | Si BDD séparée Q1=B : restore `.dump` Sourcing sur projet Sourcing Frankfurt **PAS NÉCESSAIRE** (Frankfurt intact, pas touché par migration) | — | — |
| 5 | Désactiver le mode read-only du repo Sourcing (banner + env var) | T+5 min | Sébastien |
| 6 | Propagation DNS rollback (TTL 300s) | T+5 à T+35 min | — |
| 7 | Smoke test post-rollback sur Sourcing original | T+35 min | Steve |
| 8 | Communication clients : « migration reportée, service nominal » | T+45 min | Steve |
| 9 | Post-mortem express équipe Sourcing + Sébastien | Lundi 20 juillet | Tous |
| 10 | Retentative bascule samedi 25 juillet (ou samedi suivant) | J+7 | Tous |

**Délai de retour à la normale** : 5-30 min selon TTL DNS (TTL 300s réduit cf. §8.2).

### 8.6 J+7 (samedi 25 juillet 2026) — Post-mortem

Cf. CR visio Point 5 :
- Documentation décisions migration (ADR-015 « Migration Sourcing → monorepo edifio »)
- Mise à jour `CLAUDE.md` Sourcing → archive read-only
- Mise à jour `CLAUDE.md` monorepo (module Sourcing intégré)
- Communication équipe + clients : retour d'expérience
- Décommissionnement final : archive GitHub `edifio-sourcing` en read-only, suppression projet Vercel `edifio-sourcing`, suppression projet Supabase Sourcing Frankfurt (après 90 jours de rétention backup).

---

## 9. Annexes

### 9.1 Documents référencés (lecture complémentaire)

| Document | Localisation | Description |
|---|---|---|
| **Brief migration v2** | `docs/brief_migration_sourcing_to_monorepo.md` | 964 lignes (~32 pages). Inventaire complet repo source + cible, comparatif stacks, 10 lots, 8 risques, plan bascule + rollback. **Lecture obligatoire avant le présent handoff.** |
| **CR visio cadrage** | `docs/CR_visio_cadrage_migration_2026-06-07.md` | 207 lignes. CR validé Sébastien + Steve. Q1-Q10 confirmées, calendrier consolidé, scénario C hybride superadmin. |
| **Catalogue Drizzle** | `docs/CATALOG_SCHEMAS_DRIZZLE_TO_MONOREPO.md` | 315 lignes. Lot 0a. Mapping détaillé 25 fichiers schema Drizzle → 31 loaders monorepo + 12 enums + 40 RLS. |
| **PREP Lot 0b** | `docs/PREP_LOT_0B_chromium_min.md` | 200+ lignes. Plan POC chromium-min Vercel vs Fly.io (Q4). Livrable bench avant 25 juin. |
| **PREP Lot 1** | `docs/PREP_LOT_1_upgrade_next15.md` | 200+ lignes. Audit grep breaking changes Next 14→15 (params async, cookies async, React 19). **Référence post-mortem si pb Next 15.** |
| **Brief global** | `docs/brief_global_edifio_sourcing.md` | Brief produit + technique + financier (~18 pages). Contexte stratégique edifio. |
| **DEPLOY** | `docs/DEPLOY.md` | Procédure de déploiement actuelle Vercel. À adapter post-bascule pour monorepo. |
| **Variables Mustache CERFA** | `docs/variables_mustache_dc1_dc2.doc` | 33 balises Mustache DC1 + DC2 documentées. À conserver à l'identique post-swap docxtemplater. |

### 9.2 Scripts ops migration (PR #117)

| Script | Localisation | Description |
|---|---|---|
| README | `scripts/migration/README.md` | Procédure pas-à-pas backup J-7 + J-1 + rollback. **Référence opérationnelle Steve.** |
| `backup-sourcing-db.ps1` | `scripts/migration/` | pg_dump Sourcing Frankfurt (Direct connection 5432). Refus pooler. Flag `-UseDocker` fallback. |
| `backup-suiviact-db.ps1` | `scripts/migration/` | pg_dump Suivi+ACT Paris (idem). |
| `export-vercel-env.ps1` | `scripts/migration/` | `vercel env pull` preview + production. Bandeau sécurité. Recommandation `age` encryption. |
| `backup-supabase-storage.ps1` | `scripts/migration/` | Backup 4 buckets via API REST. SERVICE_ROLE_KEY obligatoire. |

### 9.3 Gates / reviews / recettes Lot 1 / 1.5 / 1.6 / 1.7

| Document | Type | Verdict |
|---|---|---|
| `gates/RECETTE_PR_115_116_LOT1_LOT15.md` | Recette Camille (QA) | 8 scénarios S1-S6 OK, 0 bloquant. 1218/1218 vitest verts. |
| `gates/REVIEW_HUGO_PR117.md` | Review reviewer | APPROUVÉ SOUS RÉSERVE. 0 bloquant sécurité, 2 à corriger avant J-7 (fix `-Encrypt age` mergé PR #119). |
| `gates/REVIEW_HUGO_PR121_RISQUES_SECU.md` | Audit reviewer (sécurité) | Source des **corrections factuelles §7.4** : R3 v1 mentions 3 tables erronées sur RLS + 1 oubli (`bureaux_etudes`) ; R4 v1 Anthropic SDK 0.98 sur-évalué. Vuln `getRequiredOrgId` flagée → fixée Lot 1.6 PR #122. |
| `gates/RECETTE_PROTECT_OPENING_ADR014.md` | Recette Camille (QA) ADR-014 | **Vuln CC-2 fixée** : `current_organization_id()` retournait NULL côté flow public cotraitant — fixé Lot 1.7 mig. 0051 policy `public_token_read` séparée. |
| `gates/REVIEW_SUIVI_ACT_PR116.md` | Review suivi_act_reviewer | CHANGEMENT REQUIS (mineur). UnsafeUnwrappedCookies inutilisée supprimée PR #118. |
| `gates/REVIEW_SUIVI_ACT_PR121.md` | Review suivi_act_reviewer (review du présent handoff) | CHANGEMENT REQUIS — source du rework v2 (le présent document). |
| `gates/REVIEW_SUIVI_ACT_PATTERN_RLS_LOT17.md` | Review suivi_act_reviewer (pattern RLS Lot 1.7) | 🟠 ORANGE — 3/5 dimensions à adapter avant push (helper SQL, naming, cotraitant_shares anon). Adressé Lot 1.7-bis post wrap call sites. |
| `gates/RECETTE_RLS_LOT17_3_TABLES.md` | Recette Camille (QA) Lot 1.7 | 24 scénarios cadrés (10 pgTAP + 5 Playwright + 4 régression + 5 CC). PR #123 mergée tests 13-14-15 verts. |
| `gates/AUDIT_PRE_RLS_LOT17.md` | Audit reviewer pré-implémentation Lot 1.7 | Identifie le pattern `postgres BYPASSRLS` → décision ENABLE seul (pas FORCE) Lot 1.7, FORCE reporté Lot 1.7-bis. |

### 9.4 Variables d'environnement complètes Sourcing

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
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# E2E tests
E2E_TEST_ROUTES_ENABLED=             # =1 active /api/test/seed-session (CI only)
```

### 9.5 Buckets Supabase Storage (4 buckets, à migrer — cf. §8.3.1)

| Bucket | Privé/Public | RLS scope | Contenu |
|---|---|---|---|
| `company_library` | Privé | `{orgId}/{kind}/{ts}_{filename}` | Documents bibliothèque entreprise (Kbis, DC1/DC2 templates, fiches métiers, CV, références, tableau Excel, etc.) |
| `response_files` | Privé | `{orgId}/{tenderId}/...` | CERFA générés (DC1, DC2 multi-archi/BE) + ZIP dossier compilé |
| `tender_documents` | Privé | `{orgId}/{tenderId}/...` | RC et DCE des AO (uploadés ou téléchargés depuis le source) |
| `app-assets` | Public read | `{orgId}/...` | Logos organisation custom |

À fusionner ou réutiliser tels quels selon la politique du module `common/storage/` monorepo.

### 9.6 ADR Sourcing référencés

| ADR | Date | Sujet |
|---|---|---|
| ADR-011 | 12 mai 2026 | Pivot magic-link → password durable (scanner email entreprise bloquait les links) |
| ADR-012 | 15 mai 2026 | Alignment visuel edifio.fr (design tokens partagés) |
| ADR-013 | 18 mai 2026 | ORM Drizzle retenu vs Prisma (score 7,80/10 vs 5,30/10) — **À RECONSIDÉRER post-bascule : Q2 = drop Drizzle pour supabase-js direct** |
| ADR-014 | 5 juin 2026 | Levée du filtre `@alyosingenierie.fr` du middleware → ouverture multi-tenant (PROTECT) |
| ADR-015 | À écrire 25 juillet 2026 | Migration Sourcing → monorepo edifio (post-mortem) |

### 9.7 Documentation utilisateur (17 guides intégrés)

17 guides intégrés dans l'app sous `/sourcing/profil/formations/[slug]`, table `formations`. Source de vérité : `src/db/seed/formations-content-fixture.ts` (17 entrées, ~917 lignes markdown total).

| # | Slug | Titre |
|---|---|---|
| 1 | `prise-en-main` | Prendre en main edifio Sourcing en 10 minutes |
| 2 | `ao-du-jour` | Traiter sa file « AO du jour » |
| 3 | `cotraitance` | Répondre en cotraitance avec un architecte |
| 4 | `contacts-coffre-bet` | Gérer les contacts et le coffre documentaire BET |
| 5 | `modes-de-reponse` | Choisir ton mode de réponse à un AO |
| 6 | `analyse-rc-pieces` | Analyser le RC et compléter ton dossier |
| 7 | `dc1-dc2-pouvoir-zip` | Préparer DC1, DC2, Pouvoir et compiler le ZIP final |
| 8 | `diffusion-dossier-archi` | Valider et envoyer le dossier à l'architecte |
| 9 | `indexation-ia-biblio` | Indexer ta bibliothèque entreprise avec Claude IA |
| 10 | `expirations-biblio` | Surveiller les expirations d'attestations dans ta bibliothèque |
| 11 | `export-csv-ao-du-jour` | Exporter les AO du jour au format Excel pour ton tableau Veille_AO |
| 12 | `pilotage-admin-observabilite` | Piloter l'activité depuis les dashboards admin |
| 13 | `cerfa-docx-templates` | Personnaliser les CERFA DC1/DC2 avec tes propres modèles Word |
| 14 | `debug-sourcing-zero-inserted` | Diagnostiquer un sourcing à 0 inserted |
| 15 | `fiches-metiers-matching-auto` | Fiches métiers : utiliser le matching auto |
| 16 | `references-matching-auto` | Références : matching auto via tableau Excel + fiches A4 |
| 17 | `cv-matching-auto` | CV : sélection auto des intervenants par mots-clés |

**Portage** : telles quelles (markdown rendu HTML, pur contenu — `slug`, `title`, `summary`, `content_md`, `module`). Seed à porter Lot 10 dans la migration `0NNNN_seed_formations.sql` côté monorepo. Si Q6 superadmin fusion `formations` choisie (cf. §4.4), inclure `module = ARRAY['sourcing']` au moment du backfill.

### 9.8 Entité juridique éditrice

**SAS edifio**
- SIREN 105 534 515
- RCS Marseille
- Immatriculation 01/06/2026
- Siège 5 avenue Verlaque, 13009 Marseille

Stripe Checkout doit facturer au nom de **SAS edifio** (pas AlyoS Ingénierie). Brevo + Resend senders à actualiser post-bascule en « edifio Suite » ou « edifio Sourcing ».

### 9.9 Contacts équipe

| Personne | Rôle | Email |
|---|---|---|
| Steve TEISSIER | CEO AlyoS / dirigeant SAS edifio / lead Sourcing | steissier@alyosingenierie.fr |
| Sébastien TEISSIER | Lead Suivi+ACT / lead migration | sebastien@edifio.fr |
| Sophie (CTO Cowork) | Pilotage stratégique CTO | (via Cowork) |
| Marc (CEO Cowork) | Pilotage stratégique CEO | (via Cowork) |
| Léa (CMO Cowork) | Pilotage marketing | (via Cowork) |
| Théo (Graphiste Cowork) | Design + tokens | (via Cowork) |

---

*FIN HANDOFF v2 — 9 sections + 9 annexes couvertes (v1 = 10 sections, §6 Sub-agents supprimé, §7.11 Total infra supprimé, §5.4 condensé, §2.1 Sourcing engine détaillé, §2.5 RLS corrigé post-Lot 1.7, §4.4 Q6 superadmin détaillé, §7.3 R-FK détaillé + test J-14, §7.6 R11-R15 ajouté, §8.3.1 Storage 4 buckets détaillé, §9.7 17 guides listés). Lecture obligatoire Sébastien avant kickoff 1er juillet 2026. Date version : 2026-06-09.*
