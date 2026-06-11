# =============================================================================
# 01-vercel-env-loader.ps1
# -----------------------------------------------------------------------------
# Loader idempotent des env vars vers le projet Vercel monorepo
# (alyos-suivi-chantier, team teissiers-projects, plan Hobby).
#
# ROLE :
#   Lit un fichier local .env.monorepo.production (KEY=VALUE par ligne) et
#   pousse chaque var via `vercel env add KEY production` en utilisant stdin
#   (Vercel CLI ne propose pas --env-file pour `env add`, donc on pipe).
#
# IDEMPOTENCE :
#   1. `vercel env ls production` enumere les vars existantes.
#   2. Pour chaque KEY du fichier, si KEY est deja presente => skip.
#   3. Sinon => `vercel env add KEY production` avec VALUE en stdin.
#
# DRY-RUN :
#   Si la premiere ligne non vide du fichier est `# DRY_RUN=true`, le script
#   affiche le plan (creations vs skips) et ne pousse RIEN sur Vercel.
#
# SECURITE :
#   - Le fichier .env.monorepo.production n'est JAMAIS commit (cf. .gitignore).
#   - Aucune VALUE n'est echo dans la sortie standard (longueur seule).
#   - Si une ligne contient un caractere suspect (CR, BOM), on refuse propre.
#
# USAGE :
#   cd C:\Dev\edifio-sourcing
#   # 1. Steve cree .env.monorepo.production en local depuis 1Password.
#   # 2. Optionnel : tester le plan
#   #    .\scripts\migration\ops\01-vercel-env-loader.ps1 -DryRun
#   # 3. Push reel
#   #    .\scripts\migration\ops\01-vercel-env-loader.ps1
#
# PRE-REQUIS :
#   - `vercel login` deja fait (ou VERCEL_TOKEN dans la session)
#   - `vercel link` vers le projet alyos-suivi-chantier (team teissiers-projects)
#     => idempotent : si pas linke, le script s'arrete avec un message clair.
#
# AUTEUR : ps_operator (Yann) - 2026-06-11 - J-2 bascule monorepo 14/06
# =============================================================================

[CmdletBinding()]
param(
    [string]$EnvFile = ".env.monorepo.production",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# --- Bannieres ASCII (pas d'emoji, pas d'accent) -----------------------------
function Write-Banner([string]$text) {
    Write-Host ""
    Write-Host "--- $text ---"
}
function Write-Ok([string]$text)   { Write-Host "[ OK ] $text" }
function Write-Skip([string]$text) { Write-Host "[SKIP] $text" }
function Write-Add([string]$text)  { Write-Host "[ ADD] $text" }
function Write-Warn2([string]$text){ Write-Host "[WARN] $text" }
function Write-Fail([string]$text) { Write-Host "[FAIL] $text" }

Write-Banner "01-vercel-env-loader.ps1 - chargement env vars monorepo"

# --- 1. Verifs prealables ----------------------------------------------------

# 1a. Fichier d'entree present ?
if (-not (Test-Path -LiteralPath $EnvFile)) {
    Write-Fail "Fichier $EnvFile introuvable a la racine."
    Write-Host "       Creer ce fichier en local depuis 1Password (KEY=VALUE par ligne)."
    Write-Host "       Il est dans .gitignore (.env.monorepo*) - aucun risque de commit."
    exit 1
}

# 1b. vercel CLI dispo ?
$vercelCmd = Get-Command vercel -ErrorAction SilentlyContinue
if (-not $vercelCmd) {
    Write-Fail "vercel CLI introuvable dans le PATH."
    Write-Host "       Installer : npm i -g vercel  (ou pnpm dlx vercel ...)"
    exit 1
}

# 1c. Repo linke a un projet Vercel ?
if (-not (Test-Path -LiteralPath ".vercel\project.json")) {
    Write-Fail ".vercel\project.json absent - le repo n'est pas linke."
    Write-Host "       Lancer : vercel link  (choisir scope teissiers-projects, projet alyos-suivi-chantier)"
    exit 1
}

# 1d. Verif que le projet linke est bien le monorepo (garde-fou anti-doigt-qui-glisse)
try {
    $projectJson = Get-Content -LiteralPath ".vercel\project.json" -Raw | ConvertFrom-Json
    $linkedProjectId = $projectJson.projectId
    Write-Ok "Vercel project linke : projectId=$linkedProjectId"
    Write-Warn2 "Verifier manuellement que projectId correspond bien a alyos-suivi-chantier"
    Write-Warn2 "  (et NON pas a l'ancien projet edifio-sourcing). Sinon : Ctrl+C maintenant."
} catch {
    Write-Fail "Lecture .vercel\project.json impossible : $($_.Exception.Message)"
    exit 1
}

# --- 2. Lecture du fichier ---------------------------------------------------

Write-Banner "Lecture $EnvFile"

$rawLines = Get-Content -LiteralPath $EnvFile -Encoding UTF8

# Detection du flag DRY_RUN (premiere ligne non vide)
$firstNonEmpty = $rawLines | Where-Object { $_ -and $_.Trim() -ne "" } | Select-Object -First 1
$fileDryRun = $false
if ($firstNonEmpty -and $firstNonEmpty.Trim() -match '^#\s*DRY_RUN\s*=\s*true\s*$') {
    $fileDryRun = $true
    Write-Warn2 "Flag # DRY_RUN=true detecte en tete du fichier - mode dry-run force."
}

$effectiveDryRun = $DryRun.IsPresent -or $fileDryRun
if ($effectiveDryRun) {
    Write-Warn2 "Mode DRY-RUN actif : aucune ecriture Vercel."
}

# Parsing KEY=VALUE
$parsed = @()
$lineNum = 0
foreach ($line in $rawLines) {
    $lineNum++
    if ($null -eq $line) { continue }
    $trim = $line.Trim()
    if ($trim -eq "" -or $trim.StartsWith("#")) { continue }

    # Pas de CR ou caractere de controle (autres que TAB)
    if ($line -match "[\x00-\x08\x0B\x0C\x0E-\x1F]") {
        Write-Fail "Ligne $lineNum : caractere de controle detecte (CR/BOM/null). Encoder en UTF-8 LF."
        exit 1
    }

    $eqIdx = $trim.IndexOf("=")
    if ($eqIdx -lt 1) {
        Write-Fail "Ligne $lineNum : pas de '=' valide -> '$trim'"
        exit 1
    }
    $key = $trim.Substring(0, $eqIdx).Trim()
    $val = $trim.Substring($eqIdx + 1)
    # Strip d'eventuels guillemets entourant la valeur
    if ($val.Length -ge 2 -and (($val.StartsWith('"') -and $val.EndsWith('"')) -or ($val.StartsWith("'") -and $val.EndsWith("'")))) {
        $val = $val.Substring(1, $val.Length - 2)
    }

    if ($key -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') {
        Write-Fail "Ligne $lineNum : nom de variable invalide '$key'"
        exit 1
    }
    if ($val -eq "") {
        Write-Fail "Ligne $lineNum : valeur vide pour '$key'. Refus (poser '<TBD>' explicite si voulu)."
        exit 1
    }

    $parsed += [PSCustomObject]@{ Key = $key; Value = $val; Line = $lineNum }
}

Write-Ok "$($parsed.Count) paires KEY=VALUE parsees."

# --- 3. Inventaire des vars deja sur Vercel production -----------------------

Write-Banner "Inventaire vercel env ls production"

# `vercel env ls production` renvoie une table. On va parser via `vercel env ls production --json` si dispo,
# sinon fallback en grep "KEY" sur la sortie texte.
$existingKeys = @{}

try {
    # Tentative JSON (CLI recente)
    $jsonOutput = & vercel env ls production --json 2>$null
    if ($LASTEXITCODE -eq 0 -and $jsonOutput) {
        $parsedJson = $jsonOutput | ConvertFrom-Json
        foreach ($entry in $parsedJson) {
            if ($entry.key) { $existingKeys[$entry.key] = $true }
        }
        Write-Ok "Inventaire JSON : $($existingKeys.Count) vars deja presentes en production."
    } else {
        throw "JSON output vide ou code retour non zero"
    }
} catch {
    Write-Warn2 "Mode JSON indisponible - fallback parsing texte."
    $textOutput = & vercel env ls production 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "vercel env ls production a echoue : $textOutput"
        exit 1
    }
    # Parsing best-effort : on cherche les lignes commencant par un nom de var
    foreach ($line in $textOutput) {
        if ($line -match '^\s*([A-Z_][A-Z0-9_]*)\s+') {
            $existingKeys[$Matches[1]] = $true
        }
    }
    Write-Ok "Inventaire texte (best-effort) : $($existingKeys.Count) vars detectees."
}

