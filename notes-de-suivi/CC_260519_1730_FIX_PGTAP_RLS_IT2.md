# CC 2026-05-19 17h30 — Fix pgTAP RLS itération 2 (PR #14)

## Contexte

Commit précédent `e7c7d5b` (itération 1) a partiellement débloqué la CI `ci-db-rls` :
- Test 04 audit immutable : OK
- Test 04 cross-tenant admin OrgA → OrgB : OK (le `SET LOCAL ROLE test_authenticated` a réglé le bypass superuser PG 15)

Mais 2 nouveaux bugs sont sortis à l'exécution :

```
tests/rls/02_tenant_isolation.sql -- Failed 9/9 subtests
  ERROR: invalid input value for enum platform_code: "boamp_test"
tests/rls/03_insert_by_member.sql -- Failed 1/4 subtests
  Failed test 3: viewer NE DOIT PAS pouvoir INSERT architects (RLS violation 42501)
```

## Bug C — `platforms.code` est un enum, pas du text

### Diagnostic

- `platform_code` est un enum `(boamp|place|francmarches|mp_info)` (cf. `0001_schema_v1.sql:9`)
- Le seed dev/CI (`src/db/seed/index.ts:528-565`) insère les 4 valeurs enum avec `onConflictDoNothing()`
- Conséquences : pas de valeur enum custom possible (`'boamp_test'` rejeté) ET pas de re-insertion de `'boamp'` (UNIQUE `platforms_code_unique` déjà occupé par le seed)
- Le commit `e7c7d5b` (itération 1) avait choisi `'boamp_test'` pour éviter la collision UNIQUE sans réaliser que c'était un enum → invalide d'office

### Fix

Réutiliser la ligne `'boamp'` du seed via `ON CONFLICT (code) DO NOTHING`, et résoudre l'UUID effectif via une subquery `SELECT id FROM platforms WHERE code = 'boamp'` dans les INSERT tenders (au lieu de l'UUID hard-codé `cccc0000-...`).

Aucun changement de plan pgTAP : on continue à inserer les 2 tenders OrgA / OrgB, mais avec une référence portable vers la ligne BOAMP existante.

## Bug D — Policy `insert_by_member` PERMISSIVE → OR'd avec `tenant_isolation`

### Diagnostic

Postgres applique les policies PERMISSIVE en OR (« au moins une autorise ») et les RESTRICTIVE en AND (« toutes doivent autoriser »).

Sur `architects`, on a deux policies, toutes deux PERMISSIVE par défaut :

| Policy             | Mode       | Type            | Check INSERT                              |
|--------------------|------------|-----------------|-------------------------------------------|
| `tenant_isolation` | PERMISSIVE | FOR ALL         | `org = current_organization_id()`         |
| `insert_by_member` | PERMISSIVE | FOR INSERT      | `org match AND role IN ('admin','user')`  |

Pour un viewer dans OrgA qui tente d'INSERT pour OrgA :
- `tenant_isolation.WITH CHECK` (PG utilise USING comme WITH CHECK quand WITH CHECK est absent) → TRUE
- `insert_by_member.WITH CHECK` → FALSE (role check)
- **OR final = TRUE** → INSERT autorisé → `throws_ok '42501'` échoue (no exception)

