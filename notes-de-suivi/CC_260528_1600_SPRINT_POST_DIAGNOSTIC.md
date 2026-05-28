# Note de suivi — 2026-05-28 16h00 — Sprint post-diagnostic PRs #86-89

**Agent** : Alex (`dev`) + Yann (`ps_operator`) — session Claude Code  
**Période** : 2026-05-28 après-midi

---

## Diagnostic production — erreurs transitoires

**Pages affectées** : `/sourcing/ao-du-jour`, `/sourcing/architectes`, `/sourcing/admin/bibliotheque`  
**Symptôme rapporté** : error banners « Sourcing indisponible » / « Annuaire indisponible »  

### Conclusion du diagnostic

**Les erreurs étaient transitoires** (cold start / blip Supabase), PAS causées par les PRs #85-89.

Preuves :
- Toutes les pages retournent HTTP 200 (pas de 500)
- `ao-du-jour` et `bibliotheque` ont `console.error` explicite dans leur catch block — absent des logs Vercel de la dernière heure
- Requêtes SQL directes via Supabase MCP : toutes les tables retournent les données
- Rôle `postgres` : `rolbypassrls=true` → FORCE RLS ne s'applique pas aux requêtes Drizzle serveur

### État migrations prod

| Migration | Tag | Statut prod |
|-----------|-----|-------------|
| 0000–0027 | init → shortlist_criteria | ✅ Appliquées |
| **0028** | fix current_organization_id COALESCE | ❌ **Non appliquée** |

Migration 0028 = défense-en-profondeur Phase 2 (rôles restreints). Non bloquante car `postgres` a BYPASSRLS.

---

## Actions réalisées

### Tâche 2 — Fix fonctions admin architectes (PR #90)

`src/app/sourcing/architectes/actions.ts` — 3 fonctions admin complétées :
- `importArchitectsFromCsv` : `set_config` ajouté avant la boucle CSV
- `enrichArchitectsFromPappers` : `set_config` ajouté avant le `Promise.all`
- `enrichSingleArchitectFromPappers` : `set_config` ajouté au début du `try`

No-op actuel (postgres BYPASSRLS) — effectif Phase 2 + migration 0028.

### Tâche 3 — Script PDF (déjà livré dans PR #88)

`scripts/generate-pdf-assets.ts` contient déjà `etude_marche_v4.html` → intégré dans PR #88.

### Tâche 4 — pgTAP tender_briefs contraintes (PR #91)

Nouveau fichier `tests/rls/12_tender_briefs_constraints.sql` — 7 assertions DDL :
- existence table, NOT NULL (id, tender_id, organization_id)
- FK vers tenders + organizations
- index `idx_tender_briefs_tender_active`

### Tâche 5 — backfill-departments PG* env vars (PR #92)

`scripts/backfill-departments.ts` : helper `resolveDbUrl()` — supporte `DATABASE_URL` OU `PGHOST/PGUSER/PGPASSWORD/PGDATABASE`.

---

## État du main post-sprint

```
(PRs #90-92 à merger)
5a5c1ed feat(auth): cookie COOKIE_DOMAIN (#89)
7e3fa94 feat(onboarding): script PDF assets (#88)
7fb7c9a test(rls): pgTAP shortlist_criteria + tender_briefs (#87)
cf6f5dc fix(architects): FORCE RLS fetchArchitectsPage (#86)
```

---

## Actions en attente Steve

1. **Migration 0028** (défense Phase 2, non urgente) :
   ```powershell
   # Dans session PowerShell avec PGPASSWORD prod
   pnpm tsx scripts/migrate.ts  # ou psql -f src/db/migrations/0028_fix_current_organization_id.sql
   ```
   Puis enregistrer dans `drizzle.__drizzle_migrations` (timestamp 1779731003000).

2. **Tâche 2.3 PDFs** (inchangé — Steve lance le script avec credentials Supabase) :
   ```powershell
   $env:NEXT_PUBLIC_SUPABASE_URL = "..."
   $env:SUPABASE_SERVICE_ROLE_KEY = "..."
   pnpm tsx scripts/generate-pdf-assets.ts
   ```

3. **Gate 7 DNS** : token Vercel + CNAME + `COOKIE_DOMAIN=.alyosingenierie.fr`
