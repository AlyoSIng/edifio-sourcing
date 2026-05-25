# =====================================================================
# dryrun-local.ps1 — Restore dump prod + dry-run des 7 migrations
# ---------------------------------------------------------------------
# Contexte : étape 2 du plan de remédiation bug `architects.cabinet`.
# OPÉRATEUR : Yann (sub-agent ps_operator).
# Prérequis : Docker Desktop running + backup-prod.ps1 déjà exécuté.
# ---------------------------------------------------------------------
# Ce script :
#   1. lance un container postgres:15-alpine éphémère ;
#   2. attend pg_isready ;
#   3. restore le dump le plus récent de backups/ ;
#   4. pose $env:DATABASE_URL local pour drizzle-kit ;
#   5. lance `pnpm drizzle-kit migrate` (les 7 migrations) ;
#   6. dump le contenu de drizzle.__drizzle_migrations ;
#   7. tear-down du container (sauf -Keep).
#
# En cas de crash migrate -> container CONSERVÉ pour investigation.
# Aucun secret en clair. Password container = 'dryrun' (jetable, local).
# =====================================================================

[CmdletBinding()]
param(
    [switch]$Keep,
    [string]$DumpFile  # optionnel : chemin explicite d'un dump à restorer
)

$ErrorActionPreference = 'Stop'

# --- 0. Constantes container ---------------------------------------
$repoRoot      = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$backupsDir    = Join-Path $repoRoot 'backups'
$containerName = 'edifio-dryrun'
$pgImage       = 'postgres:15-alpine'
$pgPort        = 55432   # port host non standard pour éviter collision
$pgPassword    = 'dryrun' # password jetable container local éphémère
$pgUser        = 'postgres'
$pgDb          = 'edifio_dryrun'

# --- 1. Vérifs prérequis -------------------------------------------
$docker = Get-Command docker -ErrorAction SilentlyContinue
if ($null -eq $docker) {
    Write-Host "[ABORT] docker introuvable. Démarre Docker Desktop." -ForegroundColor Red
    exit 2
}
try {
    docker info --format '{{.ServerVersion}}' | Out-Null
} catch {
    Write-Host "[ABORT] Docker daemon ne répond pas. Démarre Docker Desktop." -ForegroundColor Red
    exit 2
}

# --- 2. Choisir le dump --------------------------------------------
if (-not (Test-Path $backupsDir)) {
    Write-Host "[ABORT] Dossier backups/ inexistant. Lance d'abord backup-prod.ps1." -ForegroundColor Red
    exit 3
}
if ($DumpFile) {
    $dump = Get-Item $DumpFile -ErrorAction Stop
} else {
    $dump = Get-ChildItem -Path $backupsDir -Filter '*.dump' |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First 1
}
if ($null -eq $dump) {
    Write-Host "[ABORT] Aucun fichier .dump dans backups/." -ForegroundColor Red
    exit 3
}
Write-Host ""
Write-Host "=== Dry-run local sur $($dump.Name) ===" -ForegroundColor Cyan
Write-Host "  Dump   : $($dump.FullName)"
Write-Host "  Taille : $([math]::Round($dump.Length / 1MB, 2)) MB"
Write-Host "  Image  : $pgImage"
Write-Host "  Port   : $pgPort (host) -> 5432 (container)"
Write-Host ""

# --- 3. Cleanup éventuel d'un ancien container ---------------------
$existing = docker ps -a --filter "name=^/$containerName$" --format '{{.Names}}'
if ($existing -eq $containerName) {
    Write-Host "Container '$containerName' existant -> suppression..." -ForegroundColor Yellow
    docker rm -f $containerName | Out-Null
}

# --- 4. Lancer le container ----------------------------------------
Write-Host "Démarrage container postgres éphémère..." -ForegroundColor Cyan
docker run -d `
    --name $containerName `
    -e POSTGRES_PASSWORD=$pgPassword `
    -e POSTGRES_USER=$pgUser `
    -e POSTGRES_DB=$pgDb `
    -p "${pgPort}:5432" `
    $pgImage | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] docker run a échoué." -ForegroundColor Red
    exit 4
}

