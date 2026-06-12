# Phase 2 — Application migrations 0129-0131 sur Supabase prod partagée

> **Auteur** : `ps_operator` (Yann) — `2026-06-12` (mission flash bascule)
> **Cible** : BDD Supabase prod **monorepo partagée** (projet `<MONOREPO-REF>`,
> region eu-west-3 Paris).
> **Opérateur runtime** : **Sébastien** (lead migration Suivi+ACT, convention
> Q8 visio 10/06 : applications manuelles, jamais sub-agent, jamais workflow CI).
> **Statut au 12/06 21h** : migrations **mergées dans le repo monorepo** (PR #1,
> SHA `720bf5c`), **PAS encore appliquées en prod**. Plan : application dim 14/06
> 8h30-8h45 (étape 3 du runbook), avant la transposition (étape 4).

---

## Contexte

Trois fichiers SQL sont à exécuter **dans l'ordre strict** sur la BDD Supabase
partagée du monorepo (projet Paris eu-west-3) :

| # | Fichier (chemin monorepo) | Rôle | Taille critique |
|---|---|---|---|
| 1 | `app/db/migrations/0129_sourcing_schema.sql` | DDL : schéma `sourcing` + 50 tables + enums + indexes | ~22 tables FK chaînées |
| 2 | `app/db/migrations/0130_sourcing_rls.sql` | RLS FORCE + 77 policies + helpers + 3 fonctions cotraitant SECURITY DEFINER | dépend de 0129 |
| 3 | `app/db/migrations/0131_sourcing_seed_platforms.sql` | Seed référentiel `sourcing.platforms` (BOAMP + PLACE + francmarches + mp_info + ...) | dépend de 0129 |

Toutes les trois sont **idempotentes au commit** (entrée dans
`drizzle.__drizzle_migrations` avec hash). En cas de réexécution → le journal
les saute, pas de double-application.

---

## Pré-conditions stricte (Sébastien dans SA session)

