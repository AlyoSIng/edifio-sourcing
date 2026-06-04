# Ops Steve — Migration 0044 prod : annulation envoi dossier

**Date** : 2026-06-04 (chantier H6)
**Demandeur** : Alex (dev) → Steve (admin BDD)

## Ce que fait la migration

Ajoute 3 colonnes nullables à `dossier_dispatches` pour permettre le soft
cancel d'un envoi (chantier H6) :

- `cancelled_at timestamptz NULL` — NULL = envoi actif
- `cancelled_by uuid NULL REFERENCES users(id) ON DELETE SET NULL`
- `cancellation_reason text NULL` — motif libre

Index partiel `idx_dossier_dispatches_active` sur les non-annulés (chemin
chaud : afficher dans l'UI Pièces).

## Comment l'appliquer

```powershell
psql -h <PROD_HOST> -U <PROD_USER> -d <PROD_DB> -f src/db/migrations/0044_dossier_dispatches_cancellable.sql

# Vérifie
psql -h <PROD_HOST> -U <PROD_USER> -d <PROD_DB> -c "\d+ dossier_dispatches" | grep -E "cancelled|cancellation"
```

Puis enregistre :
```sql
INSERT INTO __drizzle_migrations (id, hash, created_at)
VALUES ((SELECT COALESCE(MAX(id),0)+1 FROM __drizzle_migrations), '0044_dossier_dispatches_cancellable', now());
```

## Limite à signaler

Le lien signé Supabase Storage **reste valide** jusqu'à son expiration
naturelle (7 jours après l'envoi). Supabase Storage n'expose pas de
révocation immédiate. L'annulation côté BDD signale juste l'audit, et
l'UI ne montre plus l'envoi comme actif. Si tu veux invalider le lien
**immédiatement**, la seule façon est de supprimer le fichier Storage —
ce qui casse aussi le téléchargement légitime de l'archi. On l'ajoutera
en V2 si le besoin se présente.
