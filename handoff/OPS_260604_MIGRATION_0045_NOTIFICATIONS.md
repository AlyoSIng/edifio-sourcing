# Ops Steve — Migration 0045 prod : compteur notifications in-app

**Date** : 2026-06-04 (chantier H7)

## Ce que fait la migration

Ajoute la colonne nullable `users.architect_notifications_seen_at
timestamptz`. Sert au compteur de nouvelles réponses architectes affiché
dans la sidebar (badge rouge sur « Activité Tandem »).

## Apply

```powershell
psql -h <PROD_HOST> -U <PROD_USER> -d <PROD_DB> -f src/db/migrations/0045_user_notifications_seen.sql

# Vérification
psql -h <PROD_HOST> -U <PROD_USER> -d <PROD_DB> -c "\d+ users" | grep architect_notifications

# Journal
INSERT INTO __drizzle_migrations (id, hash, created_at)
VALUES ((SELECT COALESCE(MAX(id),0)+1 FROM __drizzle_migrations), '0045_user_notifications_seen', now());
```

## Effet

- Sidebar : à côté de l'item « Activité Tandem » dans le groupe Admin,
  un badge rouge `X` apparaît si X réponses architectes ont été reçues
  depuis le dernier passage sur la page. Cap à `99` pour éviter le
  débordement visuel (au-delà, l'UI affiche `99` même si la BDD a plus).
- Au clic sur l'item → la page Activité Tandem charge ET met à jour
  `architect_notifications_seen_at = now()`. Au prochain reload, le
  badge disparaît jusqu'à la prochaine réponse archi.