1. **Localisation** : se mettre dans `C:\Dev\alyos-suivi-chantier` côté
   Sébastien (pas dans `edifio-sourcing` — les fichiers SQL n'y sont pas).
2. **Connexion réseau** : pooler Frankfurt ne convient PAS (BDD = Paris).
   Utiliser le pooler eu-west-3 : `aws-0-eu-west-3.pooler.supabase.com:5432`.
3. **Variables PG\*** posées dans la session courante uniquement, jamais
   committées, jamais affichées en chat (cf. memory
   `feedback_ops_prod_user_runs_migration` + `followup_post_mvp_security_rotations`) :

   ```powershell
   $env:PGHOST     = "aws-0-eu-west-3.pooler.supabase.com"
   $env:PGPORT     = "5432"
   $env:PGUSER     = "postgres.<MONOREPO-REF>"   # ref Supabase Paris, 1Password
   $env:PGDATABASE = "postgres"
   $env:PGPASSWORD = "<monorepo prod — 1Password — URI-safe>"
   ```

   **Rappel password** : URI-safe-only (cf. memory
   `followup_post_mvp_security_rotations` — incident 2026-05-21). Pas de `:`,
   pas de `@`, pas de `/`, pas de `?` dans le password.

4. **Sanity check** avant la 1re commande (read-only) :

   ```bash
   psql "host=$env:PGHOST port=$env:PGPORT user=$env:PGUSER dbname=$env:PGDATABASE" \
     --set=ON_ERROR_STOP=1 \
     -c "SELECT current_database(), current_user, version();"
   ```

   **Critère** : retourne la base `postgres` et l'utilisateur
   `postgres.<MONOREPO-REF>` + version PG 17. Si `current_user` ressort
   `postgres.loogmtltwkhvczdiurqs` → c'est la BDD Sourcing standalone, **STOP
   immédiat**. La cible est la BDD du monorepo, pas celle de Sourcing.

---

## Les 3 commandes exactes (ordre strict, attente entre chaque)

### Commande 1 : 0129 — schéma sourcing (DDL)

```bash
psql "host=$env:PGHOST port=$env:PGPORT user=$env:PGUSER dbname=$env:PGDATABASE" \
  --set=ON_ERROR_STOP=1 \
  -f app/db/migrations/0129_sourcing_schema.sql \
  2>&1 | tee logs/bascule-3-0129-schema.log
```

**Attente avant commande 2** : que `psql` rende la main (sortie complète +
fin de log). Aucun sleep. La commande est synchrone, elle bloque jusqu'à
`COMMIT` ou erreur.

**Critère de succès — bloc à coller dans SQL Editor Supabase (mono-bloc,
cf. memory `env_docker_inaccessible_tools`)** :

```sql
DO $$
DECLARE n_tables int; n_enums int;
BEGIN
  SELECT count(*) INTO n_tables
    FROM information_schema.tables WHERE table_schema = 'sourcing';
  IF n_tables < 22 THEN
    RAISE EXCEPTION 'KO 0129: % tables sourcing.* (attendu >= 22, banc dry-run = 50)', n_tables;
  END IF;

  SELECT count(*) INTO n_enums
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'sourcing' AND t.typtype = 'e';
  IF n_enums < 3 THEN
    RAISE EXCEPTION 'KO 0129: % enums sourcing.* (attendu >= 3)', n_enums;
  END IF;

  RAISE NOTICE 'OK 0129: % tables, % enums', n_tables, n_enums;
END $$;
```

**Pass** = `NOTICE OK 0129: 50 tables, N enums` (50 attendu vu le banc
`pg-monorepo-dryrun` qui a passé 14/14 assertions).
**Fail** = `EXCEPTION` → STOP, ne pas lancer 0130.

---

### Commande 2 : 0130 — RLS + 77 policies + helpers

```bash
psql "host=$env:PGHOST port=$env:PGPORT user=$env:PGUSER dbname=$env:PGDATABASE" \
  --set=ON_ERROR_STOP=1 \
  -f app/db/migrations/0130_sourcing_rls.sql \
  2>&1 | tee logs/bascule-3-0130-rls.log
```

**Attente avant commande 3** : idem, fin de log + retour prompt.

**Critère de succès — bloc SQL Editor** :

```sql
DO $$
DECLARE n_policies int; n_helpers int; n_force int;
BEGIN
  -- 77 policies attendues (cf. dry-run banc 11/06, note CC_260611_RECETTE_DRYRUN_J2)
  SELECT count(*) INTO n_policies
    FROM pg_policies WHERE schemaname = 'sourcing';
  IF n_policies < 70 THEN
    RAISE EXCEPTION 'KO 0130: % policies sourcing.* (attendu >= 70, banc = 77)', n_policies;
  END IF;

  -- 50 tables - 4 referentiels - 2 enable-only = 44 tables FORCE strict
  SELECT count(*) INTO n_force
    FROM pg_class t JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'sourcing' AND t.relkind = 'r'
      AND t.relrowsecurity AND t.relforcerowsecurity;
  IF n_force < 40 THEN
    RAISE EXCEPTION 'KO 0130: % tables FORCE strict (attendu >= 40, banc = 44)', n_force;
  END IF;

  -- Helper RLS pivot
  IF to_regprocedure('public.current_user_has_sourcing()') IS NULL THEN
    RAISE EXCEPTION 'KO 0130: helper current_user_has_sourcing absent';
  END IF;

  -- 3 fonctions cotraitant SECURITY DEFINER (A11 du banc)
  SELECT count(*) INTO n_helpers
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'sourcing' AND p.prosecdef = true
      AND p.proname LIKE '%cotraitant%';
  IF n_helpers < 3 THEN
    RAISE EXCEPTION 'KO 0130: % fonctions cotraitant SECURITY DEFINER (attendu >= 3)', n_helpers;
  END IF;

  RAISE NOTICE 'OK 0130: % policies, % tables FORCE, % cotraitant defs', n_policies, n_force, n_helpers;
END $$;
```

**Pass** = `NOTICE OK 0130: 77 policies, 44 tables FORCE, 3 cotraitant defs`.
**Fail** = `EXCEPTION` → STOP, ne pas lancer 0131. La 0131 ne dépend pas
strictement de 0130 (juste de 0129) mais le critère « les 3 migrations sont
en prod » exige les 3.

---

### Commande 3 : 0131 — seed platforms

```bash
psql "host=$env:PGHOST port=$env:PGPORT user=$env:PGUSER dbname=$env:PGDATABASE" \
  --set=ON_ERROR_STOP=1 \
  -f app/db/migrations/0131_sourcing_seed_platforms.sql \
  2>&1 | tee logs/bascule-3-0131-seed.log
```

**Critère de succès — bloc SQL Editor** :

```sql
DO $$
DECLARE n_platforms int;
BEGIN
  SELECT count(*) INTO n_platforms FROM sourcing.platforms WHERE is_active = true;
  IF n_platforms < 4 THEN
    RAISE EXCEPTION 'KO 0131: % platforms actives (attendu >= 4 : BOAMP + PLACE + francmarches + mp_info)', n_platforms;
  END IF;
  RAISE NOTICE 'OK 0131: % platforms actives', n_platforms;
END $$;
```

**Pass** = `NOTICE OK 0131: 4 platforms actives` (ou plus si seed étendu).

---

## Critère global PASS (à coller après les 3)

```sql
DO $$
DECLARE n_drizzle int;
BEGIN
  SELECT count(*) INTO n_drizzle
    FROM drizzle.__drizzle_migrations
   WHERE hash LIKE '%0129%' OR hash LIKE '%0130%' OR hash LIKE '%0131%';
  IF n_drizzle < 3 THEN
    RAISE EXCEPTION 'KO global: % migrations 0129-0131 dans __drizzle_migrations (attendu 3)', n_drizzle;
  END IF;
  RAISE NOTICE 'OK global: 3 migrations sourcing tracées dans drizzle.__drizzle_migrations';
END $$;
```

**Pass** = `NOTICE OK global: 3 migrations sourcing tracées`.

---

## PostgREST — exposer le schéma `sourcing`

**Action manuelle dashboard Supabase monorepo** (cf. pre-flight §2.3) :

```
Dashboard Supabase monorepo
→ Settings → API
→ Exposed schemas (champ libre)
→ S'assurer que la liste contient : public, sourcing
→ Save
```

Sans ça, les routes Next.js qui font `supabase.schema('sourcing').from(...)`
retournent 404 PostgREST.

---

## Si ça casse en cours de route

| Symptôme | Cause probable | Action |
|---|---|---|
| `ERROR: schema "sourcing" already exists` sur 0129 | Migration déjà appliquée partiellement | Vérifier `drizzle.__drizzle_migrations` ; si hash 0129 présent, c'est OK, lancer 0130. |
| `ERROR: relation "sourcing.search_profiles" does not exist` sur 0130 | 0129 a fail silencieux | Relancer 0129 et lire les logs. |
| `ERROR: duplicate key value violates unique constraint` sur 0131 | Seed déjà appliqué | OK si `__drizzle_migrations` contient le hash 0131. Sinon investiguer. |
| Connexion refusée / timeout | Pooler eu-west-3 indisponible OU mauvais host | Vérifier la sanity check pré-conditions. |
| `must_change_password` ou rôle inattendu | Mauvais `PGUSER` (probable BDD Sourcing au lieu de monorepo) | STOP. Resorter PGUSER. |

**Rollback** : les 3 migrations sont packagées en DDL pure. Pas de rollback
trivial — la stratégie est R2 du runbook `ROLLBACK_BASCULE_140626.md` : on
laisse les objets en place côté BDD monorepo (ils sont isolés dans le schéma
`sourcing.*`), on rollback uniquement le DNS (`03-rollback-dns.ps1`). Les
tables sourcing.* restent dormantes sans impact sur Suivi/ACT.

---

## Quand lancer ces commandes

D'après le runbook `RUNBOOK_BASCULE_MONOREPO_140626.md` (v1.1) §3 :
- **Fenêtre canon** : dim 14/06 entre **8h30 et 8h45**.
- **Pré-requis** : étape 2 du runbook terminée (export Sourcing prod + backup
  Docker `backups\sourcing-prod-2026-06-14-*.dump` > 5 MB).
- **Bloque** : étape 4 (transposition `04-load-data.ps1`) — la transposition
  écrit `INSERT INTO sourcing.tenders` etc., ces tables doivent exister.

**Pas avant samedi soir** sauf décision Board explicite. Le gel migrations
Sourcing depuis le 10/06 (A4 visio) ne s'applique PAS à ces 3 fichiers
(ils sont côté monorepo et ont leur propre PR de portage déjà mergée).

---

## Trace post-exécution attendue

À l'issue, Sébastien fait :

1. Capture des 3 critères PASS (les 3 `NOTICE OK 012x: ...`) collés dans
   `logs/bascule-3-0129-schema.log` etc., puis pushés par Yann avec une
   note de suivi `CC_260614_PHASE3_MIGRATIONS_APPLIED.md`.
2. Mise à jour de la case `§2.2` du pre-flight (cocher) **après** le PASS.
3. Mise à jour `DECISIONS.md` : entrée 2026-06-14 « migrations 0129-0131
   appliquées prod monorepo par Sébastien à HH:MM, 4/4 critères PASS ».

---

## Sécurité — rappels

- **Steve ou Sébastien lance la commande**, jamais Yann (cf. memory
  `feedback_ops_prod_user_runs_migration`).
- **PGPASSWORD jamais en log** : `psql` ne le print pas, mais ne pas
  `Write-Host $env:PGPASSWORD` par mégarde.
- **Logs `bascule-3-*.log`** : à NE PAS committer (ils sont déjà ignorés
  par `.gitignore` racine via le pattern `logs/`). Conservation locale
  pour le post-mortem semaine du 16/06.
- **Si une commande déraille** : NE PAS retenter en boucle. Sortir,
  re-lire le log, et basculer en R2 si nécessaire.

---

**Fin du mémo phase 2 — prêt à imprimer pour la fenêtre dim 8h30-8h45.**
