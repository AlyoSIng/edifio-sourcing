# Scripts ops bascule monorepo — dimanche 14/06 2026, 8h-11h

Préparés par `ps_operator` (Yann) en J-3/J-2 de la bascule
`edifio-sourcing` (standalone Frankfurt) → `alyos-suivi-chantier` (monorepo Paris).

> **Posture inchangée vs `../README.md`** : Steve lance chaque script dans SA
> session PowerShell après avoir posé les ENV depuis 1Password.
> Aucun sub-agent ne touche aux credentials prod (cf. memory
> `feedback_ops_prod_user_runs_migration.md`).

---

## Contexte

Cible bascule : **dimanche 14 juin 2026, 8h-11h** (visio cadrage 10/06, A8).
Runbook détaillé : `docs/RUNBOOK_BASCULE_MONOREPO_140626.md`.
Diff env vars : `docs/VARS_ENV_VERCEL_MONOREPO_DIFF.md`.
Handoff Sébastien : `docs/HANDOFF_SEBASTIEN_J3_BASCULE_260611.md`.

Ces 3 scripts couvrent les **3 manipulations Vercel + DNS** côté Steve :
1. Pousser les env vars manquantes sur le projet Vercel monorepo (J-2 / vendredi 12/06 soir)
2. Smoke prod après cutover DNS (étape 7 du runbook, dim ~9h45-10h15)
3. Rollback DNS en cas de smoke KO (étape 8 du runbook, plan B)

---

## Inventaire

| Script | Quand | Lecture / Écriture | Pré-requis session |
|---|---|---|---|
| `01-vercel-env-loader.ps1` | **Vendredi 12/06 soir** (J-2) | Lecture `.env.monorepo.production` + écriture Vercel production | `vercel login` ou `VERCEL_TOKEN` + `vercel link` vers monorepo |
| `02-smoke-prod-monorepo.ps1` | **Dim 14/06 ~9h45-10h15** (étape 7) | Lecture seule (HTTP + DNS resolve) | `$env:CRON_SECRET` posé pour T4 (sinon T4 saute en WARN) |
| `03-rollback-dns.ps1` | **Dim 14/06 ~10h00+** si smoke KO | Lecture DNS + écriture snapshot local. **NE TOUCHE PAS au DNS** (pas-à-pas OVH manuel). | `-Confirm` ou `$env:CONFIRM_ROLLBACK_DNS = "REVERT-SOURCING-EDIFIO"` pour afficher le pas-à-pas |

**Tous les fichiers de sortie atterrissent dans `backups/dns-rollback/` à la racine du repo.** Ce dossier est déjà ignoré (cf. `.gitignore` ligne `backups/`).

---

## Ordre d'exécution dimanche 14/06

```powershell
cd C:\Dev\edifio-sourcing

# =============================================================================
# J-2 (vendredi 12/06 soir) — préparation Vercel monorepo
# =============================================================================

# Pré-requis : repo linké au projet Vercel monorepo (à faire une fois)
#   vercel link
#   (choisir scope teissiers-projects, projet alyos-suivi-chantier)

# Steve crée .env.monorepo.production en local depuis 1Password.
# Format : une paire KEY=VALUE par ligne, encodage UTF-8 LF.
# Optionnel : `# DRY_RUN=true` en première ligne pour forcer le dry-run.

# Test du plan SANS écriture
.\scripts\migration\ops\01-vercel-env-loader.ps1 -DryRun

# Push réel (demande confirmation "PUSH-MONOREPO-PROD" interactive)
.\scripts\migration\ops\01-vercel-env-loader.ps1

# Hygiène post-push
#   - Supprimer immédiatement .env.monorepo.production du disque local
#   - Vérifier sur https://vercel.com/teissiers-projects/alyos-suivi-chantier/settings/environment-variables
#     que les +N vars créées sont bien là.

# =============================================================================
# Dim 14/06 — étape 7 du runbook (9h45-10h15)
# =============================================================================

# Steve pose le CRON_SECRET prod monorepo (depuis 1Password) :
$env:CRON_SECRET = "<valeur prod CRON_SECRET monorepo>"

