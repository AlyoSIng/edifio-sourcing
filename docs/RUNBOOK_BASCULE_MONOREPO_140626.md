# Runbook bascule monorepo — dimanche 14 juin 2026, 8h-11h (v1)

> **Bascule de `edifio-sourcing` (standalone, Supabase Frankfurt `loogmtltwkhvczdiurqs`)
> vers le monorepo `alyos-suivi-chantier` (Supabase Paris eu-west-3, projet partagé Suivi+ACT).**
>
> Décision visio cadrage 10/06 (A8) : bascule AVANCÉE au week-end 13-14/06 — cf.
> `DECISIONS.md` 2026-06-10 + `docs/VISIO_CADRAGE_MIGRATION_BRIEF_260610.md`.
>
> **v1 du 10/06 — à figer vendredi 12/06 soir** (les `<PLACEHOLDER>` et les points
> marqués ⏳ doivent être résolus avant le GO/NO-GO de samedi). Structure héritée de
> `docs/PLAN_BASCULE_10_06_2026.md` + `docs/CHEAT_SHEET_BASCULE.md` (bascule 0050-0053
> réussie le 10/06).
>
> **Pré-requis absolu** : GO prononcé samedi 13/06 soir sur la base de
> `docs/RECETTE_CROISEE_MIGRATION_PLAN.md` (100 % P0 verts, 0 KO sécurité).
> **Le NO-GO ramène au plan du 18/07 sans dégât** — aucune action destructive
> sur la prod Sourcing avant l'étape 1 de dimanche.

## TL;DR — Dimanche en 9 étapes (~2h45 + 15 min buffer)

| # | Étape | Qui | Horaire | Bloquant si KO ? |
|---|---|---|---|---|
| 1 | Maintenance ON + gel writes (domaine OFF + worker Fly suspendu) | Steve | 8h00-8h10 | Oui — STOP |
| 2 | Backup final sourcing prod + dump données à transposer | Steve | 8h10-8h30 | Oui — STOP |
| 3 | Application 0129-0131 sur BDD monorepo prod | Sébastien | 8h30-8h45 | Oui — STOP |
| 4 | Transposition données (orgs, users→profiles, billing, 22 tables, auth.users) | Sébastien + Steve | 8h45-9h20 | **CRITIQUE** — rollback |
| 5 | Assertions SQL post-import (12 assertions) | Camille (prépare) / Steve (exécute) | 9h20-9h35 | Oui — rollback |
| 6 | Bascule domaine `sourcing.edifio.fr` → projet Vercel monorepo | Steve | 9h35-9h45 | Oui — DNS revert |
| 7 | Smoke prod (AlyoS + PROTECT + cotraitant + SSO) | Steve + équipe | 9h45-10h15 | Oui — rollback complet |
| 8 | Crons actifs (Vercel monorepo + worker Fly repointé) | Steve | 10h15-10h30 | Non — peut attendre lundi 6h00 |
| 9 | Comm post-bascule (équipe + PROTECT, cf. A5) | Steve | 10h30-10h45 | Non |

## Qui fait quoi

| Rôle | Personne | Responsabilités |
|---|---|---|
| Pilote ops prod | **Steve** | Pose les ENV PG* dans SA session, lance backups/imports/psql, bascule domaine Vercel, smoke prod. (Règle actée : jamais un sub-agent sur les credentials prod.) |
| Lead BDD monorepo | **Sébastien** | Applique 0129-0131, supervise la transposition, accès écriture BDD monorepo, arbitre tout conflit de données Suivi/ACT |
| Recette & assertions | **Camille** | Fournit le bloc d'assertions §5 prêt à coller, tient la checklist smoke §7, déclare PASS/FAIL |
| Dev d'astreinte | **Alex** | Hotfix only si le smoke révèle un bug applicatif (gel features maintenu) |

**Canal temps réel** : visio ouverte en continu 8h-11h (Steve + Sébastien minimum).
**Règle d'or** : STOP au moindre doute. Chaque étape a son critère de sortie écrit.

## ⚠️ Garde-fous — pièges réels de la bascule du 10/06

Leçons de `notes-de-suivi/CC_260610_0855_BASCULE_PROD.md` et `CC_260610_1340_INCIDENT_E2E_PROD.md` :

1. **Session Pooler IPv4, pas la Direct connection.** La Direct connection `db.<ref>.supabase.co:5432`
   est IPv6-only → cassée depuis Docker Windows. Utiliser le **Session Pooler port 5432**
   (PAS le transaction pooler 6543) avec le username `postgres.<project-ref>` :
   - Sourcing (Frankfurt) : `aws-0-eu-west-1.pooler.supabase.com:5432`, user `postgres.loogmtltwkhvczdiurqs`
   - Monorepo (Paris) : `aws-0-eu-west-3.pooler.supabase.com:5432`, user `postgres.<MONOREPO-REF>` ⏳
   - ⚠️ Les en-têtes de `backup-sourcing-db.ps1` / `backup-suiviact-db.ps1` recommandent encore
     la Direct connection — **obsolète**, suivre ce runbook.
2. **Créer `logs/` AVANT tout pipeline `Tee-Object`** (le 10/06, le Tee a échoué silencieusement
   APRÈS que `docker run` avait déjà tourné) : `New-Item -ItemType Directory -Force logs | Out-Null`.
   Mieux : rediriger avec `*>&1 | Out-File` et vérifier le code retour `$LASTEXITCODE` à chaque commande.
3. **Docker inaccessible depuis les outils Claude Code** : toutes les commandes `docker run` de ce
   runbook sont lancées par Steve dans SA session. SQL Editor Supabase = mono-bloc `DO $$ ... $$` obligatoire.
4. **La vraie URL prod est `sourcing.edifio.fr`** (pas `sourcing.alyosingenierie.fr` — piège CHEAT_SHEET du 10/06).
5. **Garde par cible, pas par flag** (incident P0 CI e2e du 10/06) : tout script qui écrit via
   service_role/psql doit afficher l'host cible et exiger une confirmation explicite
   (`PROD-CONFIRMER`). Aucun seed e2e ne doit jamais voir le project ref prod du monorepo.
