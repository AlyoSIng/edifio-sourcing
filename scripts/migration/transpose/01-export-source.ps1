# =============================================================================
# 01-export-source.ps1 - Export des donnees prod Sourcing (bascule monorepo 14/06)
# =============================================================================
# Produit dans backups/ :
#   - sourcing-data.sql            : pg_dump data-only PLAIN du schema public,
#                                    --quote-all-identifiers, SANS users /
#                                    memberships / organizations (identity a part)
#   - identity-organizations.csv   : COPY (SELECT ...) des organizations (toutes colonnes)
#   - identity-users.csv           : public.users (sans fixtures e2e)
#   - identity-memberships.csv     : public.memberships (sans fixtures e2e)
#   - identity-auth-users.csv      : auth.users (id, email, encrypted_password,
#                                    email_confirmed_at, raw_user_meta_data, created_at)
#   - counts-source.csv            : count(*) des 49 tables (reference assertions 05)
#
# LECTURE SEULE sur la source. Aucune ecriture BDD.
#
# Connexion (runbook bascule 14/06, garde-fou n.1) : Session Pooler IPv4 port 5432,
# user postgres.<project-ref>. PAS la Direct connection (IPv6-only depuis Docker
# Windows), PAS le transaction pooler 6543.
#
#   $env:PGHOST     = "aws-0-eu-west-1.pooler.supabase.com"
#   $env:PGPORT     = "5432"
#   $env:PGUSER     = "postgres.loogmtltwkhvczdiurqs"
#   $env:PGDATABASE = "postgres"
#   $env:PGPASSWORD = "<1Password>"   # pose par Steve dans SA session
#
#   .\scripts\migration\transpose\01-export-source.ps1 -UseDocker
#
# ASCII only (PS 5.1 sans BOM - incident accents 10/06).
# =============================================================================
[CmdletBinding()]
param(
    [switch]$UseDocker,
    [string]$OutDir = "backups",
    [switch]$NonInteractive
)

$ErrorActionPreference = "Stop"

# --- ENV requises ---
$requiredEnv = @("PGHOST", "PGPORT", "PGUSER", "PGDATABASE", "PGPASSWORD")
$missing = @($requiredEnv | Where-Object { -not (Test-Path "Env:$_") })
if ($missing.Count -gt 0) {
    Write-Host "[REFUS] ENV manquantes : $($missing -join ', ')" -ForegroundColor Red
    Write-Host "Poser les PG* (Session Pooler, port 5432) dans CETTE session avant de relancer." -ForegroundColor Yellow
    exit 1
}

# --- Garde-fous connexion ---
if ($env:PGPORT -eq "6543") {
    Write-Host "[REFUS] PGPORT=6543 = transaction pooler. Utiliser le Session Pooler port 5432." -ForegroundColor Red
    exit 1
}
if ($env:PGHOST -like "*pooler.supabase.com" -and $env:PGUSER -notmatch '^postgres\.') {
    Write-Host "[REFUS] Sur le pooler, PGUSER doit etre 'postgres.<project-ref>' (recu '$($env:PGUSER)')." -ForegroundColor Red
    exit 1
}

# --- Confirmation cible (garde par cible, incident e2e 10/06) ---
Write-Host "[INFO] SOURCE export : $($env:PGUSER)@$($env:PGHOST):$($env:PGPORT)/$($env:PGDATABASE)" -ForegroundColor Cyan
if (-not $NonInteractive) {
    $answer = Read-Host "Confirmer que cette cible est bien la SOURCE Sourcing (taper EXPORT-CONFIRMER)"
    if ($answer -ne "EXPORT-CONFIRMER") {
        Write-Host "[ABANDON] Confirmation refusee." -ForegroundColor Red
        exit 1
    }
}

# --- Chemins ---
$repoRoot = (Get-Item $PSScriptRoot).Parent.Parent.Parent.FullName
$absOutDir = Join-Path $repoRoot $OutDir
New-Item -ItemType Directory -Path $absOutDir -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $repoRoot "logs") -Force | Out-Null

