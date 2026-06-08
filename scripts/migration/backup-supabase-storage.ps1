<#
.SYNOPSIS
    Téléchargement complet des buckets Supabase Storage d'un projet (sauvegarde locale).

.DESCRIPTION
    Liste tous les buckets Supabase Storage du projet cible, puis télécharge chaque
    objet vers `backups/storage/<project>/<bucket>/<date>/<chemin/objet>`.

    Utilise l'API REST Storage Supabase avec le SERVICE_ROLE_KEY (jamais l'ANON_KEY
    sinon les buckets privés sont invisibles).

    SAFETY :
    - Refuse si SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquantes en ENV.
    - Aucune écriture sur Storage prod, lecture seule.
    - Le SERVICE_ROLE_KEY est SENSIBLE → Steve le pose dans SA session, jamais
      écrit dans un fichier.

.NOTES
    Auteur : Yann (ps_operator) — préparé pour bascule 18 juillet 2026.
    Cf. MEMORY > feedback_ops_prod_user_runs_migration.md.

    API REST utilisée :
      GET  {SUPABASE_URL}/storage/v1/bucket               → liste les buckets
      POST {SUPABASE_URL}/storage/v1/object/list/{bucket} → liste les objets (paginé)
      GET  {SUPABASE_URL}/storage/v1/object/{bucket}/{key} → télécharge l'objet

    Pagination : 1000 objets par page max (limite Supabase Storage API).
    Headers : Authorization: Bearer <SERVICE_ROLE_KEY>, apikey: <SERVICE_ROLE_KEY>.

.EXAMPLE
    # Avant de lancer (Steve, dans SA session PowerShell) :
    $env:SUPABASE_URL              = "https://<project-ref>.supabase.co"
    $env:SUPABASE_SERVICE_ROLE_KEY = "<service-role-key depuis 1Password>"

    # Puis :
    .\scripts\migration\backup-supabase-storage.ps1 -ProjectName "edifio-sourcing"

    # Pour limiter aux buckets nommés :
    .\scripts\migration\backup-supabase-storage.ps1 -ProjectName "edifio-sourcing" -Buckets "company_library,architects-docs"

.PARAMETER ProjectName
    Nom logique du projet (utilisé pour le sous-dossier de sortie).

.PARAMETER Buckets
    (Optionnel) Liste de buckets séparés par virgule. Par défaut : tous les buckets.

.PARAMETER OutDir
    Dossier racine de sortie. Par défaut : backups/storage/ (relatif au repo).
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [string]$ProjectName,
    [string]$Buckets = "",
    [string]$OutDir = "backups/storage"
)

$ErrorActionPreference = "Stop"

# --- Safety check : ENV vars requises ---
$requiredEnv = @("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY")
$missing = @()
foreach ($var in $requiredEnv) {
    if (-not (Test-Path "Env:$var")) {
        $missing += $var
    }
}

if ($missing.Count -gt 0) {
    Write-Host "[REFUS] Variables d'environnement manquantes : $($missing -join ', ')" -ForegroundColor Red
    Write-Host ""
    Write-Host "Avant de relancer, poser les vars dans CETTE session PowerShell :" -ForegroundColor Yellow
    Write-Host '  $env:SUPABASE_URL              = "https://<project-ref>.supabase.co"' -ForegroundColor Cyan
    Write-Host '  $env:SUPABASE_SERVICE_ROLE_KEY = "<depuis 1Password>"' -ForegroundColor Cyan
    Write-Host ""
    Write-Host "ATTENTION : SERVICE_ROLE_KEY (pas ANON_KEY), sinon buckets privés invisibles." -ForegroundColor Yellow
    exit 1
}

# --- Sanity : URL Supabase ---
if (-not ($env:SUPABASE_URL -match '^https://')) {
    Write-Host "[REFUS] SUPABASE_URL doit commencer par https:// (valeur actuelle : $($env:SUPABASE_URL))" -ForegroundColor Red
    exit 1
}

$apiBase = $env:SUPABASE_URL.TrimEnd('/') + "/storage/v1"
$headers = @{
    "apikey"        = $env:SUPABASE_SERVICE_ROLE_KEY
    "Authorization" = "Bearer $($env:SUPABASE_SERVICE_ROLE_KEY)"
}

$repoRoot = (Get-Item $PSScriptRoot).Parent.Parent.FullName
$stampDate = Get-Date -Format "yyyy-MM-dd"

Write-Host "[INFO] Projet logique : $ProjectName" -ForegroundColor Cyan
Write-Host "[INFO] URL Supabase   : $($env:SUPABASE_URL)" -ForegroundColor Cyan
Write-Host ""