6. **Vérifier l'existence des profiles/memberships après import** (le 10/06, Steve n'avait pas de
   membership en prod alors que ses 2 collègues si — bug de seed silencieux). Assertion §5.3 dédiée.
7. **`ON_ERROR_STOP=1` sur chaque psql** — sinon une migration peut moitié-passer sans bruit.

---

## J-1 — Samedi 13/06 soir : pré-flight (~1h, après le GO)

### P1. GO/NO-GO formel (Steve + Sébastien)

Critères (cf. `docs/RECETTE_CROISEE_MIGRATION_PLAN.md` §6) :

- [ ] Recette croisée : **100 % des cas P0 verts, 0 KO sécurité** (checklist signée Camille)
- [ ] Script de transposition : **2 runs consécutifs sur dump = mêmes assertions vertes** (idempotence prouvée)
- [ ] Migrations 0129-0131 relues par Sébastien + dry-run passé sur container postgres local
- [ ] Runbook figé (tous les ⏳ et `<PLACEHOLDER>` de ce doc résolus)
- [ ] Rollback (Annexe A) relu à voix haute par Steve ET Sébastien
- [ ] Dispos confirmées dimanche 8h-11h : Steve, Sébastien (+ Alex joignable)

**NO-GO** → on annonce le report au 18/07, rien d'autre à faire (prod Sourcing intacte).

### P2. Backups des DEUX BDD prod

```powershell
cd C:\Dev\edifio-sourcing
New-Item -ItemType Directory -Force backups, logs | Out-Null

# --- Backup SOURCING prod (Frankfurt) — Session Pooler IPv4 ---
$env:PGHOST = "aws-0-eu-west-1.pooler.supabase.com"
$env:PGPORT = "5432"
$env:PGUSER = "postgres.loogmtltwkhvczdiurqs"
$env:PGDATABASE = "postgres"
$env:PGPASSWORD = "<password sourcing prod — 1Password>"
.\scripts\migration\backup-sourcing-db.ps1 -UseDocker
# Attendu : backups/sourcing-prod-2026-06-13-HHmm.dump (> 5 MB)

# --- Backup MONOREPO prod (Paris) — Session Pooler IPv4 ---
$env:PGHOST = "aws-0-eu-west-3.pooler.supabase.com"
$env:PGUSER = "postgres.<MONOREPO-REF>"            # ⏳ ref à coller vendredi
$env:PGPASSWORD = "<password monorepo prod — 1Password>"
.\scripts\migration\backup-suiviact-db.ps1 -UseDocker
# Attendu : backups/suiviact-prod-2026-06-13-HHmm.dump

# --- Vérification (les DEUX fichiers, taille non nulle) ---
ls backups\*-prod-2026-06-13-*.dump
```

- [ ] Copier les 2 dumps hors machine (OneDrive sécurisé / 1Password attachment)
- [ ] Backup Storage Supabase si la bibliothèque a des fichiers : `.\scripts\migration\backup-supabase-storage.ps1` ⏳ (vérifier le périmètre buckets vendredi)

### P3. Gel déploiements + DNS

- [ ] **Plus aucun merge** sur `main` (sourcing) ni `main`/`prod-suivi` (monorepo) après samedi 20h — annonce Slack
- [ ] Vérifier que le dernier deploy Vercel du monorepo (avec middleware `SOURCING_HOSTS`, routes `/sourcing`, crons) est **Ready** et correspond au commit recetté samedi : `git log origin/prod-suivi --oneline -3` ⏳ (noter le SHA recetté ici : `________`)
- [ ] Aucune modif DNS chez le registrar ce week-end (la bascule §6 se fait au niveau Vercel, pas du registrar)

### P4. ENV Vercel monorepo complètes

> Source de vérité : `docs/VARS_ENV_VERCEL_MONOREPO_DIFF.md` (44 vars détaillées,
> diff statique Sourcing ↔ monorepo au 11/06).

```powershell
# Exporter et diff les ENV du projet standalone vs monorepo
.\scripts\migration\export-vercel-env.ps1   # ⏳ adapter pour lister les 2 projets
```

Checklist minimale à confirmer posées sur le projet Vercel monorepo (Production) :

- [ ] `ANTHROPIC_API_KEY`, `BREVO_API_KEY`, `RESEND_API_KEY`
- [ ] ~~`ODOO_URL` / `ODOO_DB` / `ODOO_USER` / `ODOO_API_KEY` / `ODOO_SYNC_ENABLED`~~ — **REPORTÉ POST-BASCULE** (Q4 acté visio 10/06 + CHECKLIST_SECRETS_VENDREDI bloc C). Ne PAS poser dimanche.
- [ ] `CRON_SECRET` (⚠️ valeur du monorepo, PAS celle du standalone — noter laquelle gagne ⏳)
- [ ] Variables Supabase = projet monorepo (URL, anon, service_role) — **PAS** `loogmtltwkhvczdiurqs`

**Vars engine sourcing — ajoutées par le portage des lots ENGINE A-D (mergé 11/06) :**

- [ ] `SCRAPER_BASE_URL` — URL du worker Fly.io (ex. `https://edifio-playwright-worker.fly.dev`). Lue par `client.ts` (déclencheur) ET par les tests. Sans elle : `ScraperUnavailableError` levée mais fire-and-forget swallow → cron continue, pipeline BOAMP seul.
- [ ] `SCRAPER_TRIGGER_SECRET` — Bearer partagé worker ↔ déclencheur ↔ webhook (contrat **symétrique** : le webhook `scraper-done` utilise le **même** secret). Sans elle : `verifyScraperWebhookAuth` fail-closed → 401 à tout appel webhook.
- [ ] `BOAMP_BASE_URL` — **optionnelle**, override de l'endpoint Opendatasoft v2.1 (utile en staging). Si absente : fallback vers `https://boamp-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/boamp/records`. **NE PAS poser en prod** sauf changement de contrat Opendatasoft.
- [ ] `R12_MONITORING_RECIPIENT` — destinataire alerte si `sourcing-run` ne tourne pas (fallback hardcodé `sebastien@edifio.fr`).

