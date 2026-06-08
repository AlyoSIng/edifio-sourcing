<#
.SYNOPSIS
    Dump complet (format custom pg_restore) du Supabase Sourcing prod (Frankfurt).

.DESCRIPTION
    Réalise un pg_dump du projet Supabase Sourcing prod vers un fichier daté local
    dans `backups/sourcing-prod-YYYY-MM-DD-HHmm.dump`.

    SAFETY : refuse de tourner si les ENV PG* ne sont pas posées dans la session.
    Aucune écriture sur la BDD prod, lecture seule (pg_dump).

.NOTES
    Auteur : Yann (ps_operator) — préparé pour bascule 18 juillet 2026.
    Cf. MEMORY > feedback_ops_prod_user_runs_migration.md : Steve pose PGPASSWORD
    dans SA session et lance la commande lui-même.

    PIÈGE IMPORTANT (incident migration 0007-0008) :
    Le pooler Supabase (port 6543) RENVOIE
        "tenant or user not found"
    avec l'erreur `postgres.vlhirdzvewzqgtnhcjft not found` quand on utilise
    le username `postgres` (le pooler attend `postgres.<project-ref>`).
    → UTILISER LA DIRECT CONNECTION (port 5432) pour pg_dump.

    Récupération de la Direct connection :
    Supabase Studio → Settings → Database → Connection string → URI
    → onglet "Direct connection" → host = db.<project-ref>.supabase.co

.EXAMPLE
    # Avant de lancer (Steve, dans SA session PowerShell) :
    $env:PGHOST = "db.<sourcing-project-ref>.supabase.co"  # Direct connection !
    $env:PGPORT = "5432"
    $env:PGUSER = "postgres"
    $env:PGDATABASE = "postgres"
    $env:PGPASSWORD = "<password depuis 1Password>"

    # Puis :
    .\scripts\migration\backup-sourcing-db.ps1

    # Pour utiliser Docker (si pg_dump pas dans le PATH) :
    .\scripts\migration\backup-sourcing-db.ps1 -UseDocker

.PARAMETER UseDocker
    Si présent, lance pg_dump via `docker run postgres:15` au lieu du binaire local.
    Utile si pg_dump n'est pas installé localement (PATH Windows par défaut).

.PARAMETER OutDir
    Dossier de sortie. Par défaut : backups/ (relatif au repo).
#>
[CmdletBinding()]
param(
    [switch]$UseDocker,
    [string]$OutDir = "backups"
)

$ErrorActionPreference = "Stop"

# --- Safety check : ENV vars requises ---
$requiredEnv = @("PGHOST", "PGPORT", "PGUSER", "PGDATABASE", "PGPASSWORD")
$missing = @()
foreach ($var in $requiredEnv) {
    if (-not (Test-Path "Env:$var")) {
        $missing += $var
    }
}

if ($missing.Count -gt 0) {
    Write-Host "[REFUS] Variables d'environnement manquantes : $($missing -join ', ')" -ForegroundColor Red
    Write-Host ""
    Write-Host "Avant de relancer, poser les vars dans CETTE session PowerShell :" -ForegroundColor Yellow
    Write-Host '  $env:PGHOST     = "db.<project-ref>.supabase.co"  # Direct connection !' -ForegroundColor Cyan
    Write-Host '  $env:PGPORT     = "5432"' -ForegroundColor Cyan
    Write-Host '  $env:PGUSER     = "postgres"' -ForegroundColor Cyan
    Write-Host '  $env:PGDATABASE = "postgres"' -ForegroundColor Cyan
    Write-Host '  $env:PGPASSWORD = "<depuis 1Password>"' -ForegroundColor Cyan
    Write-Host ""
    Write-Host "ATTENTION : utiliser la Direct connection (5432), PAS le pooler (6543)." -ForegroundColor Yellow
    exit 1
}