# Lancer le smoke
.\scripts\migration\ops\02-smoke-prod-monorepo.ps1

# Codes retour :
#   0 = tout vert (GO étape 8 du runbook)
#   1 = au moins un test critique FAIL (=> rollback)
#   2 = warnings à inspecter (décision Steve + Sébastien)

# =============================================================================
# Dim 14/06 — plan B (si smoke KO ou incident détecté)
# =============================================================================

# Étape 1 : snapshot lecture seule (toujours faire ça d'abord)
.\scripts\migration\ops\03-rollback-dns.ps1

# Étape 2 : afficher le pas-à-pas OVH (Steve exécute clic par clic dans le panel)
.\scripts\migration\ops\03-rollback-dns.ps1 -Confirm

# Étape 3 : après action OVH, attendre 5-15 min puis re-snapshot pour vérifier
.\scripts\migration\ops\03-rollback-dns.ps1

# Étape 4 : si BDD monorepo déjà écrite, ouvrir le runbook section
#   "Rollback complet" et utiliser le dump pré-bascule (étape 2 du runbook).
```

---

## Garde-fous communs

### Tous les scripts
- **ASCII strict** : pas de BOM, pas d'accent, pas d'emoji. Indicateurs : `[ OK ]`, `[FAIL]`, `[WARN]`, `[INFO]`, `[SKIP]`, `[ ADD]`.
- **PowerShell 5.1 compatible** : pas de `&&`, pas de `??`, pas de `-NoNewline` cassé.
- **`Set-StrictMode -Version Latest`** activé partout (catch les typos de variables).
- **Aucune VALUE secrète n'est jamais affichée** dans la sortie standard (longueur uniquement).

### `01-vercel-env-loader.ps1` spécifiquement
- Refuse si `.env.monorepo.production` absent.
- Refuse si `vercel` CLI absent du PATH.
- Refuse si `.vercel/project.json` absent (`vercel link` jamais fait).
- Affiche le `projectId` linké et **demande à Steve de vérifier visuellement** que c'est bien le monorepo et pas l'ancien projet (anti-doigt-qui-glisse).
- Idempotence par `vercel env ls production` (JSON ou fallback texte).
- Confirmation interactive `PUSH-MONOREPO-PROD` obligatoire avant écriture.
- Mode dry-run via flag `-DryRun` ou première ligne `# DRY_RUN=true`.

