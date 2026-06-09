# Plan de bascule prod — 10 juin 2026

> Application des migrations 0050 (Salve U) + 0051 (RLS 3 tables) + 0052
> (FORCE + helper + naming) + 0053 (éradication bombe cotraitant + 4 functions
> SECURITY DEFINER) sur preview Vercel puis prod.
>
> **Note** : ce n'est PAS encore la bascule vers le monorepo (18 juillet) — c'est
> l'application des migrations BDD + activation des features Salve U + R12
> monitoring sur la prod actuelle (`edifio-sourcing` standalone).

## TL;DR — Procédure en 9 étapes (~2 h)

| # | Étape | Durée | Bloquant si KO ? |
|---|---|---|---|
| 1 | Pré-flight checks | 5 min | Oui — STOP |
| 2 | Backup pg_dump prod | 10 min | Oui — STOP |
| 3 | Application 0050-0053 en preview | 10 min | Oui — STOP (fix avant prod) |
| 4 | Smoke preview (E2E + manuel) | 30 min | Oui — STOP |
| 5 | Backup pg_dump prod (re-confirmation) | 5 min | Oui — STOP |
| 6 | Application 0050-0053 en prod | 10 min | **CRITIQUE** — rollback si KO |
| 7 | Smoke prod | 15 min | Yes — rollback si KO |
| 8 | Activation cron monitoring R12 | 5 min | Non — peut attendre |
| 9 | Communication équipe AlyoS | 10 min | Non |

## Sommaire

