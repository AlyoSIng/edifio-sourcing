# Runbook — Application des migrations 0050 à 0053 (preview puis prod)

> **Public** : Steve, qui lance les commandes depuis SA session PowerShell.
> **Auteur** : Yann (`ps_operator`) — 2026-06-09.
> **Branche source** : `ops/migration-apply-script-0050-0053` (base `main` @ `044f68a`).
> **Script** : [`scripts/migration/apply-migrations-0050-0053.ps1`](../scripts/migration/apply-migrations-0050-0053.ps1)
> **Plan de rollback** : [`docs/ROLLBACK_PLAN_MIGRATIONS_0050_0053.md`](./ROLLBACK_PLAN_MIGRATIONS_0050_0053.md)

---

## Sommaire

1. [Pré-requis avant de lancer quoi que ce soit](#1-pré-requis-avant-de-lancer-quoi-que-ce-soit)
2. [Poser les 5 variables d'environnement PG\*](#2-poser-les-5-variables-denvironnement-pg)
3. [Étape 1 — Appliquer en preview](#3-étape-1--appliquer-en-preview)
4. [Étape 2 — Smoke preview](#4-étape-2--smoke-preview)
5. [Étape 3 — Backup prod AVANT apply](#5-étape-3--backup-prod-avant-apply)
6. [Étape 4 — Appliquer en prod](#6-étape-4--appliquer-en-prod)
7. [Étape 5 — Smoke prod](#7-étape-5--smoke-prod)
8. [Que faire si dry-run échoue (avant prod)](#8-que-faire-si-dry-run-échoue-avant-prod)
9. [Que faire si apply prod échoue](#9-que-faire-si-apply-prod-échoue)
10. [Timing attendu](#10-timing-attendu)
11. [Récapitulatif des commandes (cheat-sheet)](#11-récapitulatif-des-commandes-cheat-sheet)

---

## 1. Pré-requis avant de lancer quoi que ce soit

- [ ] PR `ops/migration-apply-script-0050-0053` mergée dans `main`.
- [ ] Pull `git checkout main && git pull origin main` à jour.
- [ ] Docker Desktop démarré (le script s'en sert pour le dry-run, et pour
      `psql` si tu n'as pas le binaire dans le PATH).
- [ ] 1Password ouvert, les 2 entrées suivantes accessibles :
  - `Supabase Sourcing PREVIEW — Direct connection (5432)`
  - `Supabase Sourcing PROD — Direct connection (5432)`
- [ ] Slack `#alyos-ing-tech` ouvert pour les annonces début/fin.
- [ ] Au moins **15 minutes devant toi** sans interruption (preview + prod).
- [ ] Lu rapidement [`docs/ROLLBACK_PLAN_MIGRATIONS_0050_0053.md`](./ROLLBACK_PLAN_MIGRATIONS_0050_0053.md)
      sections 1, 7 et 8 (palier 1 / arbre de décision / plan B).

---

## 2. Poser les 5 variables d'environnement PG\*

> **Règle d'or** : tu poses les vars dans **TA** session PowerShell. Tu ne les
> partages **jamais** dans le chat. Si un sub-agent te demande la valeur, tu
> refuses (cf. MEMORY > `feedback_ops_prod_user_runs_migration.md`).

### 2.a Avec 1Password CLI (recommandé)

Si `op` (1Password CLI) est installé et que tu es signé :

```powershell
# PREVIEW
$env:PGHOST     = "db.<preview-project-ref>.supabase.co"
$env:PGPORT     = "5432"
$env:PGUSER     = "postgres"
$env:PGDATABASE = "postgres"
$env:PGPASSWORD = op read "op://AlyoS/Supabase Sourcing PREVIEW Direct/password"
```

```powershell
# PROD (à faire APRÈS preview OK, dans la MÊME session ou une nouvelle)
$env:PGHOST     = "db.<prod-project-ref>.supabase.co"
$env:PGPORT     = "5432"
$env:PGUSER     = "postgres"
$env:PGDATABASE = "postgres"
$env:PGPASSWORD = op read "op://AlyoS/Supabase Sourcing PROD Direct/password"
```

### 2.b Sans 1Password CLI (copier-coller manuel depuis 1Password Desktop)

```powershell
$env:PGHOST     = "db.<project-ref>.supabase.co"
$env:PGPORT     = "5432"
$env:PGUSER     = "postgres"
$env:PGDATABASE = "postgres"
# Copier le password depuis 1Password Desktop, le coller ICI uniquement :
$env:PGPASSWORD = "<paste-here-then-clear-clipboard>"
```

Après avoir collé : `Set-Clipboard -Value ""` pour vider le presse-papier.

### 2.c Vérifier les vars sans afficher le password

```powershell
@("PGHOST", "PGPORT", "PGUSER", "PGDATABASE") | ForEach-Object {
    "{0,-12} = {1}" -f $_, (Get-Item "Env:$_").Value
}
"PGPASSWORD   = $(if ($env:PGPASSWORD) { '[set, longueur=' + $env:PGPASSWORD.Length + ']' } else { '[NOT SET]' })"
```

### 2.d Pièges à éviter

| Symptôme | Cause | Fix |
|---|---|---|
| `tenant or user not found` | Tu as utilisé le pooler (port 6543) avec PGUSER=`postgres` nu | Utiliser **Direct connection** (5432). Le script refusera si PGPORT=6543. |
| `password authentication failed` | Mauvais project-ref ou caractère spécial dans le password mangé par le shell | Mettre le password entre `"..."` (double-quotes). Si caractères très spéciaux (`$`, backtick), entourer avec single-quotes `'...'` à la place. |
| `could not translate host name` | DNS pas encore propagé / VPN AlyoS désactivé | Vérifier connectivité : `Test-NetConnection $env:PGHOST -Port 5432` |

---

## 3. Étape 1 — Appliquer en preview

Annonce Slack `#alyos-ing-tech` :

> Steve : J'attaque l'apply migrations 0050–0053 sur **preview**. ETA 5 min.

```powershell
# Vérifier la branche et le SHA
cd C:\Dev\edifio-sourcing
git status
git log --oneline -1

# Lancer le script
.\scripts\migration\apply-migrations-0050-0053.ps1 -Environment preview -UseDocker
```

Le script va :

1. Vérifier les 5 ENV vars (refuse si manquantes).
2. Vérifier que `PGPORT != 6543` et `PGUSER != postgres.<ref>` (garde-fou Direct connection).
3. Vérifier que Docker tourne (`docker --version`).
4. Demander confirmation : taper `y` pour preview.
5. Lancer un container `postgres:15` éphémère et jouer chaque migration en `BEGIN ... ROLLBACK` (dry-run).
6. Lire le compteur `drizzle.__drizzle_migrations` AVANT.
7. Appliquer 0050 → 0051 → 0052 → 0053 séquentiellement, chacune en `--single-transaction`, avec INSERT du hash dans `drizzle.__drizzle_migrations`.
8. Post-checks : RLS FORCE sur 4 tables + 2 fonctions helper + delta compteur = +4.
9. Récap final + URLs smoke.

**Critère de succès** : le script termine avec `[OK] Apply termine.` et le récap affiche les 4 migrations en `[OK]` (pas `[skip]`).

---

## 4. Étape 2 — Smoke preview

Dans le navigateur :

1. Aller sur `https://edifio-sourcing-preview.vercel.app/login` et connecter un compte admin de test.
2. Déclencher le cron smoke : `https://edifio-sourcing-preview.vercel.app/api/admin/crons/smoke-sourcing-run`.
   - Réponse attendue : `200 OK` + JSON `{ ok: true, inserted: N }`.
3. Vérifier l'apprentissage Salve U : `https://edifio-sourcing-preview.vercel.app/sourcing/admin/profil`.
   - Doit s'afficher sans 500.
4. Tester un partage cotraitant via un lien public (token chiffré). Doit retourner les données attendues, **et seulement celles-ci** (RLS FORCE).

**Critère de succès preview** : 4/4 checks verts. Sinon, **NE PAS continuer en prod**, escalader sur Slack.

Annonce Slack :

> Steve : Preview OK (0050–0053 appliquées, smoke vert). Je passe en prod dans 5 min.

---

## 5. Étape 3 — Backup prod AVANT apply

> **NON NÉGOCIABLE**. Pas de dump frais < 5 min = pas d'apply prod.

Dans une nouvelle fenêtre PowerShell (ou la même, en ré-écrasant les ENV vars vers prod) :

```powershell
# Vars PROD (cf. §2)
$env:PGHOST     = "db.<prod-project-ref>.supabase.co"
$env:PGPORT     = "5432"
$env:PGUSER     = "postgres"
$env:PGDATABASE = "postgres"
$env:PGPASSWORD = op read "op://AlyoS/Supabase Sourcing PROD Direct/password"

# Dump
cd C:\Dev\edifio-sourcing
.\scripts\migration\backup-sourcing-db.ps1 -UseDocker
```

Sortie attendue : `backups\sourcing-prod-YYYY-MM-DD-HHmm.dump` (typiquement 50-200 MB).

Vérifier la taille :

```powershell
Get-ChildItem backups\sourcing-prod-*.dump | Sort-Object LastWriteTime -Descending | Select-Object -First 1
```

Noter le chemin exact dans un post-it terminal (utile en cas de rollback palier 3).

---

## 6. Étape 4 — Appliquer en prod

Annonce Slack :

> Steve : Backup prod OK (`sourcing-prod-2026-06-09-HHmm.dump`, X MB). J'attaque l'apply prod. ETA 5 min.

```powershell
# Les vars PROD sont toujours posées (cf. §5)
.\scripts\migration\apply-migrations-0050-0053.ps1 -Environment prod -UseDocker
```

Le script va :

1. Refaire le pre-flight (ENV + Docker + fichiers).
2. **Demander confirmation : taper exactement `PROD-CONFIRMER`**. N'importe quoi d'autre → abort.
3. Refaire le dry-run Docker (~30 s).
4. Lire compteur AVANT, apply séquentiel, post-checks, récap.

**Critère de succès** : pareil que preview — récap avec 4 `[OK]`, delta = `+4`.

Si tu as déjà fait le dry-run en preview dans la même session ET que tu es pressé, tu peux ajouter `-SkipDryRun` (mais ce n'est pas recommandé : 30 s gagnées vs. filet de sécurité perdu).

---

## 7. Étape 5 — Smoke prod

Identique à §4 mais sur `https://sourcing.alyosingenierie.fr` :

1. Login admin réel.
2. `https://sourcing.alyosingenierie.fr/api/admin/crons/smoke-sourcing-run`.
3. `https://sourcing.alyosingenierie.fr/sourcing/admin/profil`.
4. Partage cotraitant via lien public.

**Critère de succès prod** : 4/4 verts.

Annonce Slack :

> Steve : Apply prod OK, smoke vert. Migrations 0050–0053 LIVE. Post-mortem dans `notes-de-suivi/CC_260609_*.md`.

---

## 8. Que faire si dry-run échoue (avant prod)

Le dry-run tourne sur un container `postgres:15` **vide** : il valide la
syntaxe SQL et les extensions de base, pas les dépendances réelles (RLS,
tables existantes).

| Symptôme | Hypothèse | Action |
|---|---|---|
| `relation "<table>" does not exist` | Le container vide n'a pas les tables prérequises | Normal pour 0051/0052/0053 qui dépendent de tables RLS. Relancer avec `-SkipDryRun` **après** avoir validé les SQL en preview. |
| Erreur de syntaxe (`syntax error at or near ...`) | Vrai bug dans le fichier .sql | **NE PAS continuer**. Recommit le fix via Alex, refaire la PR. |
| Erreur d'extension (`extension "pgcrypto" not available`) | Le container postgres:15 n'a pas l'extension | Vérifier que la migration fait bien `CREATE EXTENSION IF NOT EXISTS pgcrypto`. Si oui : relancer avec `-SkipDryRun`. |
| `OperationalError: container failed to start` | Docker Desktop pas démarré | Démarrer Docker Desktop puis relancer. |

Si tu n'arrives pas à classer l'erreur, pose la question à Alex via
`handoff/REQUEST_*.md` avant de continuer.

---

## 9. Que faire si apply prod échoue

Cas 1 : **L'erreur arrive AVANT la première migration appliquée** (ENV, dry-run, confirmation).

→ Rien à rollback. Lire le message, corriger, relancer.

Cas 2 : **Erreur pendant l'apply d'une migration**.

Le script s'arrête immédiatement (`exit 1`). Chaque migration tourne en
`--single-transaction`, donc **la migration en cours est rollback automatique** :

- Soit l'INSERT dans `drizzle.__drizzle_migrations` n'a pas eu lieu → la migration
  n'a pas écrit en BDD (transaction rollback).
- Soit l'INSERT a eu lieu mais la suivante a échoué → la migration courante est
  bien appliquée et trackée, les suivantes ne le sont pas.

**Procédure de récupération** :

1. **Pas de panique**. Le script est idempotent : relancer le rejoue sans rejouer ce qui est déjà tracé.
2. Lire le message d'erreur PostgreSQL en haut du diff rouge.
3. Vérifier si c'est une erreur transitoire (timeout connexion) → relancer le script.
4. Si c'est une erreur de schéma (constraint violation, type mismatch) → **ne pas relancer**, escalader sur Slack et ouvrir le rollback :

```powershell
# Ouvrir le plan de rollback dans VS Code
code docs\ROLLBACK_PLAN_MIGRATIONS_0050_0053.md
```

Suivre la section correspondante à la migration qui a échoué (3 pour 0050,
4 pour 0051, 5 pour 0052, 6 pour 0053).

Cas 3 : **Toutes les migrations OK mais un post-check rouge** (RLS FORCE manquant, fonction absente).

→ C'est anormal : les migrations ont signalé succès mais l'état attendu n'est pas
là. Hypothèses :
- Une autre session a tourné une migration concurrente (improbable, mais
  vérifier `pg_stat_activity`).
- Le hash dans `drizzle.__drizzle_migrations` ne correspond pas (collision).
- Un bug dans le post-check (faux négatif).

**Action** : relire le diff rouge, déterminer si l'état réel est OK ou pas. Si
oui : marquer le post-check à corriger en post-mortem. Si non : rollback de la
migration concernée selon `ROLLBACK_PLAN`.

Cas 4 : **Apply prod OK mais smoke prod KO** (501 sur `/api/admin/crons/smoke-sourcing-run` par exemple).

→ Le SQL est en place mais l'app a un bug. Ce n'est plus un problème de
migration. Soit on déploie un hotfix Vercel, soit on rollback les migrations
selon l'arbre de décision (`ROLLBACK_PLAN` §7).

---

## 10. Timing attendu

| Étape | Durée |
|---|---|
| Lecture rapide de ce runbook | 5 min |
| Pose des ENV vars preview | 1 min |
| Apply preview (dry-run inclus) | **~5 min** |
| Smoke preview | 3 min |
| Bascule ENV vars vers prod + backup prod | 5 min |
| Apply prod (dry-run inclus) | **~5 min** |
| Smoke prod | 3 min |
| Annonces Slack + post-mortem express | 5 min |
| **Total fenêtre bloquée** | **~30 min** |

Si tout va bien, tu peux clôturer en moins de 25 min. Compte 1h30 si quelque
chose dérape (rollback palier 1 + re-apply).

---

## 11. Récapitulatif des commandes (cheat-sheet)

```powershell
# 0. Avant tout
cd C:\Dev\edifio-sourcing
git checkout main
git pull origin main
docker --version   # doit répondre

# 1. ENV PREVIEW
$env:PGHOST     = "db.<preview-project-ref>.supabase.co"
$env:PGPORT     = "5432"
$env:PGUSER     = "postgres"
$env:PGDATABASE = "postgres"
$env:PGPASSWORD = "<depuis 1Password>"

# 2. Apply PREVIEW
.\scripts\migration\apply-migrations-0050-0053.ps1 -Environment preview -UseDocker

# 3. Smoke preview (navigateur)
#    https://edifio-sourcing-preview.vercel.app/login
#    https://edifio-sourcing-preview.vercel.app/api/admin/crons/smoke-sourcing-run

# 4. Bascule ENV vars vers PROD
$env:PGHOST     = "db.<prod-project-ref>.supabase.co"
$env:PGPASSWORD = "<depuis 1Password — PROD>"

# 5. Backup prod
.\scripts\migration\backup-sourcing-db.ps1 -UseDocker

# 6. Apply PROD
.\scripts\migration\apply-migrations-0050-0053.ps1 -Environment prod -UseDocker
#    Tape: PROD-CONFIRMER

# 7. Smoke prod (navigateur)
#    https://sourcing.alyosingenierie.fr/login
#    https://sourcing.alyosingenierie.fr/api/admin/crons/smoke-sourcing-run

# 8. Nettoyage session (optionnel mais conseillé)
Remove-Item Env:PGPASSWORD
Set-Clipboard -Value ""
```

---

**Fin du runbook.** En cas de doute, ne pas avancer : escalader sur Slack.
Mieux vaut 30 min de retard qu'un rollback en panique.