# --- 5. Attendre pg_isready ----------------------------------------
Write-Host "Attente pg_isready..." -ForegroundColor Cyan
$ready  = $false
$tries  = 0
$maxTry = 30
while (-not $ready -and $tries -lt $maxTry) {
    Start-Sleep -Seconds 1
    docker exec $containerName pg_isready -U $pgUser -d $pgDb 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $ready = $true }
    $tries++
}
if (-not $ready) {
    Write-Host "[FAIL] postgres pas ready après ${maxTry}s. Container CONSERVÉ pour debug." -ForegroundColor Red
    Write-Host "  docker logs $containerName" -ForegroundColor Yellow
    exit 5
}
Write-Host "  postgres ready après ${tries}s." -ForegroundColor Green

# --- 6. Copier le dump dans le container ---------------------------
Write-Host "Copie dump vers container..." -ForegroundColor Cyan
docker cp $dump.FullName "${containerName}:/tmp/prod.dump"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] docker cp a échoué. Container CONSERVÉ." -ForegroundColor Red
    exit 6
}

# --- 7. Restore avec pg_restore ------------------------------------
Write-Host "pg_restore --clean --if-exists..." -ForegroundColor Cyan
docker exec `
    -e PGPASSWORD=$pgPassword `
    $containerName `
    pg_restore `
        --clean --if-exists `
        --no-owner --no-acl `
        -U $pgUser -d $pgDb `
        /tmp/prod.dump
# pg_restore peut renvoyer != 0 sur des warnings non bloquants -> on continue
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [WARN] pg_restore exit code $LASTEXITCODE (warnings courants, on poursuit)." -ForegroundColor Yellow
}

# --- 8. Poser DATABASE_URL local + lancer drizzle-kit migrate ------
$dryrunUrl = "postgres://${pgUser}:${pgPassword}@localhost:${pgPort}/${pgDb}"
$env:DATABASE_URL = $dryrunUrl
Write-Host ""
Write-Host "DATABASE_URL pointé sur le container local (jetable)." -ForegroundColor Cyan
Write-Host "Lancement drizzle-kit migrate (7 migrations attendues)..." -ForegroundColor Cyan
Write-Host ""

$migrateOk = $true
try {
    & pnpm drizzle-kit migrate
    if ($LASTEXITCODE -ne 0) { $migrateOk = $false }
} catch {
    $migrateOk = $false
    Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
}

# --- 9. Récap migrations -------------------------------------------
Write-Host ""
if (-not $migrateOk) {
    Write-Host "=== [FAIL] drizzle-kit migrate a crashé ===" -ForegroundColor Red
    Write-Host "Container CONSERVÉ pour investigation Steve :" -ForegroundColor Yellow
    Write-Host "  Container : $containerName"
    Write-Host "  URL       : $dryrunUrl"
    Write-Host "  Inspect   : docker exec -it $containerName psql -U $pgUser -d $pgDb"
    Write-Host "  Logs      : docker logs $containerName"
    Write-Host "  Tear-down : docker rm -f $containerName"
    exit 7
}

Write-Host "=== OK drizzle-kit migrate ===" -ForegroundColor Green
Write-Host "Contenu drizzle.__drizzle_migrations :" -ForegroundColor Cyan
docker exec `
    -e PGPASSWORD=$pgPassword `
    $containerName `
    psql -U $pgUser -d $pgDb -c `
    "SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id;"

# --- 10. Tear-down -------------------------------------------------
Write-Host ""
if ($Keep) {
    Write-Host "[INFO] -Keep posé -> container '$containerName' CONSERVÉ." -ForegroundColor Yellow
    Write-Host "  Connexion : $dryrunUrl"
    Write-Host "  Stop      : docker rm -f $containerName"
} else {
    Write-Host "Tear-down container '$containerName'..." -ForegroundColor Cyan
    docker rm -f $containerName | Out-Null
    Write-Host "  Container détruit." -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Dry-run terminé OK ===" -ForegroundColor Green
Write-Host "Étape suivante : revue CTO Sophie -> étape 3 (apply prod par Steve)." -ForegroundColor Cyan
exit 0
