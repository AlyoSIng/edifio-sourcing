# CC 2026-05-19 19:00 — Stash sync Cowork pré-PR #2

**Agent** : Yann (ps_operator)
**Branche** : `feat/sourcing-mvp`
**Contexte** : Avant qu'Alex démarre PR #2 (connecteur BOAMP), isolement de
2 modifs tracked apparues dans le working tree, identifiées comme régressions
vs `origin/main` par rapport au travail final commité hier (fixes 2026-05-18 et it2 du 2026-05-19).

## Fichiers stashés

- `DECISIONS.md` — version condensée « Batch n°12 » qui remplace 6 entrées détaillées du 2026-05-18.
- `specs/schema_v1.sql` — version intermédiaire Sophie : contient le fix `idx_tenders_deadline`
  (2026-05-18) mais PAS le fix `insert_by_member AS RESTRICTIVE` (it2 du 2026-05-19).

**Origine probable** : sync Cowork (Sophie + Théo/Léa) parallèle à PR #14 qui a
écrasé localement le working tree à un état antérieur aux fixes finaux.

## Stash créé

Nom exact : `cowork-sync-260519-pre-pr2 (DECISIONS.md + schema_v1.sql regression)`
Référence : `stash@{0}` sur `feat/sourcing-mvp`.

Untracked NON inclus dans le stash (préservés dans le working tree) :
- `design/copy/etude_couts_v{1,2,3}.html` + `etude_marche_v{1,3}.html` (Théo / Léa)
- `src/db/seed/distribution-report.json`

## Récupération ultérieure

Après clarification avec Sophie (DECISIONS.md) et Théo/Léa (schema_v1.sql),
au choix :

```powershell
# Inspection sans appliquer
git stash show -p stash@{0}

# Application non destructive (garde le stash en stock)
git stash apply stash@{0}

# Application + suppression du stash (si OK Cowork validé)
git stash pop stash@{0}
```

## Action en attente

**Steve doit clarifier avec Sophie / Théo / Léa** avant toute réintégration :
quelle version de `DECISIONS.md` et `specs/schema_v1.sql` fait foi
(working tree Cowork ou HEAD `feat/sourcing-mvp` post-fixes 2026-05-18/19).

## Statut

- [x] Stash créé
- [x] Working tree tracked propre
- [x] Untracked préservés
- [ ] Note committée (volontairement laissée untracked pour visibilité Steve)
