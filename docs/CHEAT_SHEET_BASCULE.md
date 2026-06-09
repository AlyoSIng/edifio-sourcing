# 🚀 Cheat Sheet Bascule — 10 juin 2026

> **1 page imprimable**. Reste à côté du clavier pendant la bascule.

## Phase 0 — Pré-bascule (~5 min)

```powershell
cd C:\Dev\edifio-sourcing
git pull origin main
git log --oneline -3
# Doit contenir : 67d754f ops(migration): script apply 0050-0053
```

## Phase 1 — Backup PROD (~10 min)

```powershell
# Pose ENV PROD (récupère depuis 1Password)
$env:PGHOST = "db.<PROD-REF>.supabase.co"
$env:PGPORT = "5432"
$env:PGUSER = "postgres"
$env:PGDATABASE = "postgres"
$env:PGPASSWORD = "<PROD-PASSWORD>"

# Backup
.\scripts\migration\backup-sourcing-db.ps1

# Confirmer : ls backups/sourcing-prod-*.dump | sort -Descending | select -First 1
```

## Phase 2 — Dry-run + apply PREVIEW (~15 min)

```powershell
# Switch ENV vers PREVIEW
$env:PGHOST = "db.<PREVIEW-REF>.supabase.co"
$env:PGPASSWORD = "<PREVIEW-PASSWORD>"

# Dry-run (Docker postgres:15 obligatoire)
.\scripts\migration\apply-migrations-0050-0053.ps1 -Environment preview -DryRunOnly

# Apply (si dry-run OK)
.\scripts\migration\apply-migrations-0050-0053.ps1 -Environment preview
# Réponse "y" pour confirmer
```

## Phase 3 — Smoke preview (~30 min)

| Test | Commande / URL |
|---|---|
| Login | `https://edifio-sourcing-preview-<hash>.vercel.app/login` |
| AO du jour | `/sourcing/ao-du-jour` |
| **Écarter** (Salve U) | Cliquer Écarter → 6 motifs visibles |
| **Exclure** | Cliquer Exclure → aucun mail/aucun learning_event |
| **Cotraitant** | Anon ouvre `/cotraitant/<token>` |
| API smoke | `curl /api/admin/crons/smoke-sourcing-run` |
| E2E P0 | `node node_modules/@playwright/test/cli.js test e2e/multi-org --grep "@p0"` |

## Phase 4 — APPLY PROD (~10 min) 🔴 CRITIQUE

```powershell
# Switch ENV vers PROD
$env:PGHOST = "db.<PROD-REF>.supabase.co"
$env:PGPASSWORD = "<PROD-PASSWORD>"

# Apply (demande "PROD-CONFIRMER")
.\scripts\migration\apply-migrations-0050-0053.ps1 -Environment prod
# Taper "PROD-CONFIRMER" exactement
```

### ❌ Si KO

1. **STOP** — ne pas continuer
2. Ouvrir `docs/ROLLBACK_PLAN_MIGRATIONS_0050_0053.md`
3. Identifier quelle migration a échoué
4. Appliquer rollback SQL inverse
5. Post-mortem dans `DECISIONS.md`

## Phase 5 — Smoke PROD (~15 min)

URL : `https://sourcing.alyosingenierie.fr`

| Test | OK ? |
|---|---|
| Login admin AlyoS | ☐ |
| AO du jour s'affiche | ☐ |
| Écarter avec motif | ☐ |
| Vercel logs sans 500 | ☐ |
| Console nav sans erreur | ☐ |

## Phase 6 — Cron monitoring R12 (~5 min)

Dashboard Vercel → Crons → vérifier que `sourcing-monitoring` apparaît avec
schedule `0 5 * * 1-5`.

Test manuel :
```powershell
curl -H "Authorization: Bearer $env:CRON_SECRET" `
  https://sourcing.alyosingenierie.fr/api/cron/sourcing-monitoring
# Attendu : { ok: true, alertSent: false }
```

## Phase 7 — Communication (~10 min)

```powershell
# Post-deploy SQL assertions (AVANT communication)
# ENV vars PROD doivent encore être posées dans la session
.\scripts\migration\run-post-deploy-verify.ps1 -Environment prod
# Doit afficher : "Toutes les assertions post-deploy OK"
# Si KO : NE PAS communiquer la bascule, revenir Phase 4 / rollback
```

Vérifications couvertes (6 catégories, ~15 assertions) :

- **A** — 4 hashes 0050-0053 présents dans `drizzle.__drizzle_migrations`
- **B** — Colonnes `learning_events.payload/reason_code/applied_at/dismissed_at`
- **C** — `FORCE RLS` actif sur `companies`, `bureaux_etudes`, `cotraitant_shares`, `cotraitant_share_items`
- **D** — 5 helpers `SECURITY DEFINER` présents et bien `prosecdef=true`
- **E** — ≥ 16 policies + aucune `select_public` / `public_token_*` résiduelle (drop 0053)
- **F** — Helpers exécutables sans exception (smoke logique)

Une fois OK :

- Mail équipe AlyoS (template dans PLAN_BASCULE §9.1)
- Slack/Discord interne (template §9.2)

## SQL post-deploy à vérifier

```sql
-- FORCE RLS actif sur 4 tables
SELECT relname, relforcerowsecurity FROM pg_class
WHERE relname IN ('companies', 'bureaux_etudes', 'cotraitant_shares', 'cotraitant_share_items');
-- → tous à TRUE

-- Functions SECURITY DEFINER présentes
\df public.current_user_org_id
\df public.get_cotraitant_share_by_token
\df public.mark_cotraitant_share_item_signed

-- Journal Drizzle à jour
SELECT count(*) FROM drizzle.__drizzle_migrations;
-- → 53 (était 49 avant)
```

## URLs / contacts d'urgence

| Service | URL |
|---|---|
| Supabase Studio prod | `https://supabase.com/dashboard/project/<prod-ref>` |
| Vercel prod | `https://vercel.com/teissiers-projects/edifio-sourcing` |
| Status check | `https://sourcing.alyosingenierie.fr/api/admin/crons` |

### Contacts
- **CTO edifio** : `sebastien@edifio.fr`
- **CTO Cowork** (escalade) : Sophie
- **Support Supabase** : dashboard ticket

## Timing récap

| Phase | Durée | Cumul |
|---|---|---|
| 0 — Pré-bascule | 5 min | 5 min |
| 1 — Backup prod | 10 min | 15 min |
| 2 — Preview | 15 min | 30 min |
| 3 — Smoke preview | 30 min | 1h00 |
| 4 — Apply prod | 10 min | 1h10 |
| 5 — Smoke prod | 15 min | 1h25 |
| 6 — Cron R12 | 5 min | 1h30 |
| 7 — Communication | 10 min | **1h40** |

## ⚠️ Règles d'or

1. **Backup AVANT toute opération destructive**
2. **Preview AVANT prod**
3. **Smoke entre chaque étape**
4. **STOP au moindre doute**
5. **Rollback documenté toujours à côté**

---

**Bon courage Steve.** 🛡️
