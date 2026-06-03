# Ops Steve — Migration 0038 prod : `dossier_dispatches`

**Date** : 2026-06-03
**Demandeur** : Alex (dev) → Steve (admin BDD)
**Contexte** : nouveau chantier "Envoyer le dossier à l'archi" (P2 du brief Steve 2026-06-03).

## Ce que fait la migration

Crée la table `dossier_dispatches` qui trace chaque envoi du ZIP du dossier
compilé à un architecte mandataire, avec :

- `tender_id` / `architect_id` (ON DELETE SET NULL — historique audit conservé
  si l'archi est purgé RGPD)
- `organization_id` (NOT NULL, ON DELETE CASCADE — tenant isolation)
- `zip_storage_path` + `zip_display_name` + `zip_size_bytes`
- `signed_url_expires_at` (sent_at + 7j)
- `sent_at`, `sent_by`, `recipient_email`, `recipient_name`
- `brevo_message_id`, `brevo_template_register`

Index :
- `idx_dossier_dispatches_tender_archi` (tender_id, architect_id, sent_at DESC)
  → chemin chaud "dernier envoi pour cet archi sur cet AO"
- `idx_dossier_dispatches_org` (organization_id, sent_at DESC) → listings

RLS :
- ENABLE + FORCE Row Level Security
- 2 policies : SELECT et FOR ALL avec `organization_id = current_organization_id()`

## Comment l'appliquer

Tu poses les variables PG* dans ta session, lance la commande, colle l'output.

```powershell
# Vérifie d'abord que tu pointes bien sur la prod
psql -h <PROD_HOST> -U <PROD_USER> -d <PROD_DB> -c "select current_database();"

# Applique la migration
psql -h <PROD_HOST> -U <PROD_USER> -d <PROD_DB> -f src/db/migrations/0038_dossier_dispatches.sql

# Vérifie que la table existe + RLS FORCE
psql -h <PROD_HOST> -U <PROD_USER> -d <PROD_DB> -c "\d+ dossier_dispatches"
psql -h <PROD_HOST> -U <PROD_USER> -d <PROD_DB> -c "select relname, relrowsecurity, relforcerowsecurity from pg_class where relname = 'dossier_dispatches';"

# Vérifie les 2 policies
psql -h <PROD_HOST> -U <PROD_USER> -d <PROD_DB> -c "select policyname from pg_policies where tablename = 'dossier_dispatches';"
```

Attendu :
- `\d+ dossier_dispatches` → table + 2 index visibles
- `relrowsecurity = t` ET `relforcerowsecurity = t`
- 2 policies : `dossier_dispatches_select_org` + `dossier_dispatches_write_org`

## Enregistrement dans `__drizzle_migrations`

Une fois appliqué, j'enregistre la migration côté journal :

```sql
INSERT INTO __drizzle_migrations (id, hash, created_at)
VALUES (
  (SELECT COALESCE(MAX(id), 0) + 1 FROM __drizzle_migrations),
  '0038_dossier_dispatches',
  now()
);
```

## Si quelque chose foire

- Erreur sur `gen_random_uuid()` → l'extension `pgcrypto` doit être active.
  Normalement déjà OK pour cette BDD (migrations précédentes l'utilisent).
- Erreur sur `current_organization_id()` → fonction définie dans la
  migration 0002_rls (déjà appliquée). Si elle manque, on a un drift à
  régler avant.

## Suivi

Une fois la migration appliquée et `__drizzle_migrations` mis à jour, ping moi
ici pour que je marque la PR comme prête à merger côté Vercel (le build PR
n'a pas besoin de la migration prod, mais le déploiement prod en a besoin
pour ne pas crasher au premier `INSERT INTO dossier_dispatches`).
