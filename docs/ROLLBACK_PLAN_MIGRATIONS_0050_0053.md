# Plan de rollback — migrations 0050 à 0053

> **Public** : Steve (Yann en backup) en cas de pépin lors de l'apply prod.
> **Tonalité** : opérationnel, SQL copier-coller, zéro fioritures.
> **Auteur** : Alex (`dev`) — 2026-06-09.
> **Branche source** : `docs/rollback-plan-migrations` (base `main` @ `72ae4c2`).
> **Validation** : tous les blocs SQL `BEGIN; ... COMMIT;` des sections 3 à 6 ont
> été joués sur `postgres:15-alpine` en Docker local (séquence
> `apply 0050→0051→0052→0053` puis `rollback 0053→0052→0051→0050`) avec
> `ON_ERROR_STOP=1`. Zéro erreur. Les assertions d'état post-rollback
> (`pg_class.relrowsecurity`, `pg_policy.polname`, `pg_proc.proname`,
> `information_schema.columns`) ramènent les valeurs attendues.

---

## Sommaire

1. [Principes généraux](#1-principes-généraux)
2. [Identifier la ligne `drizzle.__drizzle_migrations` à supprimer](#2-identifier-la-ligne-drizzle__drizzle_migrations-à-supprimer)
3. [Rollback migration 0050 (`learning_payload`)](#3-rollback-migration-0050--learning_payload)
4. [Rollback migration 0051 (`rls_fix_companies_cotraitant_shares_be`)](#4-rollback-migration-0051--rls-fix-3-tables)
5. [Rollback migration 0052 (`rls_lot17_bis_force_helper_naming`)](#5-rollback-migration-0052--force--helper--naming)
6. [Rollback migration 0053 (`eradicate_cotraitant_public_policy`)](#6-rollback-migration-0053--éradication-bombe-cotraitant)
7. [Arbre de décision : rollback ou pas ?](#7-arbre-de-décision--rollback-ou-pas-)
8. [Plan B — restore `pg_dump`](#8-plan-b--restore-pg_dump)
9. [Tests de rollback en preview AVANT prod](#9-tests-de-rollback-en-preview-avant-prod)
10. [Communication pendant un rollback](#10-communication-pendant-un-rollback)
11. [Tableau récapitulatif des impacts](#11-tableau-récapitulatif-des-impacts)

---

## 1. Principes généraux

### 1.1 Toujours `pg_dump` AVANT toute opération destructive

Le dump de référence est produit par
[`scripts/migration/backup-sourcing-db.ps1`](../scripts/migration/backup-sourcing-db.ps1)
en utilisant la **Direct connection** (port 5432, jamais le pooler 6543 — incident
migrations 0007-0008 documenté).

```powershell
# Steve, dans SA session PowerShell (NE PAS partager le PGPASSWORD)
$env:PGHOST     = "db.<sourcing-project-ref>.supabase.co"
$env:PGPORT     = "5432"
$env:PGUSER     = "postgres"
$env:PGDATABASE = "postgres"
$env:PGPASSWORD = "<password depuis 1Password>"

# Dump complet
.\scripts\migration\backup-sourcing-db.ps1

# Sortie : backups/sourcing-prod-YYYY-MM-DD-HHmm.dump
```

**Règle d'or** : aucun rollback ne démarre sans un dump frais (< 5 min) confirmé sur disque.

### 1.2 Tester le rollback en preview AVANT prod

Le projet Supabase **sourcing-preview** (Frankfurt) est un miroir staging. Cf. section [§9](#9-tests-de-rollback-en-preview-avant-prod).

### 1.3 Canal de notification

- Slack `#alyos-ing-tech` : annoncer le début + la fin du rollback (Steve)
- Mail aux admins multi-tenant onboardés PROTECT si downtime > 5 min
- Steve garde un terminal ouvert avec la session PG prod jusqu'à la fin

### 1.4 Les 3 paliers de rollback

| Palier | Quand l'utiliser | Coût | Risque |
|---|---|---|---|
| **1. DDL inverse** (sections 3 à 6) | Migration a appliqué proprement mais smoke test KO | 30 s à 2 min | Quasi nul si la table n'a pas été écrite entre l'apply et le rollback |
| **2. Restore partiel** (`pg_restore --table=...`) | Une table précise a perdu des données | 5-10 min | Faible mais nécessite arrêt des écritures applicatives |
| **3. Restore complet pg_dump** (section 8 — option nucléaire) | Échec massif, corruption | 15-30 min de downtime + perte des écritures depuis le dump | Le plus sûr mais le plus coûteux |

Toujours commencer par le palier 1. Ne monter au palier 2 ou 3 que si le palier précédent échoue.

---

## 2. Identifier la ligne `drizzle.__drizzle_migrations` à supprimer

Drizzle stocke chaque migration appliquée dans `drizzle.__drizzle_migrations` avec
les colonnes `id` (serial), `hash` (SHA du contenu SQL), `created_at` (timestamp).
Pour rollback proprement, il faut **supprimer cette ligne** sinon `drizzle-kit migrate`
considère la migration toujours appliquée et ne la rejouera jamais.

**Trouver le hash avant DELETE** (à faire UNE fois, en début de rollback) :

```sql
-- Lister les 6 dernières migrations appliquées avec leur tag
SELECT id, hash, created_at,
       to_timestamp(created_at / 1000)::timestamptz AS applied_at
  FROM drizzle.__drizzle_migrations
  ORDER BY id DESC
  LIMIT 6;
```

Identifier la ligne par `applied_at` (l'horaire de l'apply prod, connu de Steve).
Noter le `id` exact dans un post-it terminal. Ensuite :

```sql
-- DELETE par id (le plus sûr — pas d'ambiguïté sur le hash)
DELETE FROM drizzle.__drizzle_migrations WHERE id = <ID_NOTÉ>;
```

> Note : dans les sections 3 à 6, les blocs SQL utilisent un placeholder
> `<MIGRATION_ID>` qu'il faut remplacer par l'id récupéré ci-dessus pour la
> migration concernée.

---

## 3. Rollback migration 0050 — `learning_payload`

### Ce que la migration fait

- `ALTER TABLE learning_events ADD COLUMN payload jsonb`
- `ALTER TABLE learning_events ADD COLUMN reason_code text`
- `ALTER TABLE learning_events ADD COLUMN applied_at timestamptz`
- `ALTER TABLE learning_events ADD COLUMN dismissed_at timestamptz`
- `CREATE INDEX idx_learning_events_org_reason ON learning_events (organization_id, reason_code, occurred_at DESC) WHERE reason_code IS NOT NULL`

Tout est additif et idempotent (`IF NOT EXISTS`).

### Pré-rollback : mesurer la perte de données

```sql
-- Combien de rows ont déjà été écrits AVEC les nouvelles colonnes ?
SELECT
  COUNT(*) AS total,
  COUNT(payload)      AS with_payload,
  COUNT(reason_code)  AS with_reason_code,
  COUNT(applied_at)   AS with_applied_at,
  COUNT(dismissed_at) AS with_dismissed_at
  FROM learning_events;
```

Si `with_payload > 0` ou `with_reason_code > 0`, le rollback **perd ces colonnes**
(donc ces données). Décision Steve : accepter la perte ou Plan B (section 8).

### SQL de rollback

```sql
-- 0050 rollback
BEGIN;

  DROP INDEX IF EXISTS idx_learning_events_org_reason;

  ALTER TABLE learning_events DROP COLUMN IF EXISTS dismissed_at;
  ALTER TABLE learning_events DROP COLUMN IF EXISTS applied_at;
  ALTER TABLE learning_events DROP COLUMN IF EXISTS reason_code;
  ALTER TABLE learning_events DROP COLUMN IF EXISTS payload;

  DELETE FROM drizzle.__drizzle_migrations WHERE id = <MIGRATION_ID_0050>;

  -- Vérification AVANT COMMIT
  SELECT column_name FROM information_schema.columns
    WHERE table_name = 'learning_events'
      AND column_name IN ('payload', 'reason_code', 'applied_at', 'dismissed_at');
  -- Attendu : 0 rows

COMMIT;
```

### Impact applicatif

- `src/app/api/sourcing/learning/*` lèvera 500 sur les routes qui écrivent `payload` /
  `reason_code` (Salve U). Désactiver la feature flag côté code ou revert le commit
  applicatif AVANT le rollback BDD.
- La page « écarter avec motif » du sourcing tombera en erreur (composant attend les colonnes).

### Quand ce rollback est SÛR

- Migration appliquée < 1 h, peu/pas d'utilisation Salve U
- Aucun event critique avec `reason_code` non null en BDD

### Quand préférer un fix forward

- Si Salve U est en service réel depuis plus de 24 h, **ne pas rollback** — fix le code et patch via migration 0054.

---

## 4. Rollback migration 0051 — RLS fix 3 tables

### Ce que la migration fait

- `ENABLE ROW LEVEL SECURITY` sur `companies`, `bureaux_etudes`, `cotraitant_shares`, `cotraitant_share_items`
- Policies créées :
  - `tenant_isolation` sur 4 tables
  - `public_token_read` sur `cotraitant_shares` + `cotraitant_share_items`
  - `public_token_update_signed` sur `cotraitant_share_items`
  - `admin_write` RESTRICTIVE sur `companies` + `bureaux_etudes`
  - `admin_update` RESTRICTIVE sur `companies` + `bureaux_etudes`
- Triggers `touch_companies` + `touch_bureaux_etudes` (updated_at)

### SQL de rollback

```sql
-- 0051 rollback
BEGIN;

  -- 1. DROP triggers
  DROP TRIGGER IF EXISTS touch_companies      ON companies;
  DROP TRIGGER IF EXISTS touch_bureaux_etudes ON bureaux_etudes;

  -- 2. DROP policies (toutes — IF EXISTS = idempotent)
  DROP POLICY IF EXISTS tenant_isolation           ON companies;
  DROP POLICY IF EXISTS admin_write                ON companies;
  DROP POLICY IF EXISTS admin_update               ON companies;

  DROP POLICY IF EXISTS tenant_isolation           ON bureaux_etudes;
  DROP POLICY IF EXISTS admin_write                ON bureaux_etudes;
  DROP POLICY IF EXISTS admin_update               ON bureaux_etudes;

  DROP POLICY IF EXISTS tenant_isolation           ON cotraitant_shares;
  DROP POLICY IF EXISTS public_token_read          ON cotraitant_shares;

  DROP POLICY IF EXISTS tenant_isolation           ON cotraitant_share_items;
  DROP POLICY IF EXISTS public_token_read          ON cotraitant_share_items;
  DROP POLICY IF EXISTS public_token_update_signed ON cotraitant_share_items;

  -- 3. DISABLE RLS
  ALTER TABLE companies              DISABLE ROW LEVEL SECURITY;
  ALTER TABLE bureaux_etudes         DISABLE ROW LEVEL SECURITY;
  ALTER TABLE cotraitant_shares      DISABLE ROW LEVEL SECURITY;
  ALTER TABLE cotraitant_share_items DISABLE ROW LEVEL SECURITY;

  -- 4. DELETE de la trace migration
  DELETE FROM drizzle.__drizzle_migrations WHERE id = <MIGRATION_ID_0051>;

  -- Vérification AVANT COMMIT
  SELECT relname, relrowsecurity
    FROM pg_class
    WHERE relname IN ('companies', 'bureaux_etudes',
                      'cotraitant_shares', 'cotraitant_share_items');
  -- Attendu : relrowsecurity = false partout

COMMIT;
```

### Impact

On revient à l'état **pré-Lot 1.7** : les 3 tables (`companies`, `bureaux_etudes`,
`cotraitant_shares`) repassent sans RLS. **Dette sécurité réintroduite** (audit Hugo
PR #121 reflag immédiatement).

- En sourcing actuel : aucun impact runtime (rôle `postgres` BYPASSRLS de toute façon)
- Pour la bascule multi-tenant PROTECT du 18/07 : **bloquant** — repousser la bascule ou refaire la PR

### Dépendances

⚠️ Rollback 0051 **invalide automatiquement** 0052 et 0053 (qui ALTER les policies créées
par 0051). Si 0052 et/ou 0053 ont déjà été appliquées, rollback dans l'ordre **0053 → 0052 → 0051**.

---

## 5. Rollback migration 0052 — FORCE + helper + naming

### Ce que la migration fait

1. Crée la function `public.current_user_org_id()` SECURITY DEFINER
2. `FORCE ROW LEVEL SECURITY` sur les 4 tables
3. DROP des policies Lot 1.7 (`tenant_isolation`, `admin_*`, `public_token_*`)
4. Crée 12+ policies en naming `<table>_<action>` :
   - `companies_select`, `companies_insert`, `companies_update`, `companies_delete`
   - `bureaux_etudes_select`, `bureaux_etudes_insert`, `bureaux_etudes_update`, `bureaux_etudes_delete`
   - `cotraitant_shares_select`, `cotraitant_shares_select_public`, `cotraitant_shares_insert`, `cotraitant_shares_update`, `cotraitant_shares_delete`
   - `cotraitant_share_items_select`, `cotraitant_share_items_select_public`, `cotraitant_share_items_update_signed`

### SQL de rollback (cible : état Lot 1.7 = post-0051)

```sql
-- 0052 rollback (suppose que 0051 doit RESTER appliquée)
BEGIN;

  -- 1. Annuler FORCE
  ALTER TABLE companies              NO FORCE ROW LEVEL SECURITY;
  ALTER TABLE bureaux_etudes         NO FORCE ROW LEVEL SECURITY;
  ALTER TABLE cotraitant_shares      NO FORCE ROW LEVEL SECURITY;
  ALTER TABLE cotraitant_share_items NO FORCE ROW LEVEL SECURITY;

  -- 2. DROP des policies 0052 (naming <table>_<action>)
  DROP POLICY IF EXISTS companies_select                   ON companies;
  DROP POLICY IF EXISTS companies_insert                   ON companies;
  DROP POLICY IF EXISTS companies_update                   ON companies;
  DROP POLICY IF EXISTS companies_delete                   ON companies;

  DROP POLICY IF EXISTS bureaux_etudes_select              ON bureaux_etudes;
  DROP POLICY IF EXISTS bureaux_etudes_insert              ON bureaux_etudes;
  DROP POLICY IF EXISTS bureaux_etudes_update              ON bureaux_etudes;
  DROP POLICY IF EXISTS bureaux_etudes_delete              ON bureaux_etudes;

  DROP POLICY IF EXISTS cotraitant_shares_select           ON cotraitant_shares;
  DROP POLICY IF EXISTS cotraitant_shares_select_public    ON cotraitant_shares;
  DROP POLICY IF EXISTS cotraitant_shares_insert           ON cotraitant_shares;
  DROP POLICY IF EXISTS cotraitant_shares_update           ON cotraitant_shares;
  DROP POLICY IF EXISTS cotraitant_shares_delete           ON cotraitant_shares;

  DROP POLICY IF EXISTS cotraitant_share_items_select        ON cotraitant_share_items;
  DROP POLICY IF EXISTS cotraitant_share_items_select_public ON cotraitant_share_items;
  DROP POLICY IF EXISTS cotraitant_share_items_update_signed ON cotraitant_share_items;

  -- 3. RECRÉER les policies Lot 1.7 (copie quasi conforme de 0051)
  CREATE POLICY tenant_isolation ON companies
    USING (organization_id = current_organization_id());
  CREATE POLICY admin_write ON companies AS RESTRICTIVE
    FOR INSERT WITH CHECK (
      organization_id = current_organization_id()
      AND current_user_role() = 'admin'
    );
  CREATE POLICY admin_update ON companies AS RESTRICTIVE
    FOR UPDATE
    USING (organization_id = current_organization_id() AND current_user_role() = 'admin')
    WITH CHECK (organization_id = current_organization_id() AND current_user_role() = 'admin');

  CREATE POLICY tenant_isolation ON bureaux_etudes
    USING (organization_id = current_organization_id());
  CREATE POLICY admin_write ON bureaux_etudes AS RESTRICTIVE
    FOR INSERT WITH CHECK (
      organization_id = current_organization_id()
      AND current_user_role() = 'admin'
    );
  CREATE POLICY admin_update ON bureaux_etudes AS RESTRICTIVE
    FOR UPDATE
    USING (organization_id = current_organization_id() AND current_user_role() = 'admin')
    WITH CHECK (organization_id = current_organization_id() AND current_user_role() = 'admin');

  CREATE POLICY tenant_isolation ON cotraitant_shares
    USING (organization_id = current_organization_id());
  CREATE POLICY public_token_read ON cotraitant_shares
    FOR SELECT USING (TRUE);

  CREATE POLICY tenant_isolation ON cotraitant_share_items
    USING (EXISTS (
      SELECT 1 FROM cotraitant_shares s
      WHERE s.id = share_id AND s.organization_id = current_organization_id()
    ));
  CREATE POLICY public_token_read ON cotraitant_share_items
    FOR SELECT USING (TRUE);
  CREATE POLICY public_token_update_signed ON cotraitant_share_items
    FOR UPDATE USING (TRUE) WITH CHECK (TRUE);

  -- 4. DROP la helper function (PAS utilisée par les policies 0052, donc safe)
  DROP FUNCTION IF EXISTS public.current_user_org_id();

  -- 5. DELETE de la trace migration
  DELETE FROM drizzle.__drizzle_migrations WHERE id = <MIGRATION_ID_0052>;

  -- Vérification AVANT COMMIT
  SELECT relname, relforcerowsecurity
    FROM pg_class
    WHERE relname IN ('companies', 'bureaux_etudes',
                      'cotraitant_shares', 'cotraitant_share_items');
  -- Attendu : relforcerowsecurity = false partout

  SELECT polname, polrelid::regclass
    FROM pg_policy
    WHERE polrelid::regclass::text IN ('companies', 'bureaux_etudes',
                                       'cotraitant_shares', 'cotraitant_share_items')
    ORDER BY polrelid::regclass::text, polname;
  -- Attendu : tenant_isolation, admin_write, admin_update, public_token_*

COMMIT;
```

### Impact

- État revient à Lot 1.7 (RLS ENABLE mais pas FORCE → service_role bypass à nouveau)
- Le helper `current_user_org_id()` disparaît (Sébastien devra le re-créer côté monorepo si bascule maintenue)
- Aucune régression page (rôle `postgres` BYPASSRLS depuis le début)

### Dépendances

⚠️ **Ne PAS rollback 0052 seule si 0053 est appliquée** : 0053 utilise des functions
qui co-existent avec les policies 0052. Rollback dans l'ordre **0053 → 0052**.

---

## 6. Rollback migration 0053 — éradication bombe cotraitant

### Ce que la migration fait

1. DROP des policies anon publiques (`cotraitant_shares_select_public`,
   `cotraitant_share_items_select_public`, `cotraitant_share_items_update_signed`)
2. Crée 4 functions SECURITY DEFINER :
   - `public.get_cotraitant_share_by_token(uuid)`
   - `public.get_cotraitant_share_items_by_token(uuid)`
   - `public.get_cotraitant_item_original_path(uuid, uuid)`
   - `public.mark_cotraitant_share_item_signed(uuid, uuid, text, text, text)`
3. GRANT EXECUTE TO anon, authenticated

### SQL de rollback

```sql
-- 0053 rollback
BEGIN;

  -- 1. DROP les 4 functions
  DROP FUNCTION IF EXISTS public.get_cotraitant_share_by_token(uuid);
  DROP FUNCTION IF EXISTS public.get_cotraitant_share_items_by_token(uuid);
  DROP FUNCTION IF EXISTS public.get_cotraitant_item_original_path(uuid, uuid);
  DROP FUNCTION IF EXISTS public.mark_cotraitant_share_item_signed(uuid, uuid, text, text, text);

  -- 2. RECRÉER les policies anon publiques (état post-0052)
  CREATE POLICY cotraitant_shares_select_public ON cotraitant_shares
    FOR SELECT
    USING (revoked_at IS NULL AND expires_at > now());

  CREATE POLICY cotraitant_share_items_select_public ON cotraitant_share_items
    FOR SELECT
    USING (EXISTS (
      SELECT 1 FROM cotraitant_shares s
      WHERE s.id = share_id
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
    ));

  CREATE POLICY cotraitant_share_items_update_signed ON cotraitant_share_items
    FOR UPDATE
    USING (EXISTS (
      SELECT 1 FROM cotraitant_shares s
      WHERE s.id = share_id
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
    ))
    WITH CHECK (EXISTS (
      SELECT 1 FROM cotraitant_shares s
      WHERE s.id = share_id
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
    ));

  -- 3. DELETE de la trace migration
  DELETE FROM drizzle.__drizzle_migrations WHERE id = <MIGRATION_ID_0053>;

  -- Vérification AVANT COMMIT
  SELECT polname FROM pg_policy WHERE polrelid = 'cotraitant_shares'::regclass;
  -- Attendu : cotraitant_shares_select, cotraitant_shares_select_public, etc.

  SELECT proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace
    AND proname LIKE '%cotraitant%';
  -- Attendu : 0 rows (les 4 functions sont DROP)

COMMIT;
```

### ATTENTION rollback 0053 seul = dangereux

Rollback 0053 **réintroduit la bombe à retardement** que 0053 visait précisément à
éradiquer. Concrètement :

- Les policies anon `USING (revoked_at IS NULL AND expires_at > now())` reviennent
- Le code `src/app/cotraitant/[token]/page.tsx` doit aussi être revert au commit
  précédant l'appel aux 4 functions (`db.execute(sql\`SELECT * FROM get_...\`)`)
- Sébastien (suivi_act_reviewer) va flag à nouveau au prochain audit

**Recommandation Alex** : si 0053 doit être rollback en urgence, **rollback aussi
0052 et 0051 dans la foulée** pour revenir à un état « pré-Lot 1.7 » cohérent
(= 3 tables sans RLS, état pré-2026-06-08). Procédure :

```sql
-- Rollback complet Lot 1.7-* (à utiliser si fuite anon découverte post-0053)
BEGIN;
  -- Exécuter dans cet ordre :
  -- (a) Bloc rollback 0053 ci-dessus SAUF le COMMIT et le DELETE drizzle
  -- (b) Bloc rollback 0052 ci-dessus SAUF le COMMIT et le DELETE drizzle
  -- (c) Bloc rollback 0051 ci-dessus SAUF le COMMIT
  -- (d) DELETE FROM drizzle.__drizzle_migrations WHERE id IN (
  --       <MIGRATION_ID_0051>, <MIGRATION_ID_0052>, <MIGRATION_ID_0053>
  --     );
COMMIT;
```

Le code applicatif (`/cotraitant/[token]`) doit ÉGALEMENT être revert au tag pré-Lot 1.7
(commit `caeaa81` ou antérieur). Sinon erreurs 500 sur la page publique.

---

## 7. Arbre de décision : rollback ou pas ?

```
                      Migration vient d'être appliquée
                                    |
                  +-----------------+-----------------+
                  |                                   |
       Erreur SQL pendant apply           Apply OK mais smoke test KO
                  |                                   |
       drizzle-kit a déjà rollback           +--------+---------+
       via transaction implicite             |                  |
       → AUCUNE action BDD requise           |                  |
                                  Erreur isolée au code      Régression
                                  applicatif (ex: TS,        en BDD
                                  Server Action)             observable
                                             |                  |
                                  → Fix le code + redeploy   → Rollback DDL
                                    PAS de rollback BDD        inverse
                                                                   (§3-6)
                                                                   |
                                                              Échec rollback DDL
                                                                   |
                                                              → Plan B pg_dump
                                                                (§8)
```

### Cas d'urgence absolue

**Fuite cross-tenant détectée en prod** (ex: alerte audit_logs ou Sentry montre une
ligne ramenée à un mauvais `organization_id`) :

1. **STOP** : `vercel rollback` immédiat vers le dernier déploiement KO (mais sain)
2. Notifier Steve + Hugo + (Sophie si dispo)
3. Rollback BDD complet Lot 1.7-* (cf. §6 « Rollback complet »)
4. Post-mortem avant tout nouveau push BDD

### Cas où on NE rollback PAS

- Migration appliquée depuis > 24 h ET utilisée en production réelle → fix forward via
  migration 0054. Le rollback ferait perdre des données utilisateur.
- Erreur runtime sur code applicatif (ex: page Next.js 500) **et** la BDD est saine →
  fix code + redeploy, surtout pas la BDD.

---

## 8. Plan B — restore `pg_dump`

À utiliser **uniquement** si :

- Le rollback DDL inverse a échoué
- Ou la BDD est dans un état incohérent (mix partiel de migrations)
- Ou perte de données détectée et inacceptable

### 8.1 Préparer

```powershell
# Steve, dans SA session PowerShell
$env:PGHOST     = "db.<sourcing-project-ref>.supabase.co"
$env:PGPORT     = "5432"
$env:PGUSER     = "postgres"
$env:PGDATABASE = "postgres"
$env:PGPASSWORD = "<password depuis 1Password>"

# Vérifier le dump qu'on va restaurer
ls backups/sourcing-prod-*.dump
```

### 8.2 Arrêter les écritures applicatives

- Vercel : passer le déploiement prod en maintenance via le dashboard (Environment
  Variables → `NEXT_PUBLIC_MAINTENANCE_MODE=1` puis redeploy) OU `vercel rollback`
  vers un commit qui sert une bannière maintenance
- Cron sourcing (Edge Functions) : désactiver le schedule depuis Supabase Studio
  → Database → Cron → toggle off (cf. `docs/RUNBOOK_CRON_SOURCING_RUN.md`)

### 8.3 Restore complet

```powershell
# Drop des schémas applicatifs (préserve auth, storage, etc. Supabase)
psql -c "DROP SCHEMA public CASCADE;"
psql -c "DROP SCHEMA drizzle CASCADE;"
psql -c "CREATE SCHEMA public;"

# Restore depuis le dump (format custom pg_restore)
pg_restore --verbose `
           --no-owner `
           --no-acl `
           --schema=public `
           --schema=drizzle `
           --dbname=postgres `
           backups/sourcing-prod-YYYY-MM-DD-HHmm.dump
```

⚠️ **Ne JAMAIS** drop les schémas `auth`, `storage`, `realtime`, `vault`, `extensions`,
`pgsodium` : ce sont les schémas internes Supabase. Le dump custom de
`backup-sourcing-db.ps1` les exclut par défaut, mais le DROP CASCADE pourrait y toucher
si on le lance sur `public` qui a des FK croisées (très rare). En cas de doute, Plan C :
restaurer dans une NOUVELLE base et basculer le DNS Supabase (escalade CTO obligatoire).

### 8.4 Vérifier l'état post-restore

```sql
-- Compter quelques tables clés
SELECT 'tenders'          AS tbl, COUNT(*) FROM tenders
UNION ALL
SELECT 'organizations'    AS tbl, COUNT(*) FROM organizations
UNION ALL
SELECT 'memberships'      AS tbl, COUNT(*) FROM memberships
UNION ALL
SELECT 'cotraitant_shares' AS tbl, COUNT(*) FROM cotraitant_shares;

-- Vérifier les migrations appliquées
SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 10;
```

### 8.5 Relancer

- Retirer le mode maintenance Vercel
- Réactiver le cron sourcing
- Smoke test : connexion + lecture tender + lecture annuaire
- Notifier `#alyos-ing-tech` que la prod est de retour
- Post-mortem dans `/notes-de-suivi/CC_<date>_ROLLBACK.md`

### Timing typique

| Étape | Durée |
|---|---|
| Mise en maintenance + arrêt cron | 2 min |
| Drop schémas + pg_restore (BDD ~500 MB) | 5-10 min |
| Vérification + smoke test | 5 min |
| Retour service | 2 min |
| **Total downtime** | **~15-20 min** |

---

## 9. Tests de rollback en preview AVANT prod

Avant de prétendre que ces SQL marchent, **les jouer dans le projet Supabase preview**
(staging) :

### 9.1 Setup preview

```powershell
$env:PGHOST     = "db.<sourcing-preview-project-ref>.supabase.co"
$env:PGPORT     = "5432"
$env:PGUSER     = "postgres"
$env:PGDATABASE = "postgres"
$env:PGPASSWORD = "<preview password depuis 1Password>"
```

### 9.2 Matrice de tests

Tester chaque rollback **dans l'ordre inverse de l'apply** et vérifier l'état :

| Test | Apply | Rollback | Vérification |
|---|---|---|---|
| T1 | 0050 | 0050 | `\d learning_events` → pas de colonnes `payload`, `reason_code`, `applied_at`, `dismissed_at` |
| T2 | 0050, 0051 | 0051 | `SELECT relrowsecurity FROM pg_class WHERE relname='companies'` → `false` |
| T3 | 0050, 0051, 0052 | 0052 | `SELECT relforcerowsecurity FROM pg_class WHERE relname='companies'` → `false` ; helper `current_user_org_id` absent |
| T4 | 0050, 0051, 0052, 0053 | 0053 | Functions `get_cotraitant_*` absentes ; policy `cotraitant_shares_select_public` présente |
| T5 (urgence) | 0050, 0051, 0052, 0053 | 0053 + 0052 + 0051 | État pré-Lot 1.7 (RLS disabled sur les 3 tables) ; cron + page `/cotraitant/[token]` cassée → revert code aussi |

### 9.3 Reseed après tests

```powershell
pnpm db:reset    # TRUNCATE + reseed Opendatasoft (preview uniquement, JAMAIS prod)
```

---

## 10. Communication pendant un rollback

| Audience | Canal | Quand |
|---|---|---|
| Steve | session terminale active | en permanence |
| Yann (`ps_operator`) | Slack `#alyos-ing-tech` | Steve l'appelle dès qu'il décide de rollback |
| Sophie (CTO) | Slack DM | Avant rollback en zone orange (choix non trivial), après si zone verte |
| Sébastien (lead migration) | mail + Slack | Si rollback touche 0051-0053 (Lot 1.7-*) car ça impacte le plan 18 juillet |
| Admins multi-tenant PROTECT onboardés | mail (template `incident_maintenance_en_cours`) | Si downtime > 5 min anticipé |
| Bannière app | Vercel env var `NEXT_PUBLIC_MAINTENANCE_MODE=1` | Si rollback complet pg_dump |
| Page status | n/a (à créer Phase 2) | — |

### Template Slack rollback

```
[ROLLBACK PROD BDD] Migration 0052 — début à 14h32 par Steve.
Motif : <smoke test KO sur les annuaires entreprise>.
ETA : 5-10 min. Bannière maintenance OFF pour l'instant (tentative palier 1).
Update à 14h42 ou en cas d'escalade palier 2.
```

---

## 11. Tableau récapitulatif des impacts

| Migration | Rollback DDL safe ? | Perte de données possible | Impact applicatif | Rollback nécessite revert code ? |
|---|---|---|---|---|
| **0050** | OUI (additive) | OUI si Salve U déjà utilisé (rows avec `payload`/`reason_code`) | Page « écarter avec motif » → 500 | Recommandé (désactiver feature flag Salve U) |
| **0051** | OUI | NON (DDL + policies, pas de DML) | Aucun runtime (postgres BYPASSRLS), mais dette sécu réintroduite + bloque bascule 18/07 | NON |
| **0052** | OUI | NON | Aucun runtime ; helper `current_user_org_id` disparaît ; CC-1 Camille reflag | NON (helper non utilisé par 0052 lui-même) |
| **0053** | OUI mais DANGEREUX seul | NON | Page `/cotraitant/[token]` → 500 si code 0053-aware déjà déployé | **OUI obligatoire** (revert code `db.execute(sql\`SELECT get_cotraitant_*\`)`) |
| **0053 + 0052 + 0051** | OUI | NON | Retour pré-Lot 1.7 (état caeaa81). Page `/cotraitant/[token]` casse → revert code aussi | **OUI obligatoire** |

---

## Annexe — checklist Steve avant le rollback

- [ ] Dump pg_dump frais réalisé via `backup-sourcing-db.ps1` (< 5 min)
- [ ] Hash + id récupérés dans `drizzle.__drizzle_migrations`
- [ ] Décision sur le palier (DDL inverse / restore partiel / restore complet) prise
- [ ] Yann notifié dans `#alyos-ing-tech`
- [ ] Code applicatif revert si la migration concerne du code (0050 Salve U, 0053 cotraitant)
- [ ] Smoke test post-rollback préparé (URLs + cookies prêts)
- [ ] Post-mortem prévu dans `/notes-de-suivi/CC_<date>_ROLLBACK.md`

---

*Document maintenu par Alex (`dev`). Toute modification du schéma 0050-0053 doit
mettre à jour ce plan dans la même PR.*
