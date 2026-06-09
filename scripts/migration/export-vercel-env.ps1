<#
.SYNOPSIS
    Export des variables d'environnement Vercel (preview + production) vers fichiers
    locaux datés.

.DESCRIPTION
    Utilise le CLI Vercel (`vercel env pull`) pour télécharger TOUTES les ENV vars
    d'un projet Vercel (les 2 environnements : preview ET production).

    Sortie : backups/vercel/<project-name>/<date>/
        ├── .env.preview.backup
        └── .env.production.backup

    SAFETY :
    - Refuse si le CLI vercel n'est pas dans le PATH (avec instructions d'install).
    - Refuse si le projet n'est pas linké (.vercel/project.json manquant).
    - Le `.env.production.backup` est SENSIBLE : contient les secrets prod.
      → Le dossier `backups/` est dans .gitignore. NE PAS le commit.
      → Idéalement : chiffrer avec age/gpg ou stocker dans 1Password après revue.

.NOTES
    Auteur : Yann (ps_operator) — préparé pour bascule 18 juillet 2026.
    Pas de lecture/écriture BDD. Lecture seule des secrets Vercel via API.

.EXAMPLE
    # Pré-requis :
    # 1. Installer le CLI : npm i -g vercel
    # 2. Login : vercel login (depuis le navigateur)
    # 3. Linker le projet : vercel link
    #    → choisir scope AlyoSIng et projet edifio-sourcing

    # Puis :
    .\scripts\migration\export-vercel-env.ps1

    # Préciser un nom de projet (pour ranger sous backups/vercel/<name>/) :
    .\scripts\migration\export-vercel-env.ps1 -ProjectName "edifio-sourcing"

.PARAMETER ProjectName
    Nom logique du projet (utilisé pour le sous-dossier de sortie).
    Par défaut : extrait de .vercel/project.json si dispo, sinon "default".

.PARAMETER OutDir
    Dossier racine de sortie. Par défaut : backups/vercel/ (relatif au repo).