- [1. Pré-flight checks](#1-pré-flight-checks-5-min)
- [2. Backup pg_dump prod](#2-backup-pg_dump-prod-10-min)
- [3. Application 0050-0053 en preview](#3-application-0050-0053-en-preview-10-min)
- [4. Smoke preview](#4-smoke-preview-30-min)
- [5. Backup pg_dump prod re-confirmation](#5-backup-pg_dump-prod-re-confirmation-5-min)
- [6. Application 0050-0053 en prod](#6-application-0050-0053-en-prod-10-min--critique)
- [7. Smoke prod](#7-smoke-prod-15-min)
- [8. Activation cron monitoring R12](#8-activation-cron-monitoring-r12-5-min)
- [9. Communication équipe AlyoS](#9-communication-équipe-alyos-10-min)
- [Annexe A — Rollback si KO en prod](#annexe-a--rollback-si-ko-en-prod)
- [Annexe B — Tableau de bord post-deploy](#annexe-b--tableau-de-bord-post-deploy)

---

## 1. Pré-flight checks (5 min)

### Vérifier que tout est mergé sur main

```powershell
cd C:\Dev\edifio-sourcing
git fetch origin main
git log origin/main --oneline -10
```

Doit contenir au minimum :
- `docs(rollback): plan rollback migrations 0050-0053`
- `test(e2e): playwright p1 multi-org protect`
- `feat(db): eradique cotraitant_shares bombe a retardement (Lot 1.7-ter)`
- `chore(husky): pre-commit léger + pre-push strict`

### Vérifier que les 4 migrations existent

```powershell
ls src/db/migrations/0050_*.sql, src/db/migrations/0051_*.sql, src/db/migrations/0052_*.sql, src/db/migrations/0053_*.sql
```

Doit afficher 4 fichiers.

### Vérifier que les tests sont verts en local

```powershell
$env:NODE_OPTIONS = "--max-old-space-size=8192"
.\node_modules\.bin\tsc --noEmit -p tsconfig.json
node .\node_modules\vitest\vitest.mjs run
```

Doit afficher : 0 erreur + 1268/1268 verts.

### Vérifier les ENV var (sur preview d'abord)

```powershell
# À poser dans TA session (pas dans un .env committé)
$env:PGHOST = "db.<preview-project-ref>.supabase.co"
$env:PGPORT = "5432"
$env:PGUSER = "postgres"
$env:PGDATABASE = "postgres"
$env:PGPASSWORD = "<password preview depuis Supabase Studio>"
```

⚠️ Direct connection (port **5432**), PAS le pooler (port 6543 — refuse pg_dump et migrations DDL massives).

---

## 2. Backup pg_dump prod (10 min)

**Avant toute opération**, dump la BDD prod actuelle.

```powershell
# Pose les ENV PROD (note : différent de preview ci-dessus)
$env:PGHOST = "db.<prod-project-ref>.supabase.co"
$env:PGPORT = "5432"
$env:PGUSER = "postgres"
$env:PGDATABASE = "postgres"
$env:PGPASSWORD = "<password prod depuis 1Password>"

# Lance le backup (script Yann)
.\scripts\migration\backup-sourcing-db.ps1
```

Sortie attendue : `backups/sourcing-prod-2026-06-10-08h30.sql.gz`

⚠️ **NE JAMAIS** continuer si le backup échoue. Sans backup, pas de rollback.

### Vérifier le backup

```powershell
ls backups/sourcing-prod-*.sql.gz | Sort-Object LastWriteTime -Descending | Select-Object -First 1
# Doit afficher un fichier > 5 MB (BDD non vide)
```

### Optionnel : copier le backup dans 1Password / OneDrive

Pour redondance, copie le dump dans un emplacement sûr (1Password attachment ou OneDrive sécurisé).

---

## 3. Application 0050-0053 en preview (10 min)

**Préalable : repose les ENV PREVIEW** (pas PROD).

### Option A — Script automatisé Yann (si livré)

```powershell
.\scripts\migration\apply-migrations-0050-0053.ps1 -Environment preview -UseDocker
```

### Option B — Manuel via psql (fallback)

```powershell
# Dry-run Docker postgres:15 pour valider la syntaxe
docker run --rm -v ${PWD}\src\db\migrations:/m postgres:15 sh -c "
  psql -h `$PGHOST -U `$PGUSER -d `$PGDATABASE -p `$PGPORT \
    --set=ON_ERROR_STOP=1 \
    -f /m/0050_learning_payload.sql \
    -f /m/0051_rls_fix_companies_cotraitant_shares_be.sql \
    -f /m/0052_rls_lot17_bis_force_helper_naming.sql \
    -f /m/0053_eradicate_cotraitant_public_policy.sql
"
```

⚠️ Si erreur → STOP. Lire le message, corriger côté migration SQL si nécessaire,
re-tester en local Docker.

### Vérifier post-application preview

```sql
-- Connexion Supabase Studio preview → SQL Editor
SELECT relname, relforcerowsecurity
FROM pg_class
WHERE relname IN ('companies', 'bureaux_etudes', 'cotraitant_shares', 'cotraitant_share_items');
-- Tous doivent avoir relforcerowsecurity = true

-- Vérifier que les 4 functions SECURITY DEFINER existent
\df public.current_user_org_id
\df public.get_cotraitant_share_by_token
\df public.get_cotraitant_share_items_by_token
\df public.mark_cotraitant_share_item_signed

-- Vérifier journal Drizzle (doit contenir 4 nouveaux hashes)
SELECT * FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 5;
```

---

## 4. Smoke preview (30 min)

### 4.1. Smoke manuel preview (10 min)

Connecte-toi à `https://edifio-sourcing-preview-<hash>.vercel.app` avec un user
de test (AlyoS admin) :

- [ ] `/sourcing/ao-du-jour` s'affiche
- [ ] Cliquer sur un AO → page détail s'affiche
- [ ] Sélectionner un AO → succès
- [ ] **Écarter un AO avec motif structuré (Salve U)** → succès + le motif est
      enregistré (vérif SQL `SELECT * FROM learning_events ORDER BY occurred_at DESC LIMIT 1`)
- [ ] **Exclure un AO** → succès + ZERO row dans `learning_events` pour cet AO
- [ ] Créer un architecte / BE / entreprise → succès
- [ ] **Flow cotraitant** : créer un share, ouvrir le lien `/cotraitant/<token>` dans
      un navigateur sans cookies → la page doit s'afficher (function SECURITY DEFINER active)

### 4.2. Smoke API preview (5 min)

```powershell
# Test du smoke endpoint sourcing-run (admin)
$Token = "<JWT admin connecté>"
curl -H "Authorization: Bearer $Token" `
  https://edifio-sourcing-preview-<hash>.vercel.app/api/admin/crons/smoke-sourcing-run

# Réponse attendue : { ok: true, verdict: "OK", tendersInserted: N }
```

### 4.3. E2E Playwright preview (15 min)

Si les secrets CI E2E sont configurés (cf. doc Camille) :

```powershell
# Local
$env:PLAYWRIGHT_BASE_URL = "https://edifio-sourcing-preview-<hash>.vercel.app"
$env:E2E_TEST_ROUTES_ENABLED = "1"
$env:PREVIEW_SUPABASE_URL = "<url preview>"
$env:PREVIEW_SUPABASE_ANON_KEY = "<anon key preview>"
$env:PREVIEW_SUPABASE_SERVICE_ROLE_KEY = "<service role preview>"

node .\node_modules\@playwright\test\cli.js test e2e/multi-org --grep "@p0"
```

Doit passer 9/9 specs P0 (S1-S6 + S8 + S10 + S11).

**Si E2E rouge** → analyser le rapport HTML (`playwright-report/`), fix, re-run.
**Si E2E vert** → continuer en prod.

---

## 5. Backup pg_dump prod re-confirmation (5 min)

Re-confirme que le backup étape 2 existe et est accessible. Lance un nouveau
dump si tu as déjà attendu > 30 min depuis l'étape 2 :

```powershell
$env:PGHOST = "db.<prod-project-ref>.supabase.co"
# ... (autres ENV)
.\scripts\migration\backup-sourcing-db.ps1
```

---

## 6. Application 0050-0053 en prod (10 min — CRITIQUE)

### Option A — Script Yann avec confirmation prod

```powershell
.\scripts\migration\apply-migrations-0050-0053.ps1 -Environment prod -UseDocker
# Demande "PROD-CONFIRMER" pour confirmer
```

### Option B — Manuel via psql

⚠️ **Re-pose les ENV PROD** (vérifier `$env:PGHOST` contient bien `prod`).

```powershell
docker run --rm -v ${PWD}\src\db\migrations:/m postgres:15 sh -c "
  psql -h `$PGHOST -U `$PGUSER -d `$PGDATABASE -p `$PGPORT \
    --set=ON_ERROR_STOP=1 \
    -f /m/0050_learning_payload.sql \
    -f /m/0051_rls_fix_companies_cotraitant_shares_be.sql \
    -f /m/0052_rls_lot17_bis_force_helper_naming.sql \
    -f /m/0053_eradicate_cotraitant_public_policy.sql
"
```

### 🔴 Si une migration prod échoue

1. **STOP** immédiat
2. Ouvrir `docs/ROLLBACK_PLAN_MIGRATIONS_0050_0053.md`
3. Identifier quelle migration a échoué (regarder les logs psql)
4. Appliquer le rollback SQL inverse de cette migration uniquement
5. Vérifier l'état BDD
6. Reporter post-mortem dans `DECISIONS.md`

---

## 7. Smoke prod (15 min)

### 7.1. Smoke SQL prod (5 min)

Identique au 4.1 mais sur la BDD prod via Supabase Studio.

### 7.2. Smoke applicatif prod (10 min)

Va sur `https://sourcing.edifio.fr` (prod) avec un user AlyoS admin :

- [ ] Login OK
- [ ] `/sourcing/ao-du-jour` s'affiche
- [ ] Tous les boutons fonctionnent
- [ ] Aucune erreur dans la console navigateur
- [ ] Aucune 500 dans Vercel logs (`vercel logs --prod`)

### 7.3. Si tout est vert → tu es **OFFICIELLEMENT EN PROD**

---

## 8. Activation cron monitoring R12 (5 min)

Le cron de monitoring `/api/cron/sourcing-monitoring` est défini dans
`vercel.json` (PR #128). Vérifier qu'il est bien actif :

1. Dashboard Vercel → projet `edifio-sourcing` → **Crons** tab
2. Le cron `sourcing-monitoring` doit apparaître avec schedule `0 5 * * 1-5` (5h00 UTC = 7h00 Paris été)
3. Vérifier que la variable `R12_MONITORING_RECIPIENT` est posée (sinon défaut `sebastien@edifio.fr`)

### Test manuel du cron monitoring

```powershell
# Trigger manuel (avec secret CRON_SECRET)
curl -H "Authorization: Bearer $env:CRON_SECRET" `
  https://sourcing.edifio.fr/api/cron/sourcing-monitoring
# Réponse attendue : { ok: true, alertSent: false } (car le cron sourcing-run est OK)
```

---

## 9. Communication équipe AlyoS (10 min)

### Mail à l'équipe interne

```
Sujet : edifio Sourcing — mise à jour appliquée en prod (Salve U + sécurité)

Bonjour,

La nouvelle version d'edifio Sourcing est en prod depuis aujourd'hui.

Nouveautés :
- Apprentissage par écartement (« Écarter avec motif » suggère des
  ajustements du profil de recherche)
- Sécurité renforcée (RLS Postgres + corrections multi-tenant)
- Monitoring du cron sourcing-run (alerte mail si KO le lundi matin)

Tu peux continuer à utiliser l'app normalement.

Steve
```

### Slack / Discord équipe technique

```
✅ Migrations 0050-0053 appliquées en prod le 10 juin 2026 à <heure>.
Backup pre-deploy : backups/sourcing-prod-2026-06-10-<heure>.sql.gz
Sub-agent invocations préparatrices : 38
PR mergées dans la session : 20

Prochaines étapes :
- POC chromium-min (deadline 25 juin)
- Cleanup repo (Yann demain)
- Kickoff portage monorepo (Sébastien 1er juillet)
- Bascule monorepo (samedi 18 juillet)
```

---

## Annexe A — Rollback si KO en prod

Voir `docs/ROLLBACK_PLAN_MIGRATIONS_0050_0053.md` (Alex, testé Docker).

Procédure rapide selon scénario :
- **Migration 0050 KO** : `DROP COLUMN payload, reason_code, applied_at, dismissed_at FROM learning_events`
- **Migration 0051 KO** : `DISABLE ROW LEVEL SECURITY` sur les 4 tables + `DROP POLICY` toutes les nouvelles
- **Migration 0052 KO** : `NO FORCE ROW LEVEL SECURITY` + rename policies en arrière + `DROP FUNCTION public.current_user_org_id()`
- **Migration 0053 KO** : `DROP FUNCTION` 4 fonctions + re-créer policies anon publiques (⚠️ réintroduit la bombe)
- **Plan B** : restore pg_dump backup étape 2 (option nucléaire)

## Annexe B — Tableau de bord post-deploy

| Métrique | Avant | Après |
|---|---|---|
| Migrations Drizzle appliquées | 49 (0001-0049) | **53** (0001-0053) ⬆️ +4 |
| Tables avec RLS FORCE | 0 | **4** (companies, bureaux_etudes, cotraitant_shares, cotraitant_share_items) |
| Functions SECURITY DEFINER | 0 | **5** (current_user_org_id + 4 cotraitant) |
| Vulnérabilités prod | 5 | **0** ✨ |
| Lignes test E2E Playwright | 0 | **3 131** (14 specs + 6 helpers) |
| Cron monitoring | Non | **Actif** (7h00 lundi-vendredi) |

---

**Plan rédigé le 9 juin 2026, ~04h00. Application prévue le 10 juin 2026.**
**Document à jour, ne pas modifier après l'étape 6 (rollback uniquement).**
