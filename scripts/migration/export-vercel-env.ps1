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
#>
[CmdletBinding()]
param(
    [string]$ProjectName = "",
    [string]$OutDir = "backups/vercel"
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
Write-Host ""
Write-Host "[SECURITE] Le fichier .env.production.backup contient des SECRETS PROD." -ForegroundColor Red
Write-Host "           - Le dossier backups/ est dans .gitignore (vérifié) → NE SERA PAS COMMIT." -ForegroundColor Yellow
Write-Host "           - Après usage : copier dans 1Password puis SUPPRIMER le fichier local." -ForegroundColor Yellow
Write-Host "           - Pour chiffrer immédiatement (optionnel, si age installé) :" -ForegroundColor Yellow
Write-Host "               age -r <recipient-pubkey> -o `"$productionFile.age`" `"$productionFile`"" -ForegroundColor Gray
Write-Host "               Remove-Item `"$productionFile`"" -ForegroundColor Gray
