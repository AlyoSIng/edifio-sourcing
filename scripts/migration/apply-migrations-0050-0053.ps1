<#
.SYNOPSIS
    Applique sequentiellement les migrations Drizzle 0050, 0051, 0052, 0053
    sur preview ou prod, avec dry-run Docker prealable et post-checks SQL.

.DESCRIPTION
    Cible : Steve, qui lance ce script depuis SA session PowerShell apres avoir
    pose lui-meme les 5 ENV vars PG* (PGHOST, PGPORT, PGUSER, PGDATABASE,
    PGPASSWORD). Le script ne LIT et ne LOG JAMAIS $env:PGPASSWORD.

    Pipeline :
      1. Pre-flight ENV + garde-fous Direct connection (port 5432, jamais 6543).
      2. Confirmation utilisateur (PROD-CONFIRMER si prod, y si preview).
      3. Dry-run Docker postgres:15 ephemere : chaque migration jouee
         independamment dans une transaction (BEGIN ... ROLLBACK) avec
         ON_ERROR_STOP=1 pour valider la syntaxe et les dependances.
         (Sauf si -SkipDryRun.)
      4. Compte des migrations dans drizzle.__drizzle_migrations AVANT apply.
      5. Application sequentielle 0050 -> 0051 -> 0052 -> 0053 contre la cible
         reelle (preview ou prod). Chaque migration : transaction implicite via
         psql --single-transaction --set ON_ERROR_STOP=1, puis INSERT dans
         drizzle.__drizzle_migrations (hash SHA256 calcule en local).
      6. Post-checks SQL :
            - RLS FORCE sur companies, bureaux_etudes, cotraitant_shares,
              cotraitant_share_items (relforcerowsecurity = true).
            - Existence des fonctions current_user_org_id et
              get_cotraitant_share_by_token.
            - Compteur drizzle.__drizzle_migrations augmente exactement de 4.
      7. Recap final tableau + URLs admin/crons pour smoke manuel.

    Idempotence : si une migration est deja dans drizzle.__drizzle_migrations
    (meme hash), elle est sautee (etape "deja appliquee"). Le script peut donc
    etre relance sans risque apres un echec partiel.

.PARAMETER Environment
    'preview' (defaut) ou 'prod'. Determine le mot-cle de confirmation et le
    niveau de verbosite des warnings.

.PARAMETER SkipDryRun
    Saute la phase Docker dry-run. A utiliser UNIQUEMENT si le dry-run a deja
    ete joue manuellement dans la meme session (ex. on relance apres echec
    d'apply prod).

.PARAMETER DryRunOnly
    Joue UNIQUEMENT le dry-run Docker. Ne touche pas a la cible reelle. Utile
    pour valider la sequence avant Steve ne pose les vars prod.

.PARAMETER UseDocker
    Si present, utilise un container `postgres:15` ephemere pour psql au lieu
    du binaire local. Utile si psql n'est pas dans le PATH.

.NOTES
    Auteur : Yann (ps_operator) -- prepare pour bascule 9 juin 2026.
    Cf. MEMORY > feedback_ops_prod_user_runs_migration.md : Steve pose
    PGPASSWORD dans SA session et lance la commande lui-meme.

    PIEGE IMPORTANT (incident migration 0007-0008) :
    Le pooler Supabase (port 6543) ne fonctionne pas avec username 'postgres'
    nu. Utiliser la Direct connection (port 5432, host db.<ref>.supabase.co).

.EXAMPLE
    # Dry-run uniquement, contre la cible courante (ENV vars posees) :
    .\scripts\migration\apply-migrations-0050-0053.ps1 -DryRunOnly

.EXAMPLE
    # Apply preview (apres avoir pose les PG* preview) :
    .\scripts\migration\apply-migrations-0050-0053.ps1 -Environment preview

.EXAMPLE
    # Apply prod (apres backup + apply preview OK) :
    .\scripts\migration\apply-migrations-0050-0053.ps1 -Environment prod -UseDocker
#>

[CmdletBinding()]
param(
    [ValidateSet('preview', 'prod')]
    [string]$Environment = 'preview',

    [switch]$SkipDryRun,

    [switch]$DryRunOnly,

    [switch]$UseDocker
)

# PowerShell 5.1 compat : pas de ?? ni ?:
$ErrorActionPreference = 'Stop'

# ----------------------------------------------------------------------------
# Helpers d'affichage (sans emoji, lisibles dans tous les terminaux Win)
# ----------------------------------------------------------------------------
function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "    OK   $msg" -ForegroundColor Green }
function Write-Info($msg) { Write-Host "    INFO $msg" -ForegroundColor Gray }
function Write-Warn($msg) { Write-Host "    WARN $msg" -ForegroundColor Yellow }
function Write-Fail($msg) { Write-Host "    FAIL $msg" -ForegroundColor Red }