Pour le test 4 (admin OrgA → OrgB), `tenant_isolation.WITH CHECK` = FALSE car org mismatch, donc le OR donne FALSE → exception 42501 → ce test passe (et il passait déjà après l'itération 1).

### Fix

Convertir `insert_by_member` en `AS RESTRICTIVE`. Avec RESTRICTIVE, son check est ANDé avec celui des permissives :
- Total INSERT = `tenant_isolation USING` (PERMISSIVE) AND `insert_by_member WITH CHECK` (RESTRICTIVE)
- Soit : `(org match) AND (org match AND role IN ('admin','user'))`
- Simplifié : `org match AND role IN ('admin','user')`

Validation par scénario :
| Test | role   | org src | org cible | Resultat attendu | Resultat policies     |
|------|--------|---------|-----------|------------------|-----------------------|
| 1    | admin  | OrgA    | OrgA      | OK               | TRUE AND TRUE = TRUE  |
| 2    | user   | OrgA    | OrgA      | OK               | TRUE AND TRUE = TRUE  |
| 3    | viewer | OrgA    | OrgA      | 42501            | TRUE AND FALSE = FALSE|
| 4    | admin  | OrgA    | OrgB      | 42501            | FALSE AND FALSE = FALSE|

Tous les scénarios conformes après fix.

### Note CTO Sophie

La spec source de vérité `specs/schema_v1.sql:551` portait **le même bug** — c'est la 3e dérive spec↔runtime de la 1re PR module sourcing engine (déjà : `idx_tenders_deadline` NOW() bug 2026-05-18, FK `users.id → auth.users(id)` 2026-05-19, et ici policies PERMISSIVE non qualifiées).

Action posée dans cette même session : `specs/schema_v1.sql:551` amendé avec `AS RESTRICTIVE` pour aligner la spec sur le code livré. Pas d'action de relance CTO requise — l'alignement est déjà committé en bundle avec le fix code.

## Fichiers modifiés

5 fichiers, edits posés non stagés :

1. `tests/rls/02_tenant_isolation.sql` — collision enum (Bug C)
2. `src/db/migrations/0002_rls.sql` — policy `AS RESTRICTIVE` (Bug D)
3. `specs/schema_v1.sql` — alignement spec source de vérité (Bug D)
4. `DECISIONS.md` — entrée post-mortem 6e dérive
5. `notes-de-suivi/CC_260519_1730_FIX_PGTAP_RLS_IT2.md` — ce document

## Statut dry-run

Le dry-run local (`pnpm db:dry-run`) n'est pas couvert par `dev` côté itération 2 :
- Le poste de travail n'a pas `pg_prove` sur l'host (cf. memory env_pnpm_corepack + scripts/db-dry-run.ps1)
- À exécuter par `ps_operator` Yann avant le push si possible — sinon CI fera foi (itération 2 ciblée, le diff est petit et précisément raisonné)

## Drift Drizzle meta

`src/db/migrations/meta/0002_snapshot.json` ne modélise PAS les policies RLS (Drizzle n'en a pas la primitive — conforme ADR-013 « RLS via SQL natif hors ORM »). Le grep `RESTRICTIVE|insert_by_member` sur le snapshot retourne uniquement des refs à des FK / index `architects_*`, pas de policy. Aucun drift à craindre. Pas de `drizzle-kit generate` requis.

## Message de commit suggéré (pour Yann)

```
fix(rls): policy insert_by_member en RESTRICTIVE + collision enum platforms.code

Itération 2 du fix pgTAP RLS (PR #14, post commit e7c7d5b).

Bug C : tests/rls/02 -- code='boamp_test' rejete (platforms.code est un enum,
pas du text). Le seed dev/CI occupe deja les 4 valeurs enum (boamp, place,
francmarches, mp_info). Fix : reutiliser la ligne 'boamp' du seed via
ON CONFLICT DO NOTHING + SELECT subquery pour platform_id dans les INSERT
tenders.

Bug D : policy insert_by_member etait PERMISSIVE par defaut, donc OR'd avec
tenant_isolation (egalement PERMISSIVE FOR ALL). Un viewer dans son org passait
par tenant_isolation (org match) malgre le role check. Fix : AS RESTRICTIVE
pour AND'er au lieu d'OR'er. Validation des 4 scenarios test 03 : admin OK,
user OK, viewer 42501, admin cross-tenant 42501. Spec specs/schema_v1.sql:551
alignee en bundle (3e derive spec/runtime de la 1re PR module sourcing).

Pas de drizzle-kit generate (Drizzle ne modelise pas les policies RLS,
conforme ADR-013).

Refs PR #14, DECISIONS.md 2026-05-19.
```

## Prochaine étape

1. `ps_operator` Yann : `pnpm db:dry-run` si possible + `git add` des 5 fichiers + commit avec le message ci-dessus + push.
2. Attendre vert CI sur le commit poussé. Les 4 jobs attendus PASS : `01_force_rls.sql`, `02_tenant_isolation.sql` (9/9), `03_insert_by_member.sql` (4/4), `04_audit_immutable.sql`.
3. Si vert : PR #14 prête pour review CTO Sophie + merge dans `feat/sourcing-mvp`. Si rouge : on rouvre itération 3 avec les logs.

— Alex (sub-agent dev)