# --- 4. Plan : add vs skip ---------------------------------------------------

Write-Banner "Plan d'execution"

$toAdd  = @()
$toSkip = @()
foreach ($pair in $parsed) {
    if ($existingKeys.ContainsKey($pair.Key)) {
        $toSkip += $pair
    } else {
        $toAdd += $pair
    }
}

foreach ($p in $toSkip) {
    Write-Skip "$($p.Key) (deja present sur Vercel - len=$($p.Value.Length))"
}
foreach ($p in $toAdd) {
    Write-Add "$($p.Key) (a creer - len=$($p.Value.Length))"
}

Write-Host ""
Write-Host "Recap plan :"
Write-Host "  +$($toAdd.Count) vars a creer"
Write-Host "  =$($toSkip.Count) vars deja presentes (skip)"

if ($effectiveDryRun) {
    Write-Banner "DRY-RUN : fin sans ecriture Vercel."
    exit 0
}

if ($toAdd.Count -eq 0) {
    Write-Banner "Aucune var a creer - sortie propre."
    exit 0
}

# --- 5. Confirmation interactive ---------------------------------------------

Write-Host ""
Write-Host "Confirmer la creation de $($toAdd.Count) vars sur le projet Vercel monorepo (production) ?"
$confirm = Read-Host "Taper EXACTEMENT 'PUSH-MONOREPO-PROD' pour continuer"
if ($confirm -ne "PUSH-MONOREPO-PROD") {
    Write-Warn2 "Confirmation refusee - sortie sans ecriture."
    exit 0
}

# --- 6. Execution : push de chaque var ---------------------------------------

Write-Banner "Ecriture sur Vercel production"

$created = 0
$failed  = @()

foreach ($pair in $toAdd) {
    $key = $pair.Key
    $val = $pair.Value

    # `vercel env add KEY production` lit la valeur sur stdin (1 ligne).
    # On pipe via Write-Output | & vercel ... pour eviter qu'echo affiche la valeur.
    try {
        $val | & vercel env add $key production 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Ok "$key cree (len=$($val.Length))"
            $created++
        } else {
            Write-Fail "$key : code retour $LASTEXITCODE"
            $failed += $key
        }
    } catch {
        Write-Fail "$key : exception $($_.Exception.Message)"
        $failed += $key
    }
}

# --- 7. Recap final ----------------------------------------------------------

Write-Banner "Recap final"
Write-Host "  +$created vars created"
Write-Host "  =$($toSkip.Count) vars unchanged"
if ($failed.Count -gt 0) {
    Write-Host "  !$($failed.Count) vars failed :"
    foreach ($k in $failed) { Write-Host "    - $k" }
    exit 1
}

Write-Ok "Termine sans erreur."
exit 0
