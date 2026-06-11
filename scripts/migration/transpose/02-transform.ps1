# =============================================================================
# 02-transform.ps1 - Transformation du dump data-only : public.* -> sourcing.*
# =============================================================================
# Entree  : backups/sourcing-data.sql (produit par 01-export-source.ps1, PLAIN,
#           --quote-all-identifiers)
# Sortie  : backups/sourcing-data.transformed.sql
#
# TECHNIQUE RETENUE (pas de sed aveugle - les donnees jsonb/raw_data peuvent
# contenir la chaine "public.") :
#   1. pg_dump est lance avec --quote-all-identifiers -> chaque bloc de donnees
#      commence par une ligne statement EXACTE :
#        COPY "public"."<table>" ("col1", ...) FROM stdin;
#   2. Machine a etats : on ne touche JAMAIS aux lignes situees entre un
#      "FROM stdin;" et le terminateur "\." (donnees brutes). Seules les lignes
#      statement hors bloc de donnees sont candidates au rewrite.
#   3. Le rewrite n'est applique que si la table extraite appartient a la liste
#      explicite des 49 tables (sourcing-tables.txt). Table inconnue -> ERREUR
#      (le dump ne correspond pas au schema attendu). users/memberships/
#      organizations presentes -> ERREUR (01 a mal exclu l'identity).
#
# COLONNE actor_role (audit_logs) : enum membership_role en source, text en
# cible (0129). Le format texte de COPY transporte les labels ('admin', ...)
# tels quels -> aucun cast explicite necessaire au chargement. Idem pour tous
# les enums public.* -> sourcing.* (memes labels).
#
# EN-TETE INJECTE dans le fichier transforme :
#   - SET session_replication_role = replica
#       -> desactive triggers ET validation FK pendant le COPY (l'ordre des
#          tables du dump n'est pas garanti FK-safe : response_files.be_id
#          reference bureaux_etudes creee plus tard, etc.).
#       -> CONTREPARTIE : les FK ne sont PAS verifiees au chargement ; c'est
#          l'assertion A8 de 05-assertions.sql (boucle anti-jointures sur
#          toutes les FK du schema sourcing) qui fait la validation.
#   - TRUNCATE des 49 tables sourcing.*
#       -> rend le chargement IDEMPOTENT (2 runs = memes assertions, critere
#          GO/NO-GO P1) et purge les seeds 0131 (platforms/specialties) dont
#          les ids entreraient en collision avec les ids prod references par
#          tenders.platform_id. TRUNCATE passe sur audit_logs car les triggers
#          d'immutabilite (reject_audit_mutation) sont ROW-level UPDATE/DELETE
#          uniquement - TRUNCATE ne les declenche pas.
#
# ASCII only (PS 5.1 sans BOM - incident accents 10/06).
# =============================================================================
[CmdletBinding()]
param(
    [string]$InputFile,
    [string]$OutputFile,
    [string]$TablesFile
)

$ErrorActionPreference = "Stop"

$repoRoot = (Get-Item $PSScriptRoot).Parent.Parent.Parent.FullName
if (-not $InputFile)  { $InputFile  = Join-Path $repoRoot "backups\sourcing-data.sql" }
if (-not $OutputFile) { $OutputFile = Join-Path $repoRoot "backups\sourcing-data.transformed.sql" }
if (-not $TablesFile) { $TablesFile = Join-Path $PSScriptRoot "sourcing-tables.txt" }

if (-not (Test-Path $InputFile)) {
    Write-Host "[REFUS] Introuvable : $InputFile (lancer 01-export-source.ps1 d'abord)." -ForegroundColor Red
    exit 1
}

$tables = @(Get-Content $TablesFile | Where-Object { $_ -and ($_ -notmatch '^\s*#') } | ForEach-Object { $_.Trim() })
if ($tables.Count -ne 49) {
    Write-Host "[REFUS] sourcing-tables.txt : 49 tables attendues, $($tables.Count) lues." -ForegroundColor Red
    exit 1
}
$tableSet = @{}
foreach ($t in $tables) { $tableSet[$t] = 0 }   # valeur = nb de blocs COPY vus
$identityTables = @("users", "memberships", "organizations")