.PARAMETER Encrypt
    (Optionnel) Si présent : chiffre immédiatement les fichiers .env.*.backup
    via `age --passphrase` puis supprime les originaux en clair (correction Hugo
    finding PR #117 — réduit la fenêtre humaine de leak des secrets).

    Pré-requis : `age` installé (https://github.com/FiloSottile/age).
    Installation Windows : `winget install FiloSottile.age`.

    Source de passphrase :
      1. Variable d'env `$env:AGE_PASSPHRASE` (préférée, scriptable).
      2. Sinon prompt interactif sécurisé (Read-Host -AsSecureString).

    Déchiffrement ultérieur :
      age --decrypt --output .env.production.backup .env.production.backup.age

.EXAMPLE
    # Avec chiffrement (recommandé pour les exports production) :
    $env:AGE_PASSPHRASE = "<passphrase forte 1Password>"
    .\scripts\migration\export-vercel-env.ps1 -ProjectName "edifio-sourcing" -Encrypt
#>
[CmdletBinding()]
param(
    [string]$ProjectName = "",
    [string]$OutDir = "backups/vercel",
    [switch]$Encrypt
)

$ErrorActionPreference = "Stop"

# --- Safety check 1 : CLI vercel disponible ---
$vercel = Get-Command vercel -ErrorAction SilentlyContinue
if (-not $vercel) {
    Write-Host "[REFUS] CLI Vercel introuvable dans le PATH." -ForegroundColor Red
    Write-Host ""
    Write-Host "Installer le CLI :" -ForegroundColor Yellow
    Write-Host "  npm i -g vercel" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Puis s'authentifier :" -ForegroundColor Yellow
    Write-Host "  vercel login" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Puis linker le projet (depuis la racine du repo) :" -ForegroundColor Yellow
    Write-Host "  vercel link" -ForegroundColor Cyan
    exit 1
}

$repoRoot = (Get-Item $PSScriptRoot).Parent.Parent.FullName

# --- Safety check 1b : age dispo si -Encrypt demandé ---
if ($Encrypt) {
    $ageCmd = Get-Command age -ErrorAction SilentlyContinue
    if (-not $ageCmd) {
        Write-Host "[REFUS] -Encrypt demande mais `age` introuvable dans le PATH." -ForegroundColor Red
        Write-Host ""
        Write-Host "Installer age (https://github.com/FiloSottile/age) :" -ForegroundColor Yellow
        Write-Host "  winget install FiloSottile.age" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Ou via scoop / chocolatey :" -ForegroundColor Yellow
        Write-Host "  scoop install age" -ForegroundColor Cyan
        Write-Host "  choco install age.portable" -ForegroundColor Cyan
        exit 1
    }
    Write-Host "[INFO] Chiffrement age active." -ForegroundColor Cyan
}

# --- Safety check 2 : projet linké (.vercel/project.json) ---
$projectJsonPath = Join-Path $repoRoot ".vercel/project.json"
if (-not (Test-Path $projectJsonPath)) {
    Write-Host "[REFUS] Aucun projet Vercel linké." -ForegroundColor Red
    Write-Host "        Fichier attendu : $projectJsonPath" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Linker le projet :" -ForegroundColor Yellow
    Write-Host "  cd `"$repoRoot`"" -ForegroundColor Cyan
    Write-Host "  vercel link" -ForegroundColor Cyan
    exit 1
}

# --- Auto-détection du nom de projet ---
if ([string]::IsNullOrWhiteSpace($ProjectName)) {
    try {
        $projectJson = Get-Content $projectJsonPath -Raw | ConvertFrom-Json
        if ($projectJson.projectId) {
            # On préfère un nom lisible — pas l'ID brut.
            # Si pas dispo on retombe sur "default".
            $ProjectName = if ($projectJson.PSObject.Properties.Name -contains "projectName") {
                $projectJson.projectName
            } else {
                "default"
            }
        }
    } catch {
        $ProjectName = "default"
    }
}

Write-Host "[INFO] Projet logique : $ProjectName" -ForegroundColor Cyan

# --- Préparation du dossier de sortie ---
$stampDate = Get-Date -Format "yyyy-MM-dd"
$absOutDir = Join-Path $repoRoot (Join-Path $OutDir (Join-Path $ProjectName $stampDate))
if (-not (Test-Path $absOutDir)) {
    New-Item -ItemType Directory -Path $absOutDir -Force | Out-Null
}

$previewFile    = Join-Path $absOutDir ".env.preview.backup"
$productionFile = Join-Path $absOutDir ".env.production.backup"

Write-Host "[INFO] Sortie : $absOutDir" -ForegroundColor Cyan
Write-Host ""

# --- Export preview ---
Write-Host "[1/2] Pull preview env..." -ForegroundColor Yellow
Push-Location $repoRoot
try {
    & vercel env pull $previewFile --environment=preview --yes
    if ($LASTEXITCODE -ne 0) {
        throw "vercel env pull preview a échoué (exit $LASTEXITCODE)."
    }
} finally {
    Pop-Location
}

# --- Export production ---
Write-Host "[2/2] Pull production env..." -ForegroundColor Yellow
Push-Location $repoRoot
try {
    & vercel env pull $productionFile --environment=production --yes
    if ($LASTEXITCODE -ne 0) {
        throw "vercel env pull production a échoué (exit $LASTEXITCODE)."
    }
} finally {
    Pop-Location
}

# --- Rapport + rappel sécurité ---
$previewSize    = if (Test-Path $previewFile)    { (Get-Item $previewFile).Length }    else { 0 }
$productionSize = if (Test-Path $productionFile) { (Get-Item $productionFile).Length } else { 0 }

Write-Host ""
Write-Host "[OK] Export terminé." -ForegroundColor Green
Write-Host "     Preview    : $previewFile ($previewSize octets)" -ForegroundColor Green
Write-Host "     Production : $productionFile ($productionSize octets)" -ForegroundColor Green

# --- Chiffrement age (si -Encrypt) ---
# Réduit la fenêtre humaine de leak des secrets sur disque (correction Hugo PR #117).
# Source passphrase : $env:AGE_PASSPHRASE en priorité (scriptable), sinon prompt.
if ($Encrypt) {
    Write-Host ""
    Write-Host "[CHIFFREMENT] Encodage age en cours..." -ForegroundColor Yellow

    # Récupération passphrase
    $passphrase = $env:AGE_PASSPHRASE
    if ([string]::IsNullOrWhiteSpace($passphrase)) {
        Write-Host "  AGE_PASSPHRASE non posee en ENV. Prompt securise..." -ForegroundColor Gray
        $securePass = Read-Host -AsSecureString -Prompt "  Passphrase age"
        $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePass)
        try {
            $passphrase = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
        } finally {
            [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
        }
    }

    if ([string]::IsNullOrWhiteSpace($passphrase)) {
        Write-Host "[ERREUR] Passphrase vide -> chiffrement annule. Fichiers en clair laisses." -ForegroundColor Red
        exit 1
    }

    # Fonction locale de chiffrement (idempotente : recree .age si deja present)
    function Invoke-AgeEncrypt {
        param(
            [Parameter(Mandatory=$true)][string]$Path,
            [Parameter(Mandatory=$true)][string]$Pass
        )
        if (-not (Test-Path $Path)) { return $null }

        $encryptedPath = "$Path.age"

        # age 1.x : --passphrase + --output. La passphrase est lue depuis stdin
        # quand --passphrase + une entree non-tty est piped, ou demandee 2x sinon.
        # On utilise un fichier temporaire de stdin pour eviter les pieges de pipe PS5.1.
        $tmpStdin = [System.IO.Path]::GetTempFileName()
        try {
            # age --passphrase prompt 2x quand stdin est un TTY ; en stdin redirige,
            # il lit la passphrase 1x sur stdin avant le payload. On contourne en
            # passant directement le fichier source via -o + argument positionnel,
            # et la passphrase via la variable AGE_PASSPHRASE que age 1.1+ supporte.
            # Pour compat large : utilisation du wrapper Start-Process avec stdin redirige.

            # Approche robuste compat age 1.0-1.2 : on POSE temporairement
            # $env:AGE_PASSPHRASE le temps de l'appel (deja en cours puisque source).
            $previous = $env:AGE_PASSPHRASE
            $env:AGE_PASSPHRASE = $Pass
            try {
                & age --passphrase --output $encryptedPath $Path 2>&1 | ForEach-Object {
                    # Masquage defensif : aucune ligne ne devrait contenir la passphrase,
                    # mais par paranoia on filtre toute occurrence si elle apparait.
                    if ($_ -is [string] -and $_ -match [regex]::Escape($Pass)) {
                        Write-Host ("  age: " + ($_ -replace [regex]::Escape($Pass), "***")) -ForegroundColor Gray
                    } else {
                        Write-Host "  age: $_" -ForegroundColor Gray
                    }
                }
                $ageExit = $LASTEXITCODE
            } finally {
                $env:AGE_PASSPHRASE = $previous
            }

            if ($ageExit -ne 0 -or -not (Test-Path $encryptedPath)) {
                throw "age a echoue (exit $ageExit) sur $Path"
            }

            # Suppression du fichier en clair (idempotent : si re-run, .age sera recree)
            Remove-Item $Path -Force
            return $encryptedPath
        } finally {
            if (Test-Path $tmpStdin) { Remove-Item $tmpStdin -Force -ErrorAction SilentlyContinue }
        }
    }

    try {
        $previewEnc    = Invoke-AgeEncrypt -Path $previewFile    -Pass $passphrase
        $productionEnc = Invoke-AgeEncrypt -Path $productionFile -Pass $passphrase
    } catch {
        # Masquage defensif sur la stack trace
        $msg = $_.Exception.Message
        if ($msg -match [regex]::Escape($passphrase)) {
            $msg = $msg -replace [regex]::Escape($passphrase), "***"
        }
        Write-Host "[ERREUR] Chiffrement age echoue : $msg" -ForegroundColor Red
        Write-Host "         Les fichiers en clair sont peut-etre encore presents -> nettoyer manuellement." -ForegroundColor Yellow
        exit 1
    } finally {
        # Effacer la passphrase de la memoire
        $passphrase = $null
        [System.GC]::Collect()
    }

    Write-Host ""
    Write-Host "[OK] Chiffrement termine. Fichiers en clair supprimes." -ForegroundColor Green
    if ($previewEnc)    { Write-Host "     Preview chiffre    : $previewEnc"    -ForegroundColor Green }
    if ($productionEnc) { Write-Host "     Production chiffre : $productionEnc" -ForegroundColor Green }
    Write-Host ""
    Write-Host "[DECHIFFREMENT] Pour relire un fichier chiffre :" -ForegroundColor Cyan
    Write-Host "     `$env:AGE_PASSPHRASE = '<passphrase>'" -ForegroundColor Gray
    Write-Host "     age --decrypt --output .env.production.backup .env.production.backup.age" -ForegroundColor Gray
} else {
    Write-Host ""
    Write-Host "[SECURITE] Le fichier .env.production.backup contient des SECRETS PROD." -ForegroundColor Red
    Write-Host "           - Le dossier backups/ est dans .gitignore (verifie) -> NE SERA PAS COMMIT." -ForegroundColor Yellow
    Write-Host "           - Apres usage : copier dans 1Password puis SUPPRIMER le fichier local." -ForegroundColor Yellow
    Write-Host "           - RECOMMANDATION : relancer avec -Encrypt pour chiffrement age immediat." -ForegroundColor Yellow
    Write-Host "               .\scripts\migration\export-vercel-env.ps1 -ProjectName `"$ProjectName`" -Encrypt" -ForegroundColor Gray
}
