# Scripts ops migration — edifio Sourcing → monorepo alyos-suivi-chantier

Préparés par `ps_operator` (Yann) pour la bascule du **samedi 18 juillet 2026 (8h-11h)**.

> **Posture** : tous les scripts sont **safe-by-default**. Ils refusent de tourner
> si les ENV nécessaires sont absentes ou si une garde-fou critique est violée
> (ex : pooler PgBouncer pour pg_dump). Steve lance les scripts lui-même dans SA
> session PowerShell après avoir posé les secrets (cf.
> `.claude/agent-memory/feedback_ops_prod_user_runs_migration.md`).

---

## Inventaire

| Script | Cible | Lecture / Écriture | ENV requises |
|---|---|---|---|
| `backup-sourcing-db.ps1` | Supabase Sourcing prod (Frankfurt eu-central-1) | Lecture seule (pg_dump) | `PGHOST` `PGPORT` `PGUSER` `PGDATABASE` `PGPASSWORD` |
| `backup-suiviact-db.ps1` | Supabase Suivi+ACT prod (Paris eu-west-3) | Lecture seule (pg_dump) | `PGHOST` `PGPORT` `PGUSER` `PGDATABASE` `PGPASSWORD` |
| `export-vercel-env.ps1` | Vercel (preview + production) | Lecture seule (vercel env pull) | aucune ENV — auth via `vercel login`. Option `-Encrypt` (age) → `$env:AGE_PASSPHRASE` recommandé. |
| `backup-supabase-storage.ps1` | Supabase Storage (tous buckets) | Lecture seule (API REST) | `SUPABASE_URL` `SUPABASE_SERVICE_ROLE_KEY` |

Tous les fichiers de sortie atterrissent dans `backups/` à la racine du repo.
**`backups/` est déjà dans `.gitignore` (ligne 67) — aucun risque de commit.**

---

## Ordre d'exécution recommandé (backup complet pré-migration)

À exécuter **J-7 (samedi 11 juillet)** pour le « répét générale », puis **J-1 (vendredi 17 juillet soir)** pour le backup officiel pré-bascule.

```powershell
# 0. Se placer à la racine du repo
cd C:\Dev\edifio-sourcing

# --- BACKUP 1 : Sourcing BDD (le plus critique) ---
$env:PGHOST     = "db.<sourcing-ref>.supabase.co"   # Direct connection !
$env:PGPORT     = "5432"
$env:PGUSER     = "postgres"
$env:PGDATABASE = "postgres"
$env:PGPASSWORD = "<depuis 1Password — projet Sourcing>"
.\scripts\migration\backup-sourcing-db.ps1

# --- BACKUP 2 : Suivi+ACT BDD (cible de la migration) ---
# (Re-poser les vars — autre projet, autre password)
$env:PGHOST     = "db.<suiviact-ref>.supabase.co"
$env:PGPORT     = "5432"
$env:PGUSER     = "postgres"
$env:PGDATABASE = "postgres"
$env:PGPASSWORD = "<depuis 1Password — projet Suivi+ACT>"
.\scripts\migration\backup-suiviact-db.ps1

# --- BACKUP 3 : Vercel ENV vars (preview + production) ---
# Pré-requis : `vercel link` à faire une fois (linke ce repo au projet edifio-sourcing).
# Pré-requis -Encrypt : `winget install FiloSottile.age` une fois.
$env:AGE_PASSPHRASE = "<passphrase forte 1Password — entree separee>"
.\scripts\migration\export-vercel-env.ps1 -ProjectName "edifio-sourcing" -Encrypt

# --- BACKUP 4 : Supabase Storage (Sourcing) ---
$env:SUPABASE_URL              = "https://<sourcing-ref>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "<service_role depuis 1Password — projet Sourcing>"
.\scripts\migration\backup-supabase-storage.ps1 -ProjectName "edifio-sourcing"

# --- BACKUP 5 : Supabase Storage (Suivi+ACT) — pour parité ---
$env:SUPABASE_URL              = "https://<suiviact-ref>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "<service_role depuis 1Password — projet Suivi+ACT>"
.\scripts\migration\backup-supabase-storage.ps1 -ProjectName "alyos-suivi-chantier"
```

**Hygiène post-backup** :
- Vérifier la taille des `.dump` (ordre attendu ~50-200 MB pour Sourcing).
- Tester un `pg_restore --list` sur le `.dump` pour valider l'intégrité du fichier.
- Copier `.env.production.backup` dans 1Password puis **supprimer le fichier local**.

---

## Pièges identifiés (les éviter)

### 1. Pooler vs Direct connection (Supabase)
Le pooler PgBouncer (port **6543**, user `postgres.<project-ref>`) **ne supporte pas
correctement `pg_dump`**. Erreur observée lors de la migration 0007-0008 :

```
FATAL: Tenant or user not found
postgres.vlhirdzvewzqgtnhcjft not found
```

→ Les scripts `backup-*-db.ps1` **refusent** si `PGPORT=6543` ou si `PGUSER` commence
par `postgres.`.

→ **Toujours utiliser la Direct connection** : Supabase Studio → Settings →
Database → Connection string → URI → onglet **"Direct connection"** (port 5432,
user `postgres` sans suffixe).

### 2. pg_dump pas dans le PATH Windows
Sur le poste Steve, PostgreSQL client n'est pas installé par défaut. Deux options :
- **Option A** : `winget install PostgreSQL.PostgreSQL` (installe pg_dump dans le PATH).
- **Option B** : utiliser le flag `-UseDocker` des scripts → `docker run postgres:15 pg_dump...`
  (nécessite Docker Desktop actif).

