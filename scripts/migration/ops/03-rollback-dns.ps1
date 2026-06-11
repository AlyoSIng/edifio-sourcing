# =============================================================================
# 03-rollback-dns.ps1
# -----------------------------------------------------------------------------
# Rollback DNS sourcing.edifio.fr si la bascule du 14/06 plante (etape 7 KO).
#
# POSTURE :
#   Le registrar utilise (OVH) n'a PAS d'API automatisable dans ce repo.
#   La bascule DNS se fait manuellement via le panel OVH (cf. memory
#   feedback_dns_consignes.md : "decrire les actions par clic exact").
#
#   => Ce script NE TOUCHE PAS au DNS directement. Il :
#     1. Snapshot l'etat DNS courant (Resolve-DnsName) -> fichier horodate
#     2. Compare a l'etat attendu rollback (CNAME vers l'ancien Vercel)
#     3. Imprime le pas-a-pas OVH (clic par clic) que Steve execute
#     4. Apres action de Steve, propose un re-snapshot pour valider le revert
#
#   Le passage en revert effectif passe par le flag -Confirm (lower-case) ou
#   par variable d'env $env:CONFIRM_ROLLBACK_DNS = "REVERT-SOURCING-EDIFIO".
#
# CIBLE ROLLBACK :
#   sourcing.edifio.fr -> CNAME vers cname.vercel-dns.com (projet ANCIEN
#   edifio-sourcing.vercel.app, scope teissiers-projects).
#
# AUTEUR : ps_operator (Yann) - 2026-06-11 - J-2 bascule monorepo 14/06
# =============================================================================

