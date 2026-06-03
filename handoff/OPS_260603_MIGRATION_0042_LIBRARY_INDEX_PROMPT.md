# Ops Steve — Migration 0042 prod : seed prompt library_index

**Date** : 2026-06-03 (chantier G5)
**Demandeur** : Alex (dev) → Steve (admin BDD)

## Ce que fait la migration

INSERT idempotent dans `ai_prompts` du row `name='library_index', version=1,
model='haiku-4-5'` avec un UUID stable
(`bbbbbbbb-0000-0000-0000-000000000009`). Permet à `indexLibraryBatchAction`
et `reindexLibraryItemAction` d'enregistrer chaque run Claude dans `ai_runs`
(conformité Gate 5 §7 audit IA).

`ON CONFLICT (id) DO NOTHING` → safe à rejouer.

## Comment l'appliquer

```powershell
psql -h <PROD_HOST> -U <PROD_USER> -d <PROD_DB> -f src/db/migrations/0042_seed_library_index_prompt.sql

# Vérifie
psql -h <PROD_HOST> -U <PROD_USER> -d <PROD_DB> -c "SELECT id, name, version, model, active FROM ai_prompts WHERE name = 'library_index';"
```

Puis ajoute la ligne au journal :
```sql
INSERT INTO __drizzle_migrations (id, hash, created_at)
VALUES ((SELECT COALESCE(MAX(id),0)+1 FROM __drizzle_migrations), '0042_seed_library_index_prompt', now());
```

## Effet code

Sans cette migration, le code throw à la première indexation IA :
`ai_prompts row 'library_index' missing — apply migration 0042`. C'est
catché par le try/catch best-effort, donc l'indexation continue mais sans
ai_runs. Une fois la migration appliquée, chaque indexation enregistre :
- `ai_runs.prompt_id` = UUID du seed
- `ai_runs.input_hash` = SHA-256 du fichier (64 chars)
- `ai_runs.output` = JSON Claude
- `ai_runs.cost_usd`, `latency_ms`, `model`, `succeeded=true`
- `library_item_index.ai_run_id` = ai_runs.id pour traçabilité