> ⚠️ **`SCRAPER_WEBHOOK_SECRET` mentionné dans le brief Steve n'existe PAS** dans le code mergé. Le webhook `scraper-done` du monorepo utilise `SCRAPER_TRIGGER_SECRET` (contrat symétrique avec le déclencheur). Une variante HMAC `SCRAPER_WEBHOOK_SECRET` séparée est un **TODO post-MVP** documenté dans `app/src/modules/sourcing/lib/engine/connectors/scraping/webhook-auth.ts` (pattern `brevo-webhook-hmac.ts`). Donc **rien à poser** sous ce nom dimanche.

- [ ] Secrets worker Fly.io (URL + token de déclenchement) ⏳ — les **mêmes valeurs** que `SCRAPER_BASE_URL` / `SCRAPER_TRIGGER_SECRET` ci-dessus mais posés côté Fly app (`fly secrets set ...`). Cf. §8 du runbook (repointage worker).

**Vars à VÉRIFIER (déjà présentes côté monorepo mais valeur peut diverger entre les 2 projets Vercel)** — Steve ouvre la page Settings → Environment Variables :

- [ ] `BREVO_TEMPLATE_ID_ARCHITECT_{FOLLOWUP,SOLICITATION,DECLINE_ACKNOWLEDGMENT,DOSSIER_DIFFUSION}_{TU,VOUS}` — 7 IDs entiers (lookup dynamique template-picker, lecture seule)
- [ ] `ARCHITECT_JWT_PRIVATE_KEY` / `ARCHITECT_JWT_PUBLIC_KEY` — PEM multi-lignes, copier intégralement (attention retours chariot)
- [ ] `MATCHING_WEIGHTS_PROFILE`
- [ ] `BREVO_SOURCING_API_KEY` / `BREVO_WEBHOOK_SECRET`
- [ ] `RESEND_API_SOURCING_KEY` / `RESEND_FROM_EMAIL`
- [ ] `PAPPERS_API_KEY`
- [ ] `NEXT_PUBLIC_SITE_URL` = `https://sourcing.edifio.fr` côté Production monorepo

### P4 bis. Vercel cron `vercel.json` — alerte 3 crons manquants

Le `vercel.json` du monorepo déclare **6 crons** alors que **9 routes** existent
(`tandem-followup`, `library-expiry-digest`, `dossier-zip-cleanup` n'ont pas
de schedule). C'est l'ambiguïté n°6 du DIFF.

- [ ] Décision vendredi : on accepte ce périmètre dégradé pour la bascule (les
  3 crons attendront un PR post-bascule), OU on ajoute les 3 schedules à
  `app/vercel.json` **avant** le deploy gel samedi 20h. Steve à arbitrer.
- [ ] Si « on ajoute » : reprendre les schedules tels que dans `vercel.json`
  standalone et les copier dans `app/vercel.json`. Ne PAS modifier les 6 schedules existants.

### P5. Test de plomberie connexions (15 min qui en sauvent 60 dimanche)

Depuis la machine de Steve, vérifier que `psql` Docker joint les DEUX poolers :

```powershell
docker run --rm -e PGPASSWORD=$env:PGPASSWORD postgres:17 psql `
  -h aws-0-eu-west-1.pooler.supabase.com -p 5432 -U postgres.loogmtltwkhvczdiurqs -d postgres `
  -c "SELECT 'sourcing OK', count(*) FROM organizations;"

docker run --rm -e PGPASSWORD=$env:PGPASSWORD postgres:17 psql `
  -h aws-0-eu-west-3.pooler.supabase.com -p 5432 -U postgres.<MONOREPO-REF> -d postgres `
  -c "SELECT 'monorepo OK', count(*) FROM organizations;"
```

---

## Dimanche 14/06 — séquence 8h00 → 11h00

### 1. Maintenance ON + gel des écritures (8h00-8h10) — Steve

Objectif : **plus aucune écriture sur la BDD sourcing** entre le dump final (§2) et la bascule (§6).

1. **Couper l'accès app** — retrait du domaine du projet standalone (clics exacts) :
   - `vercel.com` → team `teissiers-projects` → projet **`edifio-sourcing`**
   - Onglet **Settings** → menu gauche **Domains**
   - Ligne `sourcing.edifio.fr` → bouton **Edit** → **Remove** → retaper `sourcing.edifio.fr` → confirmer
   - Effet : le domaine ne sert plus rien (404 Vercel) = maintenance de fait. ⏳ Si on préfère une
     vraie page maintenance : Settings → Deployment Protection → Password Protection (selon plan
     Vercel) — à trancher vendredi.
2. **Suspendre le worker Fly.io** (il écrit des tenders) :
   ```powershell
   fly machine list -a <FLY-APP-SOURCING>          # ⏳ nom app à coller vendredi
   fly machine stop <MACHINE-ID> -a <FLY-APP-SOURCING>
   ```
3. **Vérifier qu'aucun cron Vercel standalone ne tirera pendant la fenêtre** : dashboard Vercel →
   `edifio-sourcing` → Crons → schedules (`sourcing-monitoring` = `0 5 * * 1-5`, lun-ven →
   inactif dimanche ✅ ; vérifier les autres).

**Critère de sortie** : `https://sourcing.edifio.fr` ne répond plus (404/401) + worker Fly `stopped`.

### 2. Backup final + dump des données à transposer (8h10-8h30) — Steve

```powershell
cd C:\Dev\edifio-sourcing
# ENV = SOURCING prod (Session Pooler, cf. P2)
$env:PGHOST = "aws-0-eu-west-1.pooler.supabase.com"
$env:PGPORT = "5432"
$env:PGUSER = "postgres.loogmtltwkhvczdiurqs"
$env:PGDATABASE = "postgres"
$env:PGPASSWORD = "<password sourcing prod>"

# 2a. Backup complet final (post-gel = état exact qui part en monorepo)
.\scripts\migration\backup-sourcing-db.ps1 -UseDocker
ls backups\sourcing-prod-2026-06-14-*.dump   # → STOP si absent ou < 5 MB

# 2b. Dump data-only pour la transposition (public + auth.users/identities avec hashes)
docker run --rm -v ${PWD}\backups:/b -e PGPASSWORD=$env:PGPASSWORD postgres:17 pg_dump `
  -h $env:PGHOST -p 5432 -U $env:PGUSER -d postgres `
  --data-only --schema=public `
  -Fc -f /b/sourcing-data-2026-06-14.dump