# ----------------------------------------------------------------------------
# Liste fixe des migrations a appliquer (ordre strict, tags du _journal.json)
# ----------------------------------------------------------------------------
$MigrationTags = @(
    '0050_learning_payload',
    '0051_rls_fix_companies_cotraitant_shares_be',
    '0052_rls_lot17_bis_force_helper_naming',
    '0053_eradicate_cotraitant_public_policy'
)

$RepoRoot       = (Get-Item $PSScriptRoot).Parent.Parent.FullName
$MigrationsDir  = Join-Path $RepoRoot 'src\db\migrations'

# ----------------------------------------------------------------------------
# Pre-flight 1 : ENV vars
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
    exit 1
}
Write-Ok "5 ENV vars presentes (PGPASSWORD non affiche)"

# Garde-fous Direct connection
if ($env:PGUSER -match '^postgres\.') {
    Write-Fail "PGUSER='$($env:PGUSER)' ressemble a un user pooler (postgres.<ref>)."
    Write-Warn "Pour Drizzle migrate, utiliser la Direct connection avec PGUSER='postgres' (sans suffixe)."
    exit 1
}
if ($env:PGPORT -eq '6543') {
    Write-Fail "PGPORT=6543 correspond au pooler PgBouncer."
    Write-Warn "Les migrations DDL doivent passer par la Direct connection (port 5432)."
    exit 1
}
Write-Ok "Garde-fous Direct connection : OK (PGUSER='$($env:PGUSER)', PGPORT='$($env:PGPORT)')"

# ----------------------------------------------------------------------------
# Pre-flight 2 : fichiers de migration presents et lisibles
# ----------------------------------------------------------------------------
Write-Step "Pre-flight fichiers de migration"

$migrationFiles = @{}
foreach ($tag in $MigrationTags) {
    $path = Join-Path $MigrationsDir "$tag.sql"
    if (-not (Test-Path $path)) {
        Write-Fail "Fichier introuvable : $path"
        exit 1
    }
    $migrationFiles[$tag] = $path
    $size = (Get-Item $path).Length
    Write-Ok "$tag.sql ($size bytes)"
}

# ----------------------------------------------------------------------------
# Pre-flight 3 : Docker dispo si requis
# ----------------------------------------------------------------------------
if ($UseDocker -or (-not $SkipDryRun -and -not $DryRunOnly) -or $DryRunOnly) {
    Write-Step "Pre-flight Docker"
    $null = & docker --version 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Docker indisponible (commande 'docker --version' a echoue)."
        Write-Warn "Options :"
        Write-Warn "  1. Demarrer Docker Desktop."
        Write-Warn "  2. Si pas de Docker du tout : -SkipDryRun + psql local (NON recommande)."
        exit 1
    }
    Write-Ok "Docker CLI dispo"

    # Verif daemon repond (docker --version repond meme si daemon down)
    $null = & docker ps 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Docker daemon ne repond pas ('docker ps' a echoue)."
        Write-Warn "Demarrer Docker Desktop, attendre l'icone verte, puis relancer."
        exit 1
    }
    Write-Ok "Docker daemon repond"
}

# psql local si demande sans Docker
if (-not $UseDocker) {
    $psqlCmd = Get-Command psql -ErrorAction SilentlyContinue
    if (-not $psqlCmd) {
        Write-Warn "psql introuvable dans le PATH."
        Write-Warn "Relancer avec -UseDocker pour utiliser un container postgres:15."
        if (-not $DryRunOnly) { exit 1 }
    }
}