### 3. SERVICE_ROLE_KEY (pas ANON_KEY) pour Storage
`backup-supabase-storage.ps1` doit utiliser le SERVICE_ROLE pour voir les buckets
privés. L'ANON_KEY ne voit que ce qui est public → backup incomplet.

### 4. Vercel link
`vercel env pull` ne marche que si le repo local est linké à un projet Vercel.
Faire `vercel link` une fois depuis la racine du repo (choisir scope AlyoSIng,
projet edifio-sourcing).

### 5. `.env.production.backup` contient des SECRETS
Le dossier `backups/` est dans `.gitignore` (vérifié — ligne 67), donc pas de
risque de commit accidentel. Mais **le fichier reste lisible en clair sur le
disque** → après usage, copier dans 1Password et supprimer.

→ **En prod, utiliser systématiquement `-Encrypt`** (cf. section « Chiffrement
des backups » ci-dessous).

---

## Chiffrement des backups (option `-Encrypt`)

Depuis la review Hugo PR #117, `export-vercel-env.ps1` accepte un flag
`-Encrypt` qui chiffre immédiatement les fichiers `.env.*.backup` via
[`age`](https://github.com/FiloSottile/age) et **supprime les fichiers en clair**
après chiffrement.

### Pourquoi `-Encrypt` est recommandé en prod

- `vercel env pull` écrit `.env.production.backup` en **clair sur disque**.
- Même si `backups/` est gitignored, c'est une fenêtre de temps où les
  secrets prod sont à portée de regard d'un malware, d'une indexation
  Spotlight / Windows Search, ou d'un backup système automatique.
- `-Encrypt` ferme cette fenêtre : le fichier en clair n'existe que le temps
  strict d'un `age --passphrase --output …`, puis il est supprimé.

### Installation d'`age` (une fois)

```powershell
# Méthode recommandée Windows :
winget install FiloSottile.age

# Alternatives :
scoop install age
choco install age.portable
```

Vérifier : `age --version` doit renvoyer une version `1.x`.

### Utilisation

```powershell
# Poser la passphrase dans la session (préférée — scriptable, pas de prompt)
$env:AGE_PASSPHRASE = "<passphrase forte depuis 1Password>"

# Lancer l'export avec chiffrement
.\scripts\migration\export-vercel-env.ps1 -ProjectName "edifio-sourcing" -Encrypt
```

Si `$env:AGE_PASSPHRASE` n'est pas posée, le script demande la passphrase via
un prompt sécurisé (`Read-Host -AsSecureString`, masqué).

Résultat : `.env.preview.backup.age` et `.env.production.backup.age` (les
versions `.backup` en clair sont **supprimées** après chiffrement).

### Procédure pour déchiffrer

```powershell
# Si la passphrase est en ENV :
$env:AGE_PASSPHRASE = "<passphrase>"
age --decrypt --output .env.production.backup .env.production.backup.age

# Sinon, age prompt interactivement :
age --decrypt --output .env.production.backup .env.production.backup.age
# (saisir la passphrase au prompt)
```

Une fois le fichier déchiffré utilisé (re-import Vercel par exemple),
**supprimer immédiatement** la version `.backup` en clair.

### Posture sécurité

- La passphrase n'est **jamais loggée** par le script (filtre regex défensif
  sur la sortie `age` + masquage stack trace en cas d'erreur).
- La passphrase est effacée de la mémoire après usage (`$null` + `GC.Collect()`).
- Le wrapper `Invoke-AgeEncrypt` est **idempotent** : un re-run re-crée le
  fichier `.age` proprement.
- **Steve pose la passphrase dans SA session** PowerShell, jamais dans un
  fichier (cf. MEMORY > `feedback_ops_prod_user_runs_migration.md`).

---

## Rollback (si bascule échoue)

Si la bascule du 18 juillet doit être annulée :

1. **Rollback BDD Sourcing** : restorer le `.dump` Sourcing dans le projet
   Supabase Sourcing source (qui n'aura PAS été touché — la migration copie
   vers Suivi+ACT, elle n'altère pas Sourcing).
   ```
   pg_restore --host=db.<sourcing-ref>.supabase.co --port=5432 \
              --username=postgres --dbname=postgres \
              --no-owner --no-acl --verbose \
              backups\sourcing-prod-YYYY-MM-DD-HHmm.dump
   ```
2. **Rollback Vercel** : ré-importer les ENV vars depuis `.env.production.backup`
   dans le dashboard Vercel (projet edifio-sourcing).
3. **Rollback DNS** : Steve repointe `sourcing.alyosingenierie.fr` vers l'ancien
   déploiement Vercel (via OVH panel — cf. MEMORY > feedback_dns_consignes.md
   pour le pas-à-pas par clic exact).
4. **Storage** : aucun rollback nécessaire si la migration n'a pas écrasé les
   buckets cible. Sinon, re-uploader depuis `backups/storage/edifio-sourcing/<bucket>/`
   (script inverse à coder le moment venu si besoin).

Procédure de bascule complète : voir `docs/brief_migration_sourcing_to_monorepo.md`
(v2, 964 lignes), section « Rollback Plan ».

---

## Maintenance

- **Branche d'origine** : `ops/migration-scripts` (créée 2026-06-08 par Yann).
- **Revue** : Steve revue puis push (les scripts n'ont JAMAIS tourné sur prod
  côté agent — cf. MEMORY > feedback_ops_prod_user_runs_migration.md).
- **Tests à froid recommandés** :
  - Lancer chaque script SANS poser les ENV → vérifier le refus propre + message.
  - Lancer `backup-sourcing-db.ps1` avec `PGPORT=6543` → vérifier le refus.
  - Lancer `backup-supabase-storage.ps1` sur le projet **staging** (pas prod) pour
    valider que le download fonctionne avant J-7.
