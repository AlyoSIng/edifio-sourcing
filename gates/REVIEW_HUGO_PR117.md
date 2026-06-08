# Revue Hugo — PR #117 `chore(migration): scripts ops backup db + vercel env + storage`

- **Branche** : `ops/migration-scripts-clean` → `main`
- **Commit** : `e4b5edb`
- **Auteur** : Yann (ps_operator)
- **Périmètre** : 5 fichiers, 872 lignes ajoutées (scripts/migration/)
- **Date revue** : 2026-06-08
- **Reviewer** : Hugo (reviewer)

---

## Verdict : **APPROUVÉ SOUS RÉSERVE**

0 bloquant sécurité, 0 VETO. Quelques améliorations à apporter avant J-7 (11 juillet)
pour durcir le périmètre, mais rien qui interdise un merge immédiat sur `main`
(les scripts ne tournent pas en CI et ne sont jamais invoqués automatiquement).

**Synthèse rapide** :
- Posture sécurité **excellente** : aucun secret hardcodé, refus systématique si
  ENV manquantes, garde-fous pooler/PGUSER actifs, alignement strict avec la
  MEMORY `feedback_ops_prod_user_runs_migration.md` (Steve pose, Steve lance).
- README clair, ordre J-7/J-1 explicite, rollback documenté.
- 2 « à corriger », 3 suggestions.

---

## A — Sécurité (audit critique)

### A1. Secrets en clair dans les scripts — **OK**
Aucun secret hardcodé. Tous les secrets transitent par `$env:PG*` /
`$env:SUPABASE_SERVICE_ROLE_KEY`, posés par Steve dans SA session avant
exécution. Conforme à MEMORY > `feedback_ops_prod_user_runs_migration.md`.

### A2. `.env.production.backup` non chiffré sur disque — **OK avec réserve**
- `export-vercel-env.ps1:148-154` affiche un bandeau `[SECURITE]` en rouge,
  rappelle le placement 1Password + suppression, et propose un one-liner `age`
  pour chiffrer.
- README §5 (« `.env.production.backup` contient des SECRETS ») confirme la
  consigne « copier dans 1Password puis supprimer ».
- **Réserve mineure (à corriger)** : la suppression n'est pas automatisée. Un
  oubli humain laisse les secrets prod en clair sur le disque jusqu'à la prochaine
  hygiène. Voir proposition B2 ci-dessous.

### A3. `SUPABASE_SERVICE_ROLE_KEY` — pas de log accidentel — **OK**
- Le `service_role_key` est utilisé dans `$headers` (mémoire process) et JAMAIS
  passé à un `Write-Host` (vérifié sur `backup-supabase-storage.ps1`).
- Le seul log d'env qui sort est `SUPABASE_URL` (ligne 96, non sensible).
- Les `catch` (lignes 76, 145) émettent `$_.Exception.Message`. PowerShell
  n'inclut PAS les headers HTTP dans ce message par défaut — pas de leak du
  Bearer.