if ($LASTEXITCODE -ne 0) { Write-Error "DUMP DATA KO — STOP" }

docker run --rm -v ${PWD}\backups:/b -e PGPASSWORD=$env:PGPASSWORD postgres:17 pg_dump `
  -h $env:PGHOST -p 5432 -U $env:PGUSER -d postgres `
  --data-only --table=auth.users --table=auth.identities `
  -f /b/sourcing-auth-2026-06-14.sql
if ($LASTEXITCODE -ne 0) { Write-Error "DUMP AUTH KO — STOP" }

# 2c. Relevé des counts source (référence pour les assertions §5)
docker run --rm -v ${PWD}\scripts\migration:/s -e PGPASSWORD=$env:PGPASSWORD postgres:17 psql `
  -h $env:PGHOST -p 5432 -U $env:PGUSER -d postgres --set=ON_ERROR_STOP=1 `
  -f /s/counts-source.sql        # ⏳ script à livrer vendredi avec le Lot 6 (liste figée des 22 tables)
```

**Critère de sortie** : 3 fichiers présents + tableau des counts source archivé dans `logs/`.

⚠️ **NE JAMAIS continuer si un dump échoue. Sans backup, pas de rollback.**

### 3. Application 0129-0131 sur la BDD monorepo (8h30-8h45) — Sébastien

Fichiers (convention monorepo, validés en recette samedi) :
`0129_sourcing_schema.sql` (CREATE SCHEMA sourcing + tables), `0130_sourcing_rls.sql`
(policies `organization_id = current_user_org_id() AND current_user_has_sourcing()` + FORCE),
`0131_sourcing_seed_platforms.sql` (référentiel plateformes).

```bash
# Sébastien, sur la BDD monorepo prod (Session Pooler eu-west-3)
psql "host=aws-0-eu-west-3.pooler.supabase.com port=5432 user=postgres.<MONOREPO-REF> dbname=postgres" \
  --set=ON_ERROR_STOP=1 \
  -f migrations/0129_sourcing_schema.sql \
  -f migrations/0130_sourcing_rls.sql \
  -f migrations/0131_sourcing_seed_platforms.sql
```

Vérification immédiate (mono-bloc, SQL Editor ou psql) :

```sql
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM information_schema.tables WHERE table_schema = 'sourcing';
  IF n < 22 THEN RAISE EXCEPTION 'KO: % tables dans le schéma sourcing (attendu >= 22)', n; END IF;
  IF to_regprocedure('public.current_user_has_sourcing()') IS NULL
    THEN RAISE EXCEPTION 'KO: helper current_user_has_sourcing absent'; END IF;
  RAISE NOTICE 'Schema sourcing OK: % tables', n;
END $$;
```

- [ ] PostgREST : Dashboard Supabase monorepo → Settings → API → **Exposed schemas** : ajouter `sourcing`

**Critère de sortie** : bloc DO vert + `sourcing` exposé dans PostgREST.

### 4. Transposition des données (8h45-9h20) — Sébastien + Steve — 🔴 CRITIQUE

Script Lot 6 : `scripts/migration/transpose-sourcing-to-monorepo.sql` ⏳ (recetté samedi, idempotent,
tourne dans UNE transaction). Mappings actés (cartographie Lot 2 + A5) :

