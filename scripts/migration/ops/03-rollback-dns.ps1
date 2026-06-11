# =============================================================================
# 03-rollback-dns.ps1
# -----------------------------------------------------------------------------
# Rollback domaine sourcing.edifio.fr si la bascule du 14/06 plante (etape 7 KO).
#
# POSTURE (decision Steve 12/06, alignee sur ROLLBACK_BASCULE_140626.md R1) :
#   ON NE TOUCHE PAS A OVH. Le CNAME registrar pointe deja vers
#   cname.vercel-dns.com (CNAME mutualise Vercel) : le routage projet se fait
#   cote Vercel via la table interne des domaines attaches.
#
#   Le rollback consiste donc a :
#     1. Retirer "sourcing.edifio.fr" du projet Vercel monorepo
#        (alyos-suivi-chantier)
#     2. Re-attacher "sourcing.edifio.fr" au projet Vercel standalone
#        (edifio-sourcing)
#     3. Verifier la propagation (~30s a 2 min selon TTL Vercel)
#
#   => Ce script :
#     1. Snapshot l'etat DNS + CNAME actuel (Resolve-DnsName) -> fichier horodate
#     2. Imprime le pas-a-pas VERCEL (clic par clic dans le dashboard)
#     3. Apres action de Steve, propose un re-snapshot pour valider le revert
#
#   Le passage en revert effectif passe par le flag -Confirm (lower-case) ou
#   par variable d'env $env:CONFIRM_ROLLBACK_DNS = "REVERT-SOURCING-EDIFIO".
#
# CIBLE ROLLBACK :
#   sourcing.edifio.fr -> domaine attache au projet Vercel ANCIEN
#   edifio-sourcing.vercel.app (scope teissiers-projects).
#
# CAS HORS PERIMETRE :
#   Pour un rollback TARDIF (J+1 a J+7), voir docs/ROLLBACK_BASCULE_140626.md
#   cas R2 (rejeu BDD + reattache domaine). Ce script alerte si invoque > 24h
#   apres la bascule.
#
# OPTION OVH (extreme fallback) : si le retrait/reattache cote Vercel echoue
#   (bug propagation, regions cassees), voir section commentee en bas du
#   fichier "# OPTION J+1 - rollback OVH si Vercel only insuffisant". A
#   declencher uniquement sur OK Board explicite.
#
# AUTEUR : ps_operator (Yann) - 2026-06-11 - J-2 bascule monorepo 14/06
#          v2 2026-06-12 - bascule posture "Vercel only" (audit Camille F-03)
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
    Write-Info "et le plan de rollback. Aucune action n'est suggeree comme 'a faire maintenant'."
    Write-Info ""
    Write-Info "Pour lancer le mode rollback (=> imprime le pas-a-pas VERCEL a executer) :"
    Write-Info "  .\scripts\migration\ops\03-rollback-dns.ps1 -Confirm"
    Write-Info "  OU"
    Write-Info "  `$env:CONFIRM_ROLLBACK_DNS = 'REVERT-SOURCING-EDIFIO'"
    Write-Info "  .\scripts\migration\ops\03-rollback-dns.ps1"
}

# --- Garde-fou : rollback tardif (J+1 a J+7) ---------------------------------
# Si on detecte que la bascule remonte a > 24h, le rollback "a chaud" cote
# Vercel only n'est plus suffisant (la BDD monorepo a recu des ecritures Sourcing).
# On affiche un message clair pour rediriger vers ROLLBACK_BASCULE_140626.md cas R2.

$bascule = [datetime]"2026-06-14 08:00:00"
$now = Get-Date
$hoursSinceBascule = ($now - $bascule).TotalHours
if ($hoursSinceBascule -gt 24) {
    Write-Warn2 ""
    Write-Warn2 "============================================================"
    Write-Warn2 "ROLLBACK TARDIF DETECTE (> 24h apres bascule du 14/06 08h00)"
    Write-Warn2 "============================================================"
    Write-Warn2 "Ce script couvre uniquement le rollback A CHAUD dimanche"
    Write-Warn2 "(fenetre 9h45-11h00, cas R1)."
    Write-Warn2 ""
    Write-Warn2 "Pour un rollback tardif J+1 a J+7, voir :"
    Write-Warn2 "  docs/ROLLBACK_BASCULE_140626.md - cas R2"
    Write-Warn2 "  (rejeu BDD obligatoire AVANT de reattacher le domaine)"
    Write-Warn2 "============================================================"
    Write-Warn2 ""
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

# --- 4. Pas-a-pas VERCEL (clic par clic, posture "Vercel only") --------------

Write-Banner "PLAN ROLLBACK DOMAINE - pas-a-pas VERCEL (Steve execute manuellement)"

Write-Host @"

OBJECTIF : ramener sourcing.edifio.fr vers l'ancien projet Vercel
($LegacyProjectVercel) pour invalider la bascule monorepo et restaurer le
service tel qu'avant 8h00. On NE TOUCHE PAS a OVH (le CNAME registrar pointe
deja sur cname.vercel-dns.com mutualise, le routage projet se fait cote Vercel).

