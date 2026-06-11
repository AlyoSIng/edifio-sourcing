# Cleanup repo `edifio-sourcing` post-bascule — runbook J+1 à J+7+

> **Rédigé par `ps_operator` (Yann) — 2026-06-11, J-3 bascule.**
> Document préparatoire, à appliquer **APRÈS confirmation que la prod monorepo
> `alyos-suivi-chantier` tourne bien** (smoke prod vert + 24h de stabilité
> minimum).
>
> **Ne RIEN exécuter avant feu vert Steve + Sébastien post-bascule du 14/06.**

---

## 1. Pourquoi ce cleanup ?

La bascule du **dimanche 14 juin 2026, 8h-11h** déplace l'intégralité de la prod
`edifio Sourcing` de son repo standalone `AlyoSIng/edifio-sourcing` (Vercel
Frankfurt) vers le monorepo `AlyoSIng/alyos-suivi-chantier` (Vercel Paris,
projet Suivi + ACT + Sourcing consolidé).

Une fois la bascule confirmée stable :

- **Plus aucun déploiement** ne doit partir du repo `edifio-sourcing`.
- **Plus aucun secret prod** ne doit traîner dans ses settings GitHub.
- **Plus aucun cron Vercel** ne doit s'exécuter depuis ce projet.
- Le repo reste **lisible publiquement en interne** pour la traçabilité des
  décisions, incidents et migrations (audit + post-mortem).

Objectif : **figer le repo en mode archive lecture seule** sans casser :
- Les liens externes qui pourraient encore le référencer (notes Cowork, gates,
  ADR, commits du monorepo qui pointent vers des commits historiques sourcing).
- La capacité à **redémarrer le service** en plan B catastrophe (Vercel projet
  en pause, pas supprimé — voir étape 5).

---

## 2. Quand ?

Calendrier cible (post-bascule réussie, à confirmer par Steve avant lancement) :

| Jour | Date cible | Actions |
|------|-----------|---------|
| **J = bascule** | dim 14/06 | Rien à toucher côté `edifio-sourcing`. Le repo reste actif au cas où rollback DNS nécessaire. |
| **J+1** | lun 15/06 | Si smoke prod monorepo encore vert le matin → étapes 1 à 3 (bannière README, branch protection, désactivation Actions workflows). |
| **J+2 à J+3** | mar-mer 16-17/06 | Si stabilité confirmée 48-72h → étapes 4 + 5 (suppression secrets GitHub, pause projet Vercel). |
| **J+7** | dim 21/06 | Si aucun incident remonté, aucun besoin de rollback détecté → étape 6 (mise à jour README finale) + étape 7 (archive GitHub Settings). |
| **J+30** | mi-juillet | Décision rétention long terme : laisser en archive permanente OU supprimer projet Vercel paused (gain quelques €/mois Hobby si applicable). |

> **Règle d'or** : tant que le **rollback complet** (DNS + Vercel + BDD) reste
> théoriquement nécessaire, **NE PAS toucher** au projet Vercel ni aux secrets
> GitHub. La fenêtre de rollback technique reste ouverte ~7 jours après la
> bascule (dump pré-bascule disponible, ancien projet Vercel encore attaché au
> domaine via réattache rapide).

---

## 3. Quoi cleanup ?

Inventaire exhaustif de ce qui touche encore au repo `edifio-sourcing` après
la bascule.

### 3.1 Repo GitHub `AlyoSIng/edifio-sourcing`

- **Branches actives** : `main` (au minimum), `develop` si encore présente,
  branches `feat/*` non mergées (à inventorier J+1).
- **Branch protection rules** : actuellement permissives (push direct main
  autorisé pour admins). À durcir J+1.
- **GitHub Actions workflows** : `.github/workflows/*.yml`
  (ci-build, db-rls, e2e, lint, typecheck, pgtap, etc.). Tous à désactiver
  pour ne pas consommer de minutes runner inutilement.
- **GitHub secrets** : au minimum `SUPABASE_SERVICE_ROLE_KEY` et
  `SUPABASE_PROJECT_REF` à supprimer (rappel incident e2e prod 10/06 — ces
  secrets ont déjà fuité côté CI et doivent disparaître après bascule).
  Inventorier les autres via `gh secret list -R AlyoSIng/edifio-sourcing`.