# --- Liste canonique des 49 tables ---
$tablesFile = Join-Path $PSScriptRoot "sourcing-tables.txt"
$tables = @(Get-Content $tablesFile | Where-Object { $_ -and ($_ -notmatch '^\s*#') } | ForEach-Object { $_.Trim() })
if ($tables.Count -ne 49) {
    Write-Host "[REFUS] sourcing-tables.txt : 49 tables attendues, $($tables.Count) lues." -ForegroundColor Red
    exit 1
}

# --- Helpers d'execution (local ou docker) ---
function Invoke-PgDump {
    param([string[]]$DumpArgs, [string]$LocalOutFile, [string]$DockerOutFile)
    if ($UseDocker) {
        $cliArgs = @("run", "--rm", "--env", "PGPASSWORD=$env:PGPASSWORD",
                  "-v", "${absOutDir}:/b", "postgres:17", "pg_dump",
                  "--host=$env:PGHOST", "--port=$env:PGPORT",
                  "--username=$env:PGUSER", "--dbname=$env:PGDATABASE") + $DumpArgs + @("--file=$DockerOutFile")
        & docker @cliArgs
    } else {
        if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) {
            Write-Host "[ERREUR] pg_dump introuvable. Relancer avec -UseDocker." -ForegroundColor Red
            exit 1
        }
        $cliArgs = @("--host=$env:PGHOST", "--port=$env:PGPORT",
                  "--username=$env:PGUSER", "--dbname=$env:PGDATABASE") + $DumpArgs + @("--file=$LocalOutFile")
        & pg_dump @cliArgs
    }
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERREUR] pg_dump KO (exit $LASTEXITCODE). STOP." -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

function Invoke-PsqlCopy {
    param([string]$Query, [string]$CsvName)
    # \copy client-side : le chemin de sortie depend du mode (montage /b en docker).
    if ($UseDocker) {
        $copyCmd = "\copy ($Query) TO '/b/$CsvName' WITH (FORMAT csv, HEADER true)"
        $cliArgs = @("run", "--rm", "--env", "PGPASSWORD=$env:PGPASSWORD",
                  "-v", "${absOutDir}:/b", "postgres:17", "psql",
                  "-h", $env:PGHOST, "-p", $env:PGPORT, "-U", $env:PGUSER, "-d", $env:PGDATABASE,
                  "--no-psqlrc", "--set=ON_ERROR_STOP=1", "-c", $copyCmd)
        & docker @cliArgs
    } else {
        if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
            Write-Host "[ERREUR] psql introuvable. Relancer avec -UseDocker." -ForegroundColor Red
            exit 1
        }
        $outPath = (Join-Path $absOutDir $CsvName) -replace '\\', '/'
        $copyCmd = "\copy ($Query) TO '$outPath' WITH (FORMAT csv, HEADER true)"
        & psql -h $env:PGHOST -p $env:PGPORT -U $env:PGUSER -d $env:PGDATABASE --no-psqlrc --set=ON_ERROR_STOP=1 -c $copyCmd
    }
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERREUR] export $CsvName KO (exit $LASTEXITCODE). STOP." -ForegroundColor Red
        exit $LASTEXITCODE
    }
    Write-Host "[OK] $CsvName" -ForegroundColor Green
}