### A4. `pg_dump` password leak via stack trace — **OK**
- Le password est passé via `$env:PGPASSWORD` (le process enfant `pg_dump` hérite
  de l'env), JAMAIS en argument CLI visible.
- En mode Docker, idem : `--env PGPASSWORD=$env:PGPASSWORD` est passé en
  variable au container, pas en argument inline.
- Le `Write-Host "[INFO] Cible : ..."` ligne 104 logge
  `PGUSER@PGHOST:PGPORT/PGDATABASE` mais EXCLUT volontairement le password. Bon.
- Pas de `try/catch` qui dumperait la connection string complète. Bon.

### A5. `vercel env pull` crée des fichiers en clair — **OK**
- Bannière `[SECURITE]` en rouge ligne 148.
- Recommandation chiffrement `age` ligne 152-153.
- Rappel `.gitignore` ligne 150.

### A6. `backups/` dans `.gitignore` — **VÉRIFIÉ ET CONFIRMÉ**
- `.gitignore` ligne 67 : `backups/` ignoré récursivement.
- README ligne 26 affirme la ligne 67 — exact, claim vérifiable, pas de fake.
- Aucun risque de commit accidentel d'un `.dump` ou d'un `.env.production.backup`.

**Sécurité : RAS bloquant.** Posture conforme aux 2 incidents historiques
(0007-0008 pooler + 21/05 password leak chat).

---

## B — Correctness (audit majeur)

### B1. Refus propre si ENV manquantes — **OK**
- Les 3 scripts BDD/Storage ont une boucle `foreach ($var in $requiredEnv)` qui
  liste TOUTES les ENV manquantes en un seul passage (pas de fail-fast partiel),
  affiche un bloc PowerShell prêt à copier-coller, et `exit 1`.
- `export-vercel-env.ps1` a son propre check : CLI vercel présent + projet linké
  (`.vercel/project.json` lisible).

### B2. Compat PowerShell 5.1 — **OK**
Vérifié par grep : aucun `??`, `&&`, `?:`, `?.` dans les 4 scripts. Conforme
MEMORY > `env_pnpm_corepack.md` (Steve tourne en PowerShell 5.1 par défaut).

### B3. Encodage UTF-8 sur écritures fichier — **N/A**
Aucun script n'utilise `Set-Content` / `Out-File`. Les écritures sont :
- `pg_dump --file=...` (binaire, format custom Postgres).
- `vercel env pull <file>` (le CLI Vercel gère l'encodage).
- `Invoke-WebRequest -OutFile` (binaires Storage).
→ La règle UTF-8 ne s'applique pas ici.

### B4. Refus port 6543 (pooler) — **OK**
- `backup-sourcing-db.ps1:89-93` : refus explicite si `PGPORT -eq "6543"`.
- `backup-suiviact-db.ps1:88-92` : idem.
- Garde-fou supplémentaire : refus si `PGUSER` commence par `postgres.`
  (signature pooler).
- Aligné sur l'incident migration 0007-0008 documenté dans le bloc `.NOTES`.

### B5. Idempotence — **OK avec réserve mineure**
- Les fichiers de sortie sont datés (`yyyy-MM-dd-HHmm` pour BDD,
  `yyyy-MM-dd` pour Vercel/Storage).
- Un re-run BDD à la même minute écrase le `.dump` précédent — acceptable pour
  un retry rapproché (1 minute), pas problématique en pratique.
- Storage : re-run même jour écrase les fichiers téléchargés — OK car
  re-téléchargement complet du bucket.

### B6. Flag `-UseDocker` — **OK**
- `backup-sourcing-db.ps1:111-130` et `backup-suiviact-db.ps1:111-130` : la
  branche `if ($UseDocker)` est bien câblée, monte `${absOutDir}:/backup`,
  passe `PGPASSWORD` en `--env`, écrit le dump dans `/backup/...`.
- Fallback documenté dans README §2.

### B7. Récursion Storage (potentiel défaut « à corriger ») — **À CORRIGER**
- `backup-supabase-storage.ps1:155-188` définit la fonction `Get-StorageObjects`
  **À L'INTÉRIEUR de la boucle `foreach ($bucket in $targetBuckets)`**.
- En PowerShell 5.1, redéfinir une fonction dans une boucle marche, mais c'est
  inhabituel et empêche la lisibilité.
- **Vrai risque** : la fonction utilise `$apiBase` et `$headers` capturés par
  closure ambiante — fragile si le scope change. Préférer définir la fonction
  AVANT la boucle, ou passer `$apiBase` / `$headers` en paramètres explicites.

---

## C — Robustesse (audit mineur)

### C1. Timestamps de fichiers — **OK**
- `sourcing-prod-2026-07-17-1830.dump` : format daté à la minute, pas d'écrasement
  d'un J-7 par un J-1.
- Vercel/Storage : `<project>/<date>/` permet conservation de plusieurs snapshots
  multi-jours sans écrasement (sauf re-run même jour).

### C2. README — lisibilité débutant ops — **TRÈS BON**
- Inventaire en tableau, ordre d'exécution numéroté, blocs PowerShell prêts à
  copier-coller (avec `<placeholders>` visibles), 5 pièges identifiés en clair
  avec rappel des incidents historiques.
- Un débutant ops peut suivre **à condition** de connaître la signification de
  « Direct connection vs pooler » — bien expliqué piège §1.

### C3. Ordre J-7 / J-1 — **OK**
Explicite ligne 31 : « J-7 (samedi 11 juillet) pour le répét générale, puis J-1
(vendredi 17 juillet soir) pour le backup officiel ».

### C4. Plan de rollback — **OK**
Section « Rollback » §1-4 du README couvre : BDD Sourcing (restore .dump),
Vercel (re-import ENV), DNS (consigne renvoi MEMORY), Storage (re-upload).
Renvoi vers `docs/brief_migration_sourcing_to_monorepo.md` §Rollback Plan.

---

## Classement final des remarques

### Bloquants : **0**
RAS.

### À corriger avant J-7 (11 juillet) : **2**

1. **[CORRECTNESS B7]** `backup-supabase-storage.ps1:155-188` — sortir la
   fonction `Get-StorageObjects` de la boucle `foreach`, passer `$apiBase` et
   `$headers` en paramètres explicites (pas de capture de closure ambiante).
   Risque : refacto futur du script qui changerait le scope casserait la
   pagination sans alerte CI.
2. **[SECURITE A2]** Ajouter dans `export-vercel-env.ps1` une option
   `-Encrypt` qui invoque `age` automatiquement après l'export si la clé `age`
   est disponible en ENV (`AGE_RECIPIENT`), puis supprime le `.env.*.backup` en
   clair. Optionnel mais réduit la fenêtre de leak humain.

### Suggestions (nice-to-have, post-J-7 OK) : **3**

3. **[CORRECTNESS B5]** Ajouter `Get-Date -Format "yyyy-MM-dd-HHmmss"` (avec
   secondes) pour permettre 2 re-runs dans la même minute sans écrasement.
4. **[ROBUSTESSE C2]** Ajouter au README une ligne « Si `pg_dump` plante avec
   `SSL connection has been closed unexpectedly`, relancer immédiatement — la
   Direct connection Supabase a un timeout court côté load balancer ». Vu en
   prod sur dumps > 100 MB.
5. **[ROBUSTESSE C4]** Documenter dans le README la durée de vie du backup
   (recommandation : conserver 90 jours, puis purger — alignement RGPD).

---

## Tests à lancer avant J-7

Conformément aux « Tests à froid recommandés » du README (et c'est une bonne
pratique) :
- [ ] Lancer chaque script SANS poser les ENV → vérifier le refus propre.
- [ ] Lancer `backup-sourcing-db.ps1` avec `PGPORT=6543` → vérifier le refus.
- [ ] Lancer `backup-sourcing-db.ps1` avec `PGUSER=postgres.fake` → vérifier
      refus.
- [ ] Tester `backup-supabase-storage.ps1` sur un projet **staging** (pas prod)
      avant J-7.
- [ ] Tester un `pg_restore --list backup.dump` pour valider l'intégrité d'un
      dump produit.

---

## Reporting Board (6 lignes max)

> **PR #117 relue : 0 bloquant, 2 à corriger, 3 suggestions — APPROUVÉ SOUS RÉSERVE.**
> Aucun secret hardcodé, garde-fous pooler/PGUSER actifs, `.gitignore` ligne 67
> vérifié, posture « Steve pose / Steve lance » conforme MEMORY. À corriger avant
> J-7 : (1) sortir `Get-StorageObjects` de la boucle pour casser la closure
> implicite, (2) ajouter option `-Encrypt age` à `export-vercel-env.ps1`. Aucun
> VETO sécurité. Merge sur `main` autorisé sans attendre les 2 corrections (les
> scripts ne tournent pas en CI et restent inertes jusqu'à invocation manuelle).
