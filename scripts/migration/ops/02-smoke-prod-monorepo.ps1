# =============================================================================
# 02-smoke-prod-monorepo.ps1
# -----------------------------------------------------------------------------
# Smoke tests post-cutover bascule monorepo (dim 14/06, etape 7 du runbook).
#
# Reference : docs/SMOKE_TESTS_POSTBASCULE.md (Alex) + docs/RUNBOOK_BASCULE_MONOREPO_140626.md
#
# TESTS :
#   T1. GET https://sourcing.edifio.fr/                 => HTTP 200
#   T2. GET https://sourcing.edifio.fr/login            => HTTP 200
#       (pas de /api/health expose en prod cote monorepo - cf. memory)
#   T3. DNS resolve sourcing.edifio.fr -> CNAME doit pointer vers le projet
#       Vercel monorepo (cname.vercel-dns.com ou similaire). On verifie qu'on
#       n'est PAS reste sur l'ancien edifio-sourcing.vercel.app.
#   T4. POST /api/cron/sourcing-run avec Bearer CRON_SECRET => 200 + JSON
#       (necessite $env:CRON_SECRET pose par Steve dans SA session)
#
# OUTPUT : tableau ASCII (pas d'emoji) avec [ OK ] / [FAIL] / [WARN].
#
# USAGE :
#   cd C:\Dev\edifio-sourcing
#   $env:CRON_SECRET = "<valeur prod monorepo - depuis 1Password>"
#   .\scripts\migration\ops\02-smoke-prod-monorepo.ps1
#
# AUTEUR : ps_operator (Yann) - 2026-06-11 - J-2 bascule monorepo 14/06
# =============================================================================

[CmdletBinding()]
param(
    [string]$BaseUrl     = "https://sourcing.edifio.fr",
    [string]$CronPath    = "/api/cron/sourcing-run",
    [string]$LegacyHost  = "edifio-sourcing.vercel.app",
    [int]   $TimeoutSec  = 15
)

$ErrorActionPreference = "Continue"  # on capture chaque test, pas de hard-stop
Set-StrictMode -Version Latest

# Force TLS 1.2 sur PowerShell 5.1
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch { }

# --- Helpers tableau ---------------------------------------------------------

$results = @()
function Add-Result {
    param([string]$Id, [string]$Name, [string]$Status, [string]$Detail)
    $script:results += [PSCustomObject]@{
        Id     = $Id
        Name   = $Name
        Status = $Status
        Detail = $Detail
    }
}

function Write-Step([string]$msg) {
    Write-Host ""
    Write-Host "--- $msg ---"
}

Write-Step "02-smoke-prod-monorepo.ps1 - smoke tests post-cutover"
Write-Host "BaseUrl    : $BaseUrl"
Write-Host "LegacyHost : $LegacyHost (doit NE PAS apparaitre dans la resolution)"
Write-Host "Timeout    : ${TimeoutSec}s par requete"

# =============================================================================
# T1. GET / => 200
# =============================================================================
Write-Step "T1 : GET $BaseUrl/"
try {
    $r1 = Invoke-WebRequest -Uri "$BaseUrl/" -Method GET -TimeoutSec $TimeoutSec -UseBasicParsing -MaximumRedirection 5
    if ($r1.StatusCode -eq 200) {
        Add-Result "T1" "GET /" "OK" "HTTP $($r1.StatusCode) - $($r1.RawContentLength) bytes"
        Write-Host "[ OK ] HTTP 200 - $($r1.RawContentLength) bytes"
    } else {
        Add-Result "T1" "GET /" "FAIL" "HTTP $($r1.StatusCode)"
        Write-Host "[FAIL] HTTP $($r1.StatusCode) (attendu 200)"
    }
} catch {
    $msg = $_.Exception.Message
    # Acceptable : 200 ou 307 vers /login ou /sourcing
    if ($_.Exception.Response -and ($_.Exception.Response.StatusCode.value__ -in 200,301,302,307,308)) {
        $code = $_.Exception.Response.StatusCode.value__
        Add-Result "T1" "GET /" "OK" "HTTP $code (redirect tolere)"
        Write-Host "[ OK ] HTTP $code (redirect tolere)"
    } else {
        Add-Result "T1" "GET /" "FAIL" $msg
        Write-Host "[FAIL] $msg"
    }
}