# --- Étape 1 : lister les buckets ---
Write-Host "[1/3] Liste des buckets..." -ForegroundColor Yellow
try {
    $allBuckets = Invoke-RestMethod -Uri "$apiBase/bucket" -Method Get -Headers $headers
} catch {
    Write-Host "[ERREUR] GET /storage/v1/bucket a échoué : $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

if (-not $allBuckets -or $allBuckets.Count -eq 0) {
    Write-Host "[WARN] Aucun bucket trouvé sur ce projet." -ForegroundColor Yellow
    exit 0
}

# Filtrage si -Buckets fourni
$targetBuckets = if ([string]::IsNullOrWhiteSpace($Buckets)) {
    $allBuckets
} else {
    $wanted = $Buckets.Split(',') | ForEach-Object { $_.Trim() }
    $allBuckets | Where-Object { $wanted -contains $_.name }
}

Write-Host "      $($targetBuckets.Count) bucket(s) à traiter : $(($targetBuckets | ForEach-Object { $_.name }) -join ', ')" -ForegroundColor Cyan
Write-Host ""

# --- Étape 2 & 3 : pour chaque bucket, lister + télécharger ---
$totalObjects = 0
$totalBytes = 0

foreach ($bucket in $targetBuckets) {
    $bucketName = $bucket.name
    Write-Host "[2/3] Bucket : $bucketName" -ForegroundColor Yellow

    $bucketOutDir = Join-Path $repoRoot (Join-Path $OutDir (Join-Path $ProjectName (Join-Path $bucketName $stampDate)))
    if (-not (Test-Path $bucketOutDir)) {
        New-Item -ItemType Directory -Path $bucketOutDir -Force | Out-Null
    }

    # Fonction récursive pour lister tous les objets d'un préfixe
    function Get-StorageObjects {
        param(
            [string]$BucketName,
            [string]$Prefix = ""
        )

        $offset = 0
        $limit = 1000
        $allObjects = @()

        while ($true) {
            $body = @{
                prefix = $Prefix
                limit  = $limit
                offset = $offset
                sortBy = @{ column = "name"; order = "asc" }
            } | ConvertTo-Json -Depth 5

            try {
                $page = Invoke-RestMethod `
                    -Uri "$apiBase/object/list/$BucketName" `
                    -Method Post `
                    -Headers $headers `
                    -ContentType "application/json" `
                    -Body $body
            } catch {
                Write-Host "[ERREUR] list/$BucketName (prefix=$Prefix, offset=$offset) : $($_.Exception.Message)" -ForegroundColor Red
                return $allObjects
            }

            if (-not $page -or $page.Count -eq 0) { break }

            foreach ($item in $page) {
                # Heuristique Supabase : un "dossier" a un id=null
                if ($null -eq $item.id) {
                    # C'est un sous-dossier : récurser
                    $subPrefix = if ([string]::IsNullOrEmpty($Prefix)) { $item.name } else { "$Prefix/$($item.name)" }
                    $allObjects += Get-StorageObjects -BucketName $BucketName -Prefix $subPrefix
                } else {
                    # C'est un fichier
                    $fullKey = if ([string]::IsNullOrEmpty($Prefix)) { $item.name } else { "$Prefix/$($item.name)" }
                    $allObjects += [PSCustomObject]@{
                        Key  = $fullKey
                        Size = $item.metadata.size
                    }
                }
            }

            if ($page.Count -lt $limit) { break }
            $offset += $limit
        }

        return $allObjects
    }

    $objects = Get-StorageObjects -BucketName $bucketName -Prefix ""
    Write-Host "      $($objects.Count) objet(s) trouvé(s)." -ForegroundColor Cyan

    if ($objects.Count -eq 0) { continue }

    Write-Host "[3/3] Téléchargement..." -ForegroundColor Yellow
    $i = 0
    foreach ($obj in $objects) {
        $i++
        $localPath = Join-Path $bucketOutDir ($obj.Key -replace '/', [IO.Path]::DirectorySeparatorChar)
        $localDir  = Split-Path $localPath -Parent
        if (-not (Test-Path $localDir)) {
            New-Item -ItemType Directory -Path $localDir -Force | Out-Null
        }

        # URL-encode le key (segments slash préservés)
        $encodedKey = ($obj.Key -split '/' | ForEach-Object { [Uri]::EscapeDataString($_) }) -join '/'
        $downloadUrl = "$apiBase/object/$bucketName/$encodedKey"

        try {
            Invoke-WebRequest -Uri $downloadUrl -Headers $headers -OutFile $localPath -ErrorAction Stop
            $totalObjects++
            if ($obj.Size) { $totalBytes += $obj.Size }
            if (($i % 25) -eq 0) {
                Write-Host "      [$i/$($objects.Count)] $($obj.Key)" -ForegroundColor Gray
            }
        } catch {
            Write-Host "[WARN] Échec téléchargement $($obj.Key) : $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }

    Write-Host "      OK bucket $bucketName" -ForegroundColor Green
    Write-Host ""
}

# --- Rapport ---
$totalMB = [math]::Round($totalBytes / 1MB, 2)
Write-Host "[OK] Sauvegarde Storage terminée." -ForegroundColor Green
Write-Host "     $totalObjects objets / $totalMB MB" -ForegroundColor Green
Write-Host "     Racine : $(Join-Path $repoRoot (Join-Path $OutDir $ProjectName))" -ForegroundColor Green
