# Clôture — Apply migration architects.cabinet (prod)

**Date** : 2026-05-25
**Agent** : Nadia (dev_tandem) — rattrapage documentaire
**Action** : Apply DDL migrations 0004-0006 en prod + alignement journal __drizzle_migrations

---

## Contexte

La colonne `cabinet` (et l'ensemble de la refonte schéma 0005_tandem_engine) était
absente de la prod, déclenchant l'erreur "column architects.cabinet does not exist"
et rendant le module Sourcing inaccessible.

Diagnostic préalable (notes `CC_260525_BUG_CABINET_INVESTIGATION.md` +
`CC_260525_0307_NADIA_BUG_CABINET.md`) :
- `SELECT column_name FROM information_schema.columns WHERE table_name='architects'`
  → colonne `cabinet` absente en prod
- Le journal `drizzle.__drizzle_migrations` ne contenait que 4 entrées (IDs 1, 2, 3, 4
  correspondant aux migrations 0000-0003). Les migrations 0004, 0005, 0006 n'avaient
  jamais été enregistrées dans ce journal, bien que leur DDL ait vraisemblablement été
  appliqué partiellement via un outil tiers (hypothèse : `drizzle-kit push` initial
  ou psql direct hors workflow Drizzle — non tracé).
- Conséquence : `drizzle-kit migrate` estimait les migrations déjà appliquées sur
  la base de l'absence dans son journal, alors que la DDL cible manquait.

---

## Procédure réellement exécutée

**Option retenue : patch DDL ciblé via éditeur SQL Supabase + INSERT manuel des
hashes dans le journal `drizzle.__drizzle_migrations`.**

(L'option B initiale "bootstrap journal 0000-0004 puis apply incrémental 0005-0006
via drizzle-kit migrate" a été cartée car la proc standard n'était pas praticable
dans ce contexte — détail dans `CC_260525_BUG_CABINET_INVESTIGATION.md` §3.)

1. Audit préalable prod (lecture seule, par Steve) :
   `SELECT column_name FROM information_schema.columns WHERE table_name='architects'`
   Résultat : colonne `cabinet` absente — drift confirmé.

2. Steve a copié-collé le SQL des migrations 0004, 0005, 0006 directement dans
   l'éditeur SQL Supabase Studio (DDL appliqué sans passer par drizzle-kit migrate).

3. Les SHA-256 des fichiers SQL migrations ont été calculés par Alex via le script
   `scripts/bug-cabinet/compute-migration-hashes.ps1`. Ces hashes ont ensuite été
   insérés manuellement dans `drizzle.__drizzle_migrations` pour aligner le journal
   avec la réalité de la base.

4. Incident double INSERT : Steve a effectué un premier INSERT avec des valeurs
   placeholder `<hash_0004>`, `<hash_0005>`, `<hash_0006>` (erreur de manipulation),
   puis un second INSERT avec les vraies valeurs. Résultat temporaire : 10 lignes dans
   le journal au lieu de 7.

   Fix appliqué :
   ```sql
   DELETE FROM drizzle.__drizzle_migrations WHERE hash LIKE '<hash_%';
   ```

5. Smoke test post-apply :
   `SELECT cabinet FROM architects LIMIT 1` → OK (valeur présente, pas d'erreur).

---

## Résultat

- **Etat journal `drizzle.__drizzle_migrations`** : 7 lignes (IDs 1, 2, 3, 4, 8, 9, 10
  — non-contiguës en raison du double INSERT puis DELETE, mais fonctionnellement correct
  pour drizzle-kit : les 7 migrations 0000-0006 sont marquées comme appliquées)
- **Smoke test post-apply** : OK (`SELECT cabinet FROM architects LIMIT 1` passe)
- **Snapshot Supabase** : non pris (option reportée — les backups automatisés sont
  bloqués par la rotation post-MVP en attente ; cf. memory `followup_post_mvp_security_rotations`)

---

## Remarques

- L'incident double INSERT (placeholders puis vraies valeurs) a été résolu par un
  DELETE ciblé sur les lignes avec hash LIKE `<hash_%`. Aucune donnée DDL n'a été
  affectée — seul le journal de traçabilité était en cause.
- Les IDs 1-4 sont contiguës (migrations originales), les IDs 8-9-10 correspondent
  aux insertions post-incident (numérotation auto-incrémentale Postgres, les IDs 5-7
  ont été consommés par les entrées incomplètes supprimées). Ce gap dans les IDs est
  sans conséquence fonctionnelle : drizzle-kit se base sur le `hash` du fichier SQL
  pour déterminer si une migration est appliquée, pas sur l'ID.
- La 8e migration (0007 en préparation, schéma à venir) s'appliquera normalement via
  `drizzle-kit migrate` : le journal reconnaîtra les 7 migrations existantes comme
  déjà appliquées et n'appliquera que la nouvelle.
- **Point de vigilance** : les hashes insérés manuellement sont des SHA-256 calculés
  localement par Alex. Une vérification de cohérence via un dry-run local sur un
  container postgres:15 propre est recommandée avant la 8e migration
  (cf. memory `feedback_postgres_dry_run_local`).

---

**Notes sources** :
- `notes-de-suivi/CC_260525_BUG_CABINET_INVESTIGATION.md`
- `notes-de-suivi/CC_260525_0307_NADIA_BUG_CABINET.md`
- `handoff/REQUEST_260525_CLOTURE_NUIT_DEBLOCAGE_LOT56_57.md` §A.1