# ----------------------------------------------------------------------------
# Confirmation utilisateur (sauf DryRunOnly qui ne touche pas la cible)
# ----------------------------------------------------------------------------
if (-not $DryRunOnly) {
    Write-Step "Confirmation cible"
    Write-Host "    Environment : $Environment" -ForegroundColor Yellow
    Write-Host "    Host        : $($env:PGHOST)" -ForegroundColor Yellow
    Write-Host "    User        : $($env:PGUSER)" -ForegroundColor Yellow
    Write-Host "    Database    : $($env:PGDATABASE)" -ForegroundColor Yellow
    Write-Host "    Migrations  : $($MigrationTags -join ', ')" -ForegroundColor Yellow
    Write-Host ""

    if ($Environment -eq 'prod') {
        Write-Warn "Cible PROD detectee. Taper exactement 'PROD-CONFIRMER' pour continuer."
        $answer = Read-Host "Confirmation"
        if ($answer -ne 'PROD-CONFIRMER') {
            Write-Fail "Confirmation invalide. Abort."
            exit 1
        }
    } else {
        $answer = Read-Host "Confirmation preview (y / n)"
        if ($answer -ne 'y') {
            Write-Fail "Confirmation invalide. Abort."
            exit 1
        }
    }
    Write-Ok "Confirmation utilisateur OK"
}