[CmdletBinding()]
param(
    [string]$DnsHost              = "sourcing.edifio.fr",
    [string]$LegacyProjectVercel  = "edifio-sourcing.vercel.app",
    [string]$MonorepoProjectVercel = "alyos-suivi-chantier.vercel.app",
    [string]$SnapshotDir          = "backups\dns-rollback",
    [switch]$Confirm
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Banner([string]$text) {
    Write-Host ""
    Write-Host "==============================================================================="
    Write-Host " $text"
    Write-Host "==============================================================================="
}
function Write-Step([string]$text) { Write-Host ""; Write-Host "--- $text ---" }
function Write-Ok([string]$text)   { Write-Host "[ OK ] $text" }
function Write-Warn2([string]$text){ Write-Host "[WARN] $text" }
function Write-Fail([string]$text) { Write-Host "[FAIL] $text" }
function Write-Info([string]$text) { Write-Host "[INFO] $text" }

# --- Garde-fou : confirmation explicite OBLIGATOIRE --------------------------

$confirmedByFlag = $Confirm.IsPresent
$confirmedByEnv  = ($env:CONFIRM_ROLLBACK_DNS -eq "REVERT-SOURCING-EDIFIO")

if (-not ($confirmedByFlag -or $confirmedByEnv)) {
    Write-Banner "03-rollback-dns.ps1 - lecture seule (pas de -Confirm)"
    Write-Info "Sans confirmation explicite, ce script se contente d'afficher l'etat DNS courant"
    Write-Info "et le plan de rollback. Aucune action sur OVH n'est suggeree comme 'a faire maintenant'."
    Write-Info ""
    Write-Info "Pour lancer le mode rollback (=> imprime le pas-a-pas OVH a executer) :"
    Write-Info "  .\scripts\migration\ops\03-rollback-dns.ps1 -Confirm"
    Write-Info "  OU"
    Write-Info "  `$env:CONFIRM_ROLLBACK_DNS = 'REVERT-SOURCING-EDIFIO'"
    Write-Info "  .\scripts\migration\ops\03-rollback-dns.ps1"
}

Write-Banner "03-rollback-dns.ps1 - snapshot + plan rollback DNS"
Write-Info "Host         : $DnsHost"
Write-Info "Legacy       : $LegacyProjectVercel  (cible rollback)"
Write-Info "Monorepo     : $MonorepoProjectVercel  (etat actuel si bascule reussie)"
Write-Info "Snapshot dir : $SnapshotDir"

# --- 1. Creation du dossier snapshot -----------------------------------------

if (-not (Test-Path -LiteralPath $SnapshotDir)) {
    New-Item -ItemType Directory -Force -Path $SnapshotDir | Out-Null
    Write-Ok "Dossier $SnapshotDir cree."
}

$ts = Get-Date -Format "yyyyMMdd_HHmmss"
$snapshotFile = Join-Path $SnapshotDir "dns_${DnsHost}_${ts}.txt"

# --- 2. Snapshot DNS courant -------------------------------------------------

Write-Step "Snapshot DNS courant - $DnsHost"

$snapshotLines = @()
$snapshotLines += "# Snapshot DNS - $DnsHost - $(Get-Date -Format o)"
$snapshotLines += "# Auteur : 03-rollback-dns.ps1 (ps_operator / Yann)"
$snapshotLines += ""

try {
    $recs = Resolve-DnsName -Name $DnsHost -Type A_AAAA -DnsOnly -ErrorAction Stop
    foreach ($rec in $recs) {
        switch ($rec.Type) {
            "CNAME" { $line = "CNAME $($rec.Name) -> $($rec.NameHost)" }
            "A"     { $line = "A     $($rec.Name) -> $($rec.IPAddress)" }
            "AAAA"  { $line = "AAAA  $($rec.Name) -> $($rec.IPAddress)" }
            default { $line = "$($rec.Type) $($rec.Name) -> $($rec | Out-String)" }
        }
        Write-Host "  $line"
        $snapshotLines += $line
    }
} catch {
    Write-Fail "Resolve-DnsName a echoue : $($_.Exception.Message)"
    $snapshotLines += "ERROR : $($_.Exception.Message)"
}

# Detection etat courant
$pointsToMonorepo = $false
$pointsToLegacy   = $false
foreach ($rec in $recs) {
    if ($rec.Type -eq "CNAME") {
        if ($rec.NameHost -like "*$MonorepoProjectVercel*") { $pointsToMonorepo = $true }
        if ($rec.NameHost -like "*$LegacyProjectVercel*")   { $pointsToLegacy = $true }
    }
}

$snapshotLines += ""
$snapshotLines += "# Etat detecte"
$snapshotLines += "# - points_to_monorepo : $pointsToMonorepo"
$snapshotLines += "# - points_to_legacy   : $pointsToLegacy"

Set-Content -LiteralPath $snapshotFile -Value $snapshotLines -Encoding UTF8
Write-Ok "Snapshot ecrit : $snapshotFile"

# --- 3. Plan rollback --------------------------------------------------------

Write-Step "Etat detecte"
if ($pointsToMonorepo) {
    Write-Warn2 "DNS pointe actuellement vers le MONOREPO (bascule effective)."
    Write-Warn2 "Rollback necessaire si le smoke prod a echoue."
} elseif ($pointsToLegacy) {
    Write-Ok "DNS pointe DEJA vers l'ancien Vercel - rien a faire (deja en rollback ou bascule pas encore faite)."
    exit 0
} else {
    Write-Warn2 "Resolution DNS ambigue (ni monorepo ni legacy detecte clairement)."
    Write-Warn2 "Inspecter le snapshot manuellement : $snapshotFile"
}

if (-not ($confirmedByFlag -or $confirmedByEnv)) {
    Write-Step "Mode lecture seule - pas de pas-a-pas affiche"
    Write-Info "Snapshot disponible : $snapshotFile"
    Write-Info "Pour le pas-a-pas OVH, relancer avec -Confirm."
    exit 0
}

# --- 4. Pas-a-pas OVH (clic par clic, en respect de memory) ------------------

Write-Banner "PLAN ROLLBACK DNS - pas-a-pas OVH (Steve execute manuellement)"

Write-Host @"

OBJECTIF : ramener sourcing.edifio.fr vers l'ancien Vercel ($LegacyProjectVercel)
pour invalider la bascule monorepo et restaurer le service tel qu'avant 8h00.

ETAPE 1 - Connexion OVH
  1.1  Ouvrir https://www.ovh.com/manager/ dans un navigateur prive
  1.2  Se connecter avec le compte AlyoS (1Password : "OVH AlyoS admin")
  1.3  Si MFA active : entrer le code TOTP

ETAPE 2 - Naviguer vers la zone DNS edifio.fr
  2.1  Dans la barre laterale gauche : cliquer "Web Cloud"
  2.2  Cliquer "Noms de domaine" -> trouver "edifio.fr" dans la liste -> clic
  2.3  Onglet en haut : cliquer "Zone DNS"

ETAPE 3 - Reperer l'enregistrement CNAME sourcing.edifio.fr
  3.1  Champ "Filtrer la zone" : taper "sourcing"
  3.2  Verifier que la ligne affichee correspond a :
         Sous-domaine : sourcing
         Type         : CNAME
         Cible        : (devrait actuellement pointer vers $MonorepoProjectVercel
                         ou cname.vercel-dns.com cote monorepo)

ETAPE 4 - Editer l'enregistrement
  4.1  Cliquer l'icone "..." (trois points) en bout de ligne du CNAME sourcing
  4.2  Selectionner "Modifier"
  4.3  Dans le champ "Cible", remplacer la valeur actuelle par :
         cname.vercel-dns.com
       (Vercel mutualise ce CNAME pour tous les projets. Le routage projet
       se fait via la table interne Vercel selon le domaine attache.)
  4.4  CRITIQUE : verifier que l'ancien projet Vercel edifio-sourcing a
       toujours le domaine sourcing.edifio.fr ATTACHE :
         a) Aller sur https://vercel.com/teissiers-projects/edifio-sourcing/settings/domains
         b) Verifier que "sourcing.edifio.fr" est dans la liste avec statut "Valid"
         c) Si absent : cliquer "Add Domain" -> taper "sourcing.edifio.fr" -> Add
       Sans ca, le CNAME OVH pointe correctement mais Vercel renverra 404.