### `02-smoke-prod-monorepo.ps1` spécifiquement
- Pas d'effet de bord (HTTP GET + DNS resolve uniquement).
- T4 (cron) skippé si `$env:CRON_SECRET` non posé → status WARN, pas FAIL.
- Tolère redirection 301/302/307/308 sur T1 (cas Next.js redirect / → /login).
- Heuristique DNS T3 : détecte CNAME terminal vers `*.vercel-dns.com`, WARN si pas de match (pas FAIL — l'IP brute pourrait être un edge case).
- Force TLS 1.2 (PowerShell 5.1 par défaut sur TLS 1.0).

### `03-rollback-dns.ps1` spécifiquement
- **N'agit JAMAIS sur le DNS lui-même** : OVH n'a pas d'API automatisable utilisée dans ce repo (cf. memory `feedback_dns_consignes`).
- Snapshot horodaté écrit dans `backups/dns-rollback/dns_sourcing.edifio.fr_YYYYMMDD_HHMMSS.txt`.
- Sans `-Confirm` : mode lecture seule, snapshot + diagnostic.
- Avec `-Confirm` : imprime le **pas-à-pas OVH clic par clic** (cf. memory `feedback_dns_consignes` : "décrire l'action par clic exact dans le panel, jamais par concept abstrait").
- Étape critique mentionnée explicitement : **vérifier que l'ancien projet Vercel `edifio-sourcing` a toujours `sourcing.edifio.fr` dans ses domaines attachés** avant de basculer le CNAME (sinon : CNAME OK, mais Vercel renvoie 404).

---

## Format `.env.monorepo.production`

Pour `01-vercel-env-loader.ps1`. À créer localement par Steve (jamais commit — `.gitignore` couvre `.env.monorepo*`).

```bash
# .env.monorepo.production
# Vars manquantes côté monorepo (cf. docs/VARS_ENV_VERCEL_MONOREPO_DIFF.md).
# Encoder en UTF-8 LF (pas de CRLF, pas de BOM).
# Première ligne `# DRY_RUN=true` => force le mode dry-run.

COOKIE_DOMAIN=.edifio.fr
DATABASE_URL=postgres://...
NEXT_PUBLIC_APP_ENV=production
# ... autres vars listées dans docs/VARS_ENV_VERCEL_MONOREPO_DIFF.md
```

Le script :
1. Parse chaque ligne `KEY=VALUE` (skip lignes vides + commentaires).
2. Refuse les CR/BOM/null cachés.
3. Énumère les vars déjà présentes sur Vercel.
4. Push uniquement les nouvelles, ligne par ligne, via stdin (`VALUE | vercel env add KEY production`).
5. Récap : `+X vars created, =Y vars unchanged`.

---

## Pièges identifiés (à éviter dim 14/06)

| # | Piège | Mitigation script |
|---|---|---|
| 1 | Pousser les vars sur l'ANCIEN projet `edifio-sourcing` au lieu du monorepo | `01-` affiche le `projectId` et demande vérif visuelle |
| 2 | Mauvaise URL prod (`sourcing.alyosingenierie.fr` au lieu de `sourcing.edifio.fr`) | Défaut hardcodé `sourcing.edifio.fr` dans `02-` |
| 3 | Bypass cache DNS local lors du smoke | T3 utilise `Resolve-DnsName -DnsOnly` ; pour rollback : `Resolve-DnsName -Server 1.1.1.1` documenté |
| 4 | Rollback DNS sans réattacher le domaine sur l'ancien Vercel | Étape 4.4 du pas-à-pas force la vérif `https://vercel.com/teissiers-projects/edifio-sourcing/settings/domains` |
| 5 | Doigt qui glisse sur le script de rollback | `-Confirm` obligatoire ou `$env:CONFIRM_ROLLBACK_DNS = "REVERT-SOURCING-EDIFIO"` |
| 6 | Echo des secrets dans la sortie standard | Aucun script n'affiche jamais une VALUE — uniquement la longueur |
| 7 | Fichier `.env.monorepo.production` traîne sur le disque post-bascule | README rappelle "supprimer immédiatement post-push" + couvert par `.gitignore` |

---

## Logs et traçabilité

- `01-vercel-env-loader.ps1` : pas de log fichier (sortie stdout uniquement, Steve fait `Tee-Object` s'il veut).
- `02-smoke-prod-monorepo.ps1` : pas de log fichier (idem). Code retour 0/1/2 pour scripting d'aval.
- `03-rollback-dns.ps1` : snapshot horodaté écrit dans `backups/dns-rollback/`. Ce dossier est gitignored.

Pour archiver une run, Steve peut faire :

```powershell
.\scripts\migration\ops\02-smoke-prod-monorepo.ps1 *>&1 | Tee-Object -FilePath "backups\smoke_$(Get-Date -Format yyyyMMdd_HHmmss).log"
```

---

## Maintenance

- **Auteur** : ps_operator (Yann) — 2026-06-11.
- **Branche d'origine** : `main` (directement, repo orchestration `edifio-sourcing` qui ne reçoit plus que ce type de doc/scripts en fin de vie).
- **Convention commits** : `chore(migration):` ou `ops(bascule):`, subject lowercase strict, jamais `--no-verify`.
- **Tests à froid recommandés avant dim 14/06** :
  - `01-` en `-DryRun` sur un `.env.monorepo.production` factice avec 2-3 vars existantes + 2-3 nouvelles → vérifier le recap.
  - `02-` sur la prod actuelle (avant bascule) → constater quelles assertions passent/échouent pour calibrer les warnings attendus.
  - `03-` sans `-Confirm` → vérifier que le snapshot s'écrit bien dans `backups/dns-rollback/`.