# =============================================================================
# T2. GET /login => 200
# =============================================================================
Write-Step "T2 : GET $BaseUrl/login"
try {
    $r2 = Invoke-WebRequest -Uri "$BaseUrl/login" -Method GET -TimeoutSec $TimeoutSec -UseBasicParsing -MaximumRedirection 5
    if ($r2.StatusCode -eq 200) {
        $hasLogin = $r2.Content -match '(?i)(mot de passe|password|connexion|sign in)'
        if ($hasLogin) {
            Add-Result "T2" "GET /login" "OK" "HTTP 200 + formulaire detecte"
            Write-Host "[ OK ] HTTP 200 + page login (formulaire detecte)"
        } else {
            Add-Result "T2" "GET /login" "WARN" "HTTP 200 mais pas de mot-cle formulaire login dans le HTML"
            Write-Host "[WARN] HTTP 200 mais page ne contient pas 'mot de passe / login' - a verifier visuellement"
        }
    } else {
        Add-Result "T2" "GET /login" "FAIL" "HTTP $($r2.StatusCode)"
        Write-Host "[FAIL] HTTP $($r2.StatusCode) (attendu 200)"
    }
} catch {
    Add-Result "T2" "GET /login" "FAIL" $_.Exception.Message
    Write-Host "[FAIL] $($_.Exception.Message)"
}

# =============================================================================
# T3. DNS resolve sourcing.edifio.fr -> ne doit PAS pointer vers l'ancien Vercel
# =============================================================================
Write-Step "T3 : Resolution DNS sourcing.edifio.fr"
$dnsHost = ([Uri]$BaseUrl).Host
try {
    $dnsRecords = Resolve-DnsName -Name $dnsHost -Type A_AAAA -DnsOnly -ErrorAction Stop
    $cnameChain = @()
    foreach ($rec in $dnsRecords) {
        switch ($rec.Type) {
            "CNAME" { $cnameChain += "$($rec.Name) CNAME $($rec.NameHost)" }
            "A"     { $cnameChain += "$($rec.Name) A $($rec.IPAddress)" }
            "AAAA"  { $cnameChain += "$($rec.Name) AAAA $($rec.IPAddress)" }
        }
    }
    $chainStr = $cnameChain -join " ; "
    Write-Host "Resolution : $chainStr"

    # Heuristique : si la chaine CNAME contient encore le host legacy => FAIL
    $isLegacy = $false
    foreach ($rec in $dnsRecords) {
        if ($rec.Type -eq "CNAME" -and $rec.NameHost -like "*$LegacyHost*") {
            $isLegacy = $true
            break
        }
    }
    # On ne check pas l'IP brute (Vercel mutualise) - on se contente du CNAME terminal.
    $endsOnVercel = $false
    foreach ($rec in $dnsRecords) {
        if ($rec.Type -eq "CNAME" -and ($rec.NameHost -like "*vercel-dns.com*" -or $rec.NameHost -like "*vercel.app*")) {
            $endsOnVercel = $true
        }
    }

    if ($isLegacy) {
        Add-Result "T3" "DNS" "FAIL" "CNAME pointe encore vers $LegacyHost"
        Write-Host "[FAIL] CNAME pointe encore vers l'ancien Vercel $LegacyHost"
    } elseif (-not $endsOnVercel) {
        Add-Result "T3" "DNS" "WARN" "Pas de CNAME vercel-dns.com detecte - chaine = $chainStr"
        Write-Host "[WARN] Pas de CNAME *.vercel-dns.com detecte - verifier manuellement"
    } else {
        Add-Result "T3" "DNS" "OK" "CNAME vers Vercel sans trace legacy ($chainStr)"
        Write-Host "[ OK ] CNAME pointe vers Vercel monorepo (pas l'ancien)"
    }
} catch {
    Add-Result "T3" "DNS" "FAIL" "Resolve-DnsName : $($_.Exception.Message)"
    Write-Host "[FAIL] Resolve-DnsName : $($_.Exception.Message)"
}