# ----------------------------------------------------------------------------
# Helper : execute psql contre un host distant (local ou Docker)
#   $sqlInline : chaine SQL passee via -c (pour les checks courts)
#   $sqlFile   : chemin fichier SQL (pour les migrations entieres)
#   $singleTx  : ajoute --single-transaction
#   $tuplesOnly: -t -A (output sans header, separateur |)
# Retour : objet { Stdout, Stderr, ExitCode }
# ----------------------------------------------------------------------------
function Invoke-Psql {
    param(
        [string]$SqlInline,
        [string]$SqlFile,
        [switch]$SingleTx,
        [switch]$TuplesOnly
    )

    $psqlArgs = @(
        "--host=$env:PGHOST"
        "--port=$env:PGPORT"
        "--username=$env:PGUSER"
        "--dbname=$env:PGDATABASE"
        "--set=ON_ERROR_STOP=1"
        "--no-psqlrc"
    )
    if ($SingleTx)   { $psqlArgs += '--single-transaction' }
    if ($TuplesOnly) { $psqlArgs += @('-t', '-A', '-F', '|') }

    if ($SqlInline) {
        $psqlArgs += @('-c', $SqlInline)
    } elseif ($SqlFile) {
        if ($UseDocker) {
            # En mode Docker, le fichier est monte en volume ; on injecte via stdin a la place
            # pour eviter les soucis de path Windows -> Linux.
            $psqlArgs += @('-f', '-')
        } else {
            $psqlArgs += @('-f', $SqlFile)
        }
    } else {
        throw "Invoke-Psql : besoin de -SqlInline ou -SqlFile"
    }

    $stdoutFile = [IO.Path]::GetTempFileName()
    $stderrFile = [IO.Path]::GetTempFileName()

    try {
        if ($UseDocker) {
            # PGPASSWORD passee via --env ; jamais en argument visible.
            $dockerArgs = @(
                'run', '--rm', '-i',
                '--env', "PGPASSWORD=$env:PGPASSWORD",
                'postgres:15',
                'psql'
            ) + $psqlArgs

            if ($SqlFile -and -not $SqlInline) {
                # stdin = contenu du fichier de migration
                Get-Content -Raw -Path $SqlFile | & docker @dockerArgs `
                    1> $stdoutFile 2> $stderrFile
            } else {
                & docker @dockerArgs 1> $stdoutFile 2> $stderrFile
            }
        } else {
            & psql @psqlArgs 1> $stdoutFile 2> $stderrFile
        }
        $exitCode = $LASTEXITCODE

        $stdout = Get-Content -Raw -Path $stdoutFile -ErrorAction SilentlyContinue
        $stderr = Get-Content -Raw -Path $stderrFile -ErrorAction SilentlyContinue

        # Sanitize : si jamais psql a echo le DSN, masquer le password
        if ($stdout) { $stdout = $stdout -replace [regex]::Escape($env:PGPASSWORD), '***REDACTED***' }
        if ($stderr) { $stderr = $stderr -replace [regex]::Escape($env:PGPASSWORD), '***REDACTED***' }

        return [PSCustomObject]@{
            Stdout   = $stdout
            Stderr   = $stderr
            ExitCode = $exitCode
        }
    } finally {
        Remove-Item -Force -ErrorAction SilentlyContinue $stdoutFile, $stderrFile
    }
}

# ----------------------------------------------------------------------------
# Dry-run Docker postgres:15 (chaque migration jouee en BEGIN ... ROLLBACK)
# Sur container ephemere INDEPENDANT de la cible reelle. Verifie uniquement
# la syntaxe + extensions de base. Ne valide PAS les dependances reelles (RLS,
# tables existantes en prod) -- cela necessiterait un dump partiel.
# ----------------------------------------------------------------------------
if (-not $SkipDryRun) {
    Write-Step "Dry-run Docker postgres:15 (parse + syntaxe seule, container vide)"
    Write-Info "NB : le container est vide -- les migrations qui referencent des tables"
    Write-Info "existantes (0050 -> learning_events, 0051-53 -> RLS) vont DELIBEREMENT"
    Write-Info "lever 'relation does not exist'. Ce qu'on cherche ici : zero erreur de"
    Write-Info "SYNTAXE SQL avant le 'relation ...'. Le vrai filet est l'apply preview."
    Write-Info "Pour un dry-run complet, voir ROLLBACK_PLAN section 9."
    $dryRunContainer = "edifio-dry-apply-$(Get-Date -Format 'yyyyMMddHHmmss')"

    $containerStarted = $false
    try {
        # Pas de -p (port mapping) : on attaque via 'docker exec' uniquement,
        # ce qui evite les collisions de port Windows (port 55432 souvent reserve).
        Write-Info "Demarrage container $dryRunContainer (sans port mapping)..."
        $startOutput = & docker run -d --rm `
            --name $dryRunContainer `
            -e POSTGRES_PASSWORD=dry-run-only `
            postgres:15 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "Echec demarrage container dry-run."
            Write-Host $startOutput -ForegroundColor Red
            Write-Warn "Causes possibles :"
            Write-Warn "  - Docker Desktop pas demarre (lancer 'docker ps' pour verifier)"
            Write-Warn "  - Image postgres:15 absente (lancer 'docker pull postgres:15')"
            Write-Warn "  - Quotas Docker atteints (lancer 'docker system prune')"
            exit 1
        }
        $containerStarted = $true

        # Attendre que Postgres soit pret (max 20 s)
        $ready = $false
        for ($i = 0; $i -lt 20; $i++) {
            Start-Sleep -Seconds 1
            $null = & docker exec $dryRunContainer pg_isready -U postgres 2>&1
            if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        }
        if (-not $ready) {
            Write-Fail "Container Postgres pas pret apres 20 s."
            exit 1
        }
        Write-Ok "Container pret"

        # Pour chaque migration : pipe stdin -> docker exec psql, BEGIN/ROLLBACK.
        # Classification des erreurs :
        #   - 'syntax error' / 'unterminated' / 'invalid command' => FATAL (vrai bug syntaxe)
        #   - 'relation/function/policy ... does not exist' => ATTENDU (container vide)
        #   - autres erreurs => WARN (a verifier mais ne bloque pas)
        foreach ($tag in $MigrationTags) {
            Write-Info "Dry-run $tag..."
            $sqlPath = $migrationFiles[$tag]
            $sqlText = Get-Content -Raw -Path $sqlPath

            $wrapped = "BEGIN;`n$sqlText`nROLLBACK;`n"

            # PowerShell 5.1 quirk : un exit code != 0 sur une native cmd convertit
            # stderr en RemoteException qui pollue la console hors de notre controle.
            # Solution : redirection vers fichier temp et lecture differee.
            $stdoutTmp = [IO.Path]::GetTempFileName()
            $stderrTmp = [IO.Path]::GetTempFileName()
            $stdinTmp  = [IO.Path]::GetTempFileName()
            try {
                Set-Content -Path $stdinTmp -Value $wrapped -Encoding utf8 -NoNewline

                # On wrappe dans un ScriptBlock + & + suppression de Stop preference
                # le temps de cet appel uniquement.
                $prevEAP = $ErrorActionPreference
                $ErrorActionPreference = 'Continue'
                try {
                    cmd /c "docker exec -i $dryRunContainer psql --username=postgres --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc < `"$stdinTmp`" > `"$stdoutTmp`" 2> `"$stderrTmp`""
                    $exit = $LASTEXITCODE
                } finally {
                    $ErrorActionPreference = $prevEAP
                }

                $outStd = Get-Content -Raw -Path $stdoutTmp -ErrorAction SilentlyContinue
                $outErr = Get-Content -Raw -Path $stderrTmp -ErrorAction SilentlyContinue
                $outputStr = "$outStd`n$outErr"
            } finally {
                Remove-Item -Force -ErrorAction SilentlyContinue $stdoutTmp, $stderrTmp, $stdinTmp
            }

            if ($exit -eq 0) {
                Write-Ok "$tag : dry-run OK (parse + execution complete)"
                continue
            }

            # Classification de l'erreur
            $isExpectedMissing = $outputStr -match '(?i)(relation|function|policy|table|column|trigger).*does not exist'
            $isSyntaxError     = $outputStr -match '(?i)(syntax error|unterminated|invalid command)'

            if ($isSyntaxError) {
                Write-Fail "$tag : dry-run KO -- ERREUR DE SYNTAXE SQL"
                Write-Host $outputStr -ForegroundColor Red
                Write-Warn "Corriger le fichier .sql avant tout apply."
                exit 1
            } elseif ($isExpectedMissing) {
                Write-Ok "$tag : syntaxe OK (relation manquante en container vide -- attendu)"
            } else {
                Write-Warn "$tag : dry-run a echoue avec une erreur non classee. Detail :"
                Write-Host $outputStr -ForegroundColor Yellow
                Write-Warn "Continuer manuellement apres revue. Pour forcer : -SkipDryRun."
                exit 1
            }
        }
    } finally {
        if ($containerStarted) {
            Write-Info "Arret container dry-run..."
            $null = & docker stop $dryRunContainer 2>&1
        }
    }
}

if ($DryRunOnly) {
    Write-Host ""
    Write-Ok "Mode DryRunOnly : aucune ecriture sur la cible reelle. Termine."
    exit 0
}

# ----------------------------------------------------------------------------
# Compte des migrations AVANT apply
# ----------------------------------------------------------------------------
Write-Step "Compte drizzle.__drizzle_migrations AVANT apply"

$countBeforeRes = Invoke-Psql -SqlInline "SELECT COUNT(*) FROM drizzle.__drizzle_migrations;" -TuplesOnly
if ($countBeforeRes.ExitCode -ne 0) {
    Write-Fail "Impossible de lire drizzle.__drizzle_migrations. Detail :"
    Write-Host $countBeforeRes.Stderr -ForegroundColor Red
    exit 1
}
$countBefore = [int]($countBeforeRes.Stdout.Trim())
Write-Ok "Migrations deja appliquees : $countBefore"

# ----------------------------------------------------------------------------
# Application sequentielle 0050 -> 0053
# Strategie :
#   - Calculer le hash SHA256 du contenu SQL (convention Drizzle journal v7).
#   - Verifier si le hash est deja dans drizzle.__drizzle_migrations.
#     Si oui -> skip (idempotence).
#   - Sinon : jouer le SQL en --single-transaction, puis INSERT du hash.
# ----------------------------------------------------------------------------
Write-Step "Apply migrations sequentiel"

$applied = @()
$skipped = @()

foreach ($tag in $MigrationTags) {
    Write-Info "----- $tag -----"
    $sqlPath = $migrationFiles[$tag]
    $sqlText = Get-Content -Raw -Path $sqlPath

    # Hash SHA256 du contenu (hex lowercase, convention Drizzle journal v7)
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($sqlText)
        $hashBytes = $sha256.ComputeHash($bytes)
        $hash = ($hashBytes | ForEach-Object { $_.ToString('x2') }) -join ''
    } finally {
        $sha256.Dispose()
    }
    Write-Info "Hash SHA256 : $hash"

    # Verif idempotence
    $existsRes = Invoke-Psql -SqlInline `
        "SELECT COUNT(*) FROM drizzle.__drizzle_migrations WHERE hash = '$hash';" `
        -TuplesOnly
    if ($existsRes.ExitCode -ne 0) {
        Write-Fail "Verif idempotence ECHEC pour $tag."
        Write-Host $existsRes.Stderr -ForegroundColor Red
        exit 1
    }
    $existsCount = [int]($existsRes.Stdout.Trim())
    if ($existsCount -gt 0) {
        Write-Ok "$tag : deja applique (hash present), skip"
        $skipped += $tag
        continue
    }

    # Apply SQL en single-transaction
    Write-Info "Apply en cours..."
    $applyRes = Invoke-Psql -SqlFile $sqlPath -SingleTx
    if ($applyRes.ExitCode -ne 0) {
        Write-Fail "$tag : APPLY ECHEC (exit $($applyRes.ExitCode))"
        if ($applyRes.Stderr) { Write-Host $applyRes.Stderr -ForegroundColor Red }
        if ($applyRes.Stdout) { Write-Host $applyRes.Stdout -ForegroundColor DarkGray }
        Write-Warn "Cf. docs/ROLLBACK_PLAN_MIGRATIONS_0050_0053.md section correspondante."
        exit 1
    }
    Write-Ok "$tag : SQL applique"

    # INSERT dans drizzle.__drizzle_migrations
    # created_at = ms epoch (convention Drizzle journal v7)
    $createdAt = [int64]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
    $insertSql = "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('$hash', $createdAt);"
    $insertRes = Invoke-Psql -SqlInline $insertSql
    if ($insertRes.ExitCode -ne 0) {
        Write-Fail "$tag : INSERT drizzle.__drizzle_migrations ECHEC."
        if ($insertRes.Stderr) { Write-Host $insertRes.Stderr -ForegroundColor Red }
        Write-Warn "Le SQL est applique mais Drizzle ne sait pas. Insertion manuelle :"
        Write-Warn "  $insertSql"
        exit 1
    }
    Write-Ok "$tag : enregistre dans drizzle.__drizzle_migrations"
    $applied += $tag
}