# --- Garde-fou : éviter d'envoyer le user pooler `postgres.<ref>` (incident 0007-0008) ---
if ($env:PGUSER -match '^postgres\.') {
    Write-Host "[REFUS] PGUSER = '$($env:PGUSER)' ressemble à un user pooler (postgres.<ref>)." -ForegroundColor Red
    Write-Host "        Pour pg_dump, utiliser la Direct connection avec PGUSER='postgres' (sans suffixe)." -ForegroundColor Yellow
    exit 1
}

# --- Garde-fou : port 6543 = pooler (incompatible pg_dump correct) ---
if ($env:PGPORT -eq "6543") {
    Write-Host "[REFUS] PGPORT=6543 correspond au pooler PgBouncer." -ForegroundColor Red
    Write-Host "        pg_dump nécessite la Direct connection (port 5432)." -ForegroundColor Yellow
    exit 1
}

# --- Préparation du dossier de sortie ---
$repoRoot = (Get-Item $PSScriptRoot).Parent.Parent.FullName
$absOutDir = Join-Path $repoRoot $OutDir
if (-not (Test-Path $absOutDir)) {
    New-Item -ItemType Directory -Path $absOutDir -Force | Out-Null
}

$stamp = Get-Date -Format "yyyy-MM-dd-HHmm"
$outFile = Join-Path $absOutDir "sourcing-prod-$stamp.dump"

Write-Host "[INFO] Cible : $($env:PGUSER)@$($env:PGHOST):$($env:PGPORT)/$($env:PGDATABASE)" -ForegroundColor Cyan
Write-Host "[INFO] Sortie : $outFile" -ForegroundColor Cyan
Write-Host "[INFO] Format : custom (pg_restore-friendly)" -ForegroundColor Cyan
Write-Host ""

# --- Exécution pg_dump ---
if ($UseDocker) {
    Write-Host "[MODE] Docker (postgres:15)" -ForegroundColor Yellow
    # On monte le dossier backups en volume ; pg_dump tourne dans le container.
    # PGPASSWORD est passé en --env (jamais en argument visible).
    $dockerArgs = @(
        "run", "--rm",
        "--env", "PGPASSWORD=$env:PGPASSWORD",
        "-v", "${absOutDir}:/backup",
        "postgres:15",
        "pg_dump",
        "--host=$env:PGHOST",
        "--port=$env:PGPORT",
        "--username=$env:PGUSER",
        "--dbname=$env:PGDATABASE",
        "--format=custom",
        "--no-owner",
        "--no-acl",
        "--verbose",
        "--file=/backup/sourcing-prod-$stamp.dump"
    )
    & docker @dockerArgs
} else {
    # pg_dump binaire local (doit être dans le PATH)
    $pgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
    if (-not $pgDump) {
        Write-Host "[ERREUR] pg_dump introuvable dans le PATH." -ForegroundColor Red
        Write-Host "         Options :" -ForegroundColor Yellow
        Write-Host "           1. Installer PostgreSQL client (winget install PostgreSQL.PostgreSQL)" -ForegroundColor Yellow
        Write-Host "           2. Relancer avec -UseDocker (si Docker Desktop dispo)" -ForegroundColor Yellow
        exit 1
    }

    & pg_dump `
        --host=$env:PGHOST `
        --port=$env:PGPORT `
        --username=$env:PGUSER `
        --dbname=$env:PGDATABASE `
        --format=custom `
        --no-owner `
        --no-acl `
        --verbose `
        --file=$outFile
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERREUR] pg_dump a échoué (exit $LASTEXITCODE)." -ForegroundColor Red
    exit $LASTEXITCODE
}

# --- Rapport ---
$size = (Get-Item $outFile).Length
$sizeMB = [math]::Round($size / 1MB, 2)
Write-Host ""
Write-Host "[OK] Dump terminé." -ForegroundColor Green
Write-Host "     Fichier : $outFile" -ForegroundColor Green
Write-Host "     Taille  : $sizeMB MB" -ForegroundColor Green
Write-Host ""
Write-Host "[NEXT] Pour restorer dans une BDD cible :" -ForegroundColor Cyan
Write-Host "       pg_restore --host=<target> --port=5432 --username=postgres --dbname=<target_db> --no-owner --no-acl --verbose `"$outFile`"" -ForegroundColor Gray
