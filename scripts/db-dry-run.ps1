<#
.SYNOPSIS
    Dry-run Postgres local des migrations Drizzle + seed dev/CI.

.DESCRIPTION
    Lance un container postgres:15 ephemere sur le port 5433 (pour ne pas
    collisionner avec un Supabase local eventuel sur 5432), y installe pgtap,
    pose le stub auth.users (Supabase), applique les extensions + toutes les
    migrations Drizzle dans l'ordre du journal (`src/db/migrations/meta/_journal.json`),
    puis optionnellement le seed dev/CI et la suite pgTAP.

    Le but : attraper les bugs Postgres runtime (predicats d'index non-IMMUTABLE,
    extensions manquantes, FK cross-schema, RLS) AVANT le push. La suite locale
    `tsc + lint + vitest` ne couvre pas ce surface -- cf. memory
    `feedback-postgres-dry-run-local` et incident PR #14 (SQLSTATE 42P17 sur
    `idx_tenders_deadline WHERE deadline > now()`).

.PARAMETER ImageTag
    Image Docker Postgres. Default `postgres:15`.

.PARAMETER ContainerName
    Nom du container. Default `edifio-pg-dry`. Reutilisable si KeepRunning.

.PARAMETER Port
    Port host. Default 5433 (5432 est reserve a Supabase local).

.PARAMETER SkipSeed
    Saute l'execution du seed (`pnpm db:seed` equivalent).

.PARAMETER SkipPgTap
    Saute la suite pgTAP (`pg_prove tests/rls/`). Necessite pg_prove cote host
    si non specifie -- si pg_prove absent, le script l'avertit et continue.

.PARAMETER KeepRunning
    Ne pas stopper le container a la fin. Utile pour debugger l'etat de la DB
    via `psql -h localhost -p 5433 -U postgres`. Penser a faire
    `docker stop edifio-pg-dry` manuellement.

.EXAMPLE
    .\scripts\db-dry-run.ps1
    Suite complete : migrations + seed + pgTAP (si pg_prove dispo).

.EXAMPLE
    .\scripts\db-dry-run.ps1 -SkipSeed -SkipPgTap -KeepRunning
    Migrations seules, container reste up pour inspection manuelle.

.NOTES
    Pas d'installation logicielle systeme (Docker requis, mais deja en place
    sur le poste). Pas d'effet sur la BDD prod / Supabase managed.
    Idempotent : relancer le script supprime le container precedent.
#>

[CmdletBinding()]
param(
    [string]$ImageTag = "postgres:15",
    [string]$ContainerName = "edifio-pg-dry",
    [int]$Port = 5433,
    [switch]$SkipSeed,
    [switch]$SkipPgTap,
    [switch]$KeepRunning
)

$ErrorActionPreference = "Stop"

# ----------------------------------------------------------------------------
# Helpers de presentation -- pas un logger fancy, juste de la lisibilite
# ----------------------------------------------------------------------------
function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "    OK -- $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "    WARN -- $msg" -ForegroundColor Yellow }
function Write-Fail($msg) { Write-Host "    FAIL -- $msg" -ForegroundColor Red }

# ----------------------------------------------------------------------------
# Pre-flight
# ----------------------------------------------------------------------------
Write-Step "Pre-flight"

# Docker dispo ?
$null = & docker --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Fail "Docker introuvable. Installer Docker Desktop puis relancer."
    exit 1
}
Write-Ok "Docker present"

# Verifier qu'on est bien a la racine du repo edifio-sourcing
if (-not (Test-Path "src/db/migrations/meta/_journal.json")) {
    Write-Fail "Lancer ce script depuis la racine du repo (src/db/migrations/meta/_journal.json introuvable)."
    exit 1
}
Write-Ok "Racine repo OK"

# Verifier que node_modules existe (besoin de tsx + drizzle-kit pour les migrations)
if (-not (Test-Path "node_modules/.bin/tsx")) {
    Write-Fail "node_modules absent ou incomplet. Lancer `corepack pnpm install --frozen-lockfile` d'abord."
    exit 1
}
Write-Ok "node_modules OK"

# ----------------------------------------------------------------------------
# Cleanup eventuel container precedent
# ----------------------------------------------------------------------------
Write-Step "Cleanup container precedent (si existant)"
$existing = & docker ps -aq --filter "name=^/$ContainerName$" 2>$null
if ($existing) {
    & docker rm -f $ContainerName | Out-Null
    Write-Ok "Container precedent $ContainerName supprime"
} else {
    Write-Ok "Aucun container precedent"
}

# ----------------------------------------------------------------------------
# Demarrage container
# ----------------------------------------------------------------------------
Write-Step "Demarrage container $ImageTag sur port $Port"
$runArgs = @(
    "run", "-d",
    "--name", $ContainerName,
    "-e", "POSTGRES_PASSWORD=postgres",
    "-e", "POSTGRES_DB=postgres",
    "-p", "${Port}:5432",
    $ImageTag
)
$containerId = & docker @runArgs
if ($LASTEXITCODE -ne 0) {
    Write-Fail "docker run a echoue"
    exit 1
}
Write-Ok "Container demarre : $($containerId.Substring(0, 12))"

