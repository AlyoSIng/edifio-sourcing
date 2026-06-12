# Pre-flight bascule monorepo — vendredi 12/06 (avant DNS cutover)

> **Auteur** : `ps_operator` (Yann) — `2026-06-12`
> **Mission** : check exhaustif AVANT la bascule DNS de `sourcing.edifio.fr` du
> projet Vercel `edifio-sourcing` (standalone Frankfurt) vers
> `alyos-suivi-chantier` (monorepo, BDD Supabase partagée).
> **Format** : checklist condensée à ouvrir sur un 2e écran pendant la bascule.
> **Runbook complet** : `docs/RUNBOOK_BASCULE_MONOREPO_140626.md` (v1.1 du 11/06).

---

## Verdict global

| # | Section | État | Bloquant ? |
|---|---|---|---|
| 1 | Vercel — projet monorepo prêt | ⚠ À confirmer par Steve (cf. §1) | Oui (P0) |
| 2 | Supabase — schéma + RLS prêts | ✅ Mergés monorepo (PR #1, SHA `720bf5c`) — vérif `__drizzle_migrations` côté prod par Steve | Oui (P0) |
| 3 | Scripts ops — prêts à l'usage | ✅ 4 scripts en place + audit F-01/F-03 appliqués | Oui (P0) |
| 4 | Scripts SQL transposition | ✅ 5 fichiers présents + dry-run banc OK | Oui (P0) |
| 5 | Liste des actions Steve | ✅ Checklist 7 étapes condensée infra | — |

**Aucun P0 cassé détecté côté repo `edifio-sourcing`.** 4 points à clore par
Steve dans les 30 prochaines minutes avant le `GO` opérationnel (cf. récap fin
de doc).

---

## 1. Vercel — projet monorepo prêt

### 1.1 Les 11 nouvelles vars sont-elles posées en target Production ?

Source de vérité des 11 vars : `docs/CHECKLIST_SECRETS_VENDREDI.md` bloc A
(5 vars à créer) + `docs/VARS_ENV_VERCEL_MONOREPO_DIFF.md` (les vars engine
A-D mergées 11/06).

**Vérification à lancer par Steve dans SA session** (les sub-agents n'ont
pas accès au compte Vercel) :

```powershell
cd C:\Dev\alyos-suivi-chantier\app
vercel env ls production
```

Comparer la sortie avec la matrice ci-dessous. La colonne « Bloc » renvoie à
`CHECKLIST_SECRETS_VENDREDI.md`.

| # | Var | Bloc | Source | Statut attendu |
|---|---|---|---|---|
| 1 | `SUPABASE_COOKIE_DOMAIN` | A1 | nouvellement créée | `.edifio.fr` en Prod |
| 2 | `DATABASE_URL` | A2 | nouvellement créée | URI pooler Frankfurt (1Password) |
| 3 | `NEXT_PUBLIC_APP_URL` | A3 | nouvellement créée | `https://sourcing.edifio.fr` en Prod |
| 4 | `SCRAPER_BASE_URL` | A4 | nouvellement créée | `https://edifio-playwright-worker.fly.dev` |
| 5 | `SCRAPER_TRIGGER_SECRET` | A5 | nouvellement créée | Bearer partagé Fly (1Password) |
| 6 | `CRON_SECRET` | B4 | déjà présente, vérifier valeur | identique prod Sourcing |
| 7 | `BREVO_SOURCING_API_KEY` | B1 | déjà présente, vérifier valeur | identique prod Sourcing |
| 8 | `RESEND_API_SOURCING_KEY` | B1 | déjà présente, vérifier valeur | identique prod Sourcing |
| 9 | `R12_MONITORING_RECIPIENT` | B4 | déjà présente, vérifier valeur | `sebastien@edifio.fr` (fallback hardcodé) |
| 10 | `ARCHITECT_JWT_PRIVATE_KEY` | B3 | déjà présente, vérifier valeur | PEM intégral multi-lignes |
| 11 | `ARCHITECT_JWT_PUBLIC_KEY` | B3 | déjà présente, vérifier valeur | PEM intégral multi-lignes |

**⚠ Garde-fous** :
- ❌ **AUCUN** `ODOO_*` posé (Bloc C reporté post-bascule, Q4 acté 12/06).
- ❌ **AUCUN** `SCRAPER_WEBHOOK_SECRET` posé (n'existe pas dans le code mergé,
  cf. A5 + audit Alex 11/06 dans runbook v1.1).
- ❌ **AUCUN** `COOKIE_DOMAIN` (sans préfixe `SUPABASE_`) posé.
- Total attendu Production : **≈ 29 vars** dont 5 « créées » + 24 « vérifiées »
  (cf. bloc D de `CHECKLIST_SECRETS_VENDREDI.md`).

**Action si var manquante** :

```powershell
cd C:\Dev\edifio-sourcing
# Steve crée .env.monorepo.production en local depuis 1Password (jamais commit).
.\scripts\migration\ops\01-vercel-env-loader.ps1 -DryRun  # plan
.\scripts\migration\ops\01-vercel-env-loader.ps1          # push réel
# Puis : Remove-Item .env.monorepo.production
```

### 1.2 Dernier deploy main « Ready » ?

Steve dans SA session :

```powershell
cd C:\Dev\alyos-suivi-chantier\app
vercel ls --scope teissiers-projects | Select-Object -First 5
# OU GitHub :
gh -R AlyoSIng/alyos-suivi-chantier run list --limit 3
```

État attendu :
- Dernier deploy `main` sur le projet `alyos-suivi-chantier` = **Ready**
- SHA du commit déployé = `55d2739` ou plus récent (HEAD `main` confirmé par
  `git log --oneline -1`).
- Statut « SUIVI fonctionne en production » confirmé par Steve (énoncé dans
  brief : « redeploy prod monorepo OK »).

**Bloquant si** : dernier deploy en état `Error` / `Building` / `Queued`
durable. → STOP bascule jusqu'à résolution.

### 1.3 Projet edifio-sourcing standalone toujours actif (rollback safety) ?

Le runbook `RUNBOOK_BASCULE_MONOREPO_140626.md` étape 1 prévoit de RETIRER le
domaine `sourcing.edifio.fr` du projet standalone pour le réattacher au
monorepo en étape 6. Le projet Vercel `edifio-sourcing` lui-même DOIT être
conservé intact (le filet de rollback R3/R4 dépend de sa capacité à
re-recevoir le domaine en cas d'incident).

Vérification :
- [ ] `https://vercel.com/teissiers-projects/edifio-sourcing/settings` accessible
- [ ] **Projet NON paused** (la pause Vercel viendra dans le script
  `04-cleanup-edifio-sourcing.ps1` J+2/J+3, pas avant)
- [ ] Cleanup `04-` JAMAIS lancé pendant la fenêtre de bascule

**Bloquant si** : projet standalone supprimé ou paused → STOP, plus de filet
rollback.

---

## 2. Supabase — schéma + RLS prêts

### 2.1 Migrations 0129-0131 mergées dans le monorepo ?

✅ **Confirmé** côté repo `alyos-suivi-chantier` :

| Migration | Fichier | Mergée via | Commit |
|---|---|---|---|
| 0129 sourcing schema | `app/db/migrations/0129_sourcing_schema.sql` | PR #1 | `720bf5c` |
| 0130 sourcing RLS | (idem PR #1) | PR #1 | `720bf5c` |
| 0131 sourcing seed platforms | (idem PR #1) | PR #1 | `720bf5c` |

Audits/fixes ultérieurs visibles dans l'historique :
- `761028f` fix(db): lot 2a corrections reviews — anti-elevation role, force 44, initplan, privé
- `9868aff` fix(db): rebase trigger anti-elevation sur 0091 (review flash hugo b1-bis)
- `36fa88c` fix(db): grant defensif current_user_org_id to authenticated (smoke s13 banc)
- `bbef9fe` docs(db): precise la cause du grant defensif

### 2.2 Application des migrations sur BDD Supabase prod (partagée)

**Pas trace côté repo `edifio-sourcing`** : la convention monorepo (Q8 visio
10/06) est que **Sébastien applique manuellement** chaque migration en prod
(gel migrations Sourcing depuis le 10/06). Le journal `__drizzle_migrations`
est la source de vérité opérationnelle.

**Vérification côté Steve via SQL Editor Supabase (BDD partagée monorepo)** :

```sql
-- Bloc à coller dans SQL Editor (mono-bloc, cf. memory env_docker_inaccessible_tools)
DO $$
DECLARE n int; v_sourcing int; v_helper int;
BEGIN
  -- 1. Migrations 0129-0131 présentes dans le journal drizzle
  SELECT count(*) INTO n FROM drizzle.__drizzle_migrations
   WHERE hash LIKE '%0129%' OR hash LIKE '%0130%' OR hash LIKE '%0131%';
  IF n < 3 THEN
    RAISE EXCEPTION 'KO: % migrations 0129-0131 trouvées dans __drizzle_migrations (attendu 3). Sébastien doit les appliquer AVANT bascule.', n;
  END IF;

  -- 2. Schéma sourcing existe et contient >= 22 tables (runbook §3 critère)
  SELECT count(*) INTO v_sourcing FROM information_schema.tables WHERE table_schema = 'sourcing';
  IF v_sourcing < 22 THEN
    RAISE EXCEPTION 'KO: schéma sourcing.* contient seulement % tables (attendu >= 22)', v_sourcing;
  END IF;

  -- 3. Helper current_user_has_sourcing présent (gating RLS)
  IF to_regprocedure('public.current_user_has_sourcing()') IS NULL THEN
    RAISE EXCEPTION 'KO: helper current_user_has_sourcing absent';
  END IF;
  v_helper := 1;

  RAISE NOTICE 'Schema sourcing OK: % tables, helper OK', v_sourcing;
END $$;
```

**Critère de PASS** : bloc DO se termine sur `NOTICE Schema sourcing OK`. Si
exception → l'application des migrations est à compléter par Sébastien
**avant** la bascule (sinon §3 du runbook deviendra l'opération d'application
côté Steve, dimanche matin, dans la fenêtre 8h30-8h45).

**État au moment de ce pre-flight** : non vérifié côté `ps_operator` (pas
d'accès BDD prod par sub-agent). Steve coche après exécution du bloc.

### 2.3 PostgREST — schéma sourcing exposé ?

```
Dashboard Supabase monorepo → Settings → API → Exposed schemas
→ doit contenir : public, sourcing
```

Si `sourcing` absent : ajouter, sauvegarder. Sans ça, les routes Next.js qui
font `supabase.schema('sourcing').from(...)` retourneront un 404.

---

## 3. Scripts ops — prêts à l'usage immédiat

Tous les scripts sont dans `scripts/migration/ops/` (5 fichiers : 4 ps1 + 1
README).

### 3.1 `01-vercel-env-loader.ps1` — déjà utilisé ce soir ✅

- État : utilisé pour poser les 5 vars Bloc A (cf. mission brief). Aucune
  action restante de ce côté.
- ⚠ Vérifier que `.env.monorepo.production` a bien été **supprimé du disque**
  après push (couvert par `.gitignore` mais hygiène sécurité — cf. memory
  `feedback_ops_prod_user_runs_migration`).

### 3.2 `02-smoke-prod-monorepo.ps1` — prêt pour le smoke post-cutover

- État : ✅ présent (12 874 octets).
- Audit Camille F-01 appliqué dans `ba7cc5b` (commit `docs(bascule): fix
  audit camille 7 findings`).
- **Vérification F-01 (mini-smoke vs smoke complet)** : bandeau d'avertissement
  présent en tête du script (lignes 8-39) : *« MINI-SMOKE COMPLEMENTAIRE - PAS
  DE COUVERTURE COMPLETE »* + renvoi explicite vers
  `docs/SMOKE_TESTS_POSTBASCULE.md` pour les 17 tests fonctionnels. ✅
- Couverture des 4 tests : T1 `GET /`, T2 `GET /login`, T3 DNS (CNAME
  Vercel), T4 cron `POST /api/cron/sourcing-run` avec Bearer `CRON_SECRET`.
- Codes retour 0/1/2 : OK / FAIL / WARN (script utilisable en chaînage).

**Pré-requis avant lancement dimanche 14/06 ~9h45** :
- [ ] `$env:CRON_SECRET` posé dans la session Steve depuis 1Password (sinon
  T4 saute en WARN, code retour 2).
- [ ] `Set-Location C:\Dev\edifio-sourcing` (le script est lancé depuis le
  repo Sourcing — pas une faute, c'est sa maison historique).

### 3.3 `03-rollback-dns.ps1` — version « Vercel only » (F-03) à jour ✅

- État : ✅ présent (15 503 octets).
- Audit Camille F-03 appliqué : posture **« Vercel only »** documentée en
  tête (lignes 6-42), v2 du 2026-06-12, basculement du pas-à-pas OVH vers
  pas-à-pas dashboard Vercel (ETAPE 2 retrait monorepo + ETAPE 3 réattache
  edifio-sourcing).
- Pas-à-pas OVH historique conservé en bas du fichier (section commentée
  « OPTION J+1 ») — fallback extrême, OK Board obligatoire.
- Garde-fous : `-Confirm` ou `$env:CONFIRM_ROLLBACK_DNS = "REVERT-SOURCING-EDIFIO"`
  obligatoire pour afficher le pas-à-pas. Sans : mode lecture seule (snapshot
  uniquement dans `backups/dns-rollback/`).
- Détection rollback tardif (> 24h après le 14/06 08:00) avec renvoi vers
  `ROLLBACK_BASCULE_140626.md` R2.

### 3.4 `scripts/migration/transpose/*.sql` — 5 fichiers présents ✅

```
01-export-source.ps1            10 461 octets — Steve   — pg_dump source
02-transform.ps1                 7 524 octets — Steve   — rewrite public.* → sourcing.*
03-identity-and-billing.sql     17 164 octets — psql    — orgs + auth + profiles + billing
04-load-data.ps1                 8 888 octets — Steve   — orchestration psql 1-tx
05-assertions.sql               13 843 octets — psql    — 12 assertions Camille + smoke RLS
sourcing-tables.txt              1 184 octets — refs    — liste canonique 49 tables
README.md                        9 747 octets — doc     — séquence complète
```

**Syntaxe / compilation** :
- Les 3 PowerShell ouvrent proprement (en-têtes valides, params + asserts ENV).
- Les 2 SQL sont mono-bloc-compatibles (`03-` avec `\copy` réservé à psql
  comme indiqué en tête, `05-` collable dans SQL Editor Supabase).
- Dry-run banc local jeudi 11/06 confirmé par Alex (cf. note suivi
  `CC_260611_RECETTE_DRYRUN_J2.md` non lu ici mais existant).

**Aucun fix ouvert sur les scripts transpose au 12/06 19h.**

---

## 4. Scripts SQL transposition — ordre exact des commandes Steve

Source : runbook §2 (export source), §4 (transposition), §5 (assertions).
La séquence ci-dessous est **canon** — divergence détectée vs runbook §2 :
le script `01-export-source.ps1` REMPLACE les commandes `2b` (dump
data-only `-Fc`) et `2c` (counts-source.sql) du runbook v1 par un seul
script ps1 qui produit le dump PLAIN + les 4 CSV identity + counts.

### Pré-conditions dans la session Steve

```powershell
cd C:\Dev\edifio-sourcing
New-Item -ItemType Directory -Force backups, logs | Out-Null
```

### Étape 2 du runbook (8h10-8h30) — Export SOURCE (Sourcing prod, lecture seule)

```powershell
# ENV = Sourcing prod, Session Pooler eu-west-1
$env:PGHOST     = "aws-0-eu-west-1.pooler.supabase.com"
$env:PGPORT     = "5432"
$env:PGUSER     = "postgres.loogmtltwkhvczdiurqs"
$env:PGDATABASE = "postgres"
$env:PGPASSWORD = "<sourcing prod — 1Password>"
```

| # | Commande | Durée attendue | Critère de succès |
|---|---|---|---|
| 1 | `.\scripts\migration\backup-sourcing-db.ps1 -UseDocker` | 5-10 min | `backups\sourcing-prod-2026-06-14-*.dump` > 5 MB. **STOP si KO** (pas de rollback possible sans backup). |
| 2 | `.\scripts\migration\transpose\01-export-source.ps1 -UseDocker` | 3-5 min | 6 fichiers produits dans `backups\` : `sourcing-data.sql`, `identity-organizations.csv`, `identity-users.csv`, `identity-memberships.csv`, `identity-auth-users.csv`, `counts-source.csv`. |
| 3 | `.\scripts\migration\transpose\02-transform.ps1` | < 1 min | `backups\sourcing-data.transformed.sql` produit. Le script abort si une table inattendue est rencontrée. |

### Étape 3 du runbook (8h30-8h45) — Migrations 0129-0131 sur monorepo

Si **2.2 a échoué côté pre-flight** (les migrations ne sont PAS encore en
prod monorepo), Sébastien les applique ici. Sinon : étape skipée, on passe
directement à 4.

```bash
# Sébastien — sur ramenant les fichiers du repo monorepo
psql "host=aws-0-eu-west-3.pooler.supabase.com port=5432 user=postgres.<MONOREPO-REF> dbname=postgres" \
  --set=ON_ERROR_STOP=1 \
  -f app/db/migrations/0129_sourcing_schema.sql \
  -f app/db/migrations/0130_sourcing_rls.sql \
  -f app/db/migrations/0131_sourcing_seed_platforms.sql
```

| # | Commande | Durée attendue | Critère de succès |
|---|---|---|---|
| 4 | (Sébastien) `psql ... -f 0129 -f 0130 -f 0131` | 1-2 min | Bloc DO vérif §2.2 ci-dessus → `NOTICE Schema sourcing OK: <n> tables`. Exposed schemas PostgREST inclut `sourcing`. |

### Étape 4 du runbook (8h45-9h20) — Transposition (monorepo, écriture) 🔴 CRITIQUE

```powershell
# Switch ENV vers MONOREPO prod, Session Pooler eu-west-3
$env:PGHOST     = "aws-0-eu-west-3.pooler.supabase.com"
$env:PGPORT     = "5432"
$env:PGUSER     = "postgres.<MONOREPO-REF>"   # ⏳ ref monorepo
$env:PGDATABASE = "postgres"
$env:PGPASSWORD = "<monorepo prod — 1Password>"
```

| # | Commande | Durée attendue | Critère de succès |
|---|---|---|---|
| 5 | `.\scripts\migration\transpose\04-load-data.ps1 -UseDocker` (puis taper `PROD-CONFIRMER`) | 10-15 min | psql termine par `COMMIT`. La transaction est UNIQUE → un échec = ROLLBACK automatique. Logs dans `logs\bascule-4-*.log`. **Si KO** : runbook Annexe A cas R2. |

⚠ **C2 collision email auth.users** : le script ABORT avec
`GARDE KO: COLLISION EMAIL ...` si un email du dump existe déjà côté
monorepo. Résolution manuelle obligatoire (cf. `transpose/README.md` §
« Conflits identité »).

### Étape 5 du runbook (9h20-9h35) — Assertions post-import (lecture)

```powershell
# Même ENV que étape 4 (monorepo prod)
docker run --rm -v ${PWD}\scripts\migration\transpose:/s -e PGPASSWORD=$env:PGPASSWORD postgres:17 psql `
  -h $env:PGHOST -p 5432 -U $env:PGUSER -d postgres --set=ON_ERROR_STOP=1 `
  -f /s/05-assertions.sql `
  *>&1 | Out-File logs\bascule-5-assertions.log
```

| # | Commande | Durée attendue | Critère de succès |
|---|---|---|---|
| 6 | `psql -f 05-assertions.sql` (Docker) **OU** copier-coller bloc DO dans SQL Editor Supabase | 30-60 s | Dernière ligne = `ASSERTIONS POST-IMPORT OK`. Toute exception `Axx KO: ...` → runbook Annexe A cas R2. |

⚠ **A1 (counts par table)** : référence = table technique
`sourcing.migration_source_counts` remplie par l'étape 5. Si étape 5 n'a pas
tourné OU si la table a été drop manuellement, A1 échoue. Nettoyage final
optionnel (après PASS) :

```sql
DROP TABLE IF EXISTS sourcing.migration_source_counts;
```

### Étape 6 (9h35-9h45) — Bascule domaine Vercel (cf. §5 ci-dessous)

Pas de commande SQL — manipulation dashboard Vercel. Voir §5 actions Steve.

### Étape 7 (9h45-10h15) — Smoke

```powershell
# Steve, session PowerShell
cd C:\Dev\edifio-sourcing
$env:CRON_SECRET = "<prod monorepo — 1Password>"
.\scripts\migration\ops\02-smoke-prod-monorepo.ps1
```

| # | Commande | Durée attendue | Critère de succès |
|---|---|---|---|
| 7 | `.\scripts\migration\ops\02-smoke-prod-monorepo.ps1` | < 30 s | Code retour 0 (4 OK) ou 2 (warnings inspecter). Code 1 = FAIL → rollback. |
| 8 | Smoke manuel sections 2-10 de `docs/SMOKE_TESTS_POSTBASCULE.md` | 30-45 min | Bilan 17/17 du runbook §7. **C'est le GO global**, pas le script seul. |

---

## 5. Actions Steve — checklist condensée

À dérouler dans l'ordre. Chaque case = un go/no-go.

### Préparation (vendredi soir)

- [ ] **A. Annoncer début bascule** — mail interne AlyoS + Slack
  `#tech-bascule-monorepo` : « Bascule lancée 8h00 dim 14/06, fenêtre
  jusqu'à 11h00. Toute interruption Sourcing/Suivi/ACT signalée ici. »
  Template dans `docs/COMM_INTERNE_BASCULE_140626.md`.
- [ ] **B. Gel push** sur `main` `edifio-sourcing` ET `main` `alyos-suivi-chantier`
  pendant toute la fenêtre 8h00-11h00 (annonce Slack). Reprise après PASS smoke.

### Bascule (dimanche 14/06 8h00 → 11h00)

- [ ] **C. Lancer la transposition** dans l'ordre canonique §4 ci-dessus
  (commandes 1 → 6). NE PAS sauter d'étape — la 6 (assertions) dépend de la
  5 (`load-counts.gen.sql`) qui dépend de la 4 (export).
- [ ] **D. DNS cutover** `sourcing.edifio.fr` → Vercel monorepo. Posture
  **« Vercel only »** (rien à toucher chez OVH). Clics exacts dashboard :
   1. `https://vercel.com/teissiers-projects/edifio-sourcing/settings/domains`
      → ligne `sourcing.edifio.fr` → **Edit** → **Remove** → confirmer.
   2. `https://vercel.com/teissiers-projects/alyos-suivi-chantier/settings/domains`
      → champ « Add a Domain » → taper `sourcing.edifio.fr` → **Add**.
   3. Attendre badge **Valid Configuration** (< 2 min puisque CNAME OVH
      pointe déjà sur `cname.vercel-dns.com`).
- [ ] **E. Smoke tests** :
   1. `02-smoke-prod-monorepo.ps1` (filet technique 4 tests, < 30 s).
   2. Smoke manuel sections 2-10 de `SMOKE_TESTS_POSTBASCULE.md` (~45 min,
      17 tests fonctionnels). C'est ce bilan 17/17 qui prononce le GO global.
- [ ] **F. Comm finale** :
   - Si 17/17 verts → mail PROTECT (template `ONBOARDING_PROTECT_ADMIN.md`,
     **vérifier l'URL = `sourcing.edifio.fr`** et la date 14/06) + mail
     équipe AlyoS « bascule réussie, RAS, post-mortem semaine du 16/06 ».
   - Si 1+ KO sécurité (7.5 / 7.6 / 7.8 / 7.14 / 7.16) → bascule en cas G
     (rollback). NE PAS notifier PROTECT.

### Plan B — rollback (uniquement si E.2 < 17/17 sur axe sécurité)

- [ ] **G. Rollback DNS** :
   ```powershell
   cd C:\Dev\edifio-sourcing
   .\scripts\migration\ops\03-rollback-dns.ps1            # snapshot lecture seule
   .\scripts\migration\ops\03-rollback-dns.ps1 -Confirm   # affiche pas-à-pas Vercel
   ```
   Steve exécute les clics dans le dashboard Vercel (retrait monorepo +
   réattache edifio-sourcing). Posture Vercel only, OVH non touché.

   Compléments si écritures monorepo déjà significatives : runbook
   `docs/ROLLBACK_BASCULE_140626.md` R1 (à chaud) ou R2 (rejeu).

- [ ] **H. Mail rollback** équipe AlyoS + PROTECT si déjà notifié : « bascule
  annulée à <HH:MM>, prod Sourcing servie depuis projet standalone,
  post-mortem semaine du 16/06, nouvelle tentative à arbitrer. »

---

## Points encore ouverts (⏳ à clore par Steve avant 8h dim)

Issus de l'Annexe C du runbook + lecture de ce pre-flight :

1. `<MONOREPO-REF>` Supabase Paris (utilisé dans toutes les commandes psql
   monorepo) → 1Password / vérifier au début de session dim 8h00.
2. Nom de l'app Fly.io scraper (`<FLY-APP-SOURCING>`) → confirmé probable
   `edifio-playwright-worker` (cf. `SCRAPER_BASE_URL` A4 checklist), à
   vérifier par `fly apps list`.
3. Valeur stricte `trial_until` PROTECT pour l'assertion A6 (param
   `protect_trial_until_expected` du 05-assertions.sql) — relever samedi
   matin via `SELECT trial_ends_at FROM organizations WHERE id =
   '08e73ef3-6458-4564-aab2-5a9aeaa9daed'` sur la prod Sourcing.
4. Steve / Assistante / Sébastien ont-ils déjà un compte auth côté
   monorepo ? Si oui → cas C2 collision email à arbitrer AVANT lancement de
   `04-load-data.ps1` (sinon ABORT mid-bascule = perte de 15-30 min).

---

## Rappels sécurité (memory)

- **Steve lance la commande**, jamais un sub-agent (cf. memory
  `feedback_ops_prod_user_runs_migration`). Sub-agents prennent le relais
  sur smoke + trace + commit post-action.
- **Password URI-safe-only** dans `DATABASE_URL` (cf. memory
  `followup_post_mvp_security_rotations` — incident 2026-05-21).
- **Docker inaccessible depuis outils Claude Code** (cf. memory
  `env_docker_inaccessible_tools`). SQL Editor Supabase pour la vérification
  §2.2 = mono-bloc `DO $$ ... $$` obligatoire.
- **DNS : clics exacts** (cf. memory `feedback_dns_consignes`). Le pas-à-pas
  Vercel de §5.D respecte ce format.

---

**Fin pre-flight. GO opérationnel = §1.1/1.2 confirmés + §2.2 PASS.**

Yann reste joignable sur le canal `#tech-bascule-monorepo` pour ouvrir une PR
de correctif urgent (lecture seule de ce doc, jamais de modification post-GO).
