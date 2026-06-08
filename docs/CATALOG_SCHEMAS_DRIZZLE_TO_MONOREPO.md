# Catalogue Drizzle → loaders monorepo

> Steve 2026-06-07 — Lot 0a de la migration edifio-sourcing → alyos-suivi-chantier.
> Validé par Sébastien (équipe Suivi+ACT) lors de l'échange du 7 juin.

## 1. Vue d'ensemble

- **25 fichiers schemas Drizzle lus** dans `src/db/schema/` (hors `index.ts`, `enums.ts`, `*.test.ts`)
- **Total : 41 tables physiques** déclarées via `pgTable(...)` (chaque fichier déclare 1 à 8 tables)
- Répartition cible :
  - **31 tables → schema `sourcing.*`** (nouvelles, à créer dans le monorepo)
  - **4 tables → schema `public.*`** (existantes monorepo, à étendre ou à ne pas porter)
  - **6 tables superadmin → à arbitrer en visio** (collisions possibles avec `public.superadmin_*` monorepo)
- **12 enums Postgres** à reposer via `CREATE TYPE sourcing.*` (sauf doublons `public.role`)
- **4 migrations RLS Sourcing** déjà écrites : `0002_rls.sql` (20 policies), `0006_tandem_rls.sql` (1), `0009_rls_messaging.sql` (2), `0018_rls_cotraitants_be.sql` (4) → **27 policies tenant_isolation + 7 policies admin restrictives** à reproduire en SQL natif côté monorepo.

---

## 2. Tables → schema `sourcing.*` (à créer dans le monorepo)

