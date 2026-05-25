# =====================================================================
# compute-migration-hashes.ps1 — Calcule les SHA-256 des 7 migrations
# ---------------------------------------------------------------------
# Contexte : étape 3 alignement du journal `drizzle.__drizzle_migrations`
# prod (actuellement 4/7 — 0004/0005/0006 apply via SQL direct mais
# non enregistrés dans le journal Drizzle).
# OPÉRATEUR : Yann (sub-agent ps_operator) — exécution locale uniquement.
# ---------------------------------------------------------------------
# Algorithme exact extrait de drizzle-orm/migrator.js (v0.39.3) ligne 23 :
#   hash = crypto.createHash('sha256').update(query).digest('hex')
# où `query` est le contenu BRUT du fichier .sql (sans normalisation,
# sans split, sans trim).
# created_at = journal.entries[i].when (millis epoch).
# ---------------------------------------------------------------------
# Ce script :
#   1. lit les 7 fichiers .sql et calcule leur SHA-256 hex ;
#   2. lit `_journal.json` pour récupérer le `when` (= created_at) ;
#   3. affiche un tableau aligné des 7 (id, tag, hash, created_at) ;
#   4. génère un INSERT SQL prêt à coller pour les 3 manquants
#      (0004/0005/0006) ;
#   5. génère un SELECT de cross-check des 4 hashs déjà connus
#      (0000-0003) à exécuter par Steve sur prod pour valider la formule.
#
# Aucun accès réseau, aucun secret, aucune écriture BDD.
# =====================================================================

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$repoRoot      = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$migrationsDir = Join-Path $repoRoot 'src\db\migrations'
$journalPath   = Join-Path $migrationsDir 'meta\_journal.json'

if (-not (Test-Path $journalPath)) {
    throw "Journal introuvable : $journalPath"
}

$journal = Get-Content -Raw $journalPath | ConvertFrom-Json
$rows    = @()

foreach ($entry in $journal.entries) {
    $sqlPath = Join-Path $migrationsDir "$($entry.tag).sql"
    if (-not (Test-Path $sqlPath)) {
        throw "Migration SQL introuvable : $sqlPath"
    }

    # IMPORTANT : lire en bytes pour matcher exactement Node fs.readFileSync().
    # On garde le contenu brut (BOM/CRLF/LF préservés comme sur disque).
    $bytes = [System.IO.File]::ReadAllBytes($sqlPath)
    $sha   = [System.Security.Cryptography.SHA256]::Create()
    $hash  = ($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) -join ''
    $sha.Dispose()

    $rows += [PSCustomObject]@{
        Id        = $entry.idx + 1
        Tag       = $entry.tag
        When      = $entry.when
        Hash      = $hash
        SizeBytes = $bytes.Length
    }
}

Write-Host "`n=== HASHS DES 7 MIGRATIONS (formule drizzle-orm@0.39.3) ===" -ForegroundColor Cyan
$rows | Format-Table Id, Tag, When, SizeBytes, Hash -AutoSize

# --- INSERT pret a coller pour 0004/0005/0006 ----------------------
$missing = $rows | Where-Object { $_.Tag -in @('0004_tender_deferral','0005_tandem_engine','0006_tandem_rls') }

Write-Host "`n=== INSERT SQL POUR ALIGNEMENT JOURNAL PROD (3 manquants) ===" -ForegroundColor Yellow
Write-Host "-- A executer par Steve sur prod APRES cross-check des 4 hashs deja connus."
Write-Host "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES"
$lines = @()
foreach ($r in $missing) {
    $lines += "  ('$($r.Hash)', $($r.When)) -- $($r.Tag)"
}
Write-Host (($lines -join ",`n") + ';')

# --- SELECT cross-check sur prod -----------------------------------
Write-Host "`n=== SELECT CROSS-CHECK SUR PROD (4 hashs deja connus) ===" -ForegroundColor Green
Write-Host "-- Steve : compare ces 4 hashs locaux avec ceux deja presents en prod."
Write-Host "-- Si match parfait => la formule est validee => INSERT ci-dessus est sur."
$known = $rows | Where-Object { $_.Id -le 4 }
foreach ($r in $known) {
    Write-Host ("-- attendu id={0} ({1}) : {2}" -f $r.Id, $r.Tag, $r.Hash)
}
Write-Host "SELECT id, hash, created_at FROM drizzle.__drizzle_migrations WHERE id <= 4 ORDER BY id;"