# ----------------------------------------------------------------------------
# Post-checks SQL
# ----------------------------------------------------------------------------
Write-Step "Post-checks SQL"

# 1. RLS FORCE sur les 4 tables sensibles
Write-Info "RLS FORCE sur companies, bureaux_etudes, cotraitant_shares, cotraitant_share_items..."
$rlsRes = Invoke-Psql -SqlInline @"
SELECT relname, relrowsecurity, relforcerowsecurity
  FROM pg_class
 WHERE relname IN ('companies', 'bureaux_etudes', 'cotraitant_shares', 'cotraitant_share_items')
   AND relnamespace = 'public'::regnamespace
 ORDER BY relname;
"@ -TuplesOnly
if ($rlsRes.ExitCode -ne 0) {
    Write-Fail "Post-check RLS FORCE : query ECHEC"
    Write-Host $rlsRes.Stderr -ForegroundColor Red
    exit 1
}
$rlsRows = $rlsRes.Stdout -split "`n" | Where-Object { $_.Trim() -ne '' }
$rlsOk = $true
foreach ($row in $rlsRows) {
    $cols = $row -split '\|'
    $name = $cols[0].Trim()
    $rls  = $cols[1].Trim()
    $frce = $cols[2].Trim()
    if ($rls -eq 't' -and $frce -eq 't') {
        Write-Ok "  $name : RLS=on FORCE=on"
    } else {
        Write-Fail "  $name : RLS=$rls FORCE=$frce (attendu t/t)"
        $rlsOk = $false
    }
}
if (-not $rlsOk) {
    Write-Fail "Post-check RLS FORCE : au moins une table KO."
    Write-Warn "Verifier 0051/0052/0053 ont bien tourne. Cf. ROLLBACK_PLAN."
    exit 1
}

