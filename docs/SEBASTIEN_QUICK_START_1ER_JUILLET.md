# Quick Start — Kickoff portage Sourcing (1er juillet 2026)

> **Pour qui** : Sébastien (lead Suivi+ACT). Lecture express le matin du 1er juillet.
> **Auteur** : Sébastien lui-même (préparé J-22). Pas de marketing, bullets only.
> **Source longue** : `docs/HANDOFF_MIGRATION_SOURCING_TO_MONOREPO.md` (1165 lignes — ne pas relire le 1/7).
> **Cible bascule** : samedi 18 juillet 8h-11h. Post-mortem 25/7.

---

## Sommaire

1. [Setup matin 1er juillet (15 min)](#1-setup-matin-1er-juillet-15-min)
2. [Versions exactes à matcher](#2-versions-exactes-à-matcher)
3. [Pattern monorepo confirmé aligné](#3-pattern-monorepo-confirmé-aligné)
4. [Catalogue 8 modules — mon ordre de portage](#4-catalogue-8-modules--mon-ordre-de-portage)
5. [Top 5 dettes à fixer en début de portage](#5-top-5-dettes-à-fixer-en-début-de-portage)
6. [Test J-14 obligatoire (préservation UUID auth.users.id)](#6-test-j-14-obligatoire-préservation-uuid-authusersid)
7. [Procédure J0 (18 juillet, 8h-12h)](#7-procédure-j0-18-juillet-8h-12h)
8. [Lundi 20/7 matin — R12 mitigation](#8-lundi-207-matin--r12-mitigation)
9. [Post-mortem 25 juillet](#9-post-mortem-25-juillet)
10. [Contacts d'urgence](#10-contacts-durgence)

---

## 1. Setup matin 1er juillet (15 min)

Checklist linéaire. Ne pas brûler les étapes.

- [ ] **08h45 — `git fetch && git pull` sur `alyos-suivi-chantier`** (monorepo). Vérifier branche `main` à jour.
- [ ] **08h47 — Clone `edifio-sourcing` en read-only** dans `C:\Dev\edifio-sourcing-readonly` (au cas où le dossier actuel a du WIP non commité) :
  ```powershell
  git clone --depth 1 --branch main https://github.com/AlyoSIng/edifio-sourcing.git C:\Dev\edifio-sourcing-readonly
  ```
- [ ] **08h50 — Lire le tag `pre-merge-sourcing-2026-06-15`** (sera créé par Steve au gel pré-portage) :
  ```powershell
  cd C:\Dev\edifio-sourcing-readonly
  git checkout pre-merge-sourcing-2026-06-15
  git log -1 --stat
  ```
- [ ] **08h55 — Ouvrir VSCode multi-root** : 2 fenêtres side-by-side, gauche `alyos-suivi-chantier`, droite `edifio-sourcing-readonly`. Workspace `.code-workspace` enregistré dans `C:\Dev\sourcing-merge.code-workspace`.
- [ ] **08h58 — Activer `suivi_act_reviewer` côté Sourcing** : ouvrir Claude Code dans `edifio-sourcing-readonly`, vérifier `.claude/agents/suivi_act_reviewer.md` chargé.
- [ ] **09h00 — Créer branche `feat/sourcing-merge`** depuis `main` monorepo. Premier commit = `chore(sourcing): kickoff portage 2026-07-01`.

```
┌─────────────────────────────┐  ┌────────────────────────────┐
│ VSCode WINDOW 1             │  │ VSCode WINDOW 2            │
│ alyos-suivi-chantier        │  │ edifio-sourcing-readonly   │
│ (cible — écriture)          │  │ (source — read-only)       │
│ branche: feat/sourcing-merge│  │ tag: pre-merge-2026-06-15  │
└─────────────────────────────┘  └────────────────────────────┘
       ↑ Claude Code                  ↑ suivi_act_reviewer
         (dev + qa monorepo)            (relit chaque PR Sourcing)
```

- [ ] **09h05** — `pnpm install && pnpm dev` côté monorepo pour vérifier que la base tourne (port 3000).
- [ ] **09h10** — Lecture express : ce document + `docs/HANDOFF_MIGRATION_SOURCING_TO_MONOREPO.md` §1.1 + §3 + §7.6 + §8. **Ne pas lire les 38 pages**.

---

## 2. Versions exactes à matcher

Lot 1 Sourcing fait, aligné monorepo. Si un `pnpm install` rebascule une de ces versions → STOP, c'est suspect.

| Package | Version Sourcing | Version monorepo | Statut |
|---|---|---|---|
| `next` | 15.5.18 | 15.5 | ✅ |
| `react` | 19.0.0 | 19 | ✅ |
| `react-dom` | 19.0.0 | 19 | ✅ |
| `@types/react` | 19.2.17 | 19 | ✅ |
| `typescript` | 5.9.3 | aligné | ✅ |
| `@supabase/ssr` | 0.10.3 | 0.10 | ✅ |
| `@supabase/supabase-js` | 2.105.4 | aligné | ✅ |
| `eslint-config-next` | 15.5.19 | aligné | ✅ |
| `@playwright/test` | 1.59.1 | aligné | ✅ |
| `vitest` | 4.1.5 | à introduire (Q7) | ⚖️ |
| `node` | 22.13 | aligné | ✅ |
| `pnpm` | 11.0.9 | aligné | ✅ |

**Drizzle (à dropper Lot 2)** : `drizzle-orm@0.39.3` + `drizzle-kit@0.30.6` + `postgres@3.4.9` — supprimer ces 3 deps en fin de portage.

---

## 3. Pattern monorepo confirmé aligné

Acquis post-Lot 1.5 + Lot 1.7-bis. Pas à re-vérifier le 1/7.

- ✅ **`createClient` async via `await cookies()`** — 157 sites Sourcing, signature alignée monorepo (renaming Lot 2 — cf. §5)
- ✅ **Helper `public.current_user_org_id()` SECURITY DEFINER** — alias vers `current_organization_id()` existant, posé migration 0052
- ✅ **Naming `<table>_<action>` × 16 policies** — `companies/bureaux_etudes/cotraitant_shares/cotraitant_share_items` × 4 (select/insert/update/delete), pattern monorepo `0104_act_schema_init.sql`
- ✅ **FORCE RLS** sur les 4 tables fixées Lot 1.7-bis (companies, bureaux_etudes, cotraitant_shares, cotraitant_share_items)
- ✅ **Pattern token public via `service_role` bypass + `SECURITY DEFINER` function** — `cotraitant_shares_select_public` éradiqué (cf. §5 — dette historique)

⚠️ **Tables avec RLS posée à la création (rien à refaire)** : `tender_briefs` (0022), `shortlist_criteria` (0027), `dossier_dispatches` (0038), `tender_be_cotraitants` (0037), `library_item_index` (0041), `buyers` (0048).

⚠️ **À auditer Lot 2** : 9 tables superadmin (0019) — RLS posée mais non auditée par catalogue.

---

## 4. Catalogue 8 modules — mon ordre de portage

Total ~25 j focus / ~12 jours ouvrés sur Lots 2-10. Mon ordre (pas celui du brief — basé sur dépendances + risques).

### Ordre + pré-requis + complexité + risques

| # | Module | Effort | Pré-requis | Risque #1 |
|---|---|---|---|---|
| 1 | **Référentiels statiques** (platforms, architect_specialties, ai_prompts seed) | 0.5 j | aucun | Nul. Échauffement. |
| 2 | **A — Auth + organizations extends + memberships** | 1 j | référentiels | Q6 N-N vs 1-1 memberships — arbitrage Sébastien. |
| 3 | **B — Audit (Module F BDD only)** | 1 j | A | Triggers `reject_audit_mutation` IMMUTABLE en SQL natif. Une UPDATE possible = perte garantie 5 ans. |
| 4 | **C — Organisations (extends `public.organizations`)** | 0.5 j | A | Collision colonnes `siren/siret/odoo_config/subscription_tier/logo_url/branding` avec modèle 0115. |
| 5 | **H — Sourcing engine (Module A Veille AO complet)** | 3.5 j | A, C | (1) UNIQUE `(org, external_ref, platform_id)` idempotence cron 6h30. (2) Partial index `idx_tenders_deferred_until` IMMUTABLE (now() STABLE casse partiel). |
| 6 | **D — Bibliothèque entreprise** | 1.5 j | H | Haiku 4.5 calls + `logAiUsage` obligatoire (lot 6 calendrier). Bucket path `{orgId}/{kind}/{ts}_{filename}`. |
| 7 | **E — Annuaire acheteurs** (`buyers`) | 1 j | A | `normalizeBuyerName` TS exportée — preserve lowercase+NFD. |
| 8 | **F — IA + Audit (code applicatif)** | 2 j | B, H | `logAiUsage` câblé partout (sinon perte traçabilité Anthropic). |
| 9 | **G — Intégrations (Odoo + Brevo + Notifications)** | 2 j | H | Webhook HMAC Brevo n'utilise PAS `createClient` (HMAC + db direct) — conserver tel quel. |
| 10 | **B — Cotraitance Tandem complet** (architects, BE, cotraitants, JWT) | 7 j | A, H, F | JWT signing/verification 3 modules (architect_tokens, opposition, cotraitant_shares) — bugs subtils si secret/algo divergent. |
| 11 | **C — Dossier IA + CERFA (code applicatif)** | 3 j | B, D | (1) Swap fflate+Mustache → docxtemplater (peut casser edge-case balises vides). (2) Swap exceljs → xlsx (peut perdre formatage cellule). 33 balises Mustache à conserver. |
| 12 | **H — Admin + Superadmin (pages + 0115 billing)** | 5 j | tous | 9 tables superadmin à arbitrer (cloisonnement vs fusion). 11 pages admin + 9 pages superadmin. |

**Total : ~28 j focus** (vs brief 25j — gardé marge pour aléas).

Note : ordre divergent du brief sur les modules B/C (placés plus tard dans MON ordre car ce sont les plus gros et bénéficient des autres modules en pré-requis).

```
Module 1  ─→ Module 2  ─→ Module 3  ─→ Module 4
(stat)      (A auth)     (B audit)    (C org)
                            │              │
                            └────┬─────────┘
                                 ▼
                          Module 5 (H Sourcing)
                                 │
                ┌────────────────┼────────────────┐
                ▼                ▼                ▼
            Module 6        Module 7         Module 8
            (D biblio)      (E buyers)       (F IA+audit)
                │                                 │
                └────────┬────────────────────────┘
                         ▼
                    Module 9 (G intégrations)
                         │
                         ▼
                    Module 10 (B Tandem)
                         │
                         ▼
                    Module 11 (C dossier IA)
                         │
                         ▼
                    Module 12 (H admin/superadmin)
```

---

## 5. Top 5 dettes à fixer en début de portage

À traiter dans les 3 premiers jours du portage. Non négociables.

### 5.1 — Rename `createSupabaseServerClient` → `createClient` (codemod simple)

- **157 occurrences sur 105 fichiers** — uniformes (toutes `await createSupabaseServerClient()`)
- Méthode :
  ```powershell
  cd C:\Dev\alyos-suivi-chantier
  git ls-files modules/sourcing | xargs sed -i 's/createSupabaseServerClient/createClient/g'
  pnpm typecheck
  ```
- **Effort 30 min**. À placer **juste après création de `feat/sourcing-merge`**.

### 5.2 — Bombe à retardement `cotraitant_shares_select_public PERMISSIVE` cross-tenant

- **Risque** : policy historique `cotraitant_shares_select_public PERMISSIVE` permet à un anon avec un token Y de lire des shares cross-tenant (bug catégorie sécurité élevée).
- **Fix** : pattern monorepo `0044_cr_public_links.sql` — restreindre policy au flow `service_role` bypass + `SECURITY DEFINER` function.
- **À éradiquer en début de Lot 5** (avant de toucher au Module Tandem complet). Sébastien refuserait au merge sinon.
- **Doc** : `gates/REVIEW_SUIVI_ACT_PATTERN_RLS_LOT17.md` §4.

### 5.3 — Arbitrage `COOKIE_DOMAIN`

- **Sourcing** : pose `COOKIE_DOMAIN` dans `src/lib/supabase/server.ts` (lignes 38-43) avec helper `requireEnv` (throw explicite si ENV manquante).
- **Monorepo** : pose dans `app/src/middleware.ts` avec `!` non-null.
- **Reco suivi_act_reviewer** : porter le helper Sourcing (plus robuste) dans le monorepo.
- **Décision à prendre Lot 2 — j'arbitre seul**.

### 5.4 — Fusion `createSupabaseAdminClient` avec helper monorepo

- Sourcing : `createSupabaseAdminClient()` sync (service_role, cookies no-op) — correct.
- Monorepo : helper équivalent. Fusionner sous nom monorepo.
- **Effort 1 h**.

### 5.5 — 5 risques R11-R15 (cookie SSO, cron 6h30, storage 4 buckets, sessions, Brevo HMAC)

| # | Risque | Mitigation |
|---|---|---|
| R11 | Cookie SSO `.edifio.fr` durant bascule 9h-9h35 — sessions invalides après DNS swap | Pré-bascule : `COOKIE_DOMAIN=.edifio.fr` identique. Forcer logout préalable (R14). Mail user 11h. |
| R12 | **Cron 6h30 lundi 19/7 KO = AlyoS aveugle lundi (🔴 CRITIQUE COMMERCIAL)** | Smoke test lundi 7h obligatoire. Si KO : déclenchement manuel `/api/cron/sourcing-run` + escalade. |
| R13 | Storage 4 buckets timing déborde 3h | Mesurer volume J-7. Si total > 5 Go → pré-migrer immuables (`app-assets`, `bibliotheque`) J-3 mercredi soir. |
| R14 | Sessions Supabase actives pendant migration | Forcer logout préalable à 8h05 (`supabase auth admin sign-out-all`). Mail prévention J-1 18h. |
| R15 | Webhook Brevo HMAC scope projet Vercel | Re-vérifier secret HMAC côté monorepo post-bascule. Smoke test 10h00 — vérifier `brevo_messages.events` JSONB s'incrémente. |

---

## 6. Test J-14 obligatoire (préservation UUID auth.users.id)

> ⚠️ **À FAIRE LE LUNDI 6 JUILLET — pas plus tard**. Si plan B nécessaire, il faut le temps de coder le UPDATE bulk.

Le risque le plus subtil de la migration inter-région Frankfurt → Paris : les UUIDs `auth.users.id` ne sont **pas garantis préservés** par l'export Supabase Auth.

### Procédure pas-à-pas

1. **Choisir un UUID de test fixe** (pas un real user) :
   ```
   00000000-0000-0000-0000-000000000042
   ```

2. **Créer le user via Auth API monorepo (Paris)** avec UUID forcé :
   ```ts
   // scripts/test-uuid-preservation.ts
   const { data, error } = await adminClient.auth.admin.createUser({
     id: "00000000-0000-0000-0000-000000000042",
     email: "test-uuid-preservation@alyosingenierie.fr",
     password: "TestUUIDPreserv2026!",
     email_confirm: true,
   });
   ```

3. **Vérifier que l'UUID est préservé** via SQL :
   ```sql
   SELECT id, email FROM auth.users
   WHERE email = 'test-uuid-preservation@alyosingenierie.fr';
   ```
   - **Si `id = 00000000-0000-0000-0000-000000000042`** ✅ → Plan A applicable. `pg_restore` Sourcing direct.
   - **Si `id ≠ ...000042`** ❌ → **PLAN B obligatoire**.

4. **Cleanup** : `auth.admin.deleteUser("00000000-...042")` post-test.

### Plan B (si KO)

```
1. pg_dump Sourcing Frankfurt → injecter dans table temp `auth_uuid_mapping`
   (cols: sourcing_uuid, paris_uuid)
2. Recréer les users via Auth API monorepo (Paris) — laisse Paris assigner les UUIDs
3. Capturer le mapping (sourcing.email → paris.id) dans `auth_uuid_mapping`
4. UPDATE bulk sur TOUTES les FK vers `auth.users.id` AVANT `pg_restore` data Sourcing :
   - sourcing.tenders (created_by, updated_by)
   - sourcing.notifications (user_id)
   - sourcing.audit_logs (user_id)
   - sourcing.architect_tokens (created_by)
   - sourcing.architect_opposition_tokens (created_by)
   - sourcing.dossier_dispatches (created_by)
   - sourcing.ai_runs (user_id)
   - public.memberships (user_id)
   - public.support_tickets (user_id)
   - public.user_news_reads (user_id)
   - public.user_notifications (user_id)
   - public.guided_test_submissions (user_id)
   (~12 tables à scanner avant restore)
5. Restore Sourcing data avec FK déjà remappées
```

**Effort plan B** : 1 j de code + 0.5 j de test. À budgéter Lot 7 si KO confirmé.

---

## 7. Procédure J0 (18 juillet samedi 8h-12h)

```
07:30  Café. Lecture express ce doc + §8 du HANDOFF.
       Vérif comms internes (Slack équipe en alerte).

08:00  Annonce démarrage bascule (Slack)
       ┌─────────────────────────────────────────┐
       │ FREEZE ÉCRITURES + LOGOUT FORCÉ R14     │
       └─────────────────────────────────────────┘
08:05  Sébastien : banner read-only UI + sign-out-all
       Steve : pg_dump Sourcing Frankfurt
       Steve : pg_dump Suivi+ACT Paris (filet)

08:15  Steve : dump-restore final BDD Sourcing → monorepo Paris
       + UPDATE bulk auth_uuid_mapping (si Plan B)

08:30  Sébastien : applique migrations Sourcing 0138-0144 Studio manuel
       Vérif : \dn shows `sourcing` schema, RLS actif

08:45  Sébastien : re-seed platforms (5) + ai_prompts + formations (17)

08:00-09:00 (PARALLÈLE)
       Steve : migration Storage 4 buckets
       ┌─────────────────────────────────────────┐
       │ app-assets       : pré-migré J-3 ✅     │
       │ bibliotheque     : pré-migré J-3 ✅     │
       │ dossier-zip      : J0 actif             │
       │ dossier-pieces   : J0 actif (le + lourd)│
       └─────────────────────────────────────────┘

09:00  ┌─────────────────────────────────────────┐
       │ BASCULE DNS sourcing.edifio.fr          │
       └─────────────────────────────────────────┘
       Steve : OVH panel pas-à-pas (clic exact)

09:05-09:35  Propagation DNS (TTL 300s)
       Vérif R15 : ping Brevo manuel 10h00
       Check `brevo_messages.events` JSONB s'incrémente

09:30  Smoke tests utilisateurs (Steve + user PROTECT volontaire)
       5 parcours critiques :
       - /sourcing/ao-du-jour (AO récents listés)
       - /sourcing/ao/[id] (consult AO)
       - /sourcing/architectes (annuaire)
       - /sourcing/admin/societe (admin OK)
       - Token public /archi/[token] (response_files OK)

10:30  ┌─────────────────────────────────────────┐
       │ DÉCISION GO/NO-GO                       │
       └─────────────────────────────────────────┘
       Si NO-GO : rollback §8.5 HANDOFF

10:45  Sébastien : décommissionnement edifio-sourcing.vercel.app
11:00  Steve : email Resend "migration réussie, reconnectez-vous"
11:30  Smoke prod intensif (3 parcours)
12:00  ┌─────────────────────────────────────────┐
       │ FERMETURE — bilan flash dans Slack      │
       └─────────────────────────────────────────┘
```

**Garde-fou Storage** : si mesure J-7 révèle `dossier-pieces` > 3 Go, retomber sur pré-migration partielle (J-3 + sync delta J0). Décision à 11h le J-7 par Steve.

---

## 8. Lundi 20/7 matin — R12 mitigation

🔴 **R12 = CRITIQUE COMMERCIAL**. AlyoS perd la valeur perçue principale si le cron 6h30 KO le 1er lundi post-bascule.

```
06:30  Cron sourcing-run doit tourner (Vercel cron)
       - app/api/cron/sourcing-run/route.ts
       - Protégé par Bearer CRON_SECRET
       - Lit search_profiles actifs, itère, log cron_run_log

07:00  Cron monitoring (Alex livre R12 mitigation)
       - Si run KO → mail alert auto à steissier@
       - Check duration > 50s ou status='error'

07:30  Manuel : check /sourcing/admin/crons
       - cron_run_log row "2026-07-20 06:30" status='ok'
       - duration_ms < 60000
       - errors_count = 0

08:00  Manuel : check digest AO du jour reçu par users AlyoS
       - Mail Resend "Votre veille du lundi" reçu ?
       - Check brevo_messages.events latest = `email_delivered`

  Si KO à 07:00 ou 07:30 :
    1. Trigger manuel : POST /api/cron/sourcing-run avec Bearer CRON_SECRET
    2. Si toujours KO → runbook docs/RUNBOOK_CRON_SOURCING_RUN.md (Alex livré)
    3. Si runbook ne suffit pas → escalade Steve + rollback DNS partiel
    4. Fallback ultime : importer dump du dimanche 19/7 (si POC Vercel KO)
```

⚠️ **Backup plan déjà préparé** : import du dump du dimanche 19/7 si Vercel cron POC fait du foin.

---

## 9. Post-mortem 25 juillet

Format : 1h vidéo (Steve + Sébastien), pas de slides.

### Ordre du jour

- [ ] **Ce qui a marché** (10 min) — liste flash, pas de discussion
- [ ] **Ce qui a bugé** (20 min) — chaque bug → 1 phrase impact + 1 phrase root cause
- [ ] **Ce qu'on referait pareil** (10 min)
- [ ] **Ce qu'on changerait pour Module ACT next migration** (15 min)
- [ ] **Dettes ouvertes à refermer** (5 min) — backlog post-mortem

### Livrables à produire

- [ ] `docs/POSTMORTEM_MIGRATION_SOURCING_2026-07-25.md` (5-10 pages max — Sébastien rédige)
- [ ] Mise à jour `gates/REVIEW_SUIVI_ACT_*` avec les patterns confirmés
- [ ] Closure sub-agent `suivi_act_reviewer` (mode standby vs archivé)

### Retour business-as-usual

- À partir du **lundi 27/7** : Sébastien retourne sur l'agenda Suivi+ACT normal
- Sourcing devient un module standard du monorepo
- Le sub-agent `suivi_act_reviewer` reste actif pour les futures PR sourcing (mode revue normale)

---

## 10. Contacts d'urgence

| Rôle | Personne | Email | Quand l'appeler |
|---|---|---|---|
| CTO Sourcing / lead côté Sourcing | Steve TEISSIER | steissier@alyosingenierie.fr | Premier réflexe pour TOUT problème Sourcing |
| CTO Cowork | Sophie | (Slack #cto) | Rare. Escalade Board uniquement. |
| AlyoS admin (data prod) | — | admin@alyosingenierie.fr | Si user AlyoS bloqué post-bascule |
| PROTECT admin (data prod) | — | contact@protect-marseille.com | Si user PROTECT bloqué post-bascule |
| Hugo (reviewer Sourcing) | sub-agent | — | Si doute sur une PR portée |
| Camille (QA Sourcing) | sub-agent | — | Si suite pgTAP rouge |

### Channels Slack

- `#migration-sourcing` — créé J-7, ouvert jusqu'à J+7 post-mortem
- `#alyos-tech` — fallback
- DM Steve pour les bloquants critiques bascule J0

### Runbooks à avoir sous la main J0

- `scripts/migration/README.md` (152 lignes) — commandes PowerShell exactes
- `docs/RUNBOOK_CRON_SOURCING_RUN.md` — fallback R12 lundi matin
- `docs/HANDOFF_MIGRATION_SOURCING_TO_MONOREPO.md` §8.5 — procédure rollback

---

*Document personnel Sébastien. Préparé J-22 (2026-06-09). Lecture obligatoire J0 entre 07h30 et 08h00. Pas de relecture du HANDOFF 38 pages. Tu es prêt.*
