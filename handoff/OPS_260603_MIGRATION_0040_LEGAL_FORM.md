# Ops Steve — Migration 0040 prod : champ « Forme juridique » DC1/DC2

**Date** : 2026-06-03
**Demandeur** : Alex (dev) → Steve (admin BDD)
**Contexte** : Steve a remarqué que la balise `forme juridique` manquait dans
la liste des variables Mustache documentées. Vérification BDD : le champ
n'existait sur aucune des 3 tables productrices de DC1/DC2 (oversight Phase 1
Lots A+B+C 2026-06-02).

## Ce que fait la migration

ALTER additif sur 3 tables : ajoute une colonne `legal_form TEXT NULL` sur
chacune. Champ libre (pas d'enum) — chaque pays / forme atypique reste
représentable. Validation côté UI seulement (datalist suggestive).

```sql
ALTER TABLE "organization_profiles" ADD COLUMN IF NOT EXISTS "legal_form" text;
ALTER TABLE "architects"             ADD COLUMN IF NOT EXISTS "legal_form" text;
ALTER TABLE "bureaux_etudes"         ADD COLUMN IF NOT EXISTS "legal_form" text;
```

Aucun impact RLS (les policies existantes couvrent automatiquement la nouvelle
colonne — pas de filtre par colonne).

## Comment l'appliquer

```powershell
# Pose tes PG* dans ta session, puis :
psql -h <PROD_HOST> -U <PROD_USER> -d <PROD_DB> -f src/db/migrations/0040_legal_form_field.sql

# Vérifie la présence des 3 colonnes
psql -h <PROD_HOST> -U <PROD_USER> -d <PROD_DB> -c "select table_name, column_name from information_schema.columns where column_name = 'legal_form' and table_name in ('organization_profiles', 'architects', 'bureaux_etudes');"
```

Attendu : 3 lignes (une par table).

## Enregistrement dans `__drizzle_migrations`

```sql
INSERT INTO __drizzle_migrations (id, hash, created_at)
VALUES (
  (SELECT COALESCE(MAX(id), 0) + 1 FROM __drizzle_migrations),
  '0040_legal_form_field',
  now()
);
```

## Suite

Tu pourras renseigner ta forme juridique AlyoS et celle de tes archis
favoris dès que les UIs admin auront un champ pour ça. Côté code, ces
champs feront partie du prochain commit qui ajoutera l'input forme
juridique sur :
- `/sourcing/admin/societe` (AlyoS)
- `/sourcing/architectes/[id]` (cabinet archi)
- `/sourcing/bureaux-etudes/[id]` (BE cotraitant)

Si tu veux que je pose ces inputs UI dans la foulée, je peux le faire dans
un commit séparé.
