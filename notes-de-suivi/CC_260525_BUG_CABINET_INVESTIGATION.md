# Investigation bug prod « column architects.cabinet does not exist »

**Date** : 2026-05-25
**Auteur (zone Alex)** : `dev` — module Sourcing principal hors Tandem
**Sévérité** : 🔴 BLOQUANT PROD — accès Sourcing indisponible
**Statut investigation côté Alex** : DIAGNOSTIC TERMINÉ — plan d'apply prêt pour validation Steve + CTO Sophie
**Statut côté Nadia (`dev_tandem`)** : en parallèle (périmètre Tandem + seed/import architects) — section dédiée à compléter ci-dessous

> Ce fichier est la **note unifiée** des deux investigations (Alex + Nadia).
> Nadia ajoute sa propre section §5 ci-dessous sans réécrire la mienne.

---

## 1. Rappel des symptômes (Steve)

- Erreur prod : `column architects.cabinet does not exist`
- Journal `__drizzle_migrations` **vide** en prod → aucune migration Drizzle jamais appliquée par `drizzle-kit migrate`
- Route Sourcing inaccessible — Steve évoque la page « AO du jour »

Handoff `handoff/BUG_260525_ARCHITECTS_CABINET_SCHEMA_DRIFT.md` annoncé mais **introuvable dans le repo** (vérifié via `Glob handoff/*CABINET*` et `handoff/*260525*` — 0 match).

---

## 2. Vérification périmètre Alex — consommateurs `architects` hors `/tandem/`

Grep exhaustif `from(architects)`, `architects.cabinet`, `leftJoin/innerJoin architects` sur :

- `src/app/sourcing/ao-du-jour/**`
- `src/app/sourcing/ao/[id]/**` HORS `/tandem/`
- `src/lib/sourcing/**`
- `src/lib/architects/**`

**Résultat : ZÉRO match dans mon périmètre.** Détail :

| Fichier | Consomme `architects` ? | Verdict |
|---|---|---|
| `src/app/sourcing/ao-du-jour/page.tsx` | NON — appelle `getTendersOfTheDay` + `getActiveSearchProfileName` uniquement | clean |
| `src/app/sourcing/ao-du-jour/actions.ts` | NON — mute `tenders` + `tenderEvents` | clean |
| `src/lib/sourcing/queries.ts` | NON — `tenders` + `searchProfiles` | clean |
| `src/lib/sourcing/orchestrator.ts` | NON (Grep) | clean |
| `src/lib/sourcing/insert.ts`, `scoring.ts`, `filter.ts`, `dedup.ts`, `normalize.ts` | NON | clean |
| `src/app/api/cron/sourcing-run/route.ts` | NON — `searchProfiles` + orchestrator | clean |
| `src/app/sourcing/layout.tsx` | NON — auth + AppShell | clean |
| `src/app/sourcing/admin/profil/**`, `admin/users/**` | NON | clean |
| `src/middleware.ts` | NON | clean |

**Tous les consommateurs `architects.cabinet` du repo sont dans le périmètre Nadia (Tandem) :**

- `src/lib/tandem/followup-cron.ts:113` — cron J+3 SELECT architects
- `src/lib/tandem/architect-page-data.ts:156,163` — page publique /archi/[token]
- `src/app/sourcing/ao/[id]/tandem/page-data.ts:131,142` — page shortlist Tandem
- `src/app/sourcing/ao/[id]/tandem/actions.ts:205,364` — Server Actions Tandem
- `src/app/api/archi/[token]/respond/route.ts:118` — POST réponse architecte

---

## 3. Verdict — `cabinet` est LÉGITIME, c'est un drift prod

### 3.1 Preuve de migration

Fichier `src/db/migrations/0005_tandem_engine.sql:16` :
```sql
ALTER TABLE "architects" ADD COLUMN "cabinet" text NOT NULL;
```

Cette migration fait partie du journal Drizzle local (`src/db/migrations/meta/_journal.json` — 7 entrées 0000→0006). Elle est **versionnée correctement** dans le repo et le schema TS (`src/db/schema/architects.ts:68`) est cohérent avec elle.