# ----------------------------------------------------------------------------
# Cleanup garanti en cas d'echec (sauf KeepRunning)
# ----------------------------------------------------------------------------
$cleanup = {
    if (-not $KeepRunning) {
        Write-Step "Cleanup container $ContainerName"
        & docker rm -f $ContainerName 2>&1 | Out-Null
        Write-Ok "Container stoppe et supprime"
    } else {
        Write-Warn "KeepRunning specifie -- container $ContainerName toujours en cours"
        Write-Warn "Penser a `docker stop $ContainerName` quand termine"
    }
}

try {
    # ------------------------------------------------------------------------
    # Wait for Postgres ready
    # ------------------------------------------------------------------------
    Write-Step "Attente pg_isready (timeout 30s)"
    $deadline = (Get-Date).AddSeconds(30)
    $ready = $false
    while ((Get-Date) -lt $deadline) {
        & docker exec $ContainerName pg_isready -U postgres 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Milliseconds 500
    }
    if (-not $ready) {
        Write-Fail "Postgres pas ready apres 30s"
        & cleanup
        exit 1
    }
    Write-Ok "Postgres ready"

    # ------------------------------------------------------------------------
    # Install pgtap dans le container (necessaire pour CREATE EXTENSION pgtap)
    # ------------------------------------------------------------------------
    Write-Step "Install postgresql-15-pgtap dans le container (PGDG)"
    & docker exec $ContainerName bash -c "apt-get update -qq && apt-get install -y -qq postgresql-15-pgtap" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "apt-get install postgresql-15-pgtap a echoue dans le container"
        & cleanup
        exit 1
    }
    Write-Ok "pgtap installe cote container"

    # ------------------------------------------------------------------------
    # Stub Supabase (schema auth + users + auth.jwt() referencee par RLS)
    # ------------------------------------------------------------------------
    Write-Step "Stub Supabase auth.users + auth.jwt() + activation pgtap"
    $stubSql = @"
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, email text);
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb AS `$`$
  SELECT NULLIF(current_setting('request.jwt.claims', true), '')::jsonb
`$`$ LANGUAGE sql STABLE;
CREATE EXTENSION IF NOT EXISTS pgtap;
"@
    $stubSql | & docker exec -i $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Stub auth + pgtap a echoue"
        & cleanup
        exit 1
    }
    Write-Ok "auth.users + pgtap actifs"

    # ------------------------------------------------------------------------
    # Migrations Drizzle via le pipeline natif (lit le journal _journal.json)
    # ------------------------------------------------------------------------
    Write-Step "Migrations Drizzle (extensions + journal complet)"
    $env:DATABASE_URL = "postgres://postgres:postgres@localhost:${Port}/postgres"
    & "./node_modules/.bin/tsx" src/db/migrate.ts
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Migrations Drizzle ont echoue (cf. logs ci-dessus)"
        & cleanup
        exit 1
    }
    Write-Ok "Migrations appliquees"

    # ------------------------------------------------------------------------
    # Seed dev/CI (optionnel)
    # ------------------------------------------------------------------------
    if (-not $SkipSeed) {
        Write-Step "Seed dev/CI (2 orgs + 200 tenders + fixture BOAMP reelle)"
        & "./node_modules/.bin/tsx" src/db/seed/index.ts
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "Seed a echoue (cf. logs ci-dessus)"
            & cleanup
            exit 1
        }
        Write-Ok "Seed applique"
    } else {
        Write-Warn "SkipSeed -- skipping pnpm db:seed"
    }

    # ------------------------------------------------------------------------
    # Suite pgTAP (optionnel)
    # ------------------------------------------------------------------------
    if (-not $SkipPgTap) {
        Write-Step "Suite pgTAP (tests/rls/)"
        $pgProve = & where.exe pg_prove 2>$null
        if ($LASTEXITCODE -ne 0 -or -not $pgProve) {
            Write-Warn "pg_prove introuvable cote host -- skipping (installer PGDG ou utiliser -SkipPgTap)"
        } else {
            $env:PGPASSWORD = "postgres"
            & pg_prove --host localhost --port $Port --username postgres --dbname postgres --ext .sql tests/rls/
            if ($LASTEXITCODE -ne 0) {
                Write-Fail "pgTAP a detecte des regressions"
                & cleanup
                exit 1
            }
            Write-Ok "pgTAP suite OK"
        }
    } else {
        Write-Warn "SkipPgTap -- skipping pgTAP suite"
    }

    Write-Host ""
    Write-Host "==> SUCCESS -- dry-run complet" -ForegroundColor Green
    if ($KeepRunning) {
        Write-Host "    Container $ContainerName toujours up sur port $Port" -ForegroundColor Yellow
        Write-Host "    Pour inspecter : psql -h localhost -p $Port -U postgres postgres" -ForegroundColor Yellow
        Write-Host "    Pour stopper   : docker rm -f $ContainerName" -ForegroundColor Yellow
    }
}
finally {
    & $cleanup
}