- **Settings repo** : option "Archive" à activer **en dernier** (étape 7).

### 3.2 Vercel — projet `edifio-sourcing` (compte AlyoS / team `teissiers-projects`)

- **Production deployment** : actuellement `sourcing.edifio.fr` détaché vers
  le monorepo. Le projet reste mais sert plus de trafic.
- **Cron jobs** Vercel (si jamais l'un d'eux a été déclaré côté Vercel et pas
  côté Fly.io) : vérifier `Settings → Cron Jobs` et désactiver.
- **Environment variables prod** : laisser pour rollback éventuel. Ne pas
  supprimer avant J+30 minimum.
- **Domain attached** : laisser `sourcing.edifio.fr` attaché jusqu'à J+7
  minimum (utilisé par le plan rollback DNS du script `03-rollback-dns.ps1`).
- **Pause** : `Settings → General → Pause Project` à activer J+2/J+3.

### 3.3 Supabase — projet Sourcing Frankfurt

> **Hors périmètre de ce script** — décision distincte côté CTO Sophie,
> probablement après J+30 (rétention dump + audit avant suppression
> définitive du projet Supabase Frankfurt).

### 3.4 Fly.io — container Playwright scraping

> **Hors périmètre de ce script** — le cron sourcing du monorepo continue
> potentiellement à utiliser le même container Fly.io EU (cf. arbitrage Q4
> visio 10/06, A1 : Fly.io conservé). À auditer côté Sébastien.

### 3.5 DNS OVH

> **Hors périmètre de ce script** — la bascule DNS est déjà couverte par
> `03-rollback-dns.ps1` et l'étape 6 du runbook bascule. Aucune action DNS
> dans le cleanup.

---

## 4. Comment ? — Procédure pas-à-pas

### Étape 1 — Bannière `ARCHIVE` sur `README.md` (J+1 matin)

**Pré-requis** : smoke prod monorepo OK au minimum 24h avant.

**Action** : remplacer le `README.md` racine de `edifio-sourcing` par le
template `docs/README.md.archive` préparé en J-3.

```powershell
cd C:\Dev\edifio-sourcing
git checkout main
git pull --ff-only origin main

# Sauvegarde l'ancien README pour traçabilité
Copy-Item README.md docs/README.pre-archive.md
git add docs/README.pre-archive.md

# Remplace par le template archive (substituer COMMIT_SHA_GEL avec le SHA du
# dernier commit légitime — soit le HEAD courant au moment du cleanup).
$gelSha = (git rev-parse HEAD).Trim()
$archiveContent = Get-Content docs/README.md.archive -Raw
$archiveContent = $archiveContent.Replace("<COMMIT_SHA_GEL>", $gelSha)
Set-Content -Path README.md -Value $archiveContent -Encoding UTF8
git add README.md

git commit -m "docs(archive): bannière repo archivé post-bascule monorepo"
git push origin main
```

**Effet** : visiteurs du repo voient immédiatement la bannière de redirection
vers le monorepo.

**Réversible** : oui, `git revert` ou écrasement.

---

### Étape 2 — Branch protection sur `main` (J+1)

**Pré-requis** : étape 1 mergée sur main.

**Action** : durcir `main` pour bloquer toute écriture future (sauf admin
explicite).

Via `gh` CLI :