| Fichier Drizzle | Table cible | Loader monorepo | RLS scope | Notes |
|---|---|---|---|---|
| `config.ts` | `sourcing.search_profiles` | `modules/sourcing/db/search_profiles.ts` | `organization_id` direct | Cols clés : `keywords` JSONB, `cpv_codes/geo_zones/market_types` text[], `amount_min/max`, `cron_time`, `cron_days` int[]. Index partiel sur `active` et `is_default`. Migration 0025 ajoute `is_default` + `display_order`. |
| `config.ts` | `sourcing.platforms` | `modules/sourcing/db/platforms.ts` | Pas de RLS (référentiel 4 lignes) | Seed initial : `boamp`, `place`, `francmarches`, `mp_info`, `prive`. UNIQUE sur `code`. |
| `config.ts` | `sourcing.platform_credentials` | `modules/sourcing/db/platform_credentials.ts` | `organization_id` | PK composite `(organization_id, platform_id)`. `credentials_vault_ref` text (jamais clair). |
| `architects.ts` | `sourcing.architect_specialties` | `modules/sourcing/db/architect_specialties.ts` | Pas de RLS (référentiel 7 lignes) | UNIQUE sur `code`. |
| `architects.ts` | `sourcing.architects` | `modules/sourcing/db/architects.ts` | `organization_id` direct | Cols clés : `cabinet` (NOT NULL), `email` nullable, `siren/siret`, `tutoiement` bool (Gate 4), `solicitable` GENERATED `(email IS NOT NULL)`, `revenue_n1/n2/n3` (migration 0047), DC1 (`address_line1/2`, `signature_city`, `legal_representative_name/role`, `legal_form` migration 0040). UNIQUE `(org, email)`. Index GIN sur `specialty_codes` + `geo_zones`. Index partiel `solicitable=TRUE AND active=TRUE`. |
| `tenders.ts` | `sourcing.tenders` | `modules/sourcing/db/tenders.ts` | `organization_id` direct | Table centrale. Cols : `external_ref`, `platform_id` FK, `title`, `buyer`, `buyer_address`, `cpv` text[], `amount`, `deadline`, `dce_url`, `raw_data` JSONB, `score` numeric(5,2) CHECK 0-100, `status` enum, `matching_profile_id` FK→search_profiles, `deferred_until`, `excluded_at`, `postal_code`, `department`, `notice_type`, `is_exclusive`. UNIQUE idempotence `(org, external_ref, platform_id)`. Index GIN trigram sur `title`. Index partiel scoré sur status='sourced'. |
| `tenders.ts` | `sourcing.tender_lots` | `modules/sourcing/db/tender_lots.ts` | EXISTS via `tenders.organization_id` | Pas de FORCE RLS (cf. 0002_rls.sql l.488+). UNIQUE `(tender_id, lot_number)`. |
| `tenders.ts` | `sourcing.tender_documents` | `modules/sourcing/db/tender_documents.ts` | `organization_id` direct | Storage path Supabase. `kind` text (RC, CCAP, CCTP, BPU, DPGF...). |
| `tenders.ts` | `sourcing.tender_events` | `modules/sourcing/db/tender_events.ts` | `organization_id` direct | `event_type` text libre. `data` JSONB. |
| `selections.ts` | `sourcing.selections` | `modules/sourcing/db/selections.ts` | `organization_id` direct | UNIQUE sur `tender_id` (1 sélection par AO). `mode` enum (`solo`/`tandem`/`conception_realisation`). |
| `selections.ts` | `sourcing.match_proposals` | `modules/sourcing/db/match_proposals.ts` | `organization_id` direct | UNIQUE `(tender_id, architect_id)`. `score` numeric(5,2) + `rank` + `rationale` text IA. |
| `selections.ts` | `sourcing.architect_tokens` | `modules/sourcing/db/architect_tokens.ts` | `organization_id` direct | JWT révocables. `jwt_id` UNIQUE. Index partiel sur `revoked = FALSE`. |
| `selections.ts` | `sourcing.architect_responses` | `modules/sourcing/db/architect_responses.ts` | `organization_id` direct | `status` enum (`pending/accepted/declined/info_requested`). `token_id` FK→architect_tokens. `followup_sent_at` (cron J+3 idempotent). UNIQUE `(tender_id, architect_id)`. |
| `selections.ts` | `sourcing.architect_opposition_tokens` | `modules/sourcing/db/architect_opposition_tokens.ts` | `organization_id` direct (RLS 0006) | RGPD art.21 — page publique `/archi/oppose/[token]`. `jti` UNIQUE. Single-use via `used_at`. |
| `library.ts` | `sourcing.response_files` | `modules/sourcing/db/response_files.ts` | `organization_id` direct | Pièces réponse (DC1, DC2, DC4, ATTRI1, mémoire, annexe). FK optionnelle `architect_id` (DC1 multi-archi Tandem, mig. 0036) et `be_id` (DC2 cotraitant BE). Index partiels sur ces FK. |
| `library.ts` | `sourcing.presentation_library` | `modules/sourcing/db/presentation_library.ts` | `organization_id` direct | Biblio entreprise : presentation, attestation, reference, cv, fiche_metier. `valid_until` date pour alertes expiry. `matching_keywords` text[] (mig. 0047). |
| `ai.ts` | `sourcing.ai_prompts` | `modules/sourcing/db/ai_prompts.ts` | Pas de RLS (global) | Prompts versionnés (Gate 5 strict). UNIQUE `(name, version)`. Index partiel sur `active`. |
| `ai.ts` | `sourcing.ai_runs` | `modules/sourcing/db/ai_runs.ts` | `organization_id` direct | Traçabilité Anthropic. FK→ai_prompts (pas de cascade). `input_hash` SHA-256 (cache). `output` JSONB. |
| `ai.ts` | `sourcing.tender_briefs` | `modules/sourcing/db/tender_briefs.ts` | `organization_id` direct | Briefs IA générés à la demande. 1 actif par AO via `is_active`. |
| `integrations.ts` | `sourcing.odoo_opportunities` | `modules/sourcing/db/odoo_opportunities.ts` | `organization_id` direct | Multi-opp Solo/Tandem. CHECK `origin IN ('solo','tandem')`. 2 index partiels UNIQUE : `uniq_opp_solo` + `uniq_opp_tandem`. `last_error` text traçabilité XML-RPC. |
| `integrations.ts` | `sourcing.brevo_messages` | `modules/sourcing/db/brevo_messages.ts` | `organization_id` direct | `events` JSONB NOT NULL DEFAULT `'[]'`. `register` enum brevo (tu/vous/neutre). |
| `integrations.ts` | `sourcing.notifications` | `modules/sourcing/db/notifications.ts` | `organization_id` direct + `user_id` | Isolation par org ET user (pattern unique cf. 0002_rls l.181). Index partiel sur non lues. **Collision potentielle nom** avec une éventuelle table `public.notifications` monorepo — à vérifier. |
| `audit.ts` | `sourcing.audit_logs` | `modules/sourcing/db/audit_logs.ts` | `organization_id` + role admin | IMMUTABLE INSERT-only (triggers `reject_audit_mutation`). Policy admin restrictive. `action` enum (22 valeurs), `data` JSONB. **Note : collision probable avec `public.audit_log` monorepo — à arbitrer**. |
| `audit.ts` | `sourcing.learning_events` | `modules/sourcing/db/learning_events.ts` | `organization_id` direct | Signaux apprentissage moteur scoring. `event_type` enum (`selected/rejected`). |
| `messaging.ts` | `sourcing.message_templates` | `modules/sourcing/db/message_templates.ts` | `organization_id` + admin_write/admin_update restrictives (0009) | 11 templates par org : 7 Brevo + 4 Resend. UNIQUE `(org, key)`. `version` int incrémental. |
| `messaging.ts` | `sourcing.organization_profiles` | `modules/sourcing/db/organization_profiles.ts` | `organization_id` + admin restrictives | 1 ligne par org (UNIQUE). Bloc présentation 4 puces AlyoS. DC2 fields (`address_line1/2`, `capital_eur`, `signature_city`, `legal_representative_name/role`, `revenue_n1/n2/n3`, `legal_form` mig. 0040). |
| `bureaux-etudes.ts` | `sourcing.bureaux_etudes` | `modules/sourcing/db/bureaux_etudes.ts` | `organization_id` direct | Annuaire BE techniques. Calqué sur `architects` (cabinet/contact/email/siren+siret/zip+city/headcount/companySize/specialty_codes/geo_zones/tutoiement/preferred/active/solicitable GENERATED/concours_only). DC2 fields complets. UNIQUE `(org, email)`. Index GIN spécialités + géo. RLS via mig. 0018. |
| `companies.ts` | `sourcing.companies` | `modules/sourcing/db/companies.ts` | `organization_id` direct | Entreprises BTP (CR/TCE/majors). Pas de `tutoiement` ni `concours_only` ni `odoo_external_id` ni `pastCollabsCount`. RLS à confirmer (pas trouvé dans les 4 mig RLS). |
| `sharing.ts` | `sourcing.cotraitant_shares` | `modules/sourcing/db/cotraitant_shares.ts` | `organization_id` direct | Tokens publics partage cotraitant. `token` UUID UNIQUE default `uuid_generate_v4()`. `expires_at` 30j. FK optionnelle `architect_id`. RLS à confirmer (pas dans 4 mig RLS). |
| `sharing.ts` | `sourcing.cotraitant_share_items` | `modules/sourcing/db/cotraitant_share_items.ts` | Via `share_id` | FK→cotraitant_shares + FK optionnelle→presentation_library. `original_storage_path` / `signed_storage_path` + métadonnées signature. |
| `cotraitants.ts` | `sourcing.cotraitants` | `modules/sourcing/db/cotraitants.ts` | `organization_id` + admin restrictives (mig. 0018) | Annuaire global réutilisable. `active` bool (archivage). UNIQUE `(org, email)`. |
| `cotraitants.ts` | `sourcing.tender_cotraitants` | `modules/sourcing/db/tender_cotraitants.ts` | `organization_id` + admin restrictives (mig. 0018) | Association AO ↔ cotraitant. UNIQUE sur `tender_id` (1 cotraitant max par AO au MVP). |
| `cotraitants.ts` | `sourcing.cotraitant_documents` | `modules/sourcing/db/cotraitant_documents.ts` | `organization_id` + admin restrictives (mig. 0018) | Pièces par cotraitant (dc1_signed, urssaf, assurance, rib, convention, alyos_rc, autre). `kind` text contrôlé applicativement. FK optionnelle `tender_id`. |
| `be-documents.ts` | `sourcing.be_documents` | `modules/sourcing/db/be_documents.ts` | `organization_id` + admin restrictives (mig. 0018) | Documents administratifs d'un BE (dc1/dc2/dc4/pouvoir/kbis/assurance/urssaf/fiscal/presentation_be/moyens_humains/references/memoire_rse). Bucket Storage `be-docs`. |
| `shortlist.ts` | `sourcing.shortlist_criteria` | `modules/sourcing/db/shortlist_criteria.ts` | `organization_id` direct | Critères short-list paramétrables (architects/cotraitants/companies). `ai_notes_weight` text (precision NUMERIC→JS). UNIQUE `(org, target)`. RLS à confirmer (pas dans 4 mig RLS). |
| `tender-cotraitants.ts` | `sourcing.tender_be_cotraitants` | `modules/sourcing/db/tender_be_cotraitants.ts` | `organization_id` direct | N-N entre `tenders` et `bureaux_etudes`. UNIQUE `(tender_id, be_id)` (idempotence INSERT). |
| `dossier-dispatches.ts` | `sourcing.dossier_dispatches` | `modules/sourcing/db/dossier_dispatches.ts` | `organization_id` direct | Envoi ZIP dossier à archi mandataire (Brevo + signed URL Supabase 7j). FK `tender_id`/`architect_id` ON DELETE SET NULL. Soft cancel via `cancelled_at` (mig. 0044). |
| `library-index.ts` | `sourcing.library_item_index` | `modules/sourcing/db/library_item_index.ts` | `organization_id` direct | Indexation IA des items biblio (mig. 0041). UNIQUE sur `library_item_id`. `extracted_entities` JSONB. `source_hash` SHA-256 détection re-upload. |
| `cron-log.ts` | `sourcing.cron_run_log` | `modules/sourcing/db/cron_run_log.ts` | RLS FORCE sans policy authenticated (service_role only) | Org-agnostique (1 row par run cron Vercel). `cron_name`, `started_at`, `finished_at`, `duration_ms`, `status` CHECK (`running/ok/error`). |
| `buyers.ts` | `sourcing.buyers` | `modules/sourcing/db/buyers.ts` | `organization_id` direct | Annuaire acheteurs publics (mig. 0048). UNIQUE `(org, name_normalized)`. Fonction `normalizeBuyerName` exportée TS (lowercase + NFD sans accents). |

