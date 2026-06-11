# =============================================================================
# 04-cleanup-edifio-sourcing.ps1
# -----------------------------------------------------------------------------
# Orchestrateur du cleanup repo edifio-sourcing POST-bascule monorepo 14/06.
#
# ROLE :
#   Apres confirmation que la prod monorepo alyos-suivi-chantier tourne bien,
#   ce script execute les actions de mise en archive du repo edifio-sourcing :
#     1. Bannieres + commit README archive (substitution COMMIT_SHA_GEL)
#     2. Branch protection main (lock_branch: true)
#     3. Deplacement workflows GitHub Actions vers .github/workflows-archived/
#     4. Suppression secrets GitHub residuels (apres sauvegarde locale)
#
# CE QUE LE SCRIPT NE FAIT PAS (manuel) :
#   - Pause projet Vercel : manuel via UI (pas d'API "pause" Vercel officielle).
#   - Archive repo GitHub (Settings -> Danger Zone) : MANUEL TRIPLE-VERIF.
#     Une commande `gh repo archive` existe mais on l'evite ici car
#     quasi-irreversible et risque de "doigt qui glisse" sur le mauvais -R.
#
# IDEMPOTENCE :
#   Chaque etape verifie l'etat avant action. Relancer le script ne casse rien.
#
# CONFIRMATION :
#   Chaque action destructive demande "CLEANUP-CONFIRM" tape a la main.
#   Pas de --force, pas de --no-verify.
#
# CODES RETOUR :
#   0  = toutes etapes OK ou SKIP (idempotent, etat final atteint)
#   1  = au moins une etape FAIL critique (commit, push, gh api)
#   2  = etapes WARN (manuels en attente, prerequisites manquants non bloquants)
#
# AUTEUR : ps_operator (Yann) - 2026-06-11 - J-3 bascule monorepo
# DOC    : docs/CLEANUP_EDIFIO_SOURCING_POSTBASCULE.md
# =============================================================================