```powershell
# Vérifier les règles actuelles
gh api repos/AlyoSIng/edifio-sourcing/branches/main/protection

# Activer la protection (lock branch = vrai blocage push même admin)
gh api -X PUT repos/AlyoSIng/edifio-sourcing/branches/main/protection `
  --input - <<EOF
{
  "required_status_checks": null,
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "lock_branch": true,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF
```

> **Note** : `lock_branch: true` rend la branche **strictement lecture seule**
> y compris pour les admins. Si Steve veut conserver la possibilité de
> hotfix en cas de rollback nécessaire, mettre `lock_branch: false` mais
> garder `allow_force_pushes: false` + `allow_deletions: false`.

**Alternative manuelle** : `Settings → Branches → Add rule → main → Lock branch`.

**Effet** : plus aucun commit ne peut atterrir sur `main` (CI/CD côté repo
ne tournera plus de toute façon, voir étape 3).

**Réversible** : oui, désactiver la rule.

---

### Étape 3 — Désactiver les GitHub Actions workflows (J+1)

**Action** : déplacer tous les `.github/workflows/*.yml` vers
`.github/workflows-archived/` pour ne plus déclencher les jobs (lint,
typecheck, e2e, pgtap RLS, ci-build, etc.) qui consomment des minutes runner
gratuitement et envoient des notifications fail inutiles.

```powershell
cd C:\Dev\edifio-sourcing
git checkout main
git pull --ff-only origin main

# Crée la branche workflow-cleanup (contourne la lock branch via PR)
git checkout -b chore/archive-workflows

# Déplace tous les workflows
New-Item -ItemType Directory -Force -Path .github/workflows-archived | Out-Null
$workflows = Get-ChildItem .github/workflows -Filter "*.yml" -ErrorAction SilentlyContinue
foreach ($wf in $workflows) {
    git mv ".github/workflows/$($wf.Name)" ".github/workflows-archived/$($wf.Name)"
}

git commit -m "chore(archive): déplace workflows actions vers workflows-archived"
git push origin chore/archive-workflows

# PR + merge via admin override (Steve)
gh pr create --title "chore(archive): désactivation Actions post-bascule" `
  --body "Cleanup post-bascule 14/06. Workflows déplacés pour ne plus déclencher de jobs runners. Repo en mode archive lecture seule." `
  --base main
```

> **Alternative plus simple** : laisser les fichiers en place et ajouter
> `on: workflow_dispatch` seul (supprimer `on: push` et `on: pull_request`).
> Mais le déplacement est plus radical et plus visible.

**Effet** : aucune CI ne tournera plus sur le repo archive.

**Réversible** : oui, déplacer les YAML inverse.

---

### Étape 4 — Suppression secrets GitHub résiduels (J+2 à J+3)

**Pré-requis** : étapes 1 à 3 effectuées, stabilité 48h+ confirmée, aucun
besoin de rerun CI prévu.

**Sauvegarde locale avant suppression** : le script `04-cleanup-edifio-sourcing.ps1`
écrit la liste des secrets supprimés (noms uniquement, jamais les valeurs)
dans `backups/cleanup/secrets_removed_<timestamp>.txt`. Ce dossier est
gitignored (cf. `.gitignore` → `backups/`).

**Action** :

```powershell
cd C:\Dev\edifio-sourcing

# Lister les secrets (vérification avant suppression)
gh secret list -R AlyoSIng/edifio-sourcing

# Suppression unitaire (le script 04 automatise avec confirmation CLEANUP-CONFIRM)
gh secret delete SUPABASE_SERVICE_ROLE_KEY -R AlyoSIng/edifio-sourcing
gh secret delete SUPABASE_PROJECT_REF      -R AlyoSIng/edifio-sourcing
```

**Effet** : les secrets disparaissent des Actions. Si une CI tourne par
inadvertance (workflow_dispatch manuel), elle échouera proprement faute de
secret au lieu d'utiliser des credentials prod obsolètes.

**Réversible partiellement** : oui (re-saisie manuelle depuis 1Password),
mais c'est le but du cleanup donc à ne pas faire sauf rollback complet.

> **Rappel sécurité (incident e2e prod 10/06)** : si la valeur
> `SUPABASE_SERVICE_ROLE_KEY` a été utilisée côté monorepo aussi, **rotation
> Supabase recommandée** avant suppression (Settings → API → Reset
> service_role JWT). Décision Steve : à arbitrer J+1.

---

### Étape 5 — Pause projet Vercel `edifio-sourcing` (J+2 à J+3)

**Pré-requis** : étapes 1 à 4 effectuées, certitude que le domaine
`sourcing.edifio.fr` est bien servi par le projet monorepo (vérif
`Resolve-DnsName` + curl 200).

**Action manuelle** (Vercel CLI ne propose pas de `pause` officiel) :

1. Ouvrir https://vercel.com/teissiers-projects/edifio-sourcing/settings
2. Section **General** → tout en bas : **Pause Project**
3. Cocher "I understand that pausing this project will stop all deployments"
4. Cliquer **Pause Project**
5. Vérifier que le projet apparaît avec un badge "Paused" dans la liste des
   projets.

**Effet** :
- Aucun déploiement ne se fait plus (même via git push ou redeploy manuel).
- Les déploiements existants restent en ligne (préserve le rollback DNS).
- Le domaine `sourcing.edifio.fr` reste attaché — utile pour rollback.

**Réversible** : oui, clic "Resume Project" à tout moment.

> **À ne PAS faire** : `vercel rm <projet>` ou suppression définitive du
> projet — cela détache le domaine et casse le plan rollback `03-rollback-dns.ps1`.

---

### Étape 6 — Mise à jour `README.md` racine pour redirection (J+7)

**Pré-requis** : 7 jours de stabilité monorepo confirmés, post-mortem
bascule rédigé (`docs/POST_MORTEM_BASCULE_140626.md`).

**Action** : compléter le `README.md` archive avec :
- Lien vers le post-mortem.
- Confirmation que le `<COMMIT_SHA_GEL>` est définitif.
- Notice "lecture seule définitive" (vs "en attente de stabilité 7 jours").

C'est essentiellement un re-substitution du template `README.md.archive`
mais avec le placeholder `<POST_MORTEM_LINK>` rempli cette fois.

```powershell
# Hotfix sur main via PR admin
cd C:\Dev\edifio-sourcing
git checkout -b chore/readme-archive-final
# Editer README.md (ajout lien post-mortem, retrait phrase "à publier")
git add README.md
git commit -m "docs(archive): readme final post-mortem publié"
git push origin chore/readme-archive-final
gh pr create --base main --title "docs(archive): readme final J+7" --body "Cleanup final post-bascule. Stabilité 7j confirmée."
```

**Réversible** : oui.

---

### Étape 7 — Archive GitHub Settings (J+7 minimum)

**MANUEL UNIQUEMENT — pas dans le script `04-cleanup-edifio-sourcing.ps1`
pour éviter tout risque d'erreur de manip.**

**Pré-requis** : étapes 1 à 6 toutes faites, post-mortem publié, décision
explicite Steve + Sophie (CTO).

**Action manuelle** :

1. Ouvrir https://github.com/AlyoSIng/edifio-sourcing/settings
2. Tout en bas : section **Danger Zone**
3. Cliquer **Archive this repository**
4. Lire le warning (le repo passe en lecture seule **définitive**, plus
   aucun issue/PR/edit possible y compris pour admin sans désarchivage).
5. Taper le nom du repo `edifio-sourcing` pour confirmer.
6. Cliquer **I understand the consequences, archive this repository**.

**Effet** :
- Le repo apparaît avec un badge **"Archived"** orange.
- Plus aucun push, issue, PR, edit possible.
- Le contenu reste **publiquement lisible** (selon visibility du repo).
- Réversible via **Unarchive** dans les Settings (admin uniquement).

**Réversible** : oui, mais demande action manuelle explicite.

> **Pourquoi pas dans le script ?** Une commande `gh` peut archiver un repo
> en une ligne (`gh repo archive`). Mais le risque "doigt qui glisse" sur un
> mauvais `-R` (mauvais nom de repo) est trop élevé pour une action quasi
> irréversible. **Steve clique manuellement après triple vérification de
> l'URL.**

---

## 5. Checklist consolidée

À cocher dans l'ordre, en suivant le calendrier de la section 2.

### J+1 (lundi 15/06)

- [ ] Smoke prod monorepo encore vert le matin (≥ 24h stable)
- [ ] **Étape 1** : ajouter la bannière `ARCHIVE` dans `README.md` (substitution
      du template `docs/README.md.archive` avec `<COMMIT_SHA_GEL>` rempli)
- [ ] **Étape 2** : activer branch protection sur `main` (`lock_branch: true`)
- [ ] **Étape 3** : déplacer les workflows `.github/workflows/*.yml` vers
      `.github/workflows-archived/`

### J+2 à J+3 (mardi-mercredi 16-17/06)

- [ ] Stabilité prod monorepo confirmée ≥ 48h
- [ ] **Étape 4** : supprimer les 2 secrets GitHub `SUPABASE_SERVICE_ROLE_KEY`
      et `SUPABASE_PROJECT_REF` (après sauvegarde locale via script 04)
- [ ] Arbitrage Steve : rotation `SUPABASE_SERVICE_ROLE_KEY` côté Supabase
      Frankfurt (oui/non) avant suppression
- [ ] **Étape 5** : passer le projet Vercel `edifio-sourcing` en **Paused**
      (manuel, Settings → General → Pause Project)

### J+7 (dimanche 21/06)

- [ ] Post-mortem bascule publié (`docs/POST_MORTEM_BASCULE_140626.md`)
- [ ] **Étape 6** : compléter `README.md` final avec lien post-mortem
- [ ] **Étape 7** : marquer le repo GitHub comme **"Archived"** dans Settings
      (manuel, Danger Zone, triple vérif URL)

### J+30 (mi-juillet)

- [ ] Décision finale rétention :
  - Repo GitHub : laisser archivé permanent (recommandé pour audit)
  - Projet Vercel paused : supprimer (gain coût Hobby si applicable) OU laisser
  - Projet Supabase Frankfurt : décision CTO Sophie (dump + suppression OU
    rétention 12 mois RGPD)

---

## 6. Garde-fous transverses

| # | Garde-fou | Mitigation |
|---|---|---|
| G1 | **Ordre critique** : `Archive GitHub` (étape 7) **toujours en dernier**, sinon plus aucun push possible (y compris les étapes 1-6). | Script 04 refuse cette action. Checklist liste l'étape 7 en dernier. |
| G2 | **Rollback DNS encore possible jusqu'à J+7** : ne pas supprimer projet Vercel ni détacher domaine avant. | Étape 5 = pause (réversible), pas suppression. |
| G3 | **Secrets supprimés non récupérables sans 1Password** : sauvegarde locale (noms seuls, pas valeurs) avant suppression. | Script 04 écrit `backups/cleanup/secrets_removed_*.txt` (gitignored). |
| G4 | **Branch protection peut bloquer Steve admin** si `lock_branch: true` : prévoir le path PR + admin override OU désactivation rule temporaire pour hotfix. | Documenté dans l'étape 2. |
| G5 | **Workflows désactivés via déplacement = simple à inverser** mais nécessite PR (main locked). | Documenté dans l'étape 3. |
| G6 | **Aucune action côté Supabase ni Fly.io** dans ce cleanup — sujets distincts CTO. | Section 3.3 et 3.4 explicites "hors périmètre". |
| G7 | **Aucune commande destructive sur le code** : pas de `git filter-branch`, pas de suppression de branches `feat/*`, pas de réécriture d'historique. | Le repo en archive doit conserver TOUTE son histoire. |

---

## 7. Liens

- Brief migration : [docs/brief_migration_sourcing_to_monorepo.md](brief_migration_sourcing_to_monorepo.md)
- Runbook bascule : [docs/RUNBOOK_BASCULE_MONOREPO_140626.md](RUNBOOK_BASCULE_MONOREPO_140626.md)
- Rollback DNS : [scripts/migration/ops/03-rollback-dns.ps1](../scripts/migration/ops/03-rollback-dns.ps1)
- README ops : [scripts/migration/ops/README.md](../scripts/migration/ops/README.md)
- Visio cadrage : [docs/VISIO_CADRAGE_MIGRATION_BRIEF_260610.md](VISIO_CADRAGE_MIGRATION_BRIEF_260610.md)
- Template README archive : [docs/README.md.archive](README.md.archive)
- Script cleanup : [scripts/migration/ops/04-cleanup-edifio-sourcing.ps1](../scripts/migration/ops/04-cleanup-edifio-sourcing.ps1)
- Post-mortem (à publier) : `docs/POST_MORTEM_BASCULE_140626.md`

---

**Auteur** : ps_operator (Yann), 2026-06-11, J-3 bascule monorepo.
**Validation** : à confirmer par Steve avant lancement du script J+1.
