# Ops Steve — Migration 0039 prod : normalisation DC2 archi-agnostique

**Date** : 2026-06-03
**Demandeur** : Alex (dev) → Steve (admin BDD)
**Contexte** : chantier réutilisation cross-archi (P3 du brief Steve 2026-06-03).

## Ce que fait la migration

Backfill simple : pour tous les DC2 historiques en BDD qui ont `architect_id`
posé (héritage Phase 3 Tandem multi-archi), on remet `architect_id = NULL`
pour que le DC2 soit archi-agnostique et persiste quand Steve switch d'archi
A à archi B sur le même AO.

```sql
UPDATE "response_files"
   SET "architect_id" = NULL
 WHERE "kind"         = 'dc2'
   AND "architect_id" IS NOT NULL
   AND "be_id"        IS NULL;
```

DC1 non touché (mandataire = archi en Tandem, reste archi-specific).
DC2 BE (Cotraitance BE) non touché (be_id IS NOT NULL filtré).

## Comment l'appliquer

À jouer **après** la migration 0038 (les deux peuvent être enchaînées).

```powershell
# Compte les DC2 concernés AVANT (pour vérifier l'effet)
psql -h <PROD_HOST> -U <PROD_USER> -d <PROD_DB> -c "select count(*) from response_files where kind = 'dc2' and architect_id is not null and be_id is null;"

# Applique la migration
psql -h <PROD_HOST> -U <PROD_USER> -d <PROD_DB> -f src/db/migrations/0039_normalize_dc2_architect_id.sql

# Compte les DC2 concernés APRÈS (doit être 0)
psql -h <PROD_HOST> -U <PROD_USER> -d <PROD_DB> -c "select count(*) from response_files where kind = 'dc2' and architect_id is not null and be_id is null;"
```

Attendu : le compteur APRÈS doit être 0. Si Steve est en démarrage MVP avec
peu d'AO, le compteur AVANT sera probablement 0 ou très faible aussi.

## Enregistrement dans `__drizzle_migrations`

```sql
INSERT INTO __drizzle_migrations (id, hash, created_at)
VALUES (
  (SELECT COALESCE(MAX(id), 0) + 1 FROM __drizzle_migrations),
  '0039_normalize_dc2_architect_id',
  now()
);
```

## Rollback

Si jamais on doit revenir en arrière (improbable) : pas de rollback simple
car on a perdu l'info de quel archi chaque DC2 était lié. La règle est
désormais "DC2 = AlyoS, archi-agnostique" — c'est la nouvelle vérité.

## Suivi

Migration idempotente (UPDATE conditionnel) — safe à rejouer.
