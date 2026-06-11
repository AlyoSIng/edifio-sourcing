# =============================================================================
# 04-load-data.ps1 - Chargement dans la BDD MONOREPO (bascule 14/06)
# =============================================================================
# Enchaine, dans UNE SEULE transaction psql (--single-transaction) :
#   1. 03-identity-and-billing.sql   (orgs, auth.users, identities, profiles, billing)
#   2. load-counts.gen.sql           (genere ici : sourcing.migration_source_counts
#                                     depuis counts-source.csv, pour l'assertion A1)
#   3. sourcing-data.transformed.sql (TRUNCATE + COPY des 49 tables sourcing.*)
#
# Toute erreur => ROLLBACK COMPLET (rien n'est a moitie charge). Seule exception
# structurelle : si on rejoue apres un run REUSSI, les ON CONFLICT de 03 et le
# TRUNCATE du fichier de donnees rendent le tout idempotent (critere GO P1 :
# 2 runs consecutifs = memes assertions).
#
# TRIGGERS PENDANT LE COPY : le fichier transforme pose
# session_replication_role = replica (desactive triggers utilisateur ET
# validation FK - l'ordre du dump n'est pas FK-safe). IMPLICATION : les FK des
# donnees chargees ne sont validees par Postgres NI au COPY NI au COMMIT ->
# l'assertion A8 de 05-assertions.sql (anti-jointures sur toutes les FK du
# schema sourcing) est OBLIGATOIRE avant de declarer l'etape 4 du runbook OK.
# La phase identity (03) tourne AVANT ce SET : FK et trigger handle_new_user
# restent actifs sur auth.users/profiles (voulu).
#
# GARDES PAR CIBLE (incident P0 CI e2e 10/06) :
#   - refuse loogmtltwkhvczdiurqs (prod Sourcing = JAMAIS une cible d'ecriture)
#   - affiche la cible et exige la saisie de PROD-CONFIRMER
#     (-AllowLocal saute la confirmation pour localhost/127.0.0.1/host.docker.internal)
#
# Connexion : Session Pooler monorepo (Paris) -
#   $env:PGHOST = "aws-0-eu-west-3.pooler.supabase.com" ; $env:PGPORT = "5432"
#   $env:PGUSER = "postgres.<MONOREPO-REF>" ; $env:PGDATABASE = "postgres"
#   $env:PGPASSWORD = "<1Password>"   # pose par Steve dans SA session
#
# ASCII only (PS 5.1 sans BOM - incident accents 10/06).
# =============================================================================
[CmdletBinding()]
param(
    [switch]$UseDocker,
    [string]$OutDir = "backups",
    [switch]$AllowLocal
)

$ErrorActionPreference = "Stop"

# --- ENV requises ---
$requiredEnv = @("PGHOST", "PGPORT", "PGUSER", "PGDATABASE", "PGPASSWORD")
$missing = @($requiredEnv | Where-Object { -not (Test-Path "Env:$_") })
if ($missing.Count -gt 0) {
    Write-Host "[REFUS] ENV manquantes : $($missing -join ', ')" -ForegroundColor Red
    exit 1
}

# --- Gardes cible ---
if ("$($env:PGHOST)$($env:PGUSER)" -match "loogmtltwkhvczdiurqs") {
    Write-Host "[REFUS] La cible designe la prod SOURCING (loogmtltwkhvczdiurqs)." -ForegroundColor Red
    Write-Host "        Ce script ECRIT : la cible doit etre la BDD monorepo (ou le banc local)." -ForegroundColor Red
    exit 1
}
if ($env:PGPORT -eq "6543") {
    Write-Host "[REFUS] PGPORT=6543 = transaction pooler. Session Pooler port 5432 obligatoire." -ForegroundColor Red
    exit 1
}
$localHosts = @("localhost", "127.0.0.1", "host.docker.internal")
$isLocal = $localHosts -contains $env:PGHOST
Write-Host "[CIBLE] ECRITURE sur : $($env:PGUSER)@$($env:PGHOST):$($env:PGPORT)/$($env:PGDATABASE)" -ForegroundColor Yellow
if ($isLocal -and $AllowLocal) {
    Write-Host "[INFO] Cible locale + -AllowLocal : confirmation sautee (banc de dry-run)." -ForegroundColor Cyan
} else {
    $answer = Read-Host "Cette cible va etre MODIFIEE (identity + TRUNCATE/COPY sourcing.*). Taper PROD-CONFIRMER"
    if ($answer -ne "PROD-CONFIRMER") {
        Write-Host "[ABANDON] Confirmation refusee." -ForegroundColor Red
        exit 1
    }
}

# --- Chemins + fichiers requis ---
$repoRoot = (Get-Item $PSScriptRoot).Parent.Parent.Parent.FullName
$absOutDir = Join-Path $repoRoot $OutDir
$logsDir = Join-Path $repoRoot "logs"
# logs/ AVANT tout pipeline (garde-fou n.2 du runbook - Tee silencieusement KO le 10/06)
New-Item -ItemType Directory -Path $logsDir -Force | Out-Null