# --- Lecture/ecriture en flux, UTF8 sans BOM, fins de ligne LF preservees ---
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$reader = New-Object System.IO.StreamReader($InputFile, $utf8NoBom)
$writer = New-Object System.IO.StreamWriter($OutputFile, $false, $utf8NoBom)
$writer.NewLine = "`n"

# --- En-tete : ON_ERROR_STOP + replica + TRUNCATE (cf. bloc de doc ci-dessus) ---
$truncateList = ($tables | ForEach-Object { "sourcing.""$_""" }) -join ", "
$writer.WriteLine("-- Genere par 02-transform.ps1 le $(Get-Date -Format 'yyyy-MM-dd HH:mm') - NE PAS EDITER A LA MAIN")
$writer.WriteLine("-- Source : sourcing-data.sql (pg_dump data-only prod Sourcing)")
$writer.WriteLine("\set ON_ERROR_STOP on")
$writer.WriteLine("SET session_replication_role = replica;")
$writer.WriteLine("TRUNCATE TABLE $truncateList;")
$writer.WriteLine("")

# --- Machine a etats ---
$copyPattern = '^COPY "public"\."([A-Za-z0-9_]+)" \(.*\) FROM stdin;$'
$inCopyData = $false
$lineNum = 0
$rewritten = 0
$errors = New-Object System.Collections.Generic.List[string]

while ($null -ne ($line = $reader.ReadLine())) {
    $lineNum++
    if ($inCopyData) {
        if ($line -eq '\.') { $inCopyData = $false }
        $writer.WriteLine($line)
        continue
    }
    if ($line -match $copyPattern) {
        $tbl = $Matches[1]
        if ($identityTables -contains $tbl) {
            $errors.Add("ligne ${lineNum}: table identity '$tbl' presente dans le dump - relancer 01 (exclusions manquantes)")
            $writer.WriteLine($line)   # on ecrit quand meme, le run est invalide de toute facon
        } elseif ($tableSet.ContainsKey($tbl)) {
            $tableSet[$tbl]++
            $rewritten++
            $writer.WriteLine(('COPY "sourcing".' + $line.Substring(14)))   # 'COPY "public".' = 14 chars (0..13)
        } else {
            $errors.Add("ligne ${lineNum}: table inconnue '$tbl' (absente de sourcing-tables.txt) - mettre a jour la liste ou exclure la table")
            $writer.WriteLine($line)
        }
        $inCopyData = $true
        continue
    }
    if ($line -match '^COPY ') {
        # Un COPY qui n'a pas la forme attendue = dump non conforme (pas de --quote-all-identifiers ?)
        $errors.Add("ligne ${lineNum}: statement COPY de forme inattendue - le dump a-t-il ete produit par 01 (--quote-all-identifiers) ?")
        $writer.WriteLine($line)
        $inCopyData = $true
        continue
    }
    $writer.WriteLine($line)
}

# --- Pied : retablit la validation pour la suite de la session psql ---
$writer.WriteLine("")
$writer.WriteLine("SET session_replication_role = DEFAULT;")

$reader.Close()
$writer.Close()

# --- Verifications finales ---
if ($inCopyData) {
    $errors.Add("fin de fichier atteinte au milieu d'un bloc COPY (dump tronque ?)")
}
$missingTables = @($tables | Where-Object { $tableSet[$_] -eq 0 })

Write-Host ""
Write-Host "=== TRANSFORMATION ===" -ForegroundColor Cyan
Write-Host "  Lignes lues            : $lineNum"
Write-Host "  Blocs COPY reecrits    : $rewritten / 49 attendus"
if ($missingTables.Count -gt 0) {
    # pg_dump emet un bloc COPY meme pour une table vide : absence = anomalie reelle.
    Write-Host "[ERREUR] Tables absentes du dump : $($missingTables -join ', ')" -ForegroundColor Red
    $errors.Add("tables absentes du dump : $($missingTables -join ', ')")
}
if ($errors.Count -gt 0) {
    Write-Host ""
    Write-Host "[ECHEC] $($errors.Count) erreur(s) :" -ForegroundColor Red
    $errors | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    Remove-Item $OutputFile -ErrorAction SilentlyContinue
    exit 1
}
Write-Host ""
Write-Host "[OK] Fichier transforme : $OutputFile" -ForegroundColor Green
Write-Host "[NEXT] .\scripts\migration\transpose\04-load-data.ps1 (cible = BDD monorepo)" -ForegroundColor Cyan
