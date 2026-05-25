# =====================================================================
# backup-prod.ps1 — Dump binaire prod (lecture seule)
# ---------------------------------------------------------------------
# Contexte : étape 1 du plan de remédiation bug `architects.cabinet`.
# OPÉRATEUR : Steve (cf. memory feedback_ops_prod_user_runs_migration).
# Steve pose lui-même $env:PG* dans SA session avant de lancer ce script.
# ---------------------------------------------------------------------
# Ce script ne contient JAMAIS de credentials.
# Connexion via les variables d'environnement standard libpq.
# Action : pg_dump --format=custom (binaire, restore flexible).
# Effet : LECTURE SEULE sur la prod. Aucune écriture.
# =====================================================================

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

# --- 1. Vérifier que les env vars PG* sont posées par Steve --------
$required = @('PGHOST', 'PGUSER', 'PGPASSWORD', 'PGDATABASE', 'PGPORT')
$missing  = @()
foreach ($name in $required) {
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name, 'Process'))) {
        $missing += $name
    }
}
if ($missing.Count -gt 0) {
    Write-Host ""
    Write-Host "[ABORT] Variables d'environnement manquantes : $($missing -join ', ')" -ForegroundColor Red
    Write-Host ""
    Write-Host "Pose-les dans TA session PowerShell (jamais dans le script) :" -ForegroundColor Yellow
    Write-Host '  $env:PGHOST     = "<hostname supabase>"'
    Write-Host '  $env:PGPORT     = "5432"'
    Write-Host '  $env:PGUSER     = "<user>"'
    Write-Host '  $env:PGDATABASE = "postgres"'
    Write-Host '  $env:PGPASSWORD = "<password>"  # ne JAMAIS commit / coller dans le chat'
    Write-Host ""
    exit 2
}

# --- 2. Vérifier que pg_dump est disponible ------------------------
$pgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
if ($null -eq $pgDump) {
    Write-Host "[ABORT] pg_dump introuvable dans le PATH." -ForegroundColor Red
    Write-Host "Installe les client tools PostgreSQL 15+ (ex: choco install postgresql15)." -ForegroundColor Yellow
    exit 3
}

# --- 3. Préparer le dossier backups/ -------------------------------
$repoRoot   = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$backupsDir = Join-Path $repoRoot 'backups'
if (-not (Test-Path $backupsDir)) {
    New-Item -ItemType Directory -Path $backupsDir | Out-Null
}

$timestamp = Get-Date -Format 'yyMMdd-HHmm'
$dumpName  = "edifio-sourcing-prod-$timestamp.dump"
$dumpPath  = Join-Path $backupsDir $dumpName

# --- 4. Récap pré-vol (pas de password affiché) --------------------
Write-Host ""
Write-Host "=== pg_dump prod -> $dumpName ===" -ForegroundColor Cyan
Write-Host "  Host     : $env:PGHOST"
Write-Host "  Port     : $env:PGPORT"
Write-Host "  Database : $env:PGDATABASE"
Write-Host "  User     : $env:PGUSER"
Write-Host "  Output   : $dumpPath"
Write-Host "  Mode     : --format=custom --no-owner --no-acl --verbose"
Write-Host "  Action   : LECTURE SEULE (pg_dump n'écrit rien sur la base)"
Write-Host ""

# --- 5. Lancer le dump ---------------------------------------------
$sw = [System.Diagnostics.Stopwatch]::StartNew()
try {
    & pg_dump `
        --format=custom `
        --no-owner `
        --no-acl `
        --verbose `
        --file=$dumpPath
    $exitCode = $LASTEXITCODE
}
catch {
    $exitCode = 1
    Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
}
$sw.Stop()

if ($exitCode -ne 0) {
    Write-Host ""
    Write-Host "[FAIL] pg_dump a renvoyé exit code $exitCode (durée: $([int]$sw.Elapsed.TotalSeconds)s)" -ForegroundColor Red
    if (Test-Path $dumpPath) {
        Write-Host "Le fichier partiel a été conservé pour investigation : $dumpPath" -ForegroundColor Yellow
    }
    exit $exitCode
}

# --- 6. Vérifier le fichier produit --------------------------------
if (-not (Test-Path $dumpPath)) {
    Write-Host "[FAIL] Le fichier $dumpPath n'a pas été créé." -ForegroundColor Red
    exit 4
}
$dumpFile = Get-Item $dumpPath
if ($dumpFile.Length -eq 0) {
    Write-Host "[FAIL] Le fichier $dumpPath est vide (0 byte)." -ForegroundColor Red
    exit 5
}

# --- 7. Récap final ------------------------------------------------
$sizeMb  = [math]::Round($dumpFile.Length / 1MB, 2)
$durSec  = [int]$sw.Elapsed.TotalSeconds
Write-Host ""
Write-Host "=== OK dump prod ===" -ForegroundColor Green
Write-Host "  Fichier : $dumpPath"
Write-Host "  Taille  : $sizeMb MB ($($dumpFile.Length) bytes)"
Write-Host "  Durée   : $durSec s"
Write-Host ""
Write-Host "Étape suivante (Yann) :" -ForegroundColor Cyan
Write-Host "  .\scripts\bug-cabinet\dryrun-local.ps1"
Write-Host ""
exit 0
