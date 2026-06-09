<#
.SYNOPSIS
    Verifie automatiquement que les migrations 0050-0053 sont en place ET que
    les invariants critiques (FORCE RLS, helpers SECURITY DEFINER, policies,
    suppressions post-0053) sont respectes.

.DESCRIPTION
    Wrapper PowerShell autour de scripts/migration/verify-post-deploy.sql.

    Read-only : ne modifie RIEN dans la BDD cible. Peut etre relance autant de
    fois que necessaire (apres apply preview, apres apply prod, dans la CI).

    Pipeline :
      1. Pre-flight ENV vars (PGHOST/PGPORT/PGUSER/PGDATABASE/PGPASSWORD).
      2. Garde-fous Direct connection (port 5432, pas 6543 pooler).
      3. Lance verify-post-deploy.sql via psql local OU container Docker
         postgres:15.
      4. Parse la sortie : compte NOTICE OK / RAISE EXCEPTION.
      5. Affiche un recap colore + code retour 0 (OK) ou 1 (KO).

    Code retour adapte a la CI : 0 = tous invariants OK, 1 = au moins une
    assertion echoue, 2 = erreur de configuration (ENV vars manquantes, psql
    introuvable, etc.).

.PARAMETER UseDocker
    Si present, utilise un container postgres:15 ephemere pour psql au lieu
    du binaire local. Utile si psql n'est pas dans le PATH.

.PARAMETER Environment
    Etiquette informative pour le recap : 'preview' (defaut) ou 'prod'.
    N'a aucun effet sur la connexion (qui est entierement determinee par
    les ENV vars PG*).

.NOTES
    Auteur : Yann (ps_operator) -- prepare pour bascule 10 juin 2026.
    Pendant : MEMORY > feedback_ops_prod_user_runs_migration.md.
    Le script ne LIT ni LOGGE jamais $env:PGPASSWORD.

.EXAMPLE
    # Apres apply prod (ENV vars prod posees) :
    .\scripts\migration\run-post-deploy-verify.ps1 -Environment prod
    # Doit afficher : "Toutes les assertions post-deploy OK"

.EXAMPLE
    # Sans psql local, via Docker :
    .\scripts\migration\run-post-deploy-verify.ps1 -UseDocker
#>

[CmdletBinding()]
param(
    [ValidateSet('preview', 'prod')]
    [string]$Environment = 'preview',

    [switch]$UseDocker
)

$ErrorActionPreference = 'Stop'

# ----------------------------------------------------------------------------
# Helpers d'affichage
# ----------------------------------------------------------------------------
function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "    OK   $msg" -ForegroundColor Green }
function Write-Info($msg) { Write-Host "    INFO $msg" -ForegroundColor Gray }
function Write-Warn($msg) { Write-Host "    WARN $msg" -ForegroundColor Yellow }
function Write-Fail($msg) { Write-Host "    FAIL $msg" -ForegroundColor Red }

$RepoRoot   = (Get-Item $PSScriptRoot).Parent.Parent.FullName
$VerifySql  = Join-Path $RepoRoot 'scripts\migration\verify-post-deploy.sql'

# ----------------------------------------------------------------------------
# Pre-flight 1 : fichier SQL present
# ----------------------------------------------------------------------------
if (-not (Test-Path $VerifySql)) {
    Write-Fail "Fichier introuvable : $VerifySql"
    exit 2
}

# ----------------------------------------------------------------------------
# Pre-flight 2 : ENV vars
# ----------------------------------------------------------------------------
Write-Step "Pre-flight ENV vars"