ETAPE 5 - Valider la modif OVH
  5.1  Cliquer "Suivant" puis "Valider" dans le modal OVH
  5.2  OVH affiche "Modification effectuee" en haut a droite
  5.3  TTL par defaut : 3600s. La propagation prend 5-15 min en general.

ETAPE 6 - Verifier la propagation (cote Steve)
  6.1  Depuis la session PowerShell :
         Resolve-DnsName -Name sourcing.edifio.fr -Server 1.1.1.1 -Type A_AAAA
         (le serveur 1.1.1.1 bypass le cache resolveur OVH/box)
  6.2  Attendre que le CNAME affiche NameHost = cname.vercel-dns.com
  6.3  Re-lancer ce script SANS -Confirm pour comparer au snapshot pris ci-dessus.

ETAPE 7 - Smoke post-rollback
  7.1  Verifier que sourcing.edifio.fr re-affiche bien l'ancienne app
       (logo Sourcing standalone, pas le shell monorepo)
  7.2  Pinger Sebastien sur le canal visio : "DNS rollback effectif, ancien
       Sourcing servant a nouveau, on annule la bascule cote BDD."

ETAPE 8 - Decision suite
  8.1  Si rollback DNS pose mais BDD monorepo deja ecrite avec donnees Sourcing
       => suivre runbook section "Rollback complet" : pg_restore du dump
          sourcing-prod pris a 8h10-8h30 etape 2 du runbook.
  8.2  Post-mortem oblige : tout rollback declenche un CC_AAMMJJ_INCIDENT_*.md
       dans notes-de-suivi/ avec timeline + cause racine + leson.

"@

Write-Ok "Pas-a-pas affiche. Steve execute cote panel OVH."
Write-Info "Le snapshot pre-action est conserve ici : $snapshotFile"
Write-Info "Apres rollback effectif, re-lancer ce script sans -Confirm pour comparer."

exit 0