→ Aucun bug Drizzle à corriger côté code. Le schema TS et les migrations sont alignés.

### 3.2 Drift prod (hypothèse à valider par Steve avec dump prod)

Si `__drizzle_migrations` est vide en prod : **aucune des 7 migrations n'a été appliquée via `drizzle-kit migrate`**. Probablement :

- (a) seed initial fait manuellement via `drizzle-kit push` (qui ne marque pas le journal) au tout début
- (b) ou DDL importé via Supabase Studio / `psql` direct hors workflow Drizzle

Conséquence : prod tourne très probablement sur le **schéma 0001 d'origine** (firstname/lastname/email NOT NULL/siret/references/partnership_status) → toutes les colonnes ajoutées/droppées par 0002→0006 manquent.

Delta probable côté table `architects` (à valider via `\d architects` sur prod) :

**Colonnes manquantes en prod** :
- `cabinet` text NOT NULL (0005)
- `contact_name` text (0005)
- `website` text (0005)
- `siren` text (0005)
- `zip` text (0005)
- `city` text (0005)
- `headcount` integer (0005)
- `company_size` text (0005)
- `company_created_at` timestamptz (0005)
- `odoo_external_id` text UNIQUE (0005)
- `preferred` boolean (0005)
- `active` boolean (0005)
- `solicitable` boolean GENERATED (0005)
- `past_collabs_count` integer (0005)

**Colonnes en trop en prod** (à dropper par 0005) :
- `firstname` text NOT NULL
- `lastname` text NOT NULL
- `title` text
- `siret` text
- `references` text
- `partnership_status` partnership_status

**Constraint à modifier** : `email` doit passer de NOT NULL à NULLABLE.

**Autres delta probables** (tables non-architects, à compléter avec dump prod) :
- `tenders.deferred_until` (0004) manquant → la page AO du jour crasherait AUSSI sur cette colonne si 0004 n'est pas joué non plus. À vérifier en priorité.
- enum `audit_action` : valeurs `tender_defer`, `tender_reject` (0004), `architect_response` (0005) manquantes
- table `architect_opposition_tokens` entière (0005) manquante
- colonnes `architect_responses.token_id`, `followup_sent_at` (0005)
- colonnes `odoo_opportunities.architect_id`, `origin`, `last_error` (0005)
- 20 policies RLS (0002) — peuvent ne pas être posées du tout
- FK cross-schema `users.id → auth.users.id` (0003)
- Policies RLS sur `architect_opposition_tokens` (0006)

---

## 4. Plan court à valider (Steve + CTO Sophie avant action Yann)

> Zone 🔴 — pas d'action sans OK explicite.

**Étape 0 — Capture état réel prod (lecture seule, par Steve)**
```sql
\d architects
\d tenders
\d architect_responses
\d odoo_opportunities
SELECT typname, enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE typname IN ('audit_action','tender_status');
SELECT * FROM __drizzle_migrations ORDER BY id;
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
SELECT count(*) FROM architects;
SELECT count(*) FROM tenders;
SELECT count(*) FROM audit_logs;
```
**Objectif** : confirmer le delta précis 0001-vs-actuel-prod et le **volume de données existantes** (impact `NOT NULL` sur `cabinet` — étape 4 ci-dessous).

**Étape 1 — Backup prod complet (Yann, OK Steve)**
```bash
pg_dump --no-owner --no-acl --format=c -Fc -f backup_pre_migrations_260525.dump $PGURL_PROD
```
Stockage hors-prod (S3 / local Yann). Test de restauration sur container `postgres:15` local avant de continuer (cf. memory `feedback_postgres_dry_run_local`).

**Étape 2 — Dry-run intégral en local (Alex + Yann)**
Sur container `postgres:15` propre, charger le backup prod puis enchaîner :
```bash
DATABASE_URL=postgres://...localhost... pnpm drizzle-kit migrate
```
Vérifier que les 7 migrations s'appliquent sans erreur **sur les données prod réelles**. Si erreur → revoir le plan, ne pas pousser en prod.