$identitySql = Join-Path $PSScriptRoot "03-identity-and-billing.sql"
$dataSql = Join-Path $absOutDir "sourcing-data.transformed.sql"
$requiredFiles = @(
    $identitySql,
    $dataSql,
    (Join-Path $absOutDir "identity-organizations.csv"),
    (Join-Path $absOutDir "identity-users.csv"),
    (Join-Path $absOutDir "identity-memberships.csv"),
    (Join-Path $absOutDir "identity-auth-users.csv"),
    (Join-Path $absOutDir "counts-source.csv")
)
$absent = @($requiredFiles | Where-Object { -not (Test-Path $_) })
if ($absent.Count -gt 0) {
    Write-Host "[REFUS] Fichier(s) manquant(s) (lancer 01 puis 02 d'abord) :" -ForegroundColor Red
    $absent | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    exit 1
}

# --- Generation de load-counts.gen.sql (chemins relatifs -> cwd = backups/) ---
# Table de reference pour l'assertion A1 de 05-assertions.sql. Elle vit dans le
# schema sourcing SANS RLS : 05 l'exclut explicitement de l'assertion A9 et le
# README prevoit son DROP post-validation.
$genSql = Join-Path $absOutDir "load-counts.gen.sql"
@(
    "-- Genere par 04-load-data.ps1 le $(Get-Date -Format 'yyyy-MM-dd HH:mm') - NE PAS EDITER",
    "CREATE TABLE IF NOT EXISTS sourcing.migration_source_counts (",
    "  table_name text PRIMARY KEY,",
    "  source_count bigint NOT NULL",
    ");",
    "TRUNCATE sourcing.migration_source_counts;",
    "\copy sourcing.migration_source_counts FROM 'counts-source.csv' WITH (FORMAT csv, HEADER true)"
) | Out-File -FilePath $genSql -Encoding ascii

# --- Execution : une session psql, une transaction ---
$stamp = Get-Date -Format "yyyyMMdd-HHmm"
$logFile = Join-Path $logsDir "transpose-load-$stamp.log"
Write-Host ""
Write-Host "[RUN] psql --single-transaction (03 -> counts -> donnees). Log : $logFile" -ForegroundColor Cyan

if ($UseDocker) {
    $cliArgs = @("run", "--rm", "--env", "PGPASSWORD=$env:PGPASSWORD",
              "-v", "${absOutDir}:/b",
              "-v", "${PSScriptRoot}:/s",
              "-w", "/b",                       # \copy relatifs resolus dans backups/
              "postgres:17", "psql",
              "-h", $env:PGHOST, "-p", $env:PGPORT, "-U", $env:PGUSER, "-d", $env:PGDATABASE,
              "--no-psqlrc", "--set=ON_ERROR_STOP=1", "--single-transaction",
              "-f", "/s/03-identity-and-billing.sql",
              "-f", "/b/load-counts.gen.sql",
              "-f", "/b/sourcing-data.transformed.sql")
    # PIEGE PS 5.1 (vu au 1er run 11/06) : `*>&1 | Out-File` avec
    # $ErrorActionPreference=Stop transforme chaque ligne stderr de psql
    # (WARNING/NOTICE legitimes) en NativeCommandError FATALE qui tue le
    # pipeline ET psql en plein vol. Fix : EA=Continue le temps de l'appel
    # + stringification explicite des ErrorRecords avant Out-File.
    $prevEA = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & docker @cliArgs 2>&1 | ForEach-Object { "$_" } | Out-File -FilePath $logFile -Encoding utf8
    } finally {
        $ErrorActionPreference = $prevEA
    }
} else {
    if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
        Write-Host "[ERREUR] psql introuvable. Relancer avec -UseDocker." -ForegroundColor Red
        exit 1
    }
    Push-Location $absOutDir   # \copy relatifs resolus dans backups/
    $prevEA = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & psql -h $env:PGHOST -p $env:PGPORT -U $env:PGUSER -d $env:PGDATABASE `
            --no-psqlrc --set=ON_ERROR_STOP=1 --single-transaction `
            -f $identitySql -f $genSql -f $dataSql 2>&1 | ForEach-Object { "$_" } | Out-File -FilePath $logFile -Encoding utf8
    } finally {
        $ErrorActionPreference = $prevEA
        Pop-Location
    }
}
$exit = $LASTEXITCODE

Write-Host "--- 25 dernieres lignes du log ---" -ForegroundColor Gray
Get-Content $logFile -Tail 25 | ForEach-Object { Write-Host "  $_" }

if ($exit -ne 0) {
    Write-Host ""
    Write-Host "[ECHEC] psql exit $exit - ROLLBACK automatique (transaction unique)." -ForegroundColor Red
    Write-Host "        Voir $logFile. Cas R2 du runbook si on est dimanche." -ForegroundColor Red
    Write-Host "        NB : des auth.users inseres lors d'un PRECEDENT run reussi ne sont pas" -ForegroundColor Yellow
    Write-Host "        annules par ce rollback-ci (procedure de nettoyage : runbook Annexe A, R2)." -ForegroundColor Yellow
    exit $exit
}

Write-Host ""
Write-Host "[OK] Chargement termine et COMMIT." -ForegroundColor Green
Write-Host "[NEXT] Executer 05-assertions.sql (psql -f ou SQL Editor, mono-bloc DO) :" -ForegroundColor Cyan
Write-Host "       l'assertion A8 (FK orphelines) est OBLIGATOIRE car le COPY a tourne" -ForegroundColor Cyan
Write-Host "       en session_replication_role = replica (FK non verifiees)." -ForegroundColor Cyan