# =============================================================================
# 1. Dump data-only PLAIN (49 tables) - sans identity
#    PLAIN (pas -Fc) : requis par 02-transform.ps1 (rewrite textuel public->sourcing).
#    --quote-all-identifiers : fiabilise le pattern de rewrite (COPY "public"."x").
# =============================================================================
Write-Host ""
Write-Host "[1/6] pg_dump data-only public.* (hors users/memberships/organizations)..." -ForegroundColor Cyan
Invoke-PgDump `
    -DumpArgs @("--data-only", "--no-owner", "--no-acl", "--schema=public",
                "--quote-all-identifiers",
                "--exclude-table=public.users",
                "--exclude-table=public.memberships",
                "--exclude-table=public.organizations") `
    -LocalOutFile (Join-Path $absOutDir "sourcing-data.sql") `
    -DockerOutFile "/b/sourcing-data.sql"
Write-Host "[OK] sourcing-data.sql" -ForegroundColor Green

# =============================================================================
# 2-5. CSV identity (fixtures e2e exclues defensivement - purge du 10/06 deja faite)
# =============================================================================
Write-Host "[2/6] identity-organizations.csv..." -ForegroundColor Cyan
Invoke-PsqlCopy -CsvName "identity-organizations.csv" -Query (
    "SELECT id, name, siren, siret, odoo_config, subscription_tier, logo_url, " +
    "primary_color, font_family, trial_started_at, trial_ends_at, subscription_status, " +
    "stripe_customer_id, created_at, updated_at FROM public.organizations ORDER BY created_at")

Write-Host "[3/6] identity-users.csv..." -ForegroundColor Cyan
Invoke-PsqlCopy -CsvName "identity-users.csv" -Query (
    "SELECT id, email, firstname, lastname, created_at, architect_notifications_seen_at " +
    "FROM public.users WHERE email NOT LIKE 'e2e-test+%' ORDER BY created_at")

Write-Host "[4/6] identity-memberships.csv..." -ForegroundColor Cyan
Invoke-PsqlCopy -CsvName "identity-memberships.csv" -Query (
    "SELECT m.organization_id, m.user_id, m.role, m.created_at FROM public.memberships m " +
    "JOIN public.users u ON u.id = m.user_id WHERE u.email NOT LIKE 'e2e-test+%' ORDER BY m.created_at")

Write-Host "[5/6] identity-auth-users.csv (hashes preserves)..." -ForegroundColor Cyan
Invoke-PsqlCopy -CsvName "identity-auth-users.csv" -Query (
    "SELECT id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at " +
    "FROM auth.users WHERE email NOT LIKE 'e2e-test+%' AND deleted_at IS NULL ORDER BY created_at")

# =============================================================================
# 6. Counts source (reference pour 05-assertions.sql, assertion A1)
# =============================================================================
Write-Host "[6/6] counts-source.csv..." -ForegroundColor Cyan
$countParts = $tables | ForEach-Object { "SELECT '$_'::text AS table_name, count(*) AS source_count FROM public.""$_""" }
$countQuery = ($countParts -join " UNION ALL ") + " ORDER BY table_name"
Invoke-PsqlCopy -CsvName "counts-source.csv" -Query $countQuery

# =============================================================================
# Rapport
# =============================================================================
Write-Host ""
Write-Host "=== EXPORT TERMINE ===" -ForegroundColor Green
$expected = @("sourcing-data.sql", "identity-organizations.csv", "identity-users.csv",
              "identity-memberships.csv", "identity-auth-users.csv", "counts-source.csv")
foreach ($f in $expected) {
    $p = Join-Path $absOutDir $f
    if (-not (Test-Path $p)) {
        Write-Host "[ERREUR] Fichier attendu absent : $f" -ForegroundColor Red
        exit 1
    }
    $kb = [math]::Round((Get-Item $p).Length / 1KB, 1)
    Write-Host ("  {0,-30} {1,10} KB" -f $f, $kb)
}
# Sanity : 4 users reels attendus (3 AlyoS + 1 PROTECT) -> 5 lignes avec le header
$authLines = @(Get-Content (Join-Path $absOutDir "identity-auth-users.csv")).Count
Write-Host "  identity-auth-users.csv : $($authLines - 1) user(s) (attendu : 4 en prod)" -ForegroundColor Yellow
Write-Host ""
Write-Host "[NEXT] .\scripts\migration\transpose\02-transform.ps1" -ForegroundColor Cyan