# =============================================================================
# T4. /api/cron/sourcing-run avec Bearer CRON_SECRET
# =============================================================================
Write-Step "T4 : POST ${BaseUrl}${CronPath} (Bearer CRON_SECRET)"
if (-not $env:CRON_SECRET -or $env:CRON_SECRET -eq "") {
    Add-Result "T4" "Cron sourcing-run" "WARN" "CRON_SECRET non pose dans la session - test saute"
    Write-Host "[WARN] `$env:CRON_SECRET non pose - poser puis re-run pour valider le cron."
} else {
    try {
        $headers = @{ "Authorization" = "Bearer $env:CRON_SECRET" }
        # Aligne sur la posture runbook + SMOKE_TESTS_POSTBASCULE : POST (la route
        # accepte GET et POST mais la doc officialise POST pour eviter le faux positif).
        $r4 = Invoke-WebRequest -Uri "${BaseUrl}${CronPath}" `
                                -Method POST `
                                -Headers $headers `
                                -TimeoutSec 60 `
                                -UseBasicParsing
        if ($r4.StatusCode -eq 200) {
            $bodyOk = $false
            try {
                $json = $r4.Content | ConvertFrom-Json
                $bodyOk = $true
                $detail = "HTTP 200 + JSON valide"
                if ($json.PSObject.Properties.Name -contains "ok") { $detail += " (ok=$($json.ok))" }
            } catch {
                $detail = "HTTP 200 mais body non-JSON"
            }
            if ($bodyOk) {
                Add-Result "T4" "Cron sourcing-run" "OK" $detail
                Write-Host "[ OK ] $detail"
            } else {
                Add-Result "T4" "Cron sourcing-run" "WARN" $detail
                Write-Host "[WARN] $detail"
            }
        } else {
            Add-Result "T4" "Cron sourcing-run" "FAIL" "HTTP $($r4.StatusCode)"
            Write-Host "[FAIL] HTTP $($r4.StatusCode)"
        }
    } catch {
        $code = $null
        if ($_.Exception.Response) { $code = $_.Exception.Response.StatusCode.value__ }
        $detail = if ($code) { "HTTP $code - $($_.Exception.Message)" } else { $_.Exception.Message }
        Add-Result "T4" "Cron sourcing-run" "FAIL" $detail
        Write-Host "[FAIL] $detail"
    }
}

# =============================================================================
# Recap ASCII
# =============================================================================

Write-Host ""
Write-Host "==============================================================================="
Write-Host " RECAP SMOKE TESTS - sourcing.edifio.fr (cible : monorepo Vercel)"
Write-Host "==============================================================================="
Write-Host (" {0,-4} {1,-25} {2,-7} {3}" -f "ID", "Test", "Status", "Detail")
Write-Host " ---- ------------------------- ------- -----------------------------------------"
foreach ($r in $results) {
    $tag = switch ($r.Status) {
        "OK"   { "[ OK ]" }
        "WARN" { "[WARN]" }
        "FAIL" { "[FAIL]" }
        default { "[ ?? ]" }
    }
    Write-Host (" {0,-4} {1,-25} {2,-7} {3}" -f $r.Id, $r.Name, $tag, $r.Detail)
}
Write-Host "==============================================================================="

$fails = ($results | Where-Object { $_.Status -eq "FAIL" }).Count
$warns = ($results | Where-Object { $_.Status -eq "WARN" }).Count
$oks   = ($results | Where-Object { $_.Status -eq "OK" }).Count

Write-Host ""
Write-Host "Total : $oks OK / $warns WARN / $fails FAIL"

if ($fails -gt 0) {
    Write-Host ""
    Write-Host "[FAIL] Au moins un test critique a echoue."
    Write-Host "       => Suivre runbook etape 7 : rollback complet (DNS + Vercel)."
    Write-Host "       Script de rollback DNS : .\scripts\migration\ops\03-rollback-dns.ps1 --confirm"
    exit 1
}

if ($warns -gt 0) {
    Write-Host ""
    Write-Host "[WARN] Tests passent mais warnings a inspecter avant de declarer GO."
    exit 2
}

Write-Host ""
Write-Host "[ OK ] Tous les tests verts. Smoke prod = PASS."
exit 0
