# Ops Steve — Migration 0041 prod : `library_item_index`

**Date** : 2026-06-03
**Demandeur** : Alex (dev) → Steve (admin BDD)
**Contexte** : chantier E MVP — indexation IA biblio (Steve 2026-06-03).

## Ce que fait la migration

Crée la table `library_item_index` qui stocke les métadonnées extraites par
Claude Haiku 4.5 pour chaque item presentation_library :

- `library_item_id` UNIQUE FK → 1 index par item, ré-indexation = upsert
- `extracted_title`, `keywords TEXT[]`, `summary`, `doc_type`
- `extracted_entities JSONB` (SIRET, dates de validité, montants…)
- `source_hash` (SHA-256 du fichier au moment de l'indexation, détecte
  ré-upload sans ré-indexation)
- `model_version`, `indexed_by`, `ai_run_id` (audit)

RLS strict tenant : ENABLE + FORCE + 2 policies (SELECT + ALL).

## Comment l'appliquer

```powershell
# Pose tes PG* dans ta session, puis :
psql -h <PROD_HOST> -U <PROD_USER> -d <PROD_DB> -f src/db/migrations/0041_library_item_index.sql

# Vérifie table + RLS
psql -h <PROD_HOST> -U <PROD_USER> -d <PROD_DB> -c "\d+ library_item_index"
psql -h <PROD_HOST> -U <PROD_USER> -d <PROD_DB> -c "select relname, relrowsecurity, relforcerowsecurity from pg_class where relname = 'library_item_index';"
psql -h <PROD_HOST> -U <PROD_USER> -d <PROD_DB> -c "select policyname from pg_policies where tablename = 'library_item_index';"
```

Attendu :
- Table avec colonnes ci-dessus, 2 index (org + doc_type partiel)
- `relrowsecurity = t` ET `relforcerowsecurity = t`
- 2 policies : `library_item_index_select_org` + `library_item_index_write_org`

## Enregistrement dans `__drizzle_migrations`

```sql
INSERT INTO __drizzle_migrations (id, hash, created_at)
VALUES (
  (SELECT COALESCE(MAX(id), 0) + 1 FROM __drizzle_migrations),
  '0041_library_item_index',
  now()
);
```

## Notes de coût IA

Indexation d'un doc PDF moyen (~30k tokens entrée + 200 sortie) =
`(30000 × 0.8 + 200 × 4) / 1_000_000 ≈ 0.025$` = **~2,5 c€**.

Pour une biblio de 30 docs : ~75 c€ par run complet. La protection
`source_hash` évite les ré-indexations inutiles : si tu ne re-uploades pas
un doc, il ne sera pas ré-indexé même si tu cliques 10 fois sur le bouton.

## Limite Vercel

L'action a un hard cap de 15 items par batch pour rester sous le timeout
Vercel de 60 s. Si tu as plus de 15 docs à indexer la première fois, le UI
te dira `X restants — relancez pour continuer` et il faudra cliquer
plusieurs fois. En V2 on basculera sur un cron ou Supabase Realtime pour
faire ça en arrière-plan.

## Suite

Une fois la migration appliquée, le bouton "🤖 Indexer la bibliothèque"
apparaît sur `/sourcing/admin/bibliotheque`. Test fumée recommandé : upload
un doc PDF court (attestation, par ex.) → clique sur le bouton → vérifie
que le badge "✓ Indexé" apparaît + que le summary est cohérent.