ETAPE 1 - Connexion Vercel
  1.1  Ouvrir https://vercel.com/login dans un navigateur prive
  1.2  Se connecter avec le compte AlyoS (1Password : "Vercel AlyoS admin")
  1.3  Si MFA active : entrer le code TOTP
  1.4  Verifier en haut a gauche que le scope est bien "teissiers-projects"
       (et non un compte personnel)

ETAPE 2 - Retirer sourcing.edifio.fr du projet MONOREPO
  2.1  Dans la liste des projets, cliquer "alyos-suivi-chantier"
       (URL directe : https://vercel.com/teissiers-projects/alyos-suivi-chantier)
  2.2  Onglet en haut : cliquer "Settings"
  2.3  Menu lateral gauche : cliquer "Domains"
  2.4  Reperer la ligne "sourcing.edifio.fr" dans la liste des domaines attaches
  2.5  Cliquer l'icone "..." (trois points) en bout de ligne
  2.6  Selectionner "Remove"
  2.7  Dans la modale de confirmation : taper "sourcing.edifio.fr" puis cliquer
       "Remove" (Vercel demande de retaper le nom du domaine, anti-doigt-qui-glisse)
  2.8  Vercel confirme "Domain removed" en haut a droite

ETAPE 3 - Re-attacher sourcing.edifio.fr au projet STANDALONE
  3.1  Retour a la liste des projets (clic logo Vercel en haut a gauche)
  3.2  Cliquer le projet "edifio-sourcing"
       (URL directe : https://vercel.com/teissiers-projects/edifio-sourcing)
  3.3  Onglet "Settings" -> Menu "Domains"
  3.4  CRITIQUE : verifier que "sourcing.edifio.fr" N'EST PAS deja dans la liste
       (si oui : pas besoin de re-ajouter, passer a l'etape 4). C'est un cas
       possible si la bascule cote standalone n'a pas ete propre samedi soir.
  3.5  Si absent : cliquer "Add Domain"
  3.6  Taper "sourcing.edifio.fr" dans le champ
  3.7  Cliquer "Add"
  3.8  Vercel affiche "Valid Configuration" en quelques secondes
       (le CNAME OVH pointe deja correctement vers cname.vercel-dns.com,
       donc la verification est immediate)

ETAPE 4 - Verifier la propagation
  4.1  Vercel propage la table de routage interne en ~30s a 2 min (TTL Vercel,
       PAS le TTL OVH puisqu'on n'a pas touche au DNS registrar)
  4.2  Depuis la session PowerShell, faire un test HTTP repete :
         1..10 | ForEach-Object {
           Invoke-WebRequest -Uri "https://sourcing.edifio.fr/" -Method HEAD -UseBasicParsing
           Start-Sleep -Seconds 5
         }
       Attendre que le header "x-vercel-id" indique le projet edifio-sourcing
       (le prefixe peut varier mais le scope projet est trace).
  4.3  Re-lancer ce script SANS -Confirm pour comparer au snapshot pris ci-dessus.

ETAPE 5 - Smoke post-rollback
  5.1  Verifier que sourcing.edifio.fr re-affiche bien l'ancienne app
       (logo Sourcing standalone, pas le shell monorepo Suivi/ACT)
  5.2  Pinger Sebastien sur le canal visio : "Domaine repointe Vercel, ancien
       Sourcing servant a nouveau, on annule la bascule cote BDD."

ETAPE 6 - Decision suite
  6.1  Si retrait/reattache cote Vercel pose mais BDD monorepo deja ecrite
       avec donnees Sourcing :
       => suivre runbook section "Rollback complet" : pg_restore du dump
          sourcing-prod pris a 8h10-8h30 etape 2 du runbook.
  6.2  Post-mortem oblige : tout rollback declenche un CC_AAMMJJ_INCIDENT_*.md
       dans notes-de-suivi/ avec timeline + cause racine + lecons.

ETAPE 7 - Fallback Vercel KO (rare)
  7.1  Si l'etape 3 retourne "Domain in use" ou si Vercel renvoie 404 apres
       reattache pendant > 10 min : Vercel a un bug de propagation rare. Dans
       ce cas seulement, voir la section commentee en bas de ce script
       "OPTION J+1 - rollback OVH si Vercel only insuffisant" - elle decrit
       le pas-a-pas OVH historique. Necessite OK Board explicite.

"@

Write-Ok "Pas-a-pas affiche. Steve execute cote dashboard Vercel."
Write-Info "Le snapshot pre-action est conserve ici : $snapshotFile"
Write-Info "Apres rollback effectif, re-lancer ce script sans -Confirm pour comparer."

exit 0

# =============================================================================
# OPTION J+1 - rollback OVH si Vercel only insuffisant
# -----------------------------------------------------------------------------
# Section commentee (jamais executee) - reference historique.
#
# A declencher UNIQUEMENT sur OK Board explicite si :
#   - Le retrait/reattache cote Vercel echoue (bug propagation > 10 min)
#   - OU on est en J+1 a J+7 avec ROLLBACK_BASCULE_140626.md R2 qui exige
#     un bascule DNS effective (pas seulement Vercel)
#   - OU edifio.fr change de registrar entre temps et le CNAME doit etre
#     re-cree manuellement
#
# Pas-a-pas OVH historique (v1 du script, conserve ici pour reference) :
#
# ETAPE 1 - Connexion OVH
#   1.1  Ouvrir https://www.ovh.com/manager/ dans un navigateur prive
#   1.2  Se connecter avec le compte AlyoS (1Password : "OVH AlyoS admin")
#   1.3  Si MFA active : entrer le code TOTP
#
# ETAPE 2 - Naviguer vers la zone DNS edifio.fr
#   2.1  Dans la barre laterale gauche : cliquer "Web Cloud"
#   2.2  Cliquer "Noms de domaine" -> trouver "edifio.fr" dans la liste -> clic
#   2.3  Onglet en haut : cliquer "Zone DNS"
#
# ETAPE 3 - Reperer l'enregistrement CNAME sourcing.edifio.fr
#   3.1  Champ "Filtrer la zone" : taper "sourcing"
#   3.2  Verifier que la ligne affichee correspond a :
#          Sous-domaine : sourcing
#          Type         : CNAME
#          Cible        : (devrait actuellement pointer vers cname.vercel-dns.com)
#
# ETAPE 4 - Editer l'enregistrement
#   4.1  Cliquer l'icone "..." (trois points) en bout de ligne du CNAME sourcing
#   4.2  Selectionner "Modifier"
#   4.3  Dans le champ "Cible", remplacer la valeur actuelle par :
#          cname.vercel-dns.com  (inchange si deja la, mais on force la propagation)
#   4.4  CRITIQUE : verifier que l'ancien projet Vercel edifio-sourcing a
#        toujours le domaine sourcing.edifio.fr ATTACHE :
#          a) Aller sur https://vercel.com/teissiers-projects/edifio-sourcing/settings/domains
#          b) Verifier que "sourcing.edifio.fr" est dans la liste avec statut "Valid"
#          c) Si absent : cliquer "Add Domain" -> taper "sourcing.edifio.fr" -> Add
#        Sans ca, le CNAME OVH pointe correctement mais Vercel renverra 404.
#
# ETAPE 5 - Valider la modif OVH
#   5.1  Cliquer "Suivant" puis "Valider" dans le modal OVH
#   5.2  OVH affiche "Modification effectuee" en haut a droite
#   5.3  TTL par defaut : 3600s. La propagation prend 5-15 min en general.
#
# ETAPE 6 - Verifier la propagation (cote Steve)
#   6.1  Depuis la session PowerShell :
#          Resolve-DnsName -Name sourcing.edifio.fr -Server 1.1.1.1 -Type A_AAAA
#          (le serveur 1.1.1.1 bypass le cache resolveur OVH/box)
#   6.2  Attendre que le CNAME affiche NameHost = cname.vercel-dns.com
#   6.3  Re-lancer ce script SANS -Confirm pour comparer au snapshot pris au-dessus.
# =============================================================================