**⚠️ Point bloquant probable étape 2** : `0005_tandem_engine.sql:16` fait `ADD COLUMN "cabinet" text NOT NULL` **sans DEFAULT**. Si la table `architects` prod n'est pas vide, l'ALTER va échouer (NOT NULL violation pour les lignes existantes). Solutions à arbitrer avec CTO :
- (a) Patcher `0005_tandem_engine.sql` pour ajouter `DEFAULT '?'` puis `ALTER COLUMN ... DROP DEFAULT` après backfill — mais ça modifie une migration déjà versionnée.
- (b) Créer une migration `0007_backfill_architects_cabinet.sql` **AVANT** d'apply 0005 (impossible, l'ordre est figé).
- (c) Si `architects` prod est vide (très probable, Nadia est en plein refonte) → pas de problème, 0005 passe.
- (d) Vider la table `architects` prod avant migration (acceptable si Nadia va reseed via Opendatasoft de toute façon — à valider Sophie).

→ **Mon avis Alex** : option (c)/(d) selon le count prod. Si `architects` contient ≤ une dizaine de lignes de test, on TRUNCATE puis on apply, Nadia reseed. Si plusieurs centaines/milliers : option (a) avec migration corrective committée au préalable.

**Étape 3 — Apply prod (Yann après OK CTO + dry-run OK)**
```bash
pnpm drizzle-kit migrate  # avec PGURL prod posée par Steve dans sa session shell uniquement
```
(cf. memory `feedback_ops_prod_user_runs_migration` — Steve pose les PG\*, lance la commande, colle l'output)

**Étape 4 — Smoke test prod (Alex côté lecture, pas d'écriture)**
- `GET https://edifio-sourcing.vercel.app/sourcing/ao-du-jour` (200 attendu)
- `GET https://edifio-sourcing.vercel.app/sourcing/ao/[uuid-test]/tandem` (200 attendu, à valider avec Nadia)
- Vérifier `SELECT count(*) FROM __drizzle_migrations` (= 7)
- Vérifier `\d architects` (présence `cabinet`, `solicitable`, `siren`, etc.)
- Vérifier les 20+ policies RLS posées : `SELECT count(*) FROM pg_policies WHERE schemaname='public'` (≈ 21)

**Étape 5 — Reseed architects (Nadia, si TRUNCATE étape 2.d)**
À cadrer dans la section §5 ci-dessous par Nadia.

**Étape 6 — Note de clôture + ADR**
- Update `DECISIONS.md` : 2026-05-25 — rattrapage drift prod migrations 0001→0006 + cause racine (push initial sans journal)
- Ajouter check CI : `drizzle-kit check` doit faillir si schema TS diverge du dernier snapshot, ET un workflow GH Actions doit refuser de merger en main si `pnpm drizzle-kit generate --dry-run` produit du diff (garde-fou anti-drift futur)

---

## Plan de rollback (si étape 3 échoue partiellement)

Postgres ne supporte pas le rollback transactionnel propre sur `ALTER TYPE ... ADD VALUE`. En revanche, les migrations Drizzle s'appliquent **chacune dans une transaction** (default `drizzle-kit migrate`).

- Si 0005 échoue → la migration est rollback, le journal `__drizzle_migrations` ne s'incrémente pas → on peut corriger + retry.
- Si 0005 réussit mais 0006 échoue → idem, 0006 rollback. État cohérent intermédiaire (0005 acquis).
- **Si désastre généralisé** (corruption, lock long) → `pg_restore` du backup étape 1 vers une nouvelle DB Supabase + bascule DNS (RTO ~30 min, RPO 0 vs heure du backup). À cadrer avec CTO.

---

## Risques identifiés

| Risque | Sévérité | Mitigation |
|---|---|---|
| `architects.cabinet NOT NULL` échoue sur données prod existantes | 🔴 BLOQUANT | Étape 2 dry-run + arbitrage Sophie sur option (c)/(d)/(a) |
| RLS posées par 0002 cassent des requêtes app existantes (rôle `postgres` bypass mais Edge Functions ?) | 🟠 MEDIUM | Smoke test étape 4 + revue policies en pre-flight |
| `tenders.deferred_until` aussi manquant → AO du jour cassée même après fix architects | 🟠 MEDIUM | Étape 0 confirme, étape 3 apply 0004 en même temps |
| 7 migrations à apply en bloc = grosse fenêtre de risque vs petites étapes | 🟡 LOW | Backup étape 1 + transactions individuelles Drizzle |
| Drift entre snapshot Drizzle `meta/0005_snapshot.json` et état post-apply réel (générations futures non déterministes) | 🟡 LOW | `pnpm drizzle-kit check` post-apply |
| Données RGPD architects existantes en prod purgées sans consentement (option d) | 🔴 RGPD | À arbitrer Sophie — vérifier RGPD art. 5 (minimisation) + voir si lignes test ou prod réelles |

---

## 5. Section Nadia (`dev_tandem`) — à compléter

**Périmètre** : `src/lib/tandem/**`, `src/app/sourcing/ao/[id]/tandem/**`,
`src/app/api/archi/**`, `src/app/api/cron/tandem-followup/**`, seed/import architects.

À renseigner par Nadia :
- Confirmer/infirmer drift côté Tandem (les 5 consommateurs `architects.cabinet` listés §2)
- Volume `architects` prod actuel (impact étape 2.d)
- Plan reseed (Opendatasoft, taille payload, idempotence)
- Risques spécifiques Tandem (tokens d'opposition existants à invalider ? jobs en cours à drainer avant migration ?)

---

## 6. Post-apply prod (Steve 2026-05-25) — validation lecture seule

> Steve a appliqué les 7 migrations en prod (Drizzle migrate) — output : « migrations sql faites sans erreur ».
> Cette section vérifie a posteriori que la prod est alignée avec le repo (3 vérifs read-only, pilotées par Steve).

### 6.1 Vérif journal `__drizzle_migrations`

Requête à exécuter par Steve en prod (lecture seule) :
```sql
SELECT id, hash, created_at
FROM drizzle.__drizzle_migrations
ORDER BY id;
```

**Attendu** : 7 lignes, dans cet ordre, avec `created_at` proche du moment de l'apply Steve.

| idx | tag attendu | when (epoch ms du journal) |
|---|---|---|
| 0 | `0000_init` | 1779106224037 |
| 1 | `0001_schema_v1` | 1779109575814 |
| 2 | `0002_rls` | 1779624000000 |
| 3 | `0003_fk_supabase` | 1779624060000 |
| 4 | `0004_tender_deferral` | 1779381444916 |
| 5 | `0005_tandem_engine` | 1779455607260 |
| 6 | `0006_tandem_rls` | 1779455667260 |

> **Note hash** : le `hash` stocké en BDD est un SHA-256 calculé à l'apply par drizzle-kit sur le contenu du fichier `.sql`. Il n'est **pas** dans `_journal.json` (qui ne contient que `idx`, `tag`, `when`). Pour valider le hash de manière infaillible, Steve peut comparer avec :
> ```sql
> SELECT id, hash, to_timestamp(created_at / 1000.0) AS applied_at
> FROM drizzle.__drizzle_migrations
> ORDER BY id;
> ```
> Critère de succès **minimal** : `count(*) = 7` ET `id` strictement croissant 1→7 ET aucun gap. Le hash ne peut être vérifié que par re-run d'un dry-run local sur un Postgres vierge (cf. memory `feedback_postgres_dry_run_local`) — non bloquant si les 4 vérifs ci-dessous passent.

### 6.2 Vérif structure `architects` post-migration

Requête prod :
```sql
\d architects
SELECT count(*) AS row_count FROM public.architects;
```

**Attendu — 24 colonnes** (alignées sur `src/db/schema/architects.ts`) :

| # | Colonne | Type | Source |
|---|---|---|---|
| 1 | `id` | uuid PK | 0001 |
| 2 | `organization_id` | uuid FK NOT NULL | 0001 |
| 3 | `cabinet` | text NOT NULL | 0005 |
| 4 | `contact_name` | text | 0005 |
| 5 | `email` | text NULLABLE (drop NOT NULL en 0005) | 0001+0005 |
| 6 | `phone` | text | 0001 |
| 7 | `website` | text | 0005 |
| 8 | `siren` | text | 0005 |
| 9 | `zip` | text | 0005 |
| 10 | `city` | text | 0005 |
| 11 | `headcount` | integer | 0005 |
| 12 | `company_size` | text | 0005 |
| 13 | `company_created_at` | timestamptz | 0005 |
| 14 | `odoo_external_id` | text UNIQUE | 0005 |
| 15 | `specialty_codes` | text[] NOT NULL DEFAULT '{}' | 0001 |
| 16 | `geo_zones` | text[] NOT NULL DEFAULT '{}' | 0001 |
| 17 | `tutoiement` | boolean NOT NULL DEFAULT false | 0001 |
| 18 | `preferred` | boolean NOT NULL DEFAULT false | 0005 |
| 19 | `active` | boolean NOT NULL DEFAULT true | 0005 |
| 20 | `solicitable` | boolean GENERATED ALWAYS AS (email IS NOT NULL) STORED | 0005 |
| 21 | `past_collabs_count` | integer NOT NULL DEFAULT 0 | 0005 |
| 22 | `notes` | text | 0001 |
| 23 | `created_at` | timestamptz NOT NULL DEFAULT now() | 0001 |
| 24 | `updated_at` | timestamptz NOT NULL DEFAULT now() | 0001 |

**Colonnes 0001 qui ne doivent PLUS être là** (droppées par 0005) :
- `firstname`, `lastname`, `title`, `siret`, `references`, `partnership_status`

**Index attendus** (depuis schema TS) :
- `architects_organization_id_email_key` (UNIQUE composite)
- `architects_odoo_external_id_unique` (UNIQUE)
- `architects_pkey` (PK id)
- `idx_architects_org` (btree organization_id)
- `idx_architects_siren` (btree partial WHERE siren IS NOT NULL)
- `idx_architects_specialties` (GIN specialty_codes)
- `idx_architects_geo_zones` (GIN geo_zones)
- `idx_architects_solicitable_active` (btree partial WHERE solicitable=true AND active=true)

**RLS attendue** : `FORCE ROW LEVEL SECURITY` + au moins une policy `architects_tenant_isolation`. Validation globale :
```sql
SELECT count(*) AS policy_count FROM pg_policies WHERE schemaname = 'public';
-- Attendu : ~24 policies (cumul 0002 + 0006, cf. grep CREATE POLICY = 24)
```

### 6.3 Plan smoke test routes (Steve, navigateur sur prod)

À ouvrir une par une, dans cet ordre, en étant **loggué avec un compte `@alyosingenierie.fr`** :

| # | URL | Critère succès |
|---|---|---|
| 1 | `/login` | Page chargée (200), formulaire email/password rendu, footer « © AlyoS Ingénierie 2026 — Outil interne ». Sanity check middleware domaine. |
| 2 | `/sourcing/ao-du-jour` | **🎯 La route initialement bloquée.** 200 OK, pas d'erreur React/500 visible, liste AO du jour rendue (vide ou peuplée selon état Opendatasoft, mais pas de crash sur `column architects.cabinet does not exist` ni `tenders.deferred_until`). |
| 3 | `/sourcing/admin/profil` | 200 OK, formulaire profil de recherche rendu (24 positive + 9 negative + 23 départements selon baseline memory `project_alyos_btp_profile_baseline`). Sanity check route admin random. |
| 4 | `/sourcing/admin/users` | 200 OK, table users rendue. Sanity check route admin protégée. |
| 5 | `/sourcing/ao/[id]/tandem` | À ouvrir avec un UUID d'AO actif récent. Pour trouver un UUID valide : `SELECT id, title, status FROM tenders WHERE status IN ('to_qualify','qualified','tandem_in_progress') ORDER BY created_at DESC LIMIT 5;` Critère : 200 OK, page Tandem rendue (shortlist vide acceptable tant que Nadia n'a pas reseed les architects). |

**En cas de crash sur route #2** : capture du message d'erreur + stack trace Vercel logs → repostage ici en §6.5 + escalade Sophie. **Aucun fix sans dry-run local préalable** (cf. memory `feedback_postgres_dry_run_local`).

### 6.4 Statut `pnpm test:rls` côté Alex

**Non exécuté.** Justification :

- `test:rls` = `pg_prove --ext .sql tests/rls/` → connecte à une base Postgres via vars `PGHOST/PGUSER/PGPASSWORD/PGDATABASE` du shell courant. Si je le lance sans contrôle de l'environnement, je risque soit (a) de viser ma DB locale qui n'a peut-être pas les 7 migrations appliquées (faux négatif), soit pire (b) de viser par mégarde une DB partagée.
- Garde-fou explicite Steve : **pas d'accès prod, lecture seule, pas de modif code**.
- Mon Bash a été refusé par sandbox sur cette session (`Permission denied` au 1er appel), je ne peux pas lancer `pg_prove` de toute façon.

**Fallback proposé** : Steve peut lancer en local depuis un terminal où il pose ses `PG*` (DB Supabase locale dev, surtout pas prod) :
```powershell
$env:PGHOST="127.0.0.1"; $env:PGPORT="54322"; $env:PGUSER="postgres"; $env:PGPASSWORD="postgres"; $env:PGDATABASE="postgres"
pnpm test:rls
```
Critère succès : tous les pgTAP verts. Si rouge → on tient un drift entre snapshot Drizzle et état post-apply (cf. risque ligne 199 §Risques).

Alternative plus propre : laisser tourner la suite RLS dans la CI GitHub Actions sur la prochaine PR (workflow déjà en place — Steve confirme).

### 6.5 Résultats (à remplir par Steve après exécution)

- [ ] §6.1 — Output `SELECT id, hash, created_at FROM drizzle.__drizzle_migrations` :
  ```
  (coller ici — attendu : 7 lignes)
  ```
- [ ] §6.2 — Output `\d architects` + `count(*)` :
  ```
  (coller ici — attendu : 24 colonnes, RLS FORCED)
  ```
- [ ] §6.2 — Output `SELECT count(*) FROM pg_policies WHERE schemaname='public'` :
  ```
  (coller ici — attendu : ~24)
  ```
- [ ] §6.3 — Routes smoke test : statut ligne 1 / 2 / 3 / 4 / 5
- [ ] §6.4 — `pnpm test:rls` lancé en local ou différé CI ? Résultat ?

→ Si toutes les cases sont vertes : clôture incident, je rédige l'entrée `DECISIONS.md` (§Étape 6 du plan initial) + setup garde-fous anti-drift (`drizzle-kit check` en CI). Si une rouge : escalade Sophie pour arbitrage corrective migration.

---

## 7. Synthèse pour Steve / CTO

- **Code OK** : `cabinet` est légitime, schema TS aligné sur migration `0005_tandem_engine.sql`. Aucun fix code à faire.
- **Drift prod confirmé** : `__drizzle_migrations` vide → 6 migrations à rattraper (0001 partiellement déjà là, 0002-0006 à apply).
- **Pas d'urgence à toucher le code** ; l'urgence est de **rattraper le journal de migration prod en mode catch-up** après backup + dry-run.
- **Pas d'`ALTER TABLE` manuel hors Drizzle** (respect garde-fou Steve).
- **Pas de `drizzle-kit push`** (perte d'audit trail — c'est exactement comme ça qu'on est arrivés ici).
- **Steve lance les commandes prod lui-même** (memory `feedback_ops_prod_user_runs_migration`).

**Bloquant unique avant exécution** : arbitrage CTO sur le sort des données `architects` prod existantes vs `NOT NULL cabinet` (étape 2 — options c/d/a). Cet arbitrage dépend du `SELECT count(*) FROM architects` que Steve seul peut faire en prod.

**Prochaine action attendue** : Steve fait l'étape 0 (lecture seule prod) et colle l'output ici. Puis CTO arbitre option backfill. Puis Yann lance étape 1 (backup).