**Total : 31 tables** à créer sous le schema `sourcing.*`.

---

## 3. Tables → schema `public.*` (existantes monorepo, à étendre ou hors port)

| Fichier Drizzle | Table monorepo | Action | Notes |
|---|---|---|---|
| `organizations.ts` | `public.organizations` | **Étendre** : ajouter colonnes manquantes selon comparaison monorepo (le 0115 monorepo a déjà `organization_billing_lifecycle`). Colonnes à valider : `siren UNIQUE`, `siret`, `odoo_config` JSONB, `subscription_tier` enum, `logo_url`, `primary_color` varchar(7), `font_family` varchar(50), `trial_started_at`, `trial_ends_at`, `subscription_status` (DEFAULT 'none'), `stripe_customer_id`. **À comparer pendant la visio Sébastien.** |
| `users.ts` | `auth.users` (Supabase) + éventuelle `public.users` monorepo | **À comparer** | Sourcing a `users` table proxy avec `firstname/lastname`, `architect_notifications_seen_at` (mig. 0045). Le monorepo gère ça probablement via `auth.users` + table profile. Cf. Q? visio. |
| `users.ts` | `memberships` (Sourcing N-N) vs monorepo (1 user = 1 org_id) | **Harmonisation nécessaire (cf. Q6 brief migration)** | Sourcing : PK `(organization_id, user_id)` + `role` membership_role. Monorepo : 1 colonne `organization_id` sur les profils. À arbitrer en visio. |
| `audit.ts` | `public.audit_log` (probable monorepo) | **À comparer** | Sourcing `audit_logs` (pluriel) est IMMUTABLE + 22 actions enum + admin-only RLS. Si monorepo a son propre `audit_log`, fusion ou cloisonnement par module à arbitrer. |