$requiredEnv = @('PGHOST', 'PGPORT', 'PGUSER', 'PGDATABASE', 'PGPASSWORD')
$missing = @()
foreach ($var in $requiredEnv) {
    if (-not (Test-Path "Env:$var")) { $missing += $var }
}
if ($missing.Count -gt 0) {
    Write-Fail "Variables d'environnement manquantes : $($missing -join ', ')"
    Write-Host ""
    Write-Host "Avant de relancer, poser les vars dans CETTE session PowerShell :" -ForegroundColor Yellow
    Write-Host '  $env:PGHOST     = "db.<project-ref>.supabase.co"  # Direct connection' -ForegroundColor Cyan
    Write-Host '  $env:PGPORT     = "5432"' -ForegroundColor Cyan
    Write-Host '  $env:PGUSER     = "postgres"' -ForegroundColor Cyan
    Write-Host '  $env:PGDATABASE = "postgres"' -ForegroundColor Cyan
    Write-Host '  $env:PGPASSWORD = "<depuis 1Password>"     # NE JAMAIS coller dans le chat' -ForegroundColor Cyan
    exit 2
}
Write-Ok "5 ENV vars presentes (PGPASSWORD non affiche)"

# Garde-fous Direct connection
if ($env:PGUSER -match '^postgres\.') {
    Write-Fail "PGUSER='$($env:PGUSER)' ressemble a un user pooler (postgres.<ref>)."
    Write-Warn "Pour les checks RLS / SECURITY DEFINER, utiliser la Direct connection."
    exit 2
}
if ($env:PGPORT -eq '6543') {
    Write-Fail "PGPORT=6543 correspond au pooler PgBouncer."
    Write-Warn "Les checks RLS doivent passer par la Direct connection (port 5432)."
    exit 2
}
Write-Ok "Garde-fous Direct connection : OK (PGUSER='$($env:PGUSER)', PGPORT='$($env:PGPORT)')"

# ----------------------------------------------------------------------------
# Pre-flight 3 : psql local OU Docker dispo
# ----------------------------------------------------------------------------
if ($UseDocker) {
    Write-Step "Pre-flight Docker"
    $null = & docker --version 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Docker indisponible (commande 'docker --version' a echoue)."
        Write-Warn "Demarrer Docker Desktop ou retirer -UseDocker pour utiliser psql local."
        exit 2
    }
    Write-Ok "Docker CLI dispo"

    $null = & docker ps 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Docker daemon ne repond pas ('docker ps' a echoue)."
        Write-Warn "Demarrer Docker Desktop, attendre l'icone verte, puis relancer."
        exit 2
    }
    Write-Ok "Docker daemon repond"
} else {
    $psqlCmd = Get-Command psql -ErrorAction SilentlyContinue
    if (-not $psqlCmd) {
        Write-Fail "psql introuvable dans le PATH."
        Write-Warn "Relancer avec -UseDocker pour utiliser un container postgres:15."
        exit 2
    }
}

# ----------------------------------------------------------------------------
# Recap cible (sans toucher le PGPASSWORD)
# ----------------------------------------------------------------------------
Write-Step "Cible de verification"
Write-Host "    Environment : $Environment" -ForegroundColor Yellow
Write-Host "    Host        : $($env:PGHOST)" -ForegroundColor Yellow
Write-Host "    User        : $($env:PGUSER)" -ForegroundColor Yellow
Write-Host "    Database    : $($env:PGDATABASE)" -ForegroundColor Yellow
Write-Host "    SQL file    : $VerifySql" -ForegroundColor Yellow
Write-Host ""

# ----------------------------------------------------------------------------
# Execution du SQL
# ----------------------------------------------------------------------------
Write-Step "Execution verify-post-deploy.sql (read-only)"

$psqlArgs = @(
    "--host=$env:PGHOST"
    "--port=$env:PGPORT"
    "--username=$env:PGUSER"
    "--dbname=$env:PGDATABASE"
    "--set=ON_ERROR_STOP=1"
    "--no-psqlrc"
)

$stdoutFile = [IO.Path]::GetTempFileName()
$stderrFile = [IO.Path]::GetTempFileName()
$exitCode   = 0

