# ============================================================================
# dryrun-monorepo-bench.ps1 - banc de dry-run migration monorepo (sprint 14/06)
# ============================================================================
# Monte un postgres:17 local (port 5434), pose les stubs Supabase, applique les
# migrations du monorepo (0001-0128) puis, si presents, les fichiers Sourcing
# 0129+ de la branche migration/sourcing-schema.
#
# Usage :
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\migration\dryrun-monorepo-bench.ps1
#   (relancable - detruit et recree le container a chaque run)
#
# Prerequis : Docker Desktop UP, clone monorepo en C:\Dev\alyos-suivi-chantier.
# NB : fichier volontairement 100% ASCII (PowerShell 5.1 lit les .ps1 sans BOM
# en ANSI - les caracteres non-ASCII cassent le parseur).
# ============================================================================

$ErrorActionPreference = "Continue"
$MonorepoMigrations = "C:\Dev\alyos-suivi-chantier\app\db\migrations"
$SourcingScripts    = "C:\Dev\edifio-sourcing\scripts\migration"
$Container          = "pg-monorepo-dryrun"
$FailLog            = "C:\Dev\edifio-sourcing\logs\dryrun-monorepo-failures.log"

if (-not (Test-Path $MonorepoMigrations)) { Write-Host "ERREUR : $MonorepoMigrations introuvable" -ForegroundColor Red; exit 1 }
New-Item -ItemType Directory -Force -Path "C:\Dev\edifio-sourcing\logs" | Out-Null
if (Test-Path $FailLog) { Remove-Item $FailLog -Force }

Write-Host "=== 1/4 Container postgres:17 (port 5434) ===" -ForegroundColor Cyan
docker rm -f $Container 2>$null | Out-Null
docker run -d --name $Container -p 5434:5432 -e POSTGRES_PASSWORD=dryrun123 `
  -v "${MonorepoMigrations}:/mono-migrations:ro" `
  -v "${SourcingScripts}:/sourcing-scripts:ro" `
  postgres:17 | Out-Null

$ready = $false
foreach ($i in 1..30) {
  Start-Sleep -Seconds 2
  docker exec $Container pg_isready -U postgres 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) { $ready = $true; break }
}
if (-not $ready) { Write-Host "ERREUR : postgres pas pret apres 60s" -ForegroundColor Red; exit 1 }
Write-Host "Container pret." -ForegroundColor Green

Write-Host "=== 2/4 Stubs Supabase (roles, auth, storage) ===" -ForegroundColor Cyan
docker exec $Container psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /sourcing-scripts/dryrun-supabase-stubs.sql
if ($LASTEXITCODE -ne 0) { Write-Host "ERREUR : stubs KO - STOP" -ForegroundColor Red; exit 1 }

Write-Host "=== 3/4 Migrations monorepo ===" -ForegroundColor Cyan
$files = Get-ChildItem $MonorepoMigrations -Filter "*.sql" | Sort-Object Name
$applied = 0; $failed = 0
foreach ($f in $files) {
  docker exec $Container psql -U postgres -d postgres -q -v ON_ERROR_STOP=1 -f "/mono-migrations/$($f.Name)" 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) {
    $applied++
  } else {
    $failed++
    Add-Content $FailLog $f.Name
    Write-Host "  FAIL: $($f.Name)" -ForegroundColor Yellow
  }
}
$color = "Yellow"
if ($failed -le 5) { $color = "Green" }
Write-Host "Monorepo : $applied OK / $failed KO (details: $FailLog)" -ForegroundColor $color
Write-Host "NB : KO tolerables sur seeds de donnees / policies storage." -ForegroundColor DarkGray
Write-Host "     KO NON tolerables sur CREATE TABLE / SCHEMA structurels." -ForegroundColor DarkGray

Write-Host "=== 4/4 Migrations Sourcing 0129+ ===" -ForegroundColor Cyan
$sourcing = $files | Where-Object { $_.Name -match "^01(29|3[0-9])" }
if ($sourcing.Count -eq 0) {
  Write-Host "Aucun fichier 0129+ detecte - Lot 2a pas encore livre." -ForegroundColor Yellow
  Write-Host "Quand Alex livre : relancer ce script, OU appliquer juste les 3 fichiers :" -ForegroundColor Yellow
  Write-Host "  docker exec pg-monorepo-dryrun psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /mono-migrations/0129_sourcing_schema.sql -f /mono-migrations/0130_sourcing_rls.sql -f /mono-migrations/0131_sourcing_seed_platforms.sql"
} else {
  $names = ($sourcing | ForEach-Object { $_.Name }) -join ", "
  Write-Host "Fichiers Sourcing detectes et appliques dans la boucle : $names" -ForegroundColor Green
  Write-Host "Verification des tables du schema sourcing :" -ForegroundColor Cyan
  docker exec $Container psql -U postgres -d postgres -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'sourcing' ORDER BY table_name;"
}

Write-Host ""
Write-Host "Banc pret. Le container $Container reste UP (port 5434) pour inspections SQL." -ForegroundColor Green