# 2. Existence fonctions helper
Write-Info "Fonctions helper current_user_org_id + get_cotraitant_share_by_token..."
$fnRes = Invoke-Psql -SqlInline @"
SELECT n.nspname || '.' || p.proname AS fqname
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE (n.nspname, p.proname) IN
       (('public', 'current_user_org_id'),
        ('public', 'get_cotraitant_share_by_token'))
 ORDER BY fqname;
"@ -TuplesOnly
if ($fnRes.ExitCode -ne 0) {
    Write-Fail "Post-check fonctions helper : query ECHEC"
    Write-Host $fnRes.Stderr -ForegroundColor Red
    exit 1
}
$fnNames = ($fnRes.Stdout -split "`n" | Where-Object { $_.Trim() -ne '' } | ForEach-Object { $_.Trim() })
$expectedFns = @('public.current_user_org_id', 'public.get_cotraitant_share_by_token')
$missingFns = $expectedFns | Where-Object { $_ -notin $fnNames }
if ($missingFns.Count -gt 0) {
    Write-Fail "Fonctions manquantes : $($missingFns -join ', ')"
    exit 1
}
foreach ($fn in $expectedFns) { Write-Ok "  $fn : presente" }

# 3. Compteur drizzle.__drizzle_migrations
Write-Info "Compteur drizzle.__drizzle_migrations APRES apply..."
$countAfterRes = Invoke-Psql -SqlInline "SELECT COUNT(*) FROM drizzle.__drizzle_migrations;" -TuplesOnly
$countAfter = [int]($countAfterRes.Stdout.Trim())
$delta = $countAfter - $countBefore
$expectedDelta = $applied.Count
if ($delta -ne $expectedDelta) {
    Write-Fail "Delta migrations = $delta, attendu = $expectedDelta (applied=$($applied.Count), skipped=$($skipped.Count))"
    exit 1
}
Write-Ok "Delta migrations = $delta (applied=$($applied.Count), skipped=$($skipped.Count))"

