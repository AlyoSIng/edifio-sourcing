# scripts/bug-cabinet — Plan de remédiation `architects.cabinet`

Scripts d'opération pour les étapes 1 et 2 du plan unifié Alex + Nadia
(validé Steve, 2026-05-25). Aucun script n'écrit sur la prod.

## 1. Prérequis

- **Docker Desktop running** (pour le container `postgres:15-alpine`).
- **Client tools PostgreSQL 15+** dans le PATH (`pg_dump`, `pg_restore`).
- **`pnpm install` à jour** (les 7 migrations drizzle vivent dans le repo).
- **Variables d'environnement `PG*` posées dans TA session PowerShell**
  (Steve) — JAMAIS dans le script, jamais dans le chat, jamais dans un commit
  (cf. memory `followup_post_mvp_security_rotations`).

```powershell
# À poser dans TA session uniquement, avant l'étape 1
$env:PGHOST     = "<hostname supabase>"
$env:PGPORT     = "5432"
$env:PGUSER     = "<user>"
$env:PGDATABASE = "postgres"
$env:PGPASSWORD = "<password prod>"   # NE PAS coller dans le chat
```

## 2. Exécution séquentielle

### Étape 1 — Backup prod (Steve)

```powershell
.\scripts\bug-cabinet\backup-prod.ps1
```

- Action : `pg_dump --format=custom --no-owner --no-acl --verbose`
- Effet : LECTURE SEULE sur la prod, aucune écriture.
- Output : `backups\edifio-sourcing-prod-YYMMDD-HHMM.dump`
- Récap : taille du dump, durée, chemin absolu.

### Étape 2 — Dry-run local (Yann)

```powershell
.\scripts\bug-cabinet\dryrun-local.ps1
# Options :
#   -Keep            -> conserve le container postgres après le run
#   -DumpFile <path> -> force un dump précis (sinon : le plus récent de backups/)
```

- Lance `postgres:15-alpine` (container `edifio-dryrun`, port host 55432).
- Restore le dump prod via `pg_restore --clean --if-exists`.
- Lance `pnpm drizzle-kit migrate` (les 7 migrations en attente).
- Affiche le contenu final de `drizzle.__drizzle_migrations`.
- Tear-down auto (sauf `-Keep`).
- **Si crash migrate** : container CONSERVÉ pour investigation Steve,
  exit code != 0, message clair avec commandes `docker exec` / `docker logs`.

### Étape 3 — Si dry-run OK

1. Revue CTO Sophie sur l'output dry-run (handoff `/handoff/REQUEST_*.md`).
2. Apply prod : **Steve lance lui-même** la commande (memory
   `feedback_ops_prod_user_runs_migration`).
3. Yann reprend smoke + trace + commit.

## 3. Garde-fous

- **Pas de password en clair** dans les scripts. `backup-prod.ps1` lit
  `$env:PG*` posés par Steve dans SA session ; `dryrun-local.ps1` utilise
  un password jetable local (`dryrun`) sur un container éphémère bind sur
  `localhost:55432`.
- **`backups/` est gitignored** (cf. `.gitignore` racine + `backups/.gitignore`).
  Aucun `.dump` ne peut être push par accident.
- **Container postgres détruit à la fin** sauf flag `-Keep` ou crash migrate
  (dans ce cas conservé pour debug, message explicite).
- **Aucune connexion à prod côté Yann** : seul `backup-prod.ps1` (Steve)
  touche la prod, et uniquement en lecture.
- **Aucune écriture en dehors de `backups/` et du container docker** local.