[CmdletBinding()]
param(
    [string]$Repo               = "AlyoSIng/edifio-sourcing",
    [string]$ArchiveTemplate    = "docs/README.md.archive",
    [string]$SecretsBackupDir   = "backups/cleanup",
    [string[]]$SecretsToRemove  = @("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_PROJECT_REF"),
    [switch]$Step1ReadmeArchive,
    [switch]$Step2BranchProtect,
    [switch]$Step3DisableActions,
    [switch]$Step4PurgeSecrets,
    [switch]$DryRun,
    [switch]$Help
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# --- Helpers ASCII (pas d'emoji, pas d'accent dans la sortie) ----------------

function Write-Banner([string]$text) {
    Write-Host ""
    Write-Host "==============================================================================="
    Write-Host " $text"
    Write-Host "==============================================================================="
}
function Write-Step([string]$text) { Write-Host ""; Write-Host "--- $text ---" }
function Write-Ok([string]$text)   { Write-Host "[ OK ] $text" }
function Write-Skip([string]$text) { Write-Host "[SKIP] $text" }
function Write-Warn2([string]$text){ Write-Host "[WARN] $text" }
function Write-Fail([string]$text) { Write-Host "[FAIL] $text" }
function Write-Info([string]$text) { Write-Host "[INFO] $text" }

# --- Help --------------------------------------------------------------------

if ($Help) {
    Write-Banner "04-cleanup-edifio-sourcing.ps1 - aide"
    Write-Host @"

USAGE
  .\scripts\migration\ops\04-cleanup-edifio-sourcing.ps1 [-Step1ReadmeArchive]
                                                          [-Step2BranchProtect]
                                                          [-Step3DisableActions]
                                                          [-Step4PurgeSecrets]
                                                          [-DryRun]
                                                          [-Help]

DESCRIPTION
  Orchestre le cleanup du repo edifio-sourcing apres la bascule monorepo
  du 14/06/2026. A executer J+1 a J+7 post-bascule selon la checklist
  docs/CLEANUP_EDIFIO_SOURCING_POSTBASCULE.md.

  Sans aucun -StepN, le script affiche le plan complet et sort en code 2.
  Chaque -StepN active l'etape correspondante. Combinables.

ETAPES
  -Step1ReadmeArchive   J+1 : substitue README.md avec docs/README.md.archive
                              (remplace COMMIT_SHA_GEL par HEAD), commit, push.
  -Step2BranchProtect   J+1 : active lock_branch: true sur main via gh api.
  -Step3DisableActions  J+1 : deplace .github/workflows/*.yml vers
                              .github/workflows-archived/ via PR.
  -Step4PurgeSecrets    J+2 : sauvegarde noms secrets dans
                              backups/cleanup/secrets_removed_<ts>.txt
                              puis supprime via gh secret delete.

FLAGS
  -DryRun               Affiche le plan SANS effectuer les actions destructives.
  -Help                 Affiche cette aide et sort en code 0.

CONFIRMATION
  Chaque etape destructive demande la saisie de "CLEANUP-CONFIRM".
  Pas de bypass via variable d'env (volontaire : ce cleanup est rare).

CE QUI N'EST PAS DANS LE SCRIPT (MANUEL OBLIGATOIRE)
  - Pause projet Vercel edifio-sourcing : UI Settings -> General -> Pause.
  - Archive repo GitHub : UI Settings -> Danger Zone -> Archive this repository.
    Ne JAMAIS utiliser `gh repo archive` sans triple-verification de -R.

EXEMPLES
  # J+1 matin : voir le plan
  .\scripts\migration\ops\04-cleanup-edifio-sourcing.ps1

  # J+1 matin : dry-run etapes 1+2+3
  .\scripts\migration\ops\04-cleanup-edifio-sourcing.ps1 -Step1ReadmeArchive `
    -Step2BranchProtect -Step3DisableActions -DryRun

  # J+1 matin : execution etape 1 seule
  .\scripts\migration\ops\04-cleanup-edifio-sourcing.ps1 -Step1ReadmeArchive

  # J+2 : purge secrets
  .\scripts\migration\ops\04-cleanup-edifio-sourcing.ps1 -Step4PurgeSecrets

CODES RETOUR
  0 = succes ou idempotent (etat final atteint)
  1 = echec critique (commit/push/gh api)
  2 = avertissements (etapes manuelles en attente, prerequisites manquants)

AUTEUR
  ps_operator (Yann) - 2026-06-11

"@
    exit 0
}

# --- Affichage etat global ---------------------------------------------------

Write-Banner "04-cleanup-edifio-sourcing.ps1 - cleanup post-bascule"
Write-Info "Repo cible        : $Repo"
Write-Info "Template archive  : $ArchiveTemplate"
Write-Info "Backup secrets    : $SecretsBackupDir"
Write-Info "Secrets a purger  : $($SecretsToRemove -join ', ')"
Write-Info "Mode dry-run      : $($DryRun.IsPresent)"
Write-Host ""
Write-Info "Etapes activees :"
Write-Info "  Step1 README archive   : $($Step1ReadmeArchive.IsPresent)"
Write-Info "  Step2 Branch protect   : $($Step2BranchProtect.IsPresent)"
Write-Info "  Step3 Disable Actions  : $($Step3DisableActions.IsPresent)"
Write-Info "  Step4 Purge secrets    : $($Step4PurgeSecrets.IsPresent)"

$anyStep = $Step1ReadmeArchive.IsPresent -or $Step2BranchProtect.IsPresent -or `
           $Step3DisableActions.IsPresent -or $Step4PurgeSecrets.IsPresent

if (-not $anyStep) {
    Write-Step "Aucune etape activee - affichage du plan uniquement"
    Write-Info "Relancer avec un ou plusieurs -StepN pour executer."
    Write-Info "Voir l'aide :  .\scripts\migration\ops\04-cleanup-edifio-sourcing.ps1 -Help"
    Write-Info "Voir la doc :  docs/CLEANUP_EDIFIO_SOURCING_POSTBASCULE.md"
    exit 2
}

# --- Verifs prealables globales ----------------------------------------------

Write-Step "Verifs prealables"

# git CLI
$gitCmd = Get-Command git -ErrorAction SilentlyContinue
if (-not $gitCmd) {
    Write-Fail "git CLI introuvable dans le PATH."
    exit 1
}
Write-Ok "git CLI present."

# gh CLI
$ghCmd = Get-Command gh -ErrorAction SilentlyContinue
if (-not $ghCmd) {
    Write-Fail "gh CLI introuvable dans le PATH (necessaire pour Steps 2, 3, 4)."
    Write-Info "Installer : winget install GitHub.cli  OU  scoop install gh"
    exit 1
}
Write-Ok "gh CLI present."

# Authentification gh
try {
    $ghStatus = & gh auth status 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "gh non authentifie : faire 'gh auth login' avant de relancer."
        exit 1
    }
    Write-Ok "gh authentifie."
} catch {
    Write-Fail "gh auth status a echoue : $($_.Exception.Message)"
    exit 1
}

# Verif qu'on est bien dans le repo edifio-sourcing
$remoteUrl = & git config --get remote.origin.url 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Fail "Pas dans un repo git ou remote origin manquant."
    exit 1
}
if ($remoteUrl -notmatch "edifio-sourcing") {
    Write-Fail "Le remote origin ne contient pas 'edifio-sourcing' : $remoteUrl"
    Write-Fail "Refus par securite (anti-doigt-qui-glisse sur mauvais repo)."
    exit 1
}
Write-Ok "Remote origin : $remoteUrl"

# Branche courante
$currentBranch = (& git rev-parse --abbrev-ref HEAD).Trim()
Write-Info "Branche courante : $currentBranch"

# Etat propre ?
$gitStatus = & git status --porcelain
if ($gitStatus) {
    Write-Warn2 "Repo non propre (modifications non commitees) :"
    $gitStatus | ForEach-Object { Write-Host "       $_" }
    Write-Warn2 "Le script pourrait inclure ces modifs dans ses commits."
    Write-Warn2 "Recommande : stash ou commit prealable. Continuer quand meme ? (yes/no)"
    $resp = Read-Host
    if ($resp -ne "yes") {
        Write-Info "Annulation utilisateur."
        exit 2
    }
}

# --- Helper confirmation interactive -----------------------------------------

function Confirm-CleanupAction([string]$action) {
    Write-Host ""
    Write-Warn2 "Action destructive : $action"
    Write-Host "       Taper exactement CLEANUP-CONFIRM pour valider, autre chose pour annuler :"
    $r = Read-Host
    return ($r -eq "CLEANUP-CONFIRM")
}

# --- Compteurs globaux -------------------------------------------------------

$globalExitCode = 0  # 0 = OK, 1 = fail, 2 = warn

# =============================================================================
# STEP 1 - Bannieres + README archive
# =============================================================================

if ($Step1ReadmeArchive) {
    Write-Banner "STEP 1 - README archive (commit + push)"

    # 1.1 Template present ?
    if (-not (Test-Path -LiteralPath $ArchiveTemplate)) {
        Write-Fail "Template introuvable : $ArchiveTemplate"
        Write-Info "Le template doit avoir ete livre en J-3 (cf. tache prep)."
        $globalExitCode = 1
    }
    else {
        Write-Ok "Template archive present : $ArchiveTemplate"

        # 1.2 README deja en mode archive ? (idempotence)
        $readmeAlreadyArchive = $false
        if (Test-Path -LiteralPath "README.md") {
            $readmeContent = Get-Content README.md -Raw
            if ($readmeContent -match "\[ARCHIVE\]") {
                $readmeAlreadyArchive = $true
            }
        }

        if ($readmeAlreadyArchive) {
            Write-Skip "README.md contient deja le marqueur [ARCHIVE] - rien a faire."
        }
        else {
            # 1.3 Recupere SHA du HEAD
            $gelSha = (& git rev-parse HEAD).Trim()
            Write-Info "Commit de gel (HEAD) : $gelSha"

            # 1.4 Plan
            Write-Info "Plan :"
            Write-Info "  - Sauvegarder README.md actuel -> docs/README.pre-archive.md"
            Write-Info "  - Remplacer README.md par $ArchiveTemplate (substitution <COMMIT_SHA_GEL> = $gelSha)"
            Write-Info "  - Commit : 'docs(archive): banniere repo archive post-bascule monorepo'"
            Write-Info "  - Push sur origin/$currentBranch"

            if ($DryRun) {
                Write-Info "[DRY-RUN] Pas d'execution."
            }
            else {
                if (-not (Confirm-CleanupAction "Substitution README.md + commit + push")) {
                    Write-Info "Step 1 annule par utilisateur."
                    $globalExitCode = 2
                }
                else {
                    try {
                        # Sauvegarde README actuel
                        if (Test-Path -LiteralPath "README.md") {
                            Copy-Item README.md docs/README.pre-archive.md -Force
                            Write-Ok "Sauvegarde README.md -> docs/README.pre-archive.md"
                        }

                        # Substitution placeholder
                        $tplContent = Get-Content $ArchiveTemplate -Raw
                        $newContent = $tplContent.Replace("<COMMIT_SHA_GEL>", $gelSha)
                        Set-Content -Path README.md -Value $newContent -Encoding UTF8 -NoNewline
                        Write-Ok "README.md substitue (placeholder remplace par $gelSha)."

                        # Git add + commit
                        & git add README.md docs/README.pre-archive.md
                        & git commit -m "docs(archive): banniere repo archive post-bascule monorepo"
                        if ($LASTEXITCODE -ne 0) {
                            Write-Fail "git commit a echoue (code $LASTEXITCODE)."
                            $globalExitCode = 1
                        }
                        else {
                            Write-Ok "Commit cree."

                            # Push
                            & git push origin $currentBranch
                            if ($LASTEXITCODE -ne 0) {
                                Write-Fail "git push a echoue (code $LASTEXITCODE)."
                                Write-Warn2 "Probablement : main deja en lock_branch (Step 2 deja passee)."
                                Write-Warn2 "Si oui : faire la PR manuelle."
                                $globalExitCode = 1
                            }
                            else {
                                Write-Ok "Push effectue sur origin/$currentBranch."
                            }
                        }
                    }
                    catch {
                        Write-Fail "Step 1 a echoue : $($_.Exception.Message)"
                        $globalExitCode = 1
                    }
                }
            }
        }
    }
}

# =============================================================================
# STEP 2 - Branch protection main (lock_branch: true)
# =============================================================================

if ($Step2BranchProtect) {
    Write-Banner "STEP 2 - Branch protection main"

    # 2.1 Etat actuel
    Write-Info "Lecture etat actuel de la protection..."
    try {
        $currentProtection = & gh api "repos/$Repo/branches/main/protection" 2>&1
        if ($LASTEXITCODE -eq 0) {
            try {
                $obj = $currentProtection | ConvertFrom-Json
                if ($obj.PSObject.Properties.Name -contains "lock_branch") {
                    if ($obj.lock_branch.enabled) {
                        Write-Skip "Branch main deja verrouillee (lock_branch.enabled = true)."
                        $alreadyLocked = $true
                    } else {
                        $alreadyLocked = $false
                    }
                } else {
                    $alreadyLocked = $false
                }
            } catch {
                Write-Warn2 "Parse JSON protection branch echoue, on continue."
                $alreadyLocked = $false
            }
        } else {
            # 404 ou autre
            Write-Info "Pas de protection actuelle sur main (404 attendu si jamais configure)."
            $alreadyLocked = $false
        }
    } catch {
        Write-Warn2 "gh api lecture protection a echoue : $($_.Exception.Message)"
        $alreadyLocked = $false
    }

    if ($alreadyLocked) {
        # rien a faire
    }
    else {
        Write-Info "Plan :"
        Write-Info "  - PUT repos/$Repo/branches/main/protection avec lock_branch: true"
        Write-Info "  - allow_force_pushes: false"
        Write-Info "  - allow_deletions: false"

        if ($DryRun) {
            Write-Info "[DRY-RUN] Pas d'appel gh api."
        }
        else {
            if (-not (Confirm-CleanupAction "Verrouillage main (lock_branch: true)")) {
                Write-Info "Step 2 annule par utilisateur."
                $globalExitCode = 2
            }
            else {
                $payload = @{
                    required_status_checks         = $null
                    enforce_admins                 = $false
                    required_pull_request_reviews  = $null
                    restrictions                   = $null
                    lock_branch                    = $true
                    allow_force_pushes             = $false
                    allow_deletions                = $false
                } | ConvertTo-Json -Depth 5

                $tmpPayload = New-TemporaryFile
                Set-Content -Path $tmpPayload -Value $payload -Encoding UTF8

                try {
                    $resp = & gh api -X PUT "repos/$Repo/branches/main/protection" --input $tmpPayload 2>&1
                    if ($LASTEXITCODE -eq 0) {
                        Write-Ok "Branch protection appliquee (main verrouillee)."
                    } else {
                        Write-Fail "gh api PUT a echoue (code $LASTEXITCODE)."
                        Write-Host $resp
                        $globalExitCode = 1
                    }
                }
                catch {
                    Write-Fail "Step 2 exception : $($_.Exception.Message)"
                    $globalExitCode = 1
                }
                finally {
                    Remove-Item $tmpPayload -Force -ErrorAction SilentlyContinue
                }
            }
        }
    }
}

# =============================================================================
# STEP 3 - Desactiver GitHub Actions workflows
# =============================================================================

if ($Step3DisableActions) {
    Write-Banner "STEP 3 - Desactiver workflows GitHub Actions"

    $workflowsDir = ".github/workflows"
    $archivedDir  = ".github/workflows-archived"

    if (-not (Test-Path -LiteralPath $workflowsDir)) {
        Write-Skip "$workflowsDir n'existe pas - aucun workflow a deplacer."
    }
    else {
        $workflows = Get-ChildItem -LiteralPath $workflowsDir -Filter "*.yml" -ErrorAction SilentlyContinue
        if (-not $workflows -or $workflows.Count -eq 0) {
            $workflows = Get-ChildItem -LiteralPath $workflowsDir -Filter "*.yaml" -ErrorAction SilentlyContinue
        }

        if (-not $workflows -or $workflows.Count -eq 0) {
            Write-Skip "Aucun fichier .yml/.yaml dans $workflowsDir."
        }
        else {
            Write-Info "Workflows detectes ($($workflows.Count)) :"
            $workflows | ForEach-Object { Write-Info "  - $($_.Name)" }

            Write-Info "Plan :"
            Write-Info "  - Cree $archivedDir si absent"
            Write-Info "  - git mv chaque $workflowsDir/*.yml -> $archivedDir/*.yml"
            Write-Info "  - Branche : chore/archive-workflows (PR ensuite manuelle si main locked)"
            Write-Info "  - Commit : 'chore(archive): deplace workflows actions vers workflows-archived'"

            if ($DryRun) {
                Write-Info "[DRY-RUN] Pas d'execution."
            }
            else {
                if (-not (Confirm-CleanupAction "Deplacement workflows vers workflows-archived (PR)")) {
                    Write-Info "Step 3 annule par utilisateur."
                    $globalExitCode = 2
                }
                else {
                    try {
                        # Cree branche
                        $branchName = "chore/archive-workflows"
                        & git checkout -b $branchName 2>&1 | Out-Null
                        if ($LASTEXITCODE -ne 0) {
                            # Branche peut deja exister
                            & git checkout $branchName 2>&1 | Out-Null
                        }
                        Write-Ok "Branche active : $branchName"

                        # Cree dossier archive
                        if (-not (Test-Path -LiteralPath $archivedDir)) {
                            New-Item -ItemType Directory -Force -Path $archivedDir | Out-Null
                            Write-Ok "Dossier $archivedDir cree."
                        }

                        # Deplace chaque workflow
                        $movedCount = 0
                        foreach ($wf in $workflows) {
                            $src = "$workflowsDir/$($wf.Name)"
                            $dst = "$archivedDir/$($wf.Name)"
                            & git mv $src $dst 2>&1 | Out-Null
                            if ($LASTEXITCODE -eq 0) {
                                Write-Ok "Deplace : $src -> $dst"
                                $movedCount++
                            } else {
                                Write-Warn2 "Echec git mv : $src"
                            }
                        }

                        if ($movedCount -gt 0) {
                            & git commit -m "chore(archive): deplace workflows actions vers workflows-archived"
                            if ($LASTEXITCODE -ne 0) {
                                Write-Fail "git commit a echoue (code $LASTEXITCODE)."
                                $globalExitCode = 1
                            }
                            else {
                                Write-Ok "Commit cree sur $branchName."
                                & git push -u origin $branchName
                                if ($LASTEXITCODE -ne 0) {
                                    Write-Fail "git push a echoue."
                                    $globalExitCode = 1
                                }
                                else {
                                    Write-Ok "Push effectue."
                                    Write-Info "ETAPE MANUELLE : creer la PR :"
                                    Write-Info "  gh pr create --base main --title 'chore(archive): desactivation Actions post-bascule' --body 'Cleanup post-bascule 14/06.'"
                                    $globalExitCode = [Math]::Max($globalExitCode, 2)
                                }
                            }
                        } else {
                            Write-Skip "Aucun fichier deplace."
                        }
                    }
                    catch {
                        Write-Fail "Step 3 exception : $($_.Exception.Message)"
                        $globalExitCode = 1
                    }
                }
            }
        }
    }
}

# =============================================================================
# STEP 4 - Purge secrets GitHub residuels
# =============================================================================

if ($Step4PurgeSecrets) {
    Write-Banner "STEP 4 - Purge secrets GitHub residuels"

    # 4.1 Liste actuelle
    Write-Info "Lecture liste secrets actuels..."
    try {
        $secretList = & gh secret list -R $Repo 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "gh secret list a echoue : $secretList"
            $globalExitCode = 1
        } else {
            Write-Info "Secrets actuels sur $Repo :"
            $secretList | ForEach-Object { Write-Info "  $_" }
        }
    } catch {
        Write-Fail "gh secret list exception : $($_.Exception.Message)"
        $globalExitCode = 1
    }

    if ($globalExitCode -ne 1) {

        # 4.2 Sauvegarde locale des noms (pas valeurs)
        if (-not (Test-Path -LiteralPath $SecretsBackupDir)) {
            New-Item -ItemType Directory -Force -Path $SecretsBackupDir | Out-Null
            Write-Ok "Dossier $SecretsBackupDir cree (gitignored, cf. .gitignore -> backups/)."
        }

        $ts = Get-Date -Format "yyyyMMdd_HHmmss"
        $backupFile = Join-Path $SecretsBackupDir "secrets_removed_$ts.txt"

        $backupLines = @()
        $backupLines += "# Secrets supprimes du repo $Repo - $(Get-Date -Format o)"
        $backupLines += "# Auteur : 04-cleanup-edifio-sourcing.ps1 (ps_operator / Yann)"
        $backupLines += "# Ce fichier est LOCAL et gitignored - ne contient JAMAIS les valeurs."
        $backupLines += "# Recuperation possible via 1Password si rollback necessaire."
        $backupLines += ""
        $backupLines += "Liste secrets cibles :"
        foreach ($s in $SecretsToRemove) {
            $backupLines += "  - $s"
        }
        $backupLines += ""
        $backupLines += "Liste complete des secrets au moment de la purge (gh secret list) :"
        if ($secretList) {
            foreach ($line in $secretList) {
                $backupLines += "  $line"
            }
        }

        Set-Content -LiteralPath $backupFile -Value $backupLines -Encoding UTF8
        Write-Ok "Sauvegarde locale ecrite : $backupFile"

        # 4.3 Suppression
        if ($DryRun) {
            Write-Info "[DRY-RUN] Pas de suppression effective."
            foreach ($s in $SecretsToRemove) {
                Write-Info "  Aurait supprime : $s"
            }
        }
        else {
            if (-not (Confirm-CleanupAction "Suppression de $($SecretsToRemove.Count) secret(s) sur $Repo")) {
                Write-Info "Step 4 annule par utilisateur."
                $globalExitCode = 2
            }
            else {
                foreach ($s in $SecretsToRemove) {
                    # Verifier presence avant delete (idempotence)
                    $exists = $false
                    if ($secretList) {
                        foreach ($line in $secretList) {
                            if ($line -match "^\s*$([regex]::Escape($s))\s") {
                                $exists = $true
                                break
                            }
                        }
                    }

                    if (-not $exists) {
                        Write-Skip "Secret $s absent - rien a faire."
                        continue
                    }

                    try {
                        & gh secret delete $s -R $Repo 2>&1 | Out-Null
                        if ($LASTEXITCODE -eq 0) {
                            Write-Ok "Secret supprime : $s"
                        } else {
                            Write-Fail "Echec suppression $s (code $LASTEXITCODE)."
                            $globalExitCode = 1
                        }
                    }
                    catch {
                        Write-Fail "Exception suppression $s : $($_.Exception.Message)"
                        $globalExitCode = 1
                    }
                }
            }
        }

        Write-Info ""
        Write-Warn2 "Rappel securite (incident e2e prod 10/06) :"
        Write-Warn2 "  Si SUPABASE_SERVICE_ROLE_KEY a ete utilise cote monorepo,"
        Write-Warn2 "  ROTATION Supabase obligatoire (Settings -> API -> Reset service_role)."
        Write-Warn2 "  A faire SEPAREMENT de ce script (arbitrage Steve)."
    }
}

# =============================================================================
# Recap final + rappels manuels
# =============================================================================

Write-Banner "RECAP FINAL"

if ($globalExitCode -eq 0) {
    Write-Ok "Toutes les etapes activees ont reussi (ou etaient deja en etat final)."
} elseif ($globalExitCode -eq 2) {
    Write-Warn2 "Cleanup partiel - actions manuelles en attente (voir messages ci-dessus)."
} else {
    Write-Fail "Au moins une etape critique a echoue - inspecter les logs et relancer apres correction."
}

Write-Step "Rappel etapes MANUELLES (hors script)"
Write-Info "  Etape 5 (J+2/J+3) : Pause projet Vercel edifio-sourcing"
Write-Info "    https://vercel.com/teissiers-projects/edifio-sourcing/settings"
Write-Info "    -> Section General (bas de page) -> Pause Project"
Write-Info ""
Write-Info "  Etape 6 (J+7) : Mise a jour README final (lien post-mortem)"
Write-Info "    PR manuelle apres publication de docs/POST_MORTEM_BASCULE_140626.md"
Write-Info ""
Write-Info "  Etape 7 (J+7 minimum) : Archive repo GitHub (MANUEL TRIPLE-VERIF)"
Write-Info "    https://github.com/$Repo/settings"
Write-Info "    -> Danger Zone -> Archive this repository"
Write-Info "    NE PAS utiliser 'gh repo archive' sans triple-verification de -R."
Write-Info ""
Write-Info "Doc complete : docs/CLEANUP_EDIFIO_SOURCING_POSTBASCULE.md"

exit $globalExitCode