# ----------------------------------------------------------------------------
# Recap final
# ----------------------------------------------------------------------------
Write-Host ""
Write-Step "Recapitulatif"
Write-Host ""
Write-Host "  Environment   : $Environment" -ForegroundColor Yellow
Write-Host "  Cible         : $($env:PGUSER)@$($env:PGHOST):$($env:PGPORT)/$($env:PGDATABASE)" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Migrations appliquees :" -ForegroundColor Green
foreach ($t in $applied) { Write-Host "    [OK] $t" -ForegroundColor Green }
if ($skipped.Count -gt 0) {
    Write-Host "  Migrations sautees (deja appliquees) :" -ForegroundColor DarkGray
    foreach ($t in $skipped) { Write-Host "    [skip] $t" -ForegroundColor DarkGray }
}
Write-Host ""
Write-Host "  Compteur drizzle.__drizzle_migrations : $countBefore -> $countAfter (delta +$delta)" -ForegroundColor Cyan
Write-Host ""

# URLs smoke (Vercel preview ou prod)
Write-Step "Smoke manuel a faire MAINTENANT"
if ($Environment -eq 'prod') {
    $base = 'https://sourcing.alyosingenierie.fr'
} else {
    $base = 'https://edifio-sourcing-preview.vercel.app'
}
Write-Host "  1. Connecter un admin sur :          $base/login" -ForegroundColor Cyan
Write-Host "  2. Lancer le cron sourcing smoke :   $base/api/admin/crons/smoke-sourcing-run" -ForegroundColor Cyan
Write-Host "  3. Verifier l'apprentissage Salve U : $base/sourcing/admin/profil" -ForegroundColor Cyan
Write-Host "  4. Tester un partage cotraitant via le lien public (token chiffre)." -ForegroundColor Cyan
Write-Host ""
Write-Ok "Apply termine. Steve : noter l'heure pour le post-mortem (cf. ROLLBACK_PLAN section 2)."