try {
    if ($UseDocker) {
        # Container ephemere : on pipe le SQL en stdin (-f -), evite les soucis
        # de mount path Windows -> Linux.
        $dockerArgs = @(
            'run', '--rm', '-i',
            '--env', "PGPASSWORD=$env:PGPASSWORD",
            'postgres:15',
            'psql'
        ) + $psqlArgs + @('-f', '-')

        Get-Content -Raw -Path $VerifySql | & docker @dockerArgs `
            1> $stdoutFile 2> $stderrFile
        $exitCode = $LASTEXITCODE
    } else {
        # psql local : -f $VerifySql direct
        $psqlArgs += @('-f', $VerifySql)
        & psql @psqlArgs 1> $stdoutFile 2> $stderrFile
        $exitCode = $LASTEXITCODE
    }

    $stdout = Get-Content -Raw -Path $stdoutFile -ErrorAction SilentlyContinue
    $stderr = Get-Content -Raw -Path $stderrFile -ErrorAction SilentlyContinue

    # Sanitize : masquer PGPASSWORD si jamais il a leak en sortie
    if ($stdout) { $stdout = $stdout -replace [regex]::Escape($env:PGPASSWORD), '***REDACTED***' }
    if ($stderr) { $stderr = $stderr -replace [regex]::Escape($env:PGPASSWORD), '***REDACTED***' }

    # ------------------------------------------------------------------------
    # Affichage sortie SQL (NOTICE + WARNING + ERROR via stderr)
    # ------------------------------------------------------------------------
    Write-Host ""
    Write-Host "--- Sortie psql (stdout) ---" -ForegroundColor DarkGray
    if ($stdout) { Write-Host $stdout }
    Write-Host "--- Sortie psql (stderr -- NOTICE/WARNING/ERROR) ---" -ForegroundColor DarkGray
    if ($stderr) { Write-Host $stderr -ForegroundColor Gray }

    # ------------------------------------------------------------------------
    # Parse : compte les assertions OK et KO
    # ------------------------------------------------------------------------
    # Patterns NOTICE de notre script SQL :
    #   "NOTICE:  A.1 OK : ..."  -> compte comme OK
    #   "NOTICE:  X.Y KO : ..."  -> compte comme KO (mais le RAISE EXCEPTION
    #                                stoppe avant donc rare)
    #   "ERROR:  ... X.Y KO : ..."-> assertion violee (vraie source de verite)
    $combined = ($stdout + "`n" + $stderr)

    $okMatches  = [regex]::Matches($combined, '(?m)NOTICE:\s+([A-Z](?:\.\d+)?)\s+OK\s*:')
    $koMatches  = [regex]::Matches($combined, '(?m)(?:ERROR|FATAL):\s+.*?([A-Z](?:\.\d+)?)\s+KO\s*:')
    $finalOkPat = [regex]::IsMatch($combined, 'Toutes les assertions post-deploy OK')

    $okCount = $okMatches.Count
    $koCount = $koMatches.Count

    Write-Host ""
    Write-Step "Recap assertions"
    Write-Host "    Assertions OK : $okCount" -ForegroundColor Green
    Write-Host "    Assertions KO : $koCount" -ForegroundColor $(if ($koCount -gt 0) { 'Red' } else { 'DarkGray' })
    Write-Host "    Exit psql     : $exitCode" -ForegroundColor $(if ($exitCode -eq 0) { 'Green' } else { 'Red' })

    if ($koCount -gt 0) {
        Write-Host ""
        Write-Host "Detail des assertions KO :" -ForegroundColor Red
        foreach ($m in $koMatches) {
            Write-Host "    - $($m.Value.Trim())" -ForegroundColor Red
        }
    }

    Write-Host ""
    if ($exitCode -eq 0 -and $finalOkPat -and $koCount -eq 0) {
        Write-Host "==================================================" -ForegroundColor Green
        Write-Host " Toutes les assertions post-deploy OK"             -ForegroundColor Green
        Write-Host "==================================================" -ForegroundColor Green
        exit 0
    } else {
        Write-Host "==================================================" -ForegroundColor Red
        Write-Host " $koCount assertion(s) post-deploy ECHOUEE(S)"     -ForegroundColor Red
        Write-Host "==================================================" -ForegroundColor Red
        Write-Warn "Action : NE PAS valider la bascule."
        Write-Warn "Cf. docs/ROLLBACK_PLAN_MIGRATIONS_0050_0053.md pour rollback."
        exit 1
    }
} finally {
    Remove-Item -Force -ErrorAction SilentlyContinue $stdoutFile, $stderrFile
}
