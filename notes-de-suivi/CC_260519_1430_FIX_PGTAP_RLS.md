# Fix pgTAP RLS — rôle non-superuser + collision seed BOAMP

**Date** : 2026-05-19 14:30
**Auteur** : Alex (DEV)
**Branche** : `feat/sourcing-mvp`
**Contexte** : PR #14 OPEN — 2 jobs `ci-db-rls` rouges, tous les autres CI verts (lint, typecheck, test, build, e2e, middleware, Vercel preview).
**Référence amont** : `DECISIONS.md` 2026-05-18 (étape 5/6 seed + workflow étendu) + `specs/module_sourcing_engine_v1.md`.

---

## Bugs identifiés

- **Bug A — collision seed dans `02_tenant_isolation.sql`** : le seed dev/CI (`pnpm db:seed`) tourne avant pgTAP et insère déjà `platforms(code='boamp', ...)`. Le test re-faisait `INSERT ... ('boamp', ...)` → violation `UNIQUE platforms_code_unique` → exit 3 pgTAP → « Bad plan: 9 planned 0 ran ».
- **Bug B — superuser bypass RLS dans `02_tenant_isolation.sql` et `03_insert_by_member.sql`** : `pg_prove` connecte en `postgres` (superuser). En PG 15, le superuser bypass RLS *inconditionnellement* — `FORCE ROW LEVEL SECURITY` n'affecte QUE le table-owner, pas les superusers (by-design). Conséquence sur le test 03 : (a) test 3 (viewer INSERT) — RLS ignorée donc INSERT réussit → `throws_ok 42501` reçoit `no exception` → FAIL ; (b) test 4 (admin OrgA INSERT pour OrgB) — RLS ignorée donc la FK fire en premier → reçoit `23503` au lieu de `42501` → FAIL. Sur le test 02, une fois Bug A corrigé, les 6 assertions cross-tenant verraient toutes les lignes des deux orgs.

## Fixes appliqués

- `.github/workflows/db-rls.yml` — nouvelle étape `Create non-superuser role for RLS assertions`, posée entre `Run migrations` et `Seed dev/CI dataset`. Crée le rôle applicatif `test_authenticated` (NOINHERIT NOLOGIN, sans BYPASSRLS) avec `GRANT SELECT,INSERT,UPDATE,DELETE` sur le schéma `public` + `ALTER DEFAULT PRIVILEGES` comme filet de sécurité pour les migrations futures.
- `tests/rls/02_tenant_isolation.sql` — (a) `code='boamp'` → `code='boamp_test'` ligne 73 + `name='tender_score_full'` → `'tender_score_full_test'` ligne 78 (idempotence + isolation seed) ; (b) ajout `SET LOCAL ROLE test_authenticated;` juste avant `SET LOCAL row_security = on;` pour la phase d'assertion. Le setup reste en `postgres` (bypass RLS volontaire pour les fixtures).
- `tests/rls/03_insert_by_member.sql` — ajout `SET LOCAL ROLE test_authenticated;` après `SET LOCAL row_security = on;` (ligne 34) et avant les `set_config('request.jwt.claims', ...)`.

## État du dry-run

**Non lancé** par Alex. Consigne explicite du Board (étape 4 du plan) : `ps_operator` (Yann) doit lancer `pnpm db:dry-run` (alias `scripts/db-dry-run.ps1`) avant le commit. Le script couvre migrations + seed + pgTAP (si pg_prove dispo sur host) — couverture complète des trois fixes. Si pg_prove absent côté host, le script skippe pgTAP avec un WARN et valide quand même que les migrations + seed sont sans régression.

## Bugs latents repérés mais non corrigés (scope creep)

Aucun à signaler — la revue se limite aux 3 fichiers concernés et au workflow.

## Prêt pour `ps_operator`

3 fichiers modifiés, non stagés, working tree par ailleurs propre. Commit suggéré : `fix(tests): role non-superuser pour pgTAP RLS + collision seed BOAMP`.