**Total : 4 tables/concepts** à arbitrer/étendre côté monorepo.

---

## 4. Enums Drizzle → CREATE TYPE SQL natif

| Enum Drizzle | DDL SQL cible | Notes |
|---|---|---|
| `subscription_tier` | `CREATE TYPE sourcing.subscription_tier AS ENUM ('sourcing', 'cotraitance', 'studio');` | À comparer avec d'éventuels tiers monorepo. |
| `membership_role` | (existe probablement `public.role` monorepo — **à comparer**) | Valeurs Sourcing : `admin`, `user`, `viewer`, `superadmin`. |
| `platform_code` | `CREATE TYPE sourcing.platform_code AS ENUM ('boamp', 'place', 'francmarches', 'mp_info', 'prive');` | |
| `auth_type` | `CREATE TYPE sourcing.auth_type AS ENUM ('api_key', 'oauth', 'login_password', 'none');` | |
| `partnership_status` | `CREATE TYPE sourcing.partnership_status AS ENUM ('actif', 'inactif', 'prospect');` | **OBSOLÈTE** — plus consommé (colonne droppée 2026-05-25). À ne pas porter sauf si historique migration en jeu. |
| `tender_status` | `CREATE TYPE sourcing.tender_status AS ENUM ('sourced', 'selected_solo', 'selected_tandem', 'awaiting_architect', 'architect_accepted', 'architect_declined', 'architect_info_requested', 'dossier_review_required', 'dossier_ready', 'dossier_diffused', 'submitted', 'won', 'lost', 'dropped');` | 14 valeurs Gate 4. |
| `selection_mode` | `CREATE TYPE sourcing.selection_mode AS ENUM ('solo', 'tandem', 'conception_realisation');` | |
| `architect_response_status` | `CREATE TYPE sourcing.architect_response_status AS ENUM ('pending', 'accepted', 'declined', 'info_requested');` | |
| `ai_model` | `CREATE TYPE sourcing.ai_model AS ENUM ('sonnet-4-6', 'haiku-4-5');` | |
| `brevo_register` | `CREATE TYPE sourcing.brevo_register AS ENUM ('tu', 'vous', 'neutre');` | |
| `audit_action` | `CREATE TYPE sourcing.audit_action AS ENUM ('login', 'membership_change', 'search_profile_change', 'tender_select', 'architect_solicit', 'dossier_diffuse', 'ai_run', 'odoo_opportunity_create', 'architect_change', 'rgpd_export', 'token_revoke', 'data_delete', 'access_attempt', 'tender_defer', 'tender_reject', 'architect_response', 'architect_edit', 'architect_import', 'architect_export', 'library_doc_upload', 'library_doc_delete', 'dce_download');` | **22 valeurs**. Ordre d'ajout important (cf. JSDoc enums.ts). |
| `learning_event_type` | `CREATE TYPE sourcing.learning_event_type AS ENUM ('selected', 'rejected');` | |