| Source (sourcing, schéma public) | Cible (monorepo) | Règle |
|---|---|---|
| `organizations` (AlyoS `11111111-...`, PROTECT) | `public.organizations` | **MERGE** : AlyoS existe déjà côté Suivi → réutiliser son id monorepo ; PROTECT → INSERT. Table de correspondance `org_id_map(old_id, new_id)` |
| `users` + `memberships` | `public.profiles` | 1 membership/user en pratique → `profiles(id, organization_id, email, full_name=firstname||' '||lastname, role)` |
| Rôles | `profiles.role` + `is_superadmin` | `admin→admin`, `user→member`, `viewer→member` (aucun viewer en prod), `superadmin→is_superadmin=true` |
| `auth.users` / `auth.identities` (4 users réels) | `auth.*` monorepo | Import **avec hashes** (pas de reset password). ⚠️ Si l'email existe déjà côté monorepo (Steve a-t-il un compte Suivi ? ⏳ vérifier vendredi) → garder l'id monorepo et **remapper user_id dans toutes les tables transposées** via `user_id_map` |
| Billing 0049 (`trial_started_at`, `trial_ends_at`, `subscription_status`, `stripe_customer_id`) | Modèle 0115 | PROTECT : `trial_until = trial_ends_at` (0049), `trial_status = 'actif'`, `contract_summary` initialisé ; **toutes les orgs sourcing** : `modules_actifs = modules_actifs \|\| '["sourcing"]'` (sans doublon) |
| 22 tables de données (tenders, selections, learning_events, architects, bureaux_etudes, companies, buyers, cotraitant_*, tender_*, presentation_library, library_item_index, dossier_dispatches, search_profiles, …) | `sourcing.*` | INSERT avec `organization_id` remappé via `org_id_map` et `*_user_id` via `user_id_map`. **Liste exacte figée vendredi avec le script** ⏳ |
| Orgs/users fixtures e2e (`e2e-test+%`, orgs `...a01/b01/c01`) | — | **NE PARTENT PAS** (purgées le 10/06 — l'assertion 5.10 vérifie qu'aucune n'a réapparu) |

```powershell
# Steve — ENV = MONOREPO prod
$env:PGHOST = "aws-0-eu-west-3.pooler.supabase.com"
$env:PGUSER = "postgres.<MONOREPO-REF>"
$env:PGPASSWORD = "<password monorepo prod>"

# 4a. auth.users + identities (avant le script, les profiles ont une FK vers auth.users)
docker run --rm -v ${PWD}\backups:/b -e PGPASSWORD=$env:PGPASSWORD postgres:17 psql `
  -h $env:PGHOST -p 5432 -U $env:PGUSER -d postgres --set=ON_ERROR_STOP=1 `
  -f /b/sourcing-auth-2026-06-14.sql `
  *>&1 | Out-File logs\bascule-4a-auth.log ; Get-Content logs\bascule-4a-auth.log -Tail 5

# 4b. Transposition (le script affiche l'host cible et demande PROD-CONFIRMER)
docker run --rm -v ${PWD}\scripts\migration:/s -v ${PWD}\backups:/b -e PGPASSWORD=$env:PGPASSWORD postgres:17 psql `
  -h $env:PGHOST -p 5432 -U $env:PGUSER -d postgres --set=ON_ERROR_STOP=1 `
  -f /s/transpose-sourcing-to-monorepo.sql `
  *>&1 | Out-File logs\bascule-4b-transpose.log ; Get-Content logs\bascule-4b-transpose.log -Tail 20
```

**Critère de sortie** : script terminé `COMMIT` sans erreur (le script ROLLBACK seul en cas d'exception).
**Si KO** : la transaction a rollback → BDD monorepo intacte hors auth.users importés → Annexe A, cas R2.

### 5. Assertions SQL post-import (9h20-9h35) — Camille prépare / Steve exécute

Mono-bloc `DO` (collable dans le SQL Editor monorepo) — version exécutable livrée vendredi dans
`scripts/migration/verify-post-import-monorepo.sql` ⏳. Les 12 assertions :

```sql
DO $$
DECLARE n int; m int; protect_org uuid; trial_src timestamptz;
BEGIN
  -- 1. Counts par table : sourcing.* == counts source relevés au §2c (22 comparaisons)
  --    (générées par le script depuis la table temporaire migration_source_counts)

  -- 2. profiles : aucun organization_id NULL parmi les users transposés
  SELECT count(*) INTO n FROM public.profiles WHERE organization_id IS NULL;
  IF n > 0 THEN RAISE EXCEPTION 'A2 KO: % profiles sans org', n; END IF;

  -- 3. Chaque auth.user sourcing a EXACTEMENT 1 profile (leçon membership Steve 10/06)
  SELECT count(*) INTO n FROM auth.users u
   WHERE u.email IN ('steissier@alyosingenierie.fr','assistante@alyosingenierie.fr',
                     'bim@alyosingenierie.fr','<EMAIL-ADMIN-PROTECT>')      -- ⏳
     AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id);
  IF n > 0 THEN RAISE EXCEPTION 'A3 KO: % users sans profile', n; END IF;

  -- 4. Rôles valides : tous dans owner/admin/member (check constraint monorepo)
  SELECT count(*) INTO n FROM public.profiles WHERE role NOT IN ('owner','admin','member');
  IF n > 0 THEN RAISE EXCEPTION 'A4 KO: % roles invalides', n; END IF;

  -- 5. Aucun 'viewer' résiduel + superadmin porté par le flag
  SELECT count(*) INTO n FROM public.profiles WHERE is_superadmin = true;
  IF n < 1 THEN RAISE EXCEPTION 'A5 KO: aucun superadmin transposé'; END IF;

  -- 6. PROTECT : trial préservé (A5 visio) — date 0049 recopiée, statut actif, module ouvert
  SELECT id INTO protect_org FROM public.organizations WHERE name ILIKE '%PROTECT%';
  IF protect_org IS NULL THEN RAISE EXCEPTION 'A6 KO: org PROTECT absente'; END IF;
  PERFORM 1 FROM public.organizations
   WHERE id = protect_org AND trial_status = 'actif' AND trial_until IS NOT NULL
     AND modules_actifs ? 'sourcing';
  IF NOT FOUND THEN RAISE EXCEPTION 'A6 KO: trial PROTECT non préservé'; END IF;
  -- ⏳ vendredi : ajouter l'égalité stricte trial_until = '<valeur trial_ends_at prod 0049>'

  -- 7. AlyoS : modules_actifs contient 'sourcing'
  PERFORM 1 FROM public.organizations WHERE name ILIKE 'AlyoS%' AND modules_actifs ? 'sourcing';
  IF NOT FOUND THEN RAISE EXCEPTION 'A7 KO: module sourcing non activé pour AlyoS'; END IF;

  -- 8. Zéro FK orpheline sur les axes critiques (org remapping)
  SELECT count(*) INTO n FROM sourcing.tenders t
   WHERE NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = t.organization_id);
  SELECT count(*) INTO m FROM sourcing.cotraitant_share_items i
   WHERE NOT EXISTS (SELECT 1 FROM sourcing.cotraitant_shares s WHERE s.id = i.share_id);
  IF n + m > 0 THEN RAISE EXCEPTION 'A8 KO: FK orphelines (tenders=%, share_items=%)', n, m; END IF;
  -- (le script complet boucle sur TOUTES les FK organization_id/user_id des 22 tables)

  -- 9. RLS : 100 %% des tables sourcing.* avec RLS + FORCE
  SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'sourcing' AND c.relkind = 'r'
     AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity);
  IF n > 0 THEN RAISE EXCEPTION 'A9 KO: % tables sourcing sans FORCE RLS', n; END IF;

  -- 10. Aucune fixture e2e en prod (post-incident 10/06)
  SELECT count(*) INTO n FROM auth.users WHERE email LIKE 'e2e-test+%';
  IF n > 0 THEN RAISE EXCEPTION 'A10 KO: % users e2e en prod', n; END IF;

  -- 11. Functions cotraitant SECURITY DEFINER présentes (bombe 10/06 non réintroduite)
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE p.proname IN ('get_cotraitant_share_by_token','get_cotraitant_share_items_by_token',
                       'mark_cotraitant_share_item_signed') AND p.prosecdef;
  IF n < 3 THEN RAISE EXCEPTION 'A11 KO: functions cotraitant SECURITY DEFINER manquantes (%/3)', n; END IF;

  -- 12. Salve U intact : les reason_code de learning_events couvrent les 7 motifs
  SELECT count(DISTINCT reason_code) INTO n FROM sourcing.learning_events WHERE reason_code IS NOT NULL;
  IF n = 0 THEN RAISE EXCEPTION 'A12 KO: learning_events sans reason_code transposés'; END IF;

  RAISE NOTICE '=== 12/12 assertions post-import OK ===';
END $$;
```

**Critère de sortie** : `12/12 assertions post-import OK`. **Toute exception → Annexe A, cas R2.**

### 6. Bascule domaine `sourcing.edifio.fr` → Vercel monorepo (9h35-9h45) — Steve

Le retrait côté standalone est fait depuis l'étape 1. Côté registrar, le CNAME pointe déjà
`cname.vercel-dns.com` → **rien à toucher chez le registrar**. Clics exacts :

1. `vercel.com` → team du monorepo ⏳ (`<TEAM-MONOREPO>`) → projet **`alyos-suivi-chantier`**
2. Onglet **Settings** → menu gauche **Domains**
3. Champ en haut : taper `sourcing.edifio.fr` → bouton **Add**
4. Attendre le badge **Valid Configuration** (propagation quasi immédiate, le CNAME ne change pas)
5. ⚠️ Si Vercel affiche un écran « Verify domain ownership » avec un TXT `_vercel` (cas domaine
   rattaché à un autre team) : ajouter le TXT chez le registrar — procédure clic-par-clic à
   préparer vendredi si les deux projets ne sont pas dans le même team ⏳
6. Test : `curl.exe -sI https://sourcing.edifio.fr/login` → `200` servi par le monorepo

**Critère de sortie** : `https://sourcing.edifio.fr/login` rend la page login du monorepo
(middleware `SOURCING_HOSTS` actif → rewrite `/sourcing`).
**Si KO après 10 min** : Annexe A, cas R3 (revert domaine).

### 7. Smoke prod (9h45-10h30) — checklist Steve

> **Procédure détaillée** : `docs/SMOKE_TESTS_POSTBASCULE.md` (10 sections,
> ~45 min, commandes curl prêtes à coller avec critères PASS/FAIL).
>
> Le tableau ci-dessous est le **résumé exécutif** (17 tests à dérouler sur la
> bascule, héritage des 12 tests historiques + 5 ajouts engine v1.1). La version
> complète couvre en plus : engine cron `sourcing-run` (section 7 du SMOKE),
> webhook `scraper-done` (section 8 du SMOKE), et la régression Suivi/ACT
> (section 9).
>
> **Note de cohérence numérotation (audit Camille F-05)** : les sections 1 à 10
> de `SMOKE_TESTS_POSTBASCULE.md` et les tests 7.1 à 7.17 du tableau ci-dessous
> couvrent **le même périmètre fonctionnel**, vu à deux granularités :
> - SMOKE doc = vue par **domaine fonctionnel** (sanity, auth, AO, Tandem,
>   Dossier, Admin, Engine cron, Webhook, Régression, Logs).
> - Runbook §7 = vue par **action unitaire** (chaque test = une commande curl
>   ou une assertion, comptage 17/17 pour le critère de sortie).
> Si un test 7.x KO dimanche : ouvrir la section correspondante du SMOKE doc
> pour le détail diagnostic + critères PASS/FAIL.

| # | Test | Attendu | OK |
|---|---|---|---|
| 7.1 | Login `steissier@alyosingenierie.fr` sur `sourcing.edifio.fr` | Atterrit `/sourcing/ao-du-jour`, PAS `/no-org` | ☐ |
| 7.2 | Login admin PROTECT | Atterrit sur l'app, bannière trial visible, pas de `forbidden` | ☐ |
| 7.3 | AO du jour (AlyoS) | Liste ou empty state propre, zéro 500 | ☐ |
| 7.4 | **Écarter un AO** → modale | **7 motifs structurés** visibles, enregistrement OK (`SELECT * FROM sourcing.learning_events ORDER BY occurred_at DESC LIMIT 1`) | ☐ |
| 7.5 | Cloisonnement : PROTECT ne voit AUCUNE entité AlyoS (architectes/BE/entreprises) | 0 leak | ☐ |
| 7.6 | **Cotraitant** : ouvrir un lien `/cotraitant/<token>` existant en navigation privée (anon) | Page s'affiche (SECURITY DEFINER OK) | ☐ |
| 7.7 | SSO : depuis une session sourcing, ouvrir le module Suivi (cookie `Domain=.edifio.fr`) | Session partagée, pas de re-login | ☐ |
| 7.8 | Gating : org sans module sourcing (un client Suivi existant) tente `sourcing.edifio.fr` | `/module-non-active` | ☐ |
| 7.9 | Superadmin : `/superadmin/organizations` avec le compte Steve | Liste orgs, `is_superadmin` lu depuis profiles | ☐ |
| 7.10 | Vercel logs monorepo : `vercel logs --prod` | Aucune 500 pendant le smoke | ☐ |
| 7.11 | Console navigateur | Aucune erreur bloquante | ☐ |
| 7.12 | **Régression Suivi/ACT** : un user Suivi se connecte et ouvre un chantier | RAS (la bascule ne casse pas l'existant) | ☐ |
| 7.13 | **Engine cron `sourcing-run`** : `curl -X POST -H "Authorization: Bearer $CRON_SECRET" .../api/cron/sourcing-run` | `200 { ok:true, totalProfiles>=1, ... }` + 1 row `sourcing.cron_run_log status='ok'` | ☐ |
| 7.14 | **Auth cron** : même curl avec `Bearer WRONG` | `401 unauthorized` (fail-closed) | ☐ |
| 7.15 | **Webhook `scraper-done`** : `curl -X POST ... -d '{"runId":"smoke-1","platform":"place","profileId":"<uuid>","orgId":"<uuid>","tenders":null,"durationMs":1000}'` | `200 { ok:true, inserted:0, skipped:0, errors:0 }` | ☐ |
| 7.16 | **Auth webhook** : même curl avec `Bearer WRONG` | `401 unauthorized` | ☐ |
| 7.17 | **Schéma Zod webhook** : curl sans `runId` ou `durationMs` | `400 { ok:false, error:"invalid_payload", issues:[...] }` | ☐ |

**Critère de sortie** : 17/17. Un seul KO sécurité (7.5, 7.6, 7.8, 7.14, 7.16) = rollback immédiat (cf. `docs/ROLLBACK_BASCULE_140626.md`, cas R1).

### 8. Crons actifs (10h15-10h30) — Steve

1. Dashboard Vercel → projet monorepo → onglet **Crons** : **2 crons sourcing**
   apparaissent (`sourcing-run`, `sourcing-monitoring`) en plus des 4 crons Suivi
   existants — soit **6 crons au total** côté monorepo.
   > ⚠ Cohérence P4 bis : `app/vercel.json` déclare 6 crons sur 9 routes possibles.
   > Les 3 crons `tandem-followup`, `library-expiry-digest`, `dossier-zip-cleanup`
   > NE sont PAS portés dans le monorepo dimanche (sauf si l'arbitrage P4 bis
   > vendredi décide d'ajouter les schedules avant gel samedi 20h). Ce
   > périmètre dégradé est ACCEPTÉ par défaut pour la bascule.
2. Repointer le worker Fly.io vers la nouvelle BDD/URL ⏳ (secrets Fly à préparer vendredi) puis redémarrer :
   ```powershell
   fly secrets set SUPABASE_URL=<url-monorepo> SUPABASE_SERVICE_ROLE_KEY=<key-monorepo> -a <FLY-APP-SOURCING>
   fly machine start <MACHINE-ID> -a <FLY-APP-SOURCING>
   ```
3. Trigger manuel de contrôle :
   ```powershell
   curl.exe -H "Authorization: Bearer $env:CRON_SECRET" https://sourcing.edifio.fr/api/cron/sourcing-monitoring
   # Attendu : { ok: true, ... }
   ```

**Critère de sortie** : 2 crons sourcing listés (sur 6 crons monorepo) + trigger manuel 200.
Échéance réelle : `sourcing-run` lundi matin — **surveillance lundi 7h obligatoire**
(insertion tenders > 0, sinon alerte R12).

### 9. Communication post-bascule (10h30-10h45) — Steve

Conformément à **A5 (visio 10/06) : comm PROTECT APRÈS bascule terminée** — donc seulement
si §7 est 12/12.

1. **Mail PROTECT** (admin) : adapter le template `docs/ONBOARDING_PROTECT_ADMIN.md` ⏳ (corriger
   la date 18/07 → 14/06 + vérifier que l'URL annoncée est bien `sourcing.edifio.fr`) — fond :
   rien ne change pour vous (même URL, mêmes identifiants, trial préservé).
2. **Mail équipe AlyoS** + Slack technique : reprendre le format §9 de `PLAN_BASCULE_10_06_2026.md`
   (heure de bascule, fichiers de backup, SHA déployé, prochaines étapes : post-mortem semaine du 16/06,
   surveillance cron lundi, décommission standalone à J+7).
3. Mettre à jour `DECISIONS.md` (entrée « Bascule monorepo 14/06 ») + note de suivi `CC_260614_HHMM_BASCULE_MONOREPO.md`.

### Ce qu'on NE fait PAS dimanche

- ❌ Supprimer le projet Vercel `edifio-sourcing` ou le projet Supabase `loogmtltwkhvczdiurqs`
  (**conserver intacts jusqu'à J+7 minimum** — c'est le filet de rollback R4)
- ❌ Rotation des secrets (backlog post-MVP, acté A7)
- ❌ Toute feature / dette Lot 2 (gel maintenu)

---

## Annexe A — Rollback

> **Documents complémentaires** :
> - `docs/ROLLBACK_BASCULE_140626.md` — procédure détaillée pour les rollbacks
>   **POST-bascule** (après le §6 / pendant le §7 smoke). Inclut R1 (à chaud
>   dimanche), R2 (tardif J+1 à J+7), rejeu des écritures monorepo vers
>   standalone, comm rollback.
> - L'annexe ci-dessous (R1 à R4 historiques) reste la référence pour les
>   échecs **AVANT bascule domaine** : §2 backup KO, §3 migrations KO, §4
>   transposition KO, §5 assertions KO.

### Critères STOP (déclenchement immédiat, pas de négociation)

| Signal | Cas |
|---|---|
| Backup ou dump §2 échoue | STOP avant tout (rien n'a été modifié) |
| 0129-0131 échoue à moitié sur la BDD monorepo | R1 |
| Transposition §4 KO ou assertions §5 < 12/12 | R2 |
| Smoke §7 : tout KO sécurité, ou > 2 KO fonctionnels non triviaux | R3 |
| Découverte post-bascule grave (leak, perte de données) dans les 7 jours | R4 |
| Heure limite : pas d'étape 6 commencée à **10h30** | R3 sans bascule = simple réouverture standalone |

### R1 — Échec migrations 0129-0131 (BDD monorepo)

Les migrations sont idempotentes et le schéma `sourcing` est neuf : `DROP SCHEMA sourcing CASCADE;`
+ retrait de `sourcing` des exposed schemas PostgREST. Les données Suivi/ACT ne sont pas touchées.
La prod Sourcing standalone n'a pas bougé → réouverture (R3 étapes 2-3).

### R2 — Échec transposition / assertions

1. Le script tourne en transaction unique → un échec = ROLLBACK automatique.
2. Nettoyer ce qui est hors transaction : users auth importés au §4a
   (`DELETE FROM auth.identities/auth.users WHERE email IN (...)` — UNIQUEMENT les emails sourcing
   qui n'existaient pas déjà côté monorepo, liste produite par le 4a) + `DROP SCHEMA sourcing CASCADE`
   si on renonce.
3. Si doute sur l'état monorepo : restore du backup `suiviact-prod-2026-06-13-*.dump` (option nucléaire,
   accord Sébastien obligatoire — écrase aussi les écritures Suivi du week-end).
4. Réouverture standalone (R3 étapes 2-3).

### R3 — Réouverture du standalone (avant ou après bascule domaine)

1. Si le domaine a été ajouté au monorepo : Vercel → projet monorepo → Settings → Domains →
   `sourcing.edifio.fr` → **Remove**.
2. Vercel → projet `edifio-sourcing` → Settings → Domains → **Add** `sourcing.edifio.fr`
   (CNAME registrar inchangé → revalidation immédiate).
3. Redémarrer le worker Fly avec ses secrets D'ORIGINE (Frankfurt) :
   `fly machine start <MACHINE-ID> -a <FLY-APP-SOURCING>` (si les secrets ont été changés au §8 :
   les reposer AVANT le start).
4. Smoke standalone : login Steve + AO du jour + 1 écartement.
5. ⚠️ Fenêtre de perte de données : entre le gel (8h00) et la réouverture, l'app était coupée →
   **aucune écriture perdue** tant que personne n'a écrit côté monorepo. Si des écritures monorepo
   ont eu lieu (bascule partielle) : les recenser (`created_at > '2026-06-14 06:00Z'` sur sourcing.*)
   avant d'abandonner.
6. Annoncer le report (équipe + PROTECT si elle avait été notifiée) + post-mortem.

### R4 — Rollback tardif (J+1 à J+7)

Le standalone et sa BDD sont conservés intacts 7 jours : R3 + rejouer manuellement les écritures
faites côté monorepo depuis dimanche (volume attendu faible : 4 users). Au-delà de J+7 : plus de
rollback simple — décision Board.

## Annexe B — Tableau de bord avant / après

| Métrique | Avant (standalone) | Après (monorepo) |
|---|---|---|
| Projet Supabase | `loogmtltwkhvczdiurqs` (Frankfurt) | `<MONOREPO-REF>` (Paris) ⏳ |
| Schéma | `public` (Drizzle, 0001-0053) | `sourcing` (SQL manuel, 0129-0131) |
| Users / orgs réels | 4 users / 2 orgs (AlyoS + PROTECT trial) | mêmes + merge AlyoS avec l'org Suivi |
| Auth rôles | `user_metadata` JWT + memberships | TABLE `profiles` + `is_superadmin` |
| Billing | 0049 (`trial_ends_at`) | 0115 (`trial_until`, `trial_status`, `modules_actifs`) |
| Domaine | `sourcing.edifio.fr` → projet `edifio-sourcing` | `sourcing.edifio.fr` → projet monorepo |
| Crons Vercel | standalone (R12 etc.) | 4 Suivi + 5 sourcing |
| Worker Fly.io | pointé Frankfurt | pointé Paris (A1 : Fly conservé) |

## Annexe C — ⏳ À résoudre vendredi 12/06 pour figer le runbook

1. `<MONOREPO-REF>` + team Vercel monorepo + nom exact du projet Vercel
2. Nom de l'app Fly (`<FLY-APP-SOURCING>`) + machine id + secrets de repointage
3. Liste figée des 22 tables + script `transpose-sourcing-to-monorepo.sql` (Lot 6) + `counts-source.sql` + `verify-post-import-monorepo.sql` (version exécutable des 12 assertions, avec l'égalité stricte `trial_until`)
4. Steve / collègues ont-ils déjà un compte auth côté monorepo (collision email → stratégie de remap user_id) ?
5. Arbitrage `must_change_password` (cartographie ⚖️ point 2) — impacte le smoke 7.2 et l'onboarding PROTECT
6. Option maintenance (retrait domaine vs Password Protection) + procédure TXT `_vercel` si teams différents
7. Email exact admin PROTECT (assertion A3) + valeur `trial_ends_at` prod à recopier (assertion A6)
8. `CRON_SECRET` : valeur monorepo confirmée + secrets P4 tous posés (y compris les 3 vars engine `SCRAPER_BASE_URL`, `SCRAPER_TRIGGER_SECRET`, `R12_MONITORING_RECIPIENT`)
9. Périmètre Storage (buckets bibliothèque / documents cotraitant) : transposer ou pas, et comment
10. Arbitrage P4 bis : on accepte les 6 crons monorepo (perte de `tandem-followup`, `library-expiry-digest`, `dossier-zip-cleanup`) OU on patch `app/vercel.json` avant gel samedi 20h
11. Pré-requis smoke `SMOKE_TESTS_POSTBASCULE.md` : préparer dans 1Password les UUIDs `<UUID org AlyoS monorepo>` et `<UUID profil AlyoS sourcing.search_profiles>` (lecture BDD post-transposition, < 30s)
12. Présence physique de `docs/SMOKE_TESTS_POSTBASCULE.md` et `docs/ROLLBACK_BASCULE_140626.md` sur le poste de Steve (imprimer ou onglet dédié) — pas de lecture inter-session pendant l'incident

---

**Runbook v1 rédigé le 10/06/2026 (Camille, qa). À figer le 12/06 soir. GO/NO-GO samedi 13/06.**
**v1.1 amendé le 11/06/2026 (Alex, dev) — post-merge engine PR #6 :**
- P4 enrichie avec les vars engine (`SCRAPER_BASE_URL`, `SCRAPER_TRIGGER_SECRET`, `BOAMP_BASE_URL`, `R12_MONITORING_RECIPIENT`)
- alerte « SCRAPER_WEBHOOK_SECRET inexistant » (contrat symétrique avec SCRAPER_TRIGGER_SECRET)
- P4 bis : 3 crons manquants dans `app/vercel.json` (`tandem-followup`, `library-expiry-digest`, `dossier-zip-cleanup`)
- §7 smoke étendu de 12 → 17 tests (engine cron, auth cron, webhook, auth webhook, validation Zod), renvoi vers `docs/SMOKE_TESTS_POSTBASCULE.md`
- Annexe A pointeur vers `docs/ROLLBACK_BASCULE_140626.md` (rollbacks post-bascule R1/R2)
- Annexe C points 10-12 ajoutés (arbitrage crons + UUIDs smoke + documents physiquement sur le poste)

**Document à ne plus modifier après l'étape 4 de dimanche (rollback uniquement).**