**Total : 12 enums** à recréer dans le schema `sourcing` (sauf `membership_role` à harmoniser avec monorepo).

---

## 5. Tables superadmin (6+1) — à arbitrer en visio

> **Décision attendue** : fusion avec les `public.superadmin_*` du monorepo OU cloisonnement par module Sourcing (`sourcing.*`) ? Aucune proposition de fusion ici — neutre.

| Fichier Drizzle | Table Sourcing | Schema actuel | Notes |
|---|---|---|---|
| `superadmin.ts` | `support_tickets` | `public.*` (Sourcing) | `org_id` FK→organizations + `user_id` UUID auth (pas de FK). `status` text CHECK ('open/in_progress/closed'). |
| `superadmin.ts` | `news_items` | `public.*` (Sourcing) | Global (pas d'org_id). `is_published` bool + `published_at`. |
| `superadmin.ts` | `user_news_reads` | `public.*` (Sourcing) | PK composite `(user_id, news_id)`. FK→news_items cascade. |
| `superadmin.ts` | `formations` | `public.*` (Sourcing) | `type` text CHECK ('video/doc/external'). Pivot 2026-05-29 : `slug` UNIQUE + `content_md` inline. |
| `superadmin.ts` | `faq_items` | `public.*` (Sourcing) | Catégorie libre + `display_order`. |
| `superadmin.ts` | `guided_tests` | `public.*` (Sourcing) | FK optionnelle→formations. `steps` JSONB tableau d'étapes typées. |
| `superadmin.ts` | `guided_test_submissions` | `public.*` (Sourcing) | FK→guided_tests + `user_id` + `org_id`. `answers` JSONB. |
| `superadmin.ts` | `app_content` | `public.*` (Sourcing) | PK = `key` text. Cf. clés 'pitch_pdf_url', 'roadmap_pdf_url', 'demo_video_url'. |
| `superadmin.ts` | `user_notifications` | `public.*` (Sourcing) | **Nom DBB volontaire `user_notifications`** (évite collision avec `integrations.notifications`). `type` text CHECK ('news/support_reply/system'). |

**Total : 9 tables superadmin Sourcing**. (Le brief disait « 3 », mais la lecture du fichier montre 9 tables — décision : flagger les 9, Sébastien arbitre cloisonnement par module ou fusion avec `public.superadmin_*` monorepo.)

---

## 6. Relations cross-modules détectées

FK importantes à préserver lors de la reconstruction des loaders :

- `sourcing.architects.organization_id` → `public.organizations.id` (cross common ↔ sourcing)
- `sourcing.tenders.organization_id` → `public.organizations.id` (idem)
- `sourcing.tenders.platform_id` → `sourcing.platforms.id` (intra-sourcing)
- `sourcing.tenders.matching_profile_id` → `sourcing.search_profiles.id` (ON DELETE SET NULL)
- `sourcing.tender_lots.tender_id` → `sourcing.tenders.id` CASCADE
- `sourcing.tender_documents/tender_events.tender_id` → `sourcing.tenders.id` CASCADE
- `sourcing.selections.tender_id` UNIQUE → `sourcing.tenders.id` CASCADE
- `sourcing.match_proposals.{tender_id,architect_id}` → `sourcing.tenders`/`architects` CASCADE
- `sourcing.architect_responses.token_id` → `sourcing.architect_tokens.id` ON DELETE SET NULL
- `sourcing.architect_opposition_tokens.architect_id` → `sourcing.architects.id` CASCADE
- `sourcing.response_files.architect_id` → `sourcing.architects.id` ON DELETE SET NULL (multi-archi Tandem)
- `sourcing.response_files.be_id` → `sourcing.bureaux_etudes.id` ON DELETE SET NULL (cotraitant BE)
- `sourcing.presentation_library.organization_id` → `public.organizations.id` (cross common ↔ sourcing)
- `sourcing.ai_runs.prompt_id` → `sourcing.ai_prompts.id` (PAS de cascade — traçabilité)
- `sourcing.ai_runs.tender_id` → `sourcing.tenders.id` ON DELETE SET NULL
- `sourcing.tender_briefs.ai_run_id` → `sourcing.ai_runs.id` ON DELETE SET NULL
- `sourcing.odoo_opportunities.architect_id` → `sourcing.architects.id` ON DELETE SET NULL
- `sourcing.brevo_messages.architect_id` → `sourcing.architects.id` ON DELETE SET NULL
- `sourcing.audit_logs.organization_id` → `public.organizations.id` ON DELETE SET NULL (rétention 5 ans)
- `sourcing.message_templates/organization_profiles.organization_id` → `public.organizations.id` CASCADE (`organization_profiles` UNIQUE sur org_id)
- `sourcing.bureaux_etudes.organization_id` → `public.organizations.id`
- `sourcing.companies.organization_id` → `public.organizations.id`
- `sourcing.cotraitant_shares.architect_id` → `sourcing.architects.id` ON DELETE SET NULL
- `sourcing.cotraitant_share_items.library_item_id` → `sourcing.presentation_library.id` ON DELETE SET NULL
- `sourcing.tender_cotraitants.cotraitant_id` → `sourcing.cotraitants.id` CASCADE (UNIQUE sur `tender_id`)
- `sourcing.cotraitant_documents.cotraitant_id` → `sourcing.cotraitants.id` CASCADE
- `sourcing.be_documents.be_id` → `sourcing.bureaux_etudes.id` CASCADE
- `sourcing.tender_be_cotraitants.be_id` → `sourcing.bureaux_etudes.id` CASCADE (UNIQUE `(tender_id, be_id)`)
- `sourcing.dossier_dispatches.architect_id` → `sourcing.architects.id` ON DELETE SET NULL
- `sourcing.library_item_index.library_item_id` → `sourcing.presentation_library.id` CASCADE (UNIQUE) + `ai_run_id` → `sourcing.ai_runs.id`
- `sourcing.guided_test_submissions.test_id` → `sourcing.guided_tests.id` CASCADE
- `sourcing.user_news_reads.news_id` → `sourcing.news_items.id` CASCADE
- `sourcing.formations.id` ← `sourcing.guided_tests.formation_id` ON DELETE SET NULL

**Note importante** : toutes les FK depuis Sourcing vers `users.id` (Sourcing) seront à reconstruire vers `auth.users.id` (Supabase) ou la table profile du monorepo, selon décision visio Q? (cf. §3).

---

## 7. Indexes critiques à porter

| Index | Table | Définition |
|---|---|---|
| `idx_organizations_tier` | `organizations` | `(subscription_tier)` |
| `idx_search_profiles_org` | `search_profiles` | `(organization_id) WHERE active` (partiel) |
| `idx_search_profiles_org_default` | `search_profiles` | `(organization_id) WHERE is_default` (partiel) |
| `idx_architects_org` | `architects` | `(organization_id)` |
| `idx_architects_siren` | `architects` | `(siren) WHERE siren IS NOT NULL` (partiel) |
| `idx_architects_specialties` | `architects` | GIN sur `specialty_codes` |
| `idx_architects_geo_zones` | `architects` | GIN sur `geo_zones` |
| `idx_architects_solicitable_active` | `architects` | `(organization_id) WHERE solicitable=TRUE AND active=TRUE` (chemin chaud matching Tandem) |
| `idx_tenders_org_status` | `tenders` | `(organization_id, status)` |
| `idx_tenders_deferred_until` | `tenders` | `(deferred_until) WHERE deferred_until IS NOT NULL` (partiel — prédicat IMMUTABLE) |
| `idx_tenders_deadline` | `tenders` | `(deadline)` (full, pas partiel — `now()` STABLE casse partiel cf. JSDoc) |
| `idx_tenders_title_trgm` | `tenders` | GIN `(title gin_trgm_ops)` recherche fuzzy |
| `idx_tenders_score` | `tenders` | `(organization_id, score DESC) WHERE status='sourced'` |
| `idx_tenders_excluded_at` | `tenders` | `(excluded_at) WHERE excluded_at IS NOT NULL` (partiel) |
| `idx_tenders_department` | `tenders` | `(department)` |
| `tenders_organization_id_external_ref_platform_id_key` | `tenders` | UNIQUE `(org, external_ref, platform_id)` idempotence ingest |
| `idx_tender_events_tender` | `tender_events` | `(tender_id, occurred_at)` |
| `idx_match_proposals_tender` | `match_proposals` | `(tender_id, rank)` |
| `idx_architect_tokens_active` | `architect_tokens` | `(jwt_id) WHERE revoked=FALSE` (partiel) |
| `idx_architect_responses_status` | `architect_responses` | `(status, tender_id)` |
| `idx_architect_responses_pending_no_followup` | `architect_responses` | `(tender_id) WHERE status='pending' AND followup_sent_at IS NULL` (cron J+3) |
| `idx_response_files_tender/architect/be` | `response_files` | 3 index + partiels sur FK nullables |
| `idx_presentation_library_org_kind` | `presentation_library` | `(organization_id, kind)` |
| `idx_presentation_library_expiry` | `presentation_library` | `(valid_until) WHERE valid_until IS NOT NULL` (alertes J-30/J-7/J-1) |
| `ai_prompts_name_version_key` | `ai_prompts` | UNIQUE `(name, version)` |
| `idx_ai_prompts_active` | `ai_prompts` | `(name) WHERE active` (partiel) |
| `idx_ai_runs_org_date` | `ai_runs` | `(organization_id, created_at DESC)` |
| `uniq_opp_solo` | `odoo_opportunities` | UNIQUE PARTIEL `(tender_id) WHERE architect_id IS NULL` (1 opp Solo / AO) |
| `uniq_opp_tandem` | `odoo_opportunities` | UNIQUE PARTIEL `(tender_id, architect_id) WHERE architect_id IS NOT NULL` (1 opp / couple) |
| `idx_notifications_user_unread` | `notifications` | `(user_id, created_at DESC) WHERE read_at IS NULL` (partiel inbox) |
| `idx_audit_logs_org_date` | `audit_logs` | `(organization_id, occurred_at DESC)` |
| `idx_audit_logs_actor` | `audit_logs` | `(actor_id) WHERE actor_id IS NOT NULL` (partiel) |
| `idx_audit_logs_action` | `audit_logs` | `(action, occurred_at DESC)` |
| `idx_bureaux_etudes_*` | `bureaux_etudes` | 4 index (org/siren partiel/specialties GIN/geo_zones GIN/solicitable_active partiel) |
| `idx_companies_*` | `companies` | 4 index (org/siren partiel/specialties GIN/geo_zones GIN/active_org partiel) |
| `idx_cotraitant_shares_token` | `cotraitant_shares` | `(token)` |
| `uq_tender_cotraitants_tender` | `tender_cotraitants` | UNIQUE `(tender_id)` (1 cotraitant max / AO MVP) |
| `tender_be_cotraitants_unique` | `tender_be_cotraitants` | UNIQUE `(tender_id, be_id)` idempotence |
| `idx_dossier_dispatches_tender_archi` | `dossier_dispatches` | `(tender_id, architect_id, sent_at)` |
| `library_item_index_library_item_id_unique` | `library_item_index` | UNIQUE `(library_item_id)` (1:1 avec biblio) |
| `idx_buyers_org_name_norm` | `buyers` | UNIQUE `(organization_id, name_normalized)` |
| `idx_shortlist_criteria_org_target` | `shortlist_criteria` | UNIQUE `(organization_id, target)` |

---

## 8. RLS policies à porter

### 8.1 Helpers SQL (à reposer dans le schema cible)

```sql
CREATE OR REPLACE FUNCTION current_organization_id() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb #>> '{app_metadata,organization_id}', '')::uuid
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION current_user_role() RETURNS membership_role AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb #>> '{app_metadata,role}', '')::membership_role
$$ LANGUAGE sql STABLE;
```

> **À harmoniser** avec les helpers existants côté monorepo (probablement déjà présents avec une autre signature). Source : Suivi+ACT est mono-tenant par user (Q6 visio).

### 8.2 Migration 0002_rls.sql — 19 tables FORCE + 20 policies

- **ENABLE RLS** sur 21 tables : `organizations`, `memberships`, `search_profiles`, `platform_credentials`, `architects`, `tenders`, `tender_lots`, `tender_documents`, `tender_events`, `selections`, `match_proposals`, `architect_responses`, `architect_tokens`, `response_files`, `presentation_library`, `ai_runs`, `odoo_opportunities`, `brevo_messages`, `notifications`, `audit_logs`, `learning_events`.
- **FORCE RLS** sur 19 tables (exclus : `organizations`, `tender_lots`).
- **20 policies `tenant_isolation` PERMISSIVE FOR ALL** :
  - 17 policies standard : `USING (organization_id = current_organization_id())`
  - 1 policy via EXISTS pour `tender_lots` (pas de col org_id directe) :
    ```sql
    USING (EXISTS (SELECT 1 FROM tenders t WHERE t.id = tender_id AND t.organization_id = current_organization_id()))
    ```
  - 1 policy spéciale `notifications` (org + user) :
    ```sql
    USING (organization_id = current_organization_id() AND user_id = (auth.jwt() ->> 'sub')::uuid)
    ```
  - 1 policy spéciale `audit_logs` (org + admin only) :
    ```sql
    USING (organization_id = current_organization_id() AND current_user_role() = 'admin')
    ```
- **1 policy `insert_by_member` RESTRICTIVE** sur `architects` FOR INSERT :
  ```sql
  WITH CHECK (organization_id = current_organization_id() AND current_user_role() IN ('admin', 'user'))
  ```
- **Triggers immutabilité `audit_logs`** : `audit_logs_no_update` + `audit_logs_no_delete` → `reject_audit_mutation()` lève une exception sur tout UPDATE/DELETE.
- **Triggers `touch_updated_at`** sur 5 tables : `organizations`, `search_profiles`, `architects`, `tenders`, `presentation_library`.

### 8.3 Migration 0006_tandem_rls.sql — 1 table FORCE + 1 policy

- ENABLE + FORCE RLS sur `architect_opposition_tokens`.
- Policy `tenant_isolation` standard `(organization_id = current_organization_id())`.

### 8.4 Migration 0009_rls_messaging.sql — 2 tables FORCE + 6 policies

- ENABLE + FORCE RLS sur `message_templates`, `organization_profiles`.
- 2 policies `tenant_isolation` PERMISSIVE FOR ALL.
- 2 policies `admin_write` RESTRICTIVE FOR INSERT (admin uniquement).
- 2 policies `admin_update` RESTRICTIVE FOR UPDATE (admin uniquement, USING + WITH CHECK).
- Triggers `touch_updated_at` sur les 2 tables.

### 8.5 Migration 0018_rls_cotraitants_be.sql — 4 tables FORCE + 12 policies

- ENABLE + FORCE RLS sur `cotraitants`, `tender_cotraitants`, `cotraitant_documents`, `be_documents`.
- 4 policies `tenant_isolation` standard.
- 4 policies `admin_write` RESTRICTIVE FOR INSERT.
- 4 policies `admin_update` RESTRICTIVE FOR UPDATE.
- Trigger `touch_updated_at` sur `cotraitants` (seule table avec updated_at).

### 8.6 Tables Sourcing sans RLS écrite dans les migrations lues

À vérifier (peut-être posée dans une autre migration ou à écrire) :

- `sourcing.companies` (créée mig. 0011) — non RLS-isée dans 0018.
- `sourcing.cotraitant_shares` + `cotraitant_share_items` (créées mig. 0014).
- `sourcing.shortlist_criteria` (créée mig. 0027).
- `sourcing.tender_briefs` (créée mig. 0022).
- `sourcing.tender_be_cotraitants` (créée mig. 0037).
- `sourcing.dossier_dispatches` (créée mig. 0038).
- `sourcing.library_item_index` (créée mig. 0041).
- `sourcing.cron_run_log` (créée mig. 0046) — service_role uniquement déclaré dans JSDoc.
- `sourcing.buyers` (créée mig. 0048).
- `sourcing.user_notifications` + autres tables superadmin (mig. 0019) — RLS posée dans 0019 mais non lue ici.

**Total policies tenant_isolation lues : 27 (20 + 1 + 2 + 4)**
**Total policies admin restrictives lues : 7 (1 insert_by_member + 2 admin_write + 2 admin_update + 4 admin_write/admin_update mig 0018 = 13 en réalité)**

> Le compte « 12 policies » mentionné dans le brief sous-estime — la réalité lue est ~40 policies entre tenant_isolation et restrictives. À reconstruire intégralement côté monorepo.

---

## 9. Récap final

- **31 tables** à créer dans schema `sourcing.*`
- **4 tables/concepts monorepo à comparer/étendre** (`organizations`, `users`, `memberships`, `audit_log`)
- **9 tables superadmin Sourcing** à arbitrer (cloisonnement vs fusion avec `public.superadmin_*` monorepo)
- **12 enums** à créer (sauf `membership_role` à harmoniser et `partnership_status` obsolète)
- **~40 policies RLS** (27 tenant_isolation + ~13 restrictives admin) à reproduire en SQL natif
- **Triggers** : `reject_audit_mutation()` + `touch_updated_at()` + 8 triggers BEFORE UPDATE attachés
- **Helpers SQL** : `current_organization_id()` + `current_user_role()` à harmoniser avec ceux du monorepo
- **Migrations à produire** : renumérotation 0138+ par convention monorepo. Estimation : 8-12 migrations (1 init enums sourcing, 1 schéma `sourcing` + tables, 1-2 RLS, 1 extends `public.organizations`, 1 seed platforms+ai_prompts, 1 superadmin si fusion, +1 par lot fonctionnel selon découpage Sébastien).

---

### Annexe — Fichiers Drizzle lus (25/25)

`audit.ts`, `integrations.ts`, `selections.ts`, `companies.ts`, `sharing.ts`, `cotraitants.ts`, `be-documents.ts`, `ai.ts`, `config.ts`, `shortlist.ts`, `tender-cotraitants.ts`, `library-index.ts`, `dossier-dispatches.ts`, `users.ts`, `cron-log.ts`, `architects.ts`, `bureaux-etudes.ts`, `messaging.ts`, `tenders.ts`, `library.ts`, `index.ts` (barrel), `buyers.ts`, `organizations.ts`, `enums.ts`, `superadmin.ts`.

Exclus : `buyers.test.ts` (test pgTAP non schema).
