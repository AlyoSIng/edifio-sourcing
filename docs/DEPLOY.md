# Procédure de déploiement BDD prod — edifio Sourcing

> Source : opération de remédiation infra 2026-05-20, branche `infra/init-prod-db`.
> Référence : `DECISIONS.md` 2026-05-20 (Init BDD prod — Phase A) + ADR-013 (`specs/adr_013_orm_drizzle.md`).

Ce document est le **runbook opposable** pour initialiser la base de données
de production Supabase `edifio-sourcing-prod`. Il s'adresse à un opérateur AlyoS
qui n'a pas nécessairement suivi le projet — la procédure pas-à-pas est
auto-suffisante.

---

## Contexte

Le projet `edifio Sourcing` utilise Drizzle ORM (ADR-013, actée 2026-05-18) :

- 4 migrations SQL versionnées dans `src/db/migrations/` (`0000_init.sql` à
  `0003_fk_supabase.sql`) — source de vérité du schéma.
- 1 seed de référence en prod (`src/db/seed/prod.ts`) qui pose le périmètre
  minimal : 1 organisation AlyoS Ingénierie + 4 plateformes + 7 spécialités
  architectes + 12 prompts IA + 1 profil de recherche actif.

Toutes les actions décrites ici sont **idempotentes** (relançables sans casse).

---

## Pré-requis

### Compte et accès

- Compte Supabase AlyoS avec accès au projet `edifio-sourcing-prod`
  (coordonnées Vault Steve — demander au Board).
- Compte Vercel AlyoS lié au projet `edifio-sourcing` (pour la variable
  d'environnement `DATABASE_URL` runtime).
- Accès lecture/exécution au repo local (`C:\Dev\edifio-sourcing` ou
  équivalent).

### Connexion locale fonctionnelle

```powershell
cd C:\Dev\edifio-sourcing
git status                    # branche infra/init-prod-db ou main post-merge
.\node_modules\.bin\tsx --version
.\node_modules\.bin\tsc --version
```

Si `pnpm` n'est pas dans le PATH ou que corepack pnpm casse au pre-commit :
fallback documenté dans `.claude/memory/env_pnpm_corepack.md` —
utiliser `.\node_modules\.bin\<tool>` directement.

### Branche mergée

Cette procédure suppose que la branche `infra/init-prod-db` (Phase A) **a été
mergée sur `main`** avant Phase B. Vérifier :

```powershell
git fetch origin
git log origin/main --oneline | Select-Object -First 5
# Doit contenir le commit Phase A "feat(db): seed prod minimal + DEPLOY.md"
```

---

## RÈGLE D'OR : `DATABASE_URL` jamais persistée

Pendant TOUTE la procédure ci-dessous, `DATABASE_URL` reste **en mémoire
PowerShell uniquement** :

- JAMAIS `setx DATABASE_URL ...` (qui persiste dans la session utilisateur Windows)
- JAMAIS `Set-Content .env.local ...` (qui committerait le secret si .gitignore oublié)
- JAMAIS de copy-paste dans un fichier non-temporaire

À la fin de l'opération, `$env:DATABASE_URL = $null` (ou simplement fermer
le terminal).

---

## Procédure complète (runbook)

### Étape 1 — Récupération de l'URI Session Pooler prod

1. Ouvrir le Supabase Dashboard → projet `edifio-sourcing-prod`.
2. Menu latéral gauche : `Connect` (icône prise électrique en haut à droite
   dans l'interface 2026, ou `Project Settings` → `Database` selon version).
3. Onglet `Session pooler`.
4. Vérifier que le port affiché est bien `5432` (PAS `6543` qui est le
   transaction pooler — incompatible avec les DDL Drizzle qui nécessitent
   `prepared statements`).
5. Cliquer `Copy` sur l'URI complète.
   Format attendu :
   `postgresql://postgres.<project-ref>:<PASSWORD>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`

**Validation immédiate** : l'URI contient bien `:5432/postgres` et
`pooler.supabase.com`. Si elle contient `:6543` ou `pgbouncer=true`,
**STOP** — choisir l'onglet `Session pooler` (pas Transaction).

### Étape 2 — Pose temporaire de `DATABASE_URL`

Dans PowerShell (terminal AlyoS dev) :

```powershell
$env:DATABASE_URL = "postgresql://postgres.xxxx:PASSWORD@aws-0-eu-central-1.pooler.supabase.com:5432/postgres"
```

**Validation** (sans afficher le password) :

```powershell
$env:DATABASE_URL -replace ':[^@]+@', ':***@'
# Doit afficher : postgresql://postgres.xxxx:***@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
```

### Étape 3 — Application des migrations Drizzle

Cette étape pose les extensions Postgres requises (`uuid-ossp`, `pgcrypto`,
`pg_trgm`) puis applique les 4 migrations versionnées (0000 → 0003) dans
l'ordre. Idempotent grâce à `__drizzle_migrations` (Drizzle ignore les
migrations déjà appliquées).

```powershell
.\node_modules\.bin\tsx src/db/migrate.ts
```

**Output attendu** :

```
[migrate] [OK] Extensions Postgres posees (uuid-ossp, pgcrypto, pg_trgm).
[migrate] [OK] Migrations Drizzle appliquees.
```

**Si erreur "WARNING : DATABASE_URL semble pointer sur le pooler 6543"** :
STOP, retour étape 1, choisir Session pooler (5432).

**Si erreur "relation already exists"** : la BDD n'est pas vide. Vérifier
manuellement via SQL Editor (étape 4) avant de continuer — ne pas forcer.

### Étape 4 — Vérification post-migrate (sanity checks SQL)

Dans le Supabase Dashboard → `SQL Editor` → New query :

```sql
-- 1. Compter les tables créées (attendu : 22+ tables publiques)
SELECT count(*) AS table_count
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

-- 2. Lister les tables (verification visuelle des noms cles)
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- 3. Verifier que RLS FORCE est actif sur les tables multi-tenant
SELECT tablename, rowsecurity, forcerowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('organizations', 'tenders', 'architects', 'search_profiles',
                    'memberships', 'audit_logs', 'ai_runs', 'brevo_messages')
ORDER BY tablename;
-- Attendu : rowsecurity = t (true) ET forcerowsecurity = t pour toutes.

-- 4. Verifier que __drizzle_migrations a bien 4 lignes
SELECT id, hash, created_at
FROM drizzle.__drizzle_migrations
ORDER BY id;
-- Attendu : 4 lignes (0000_init, 0001_schema_v1, 0002_rls, 0003_fk_supabase).
```

Si l'une de ces vérifications échoue : **STOP**, ne pas seeder. Voir
[Runbook revert](#runbook-revert-rollback-durgence) ci-dessous.

### Étape 5 — Application du seed prod minimal

Le script `src/db/seed/prod.ts` est protégé par une **double garde** :
NODE_ENV doit valoir `production` ET DATABASE_URL ne doit pas contenir
`localhost`. Sinon il refuse et throw.

```powershell
$env:NODE_ENV = "production"
.\node_modules\.bin\tsx src/db/seed/prod.ts
```

**Output attendu** :

```
[db:seed:prod] ==== Seed PROD minimal -- edifio Sourcing ====
[db:seed:prod] Contexte : production
[db:seed:prod] [OK] organizations : 1 ligne (AlyoS Ingenierie)
[db:seed:prod] [OK] platforms : 4 lignes (boamp / place / francmarches / mp_info)
[db:seed:prod] [OK] architect_specialties : 7 lignes
[db:seed:prod] [OK] ai_prompts : 12 lignes (P1-P12 v1)
[db:seed:prod] [OK] search_profiles : 1 ligne (AlyoS BTP, active)
[db:seed:prod] Rapport : { ... }
[db:seed:prod] Rapport ecrit : .../src/db/seed/prod-seed-report.json
[db:seed:prod] ==== Seed PROD termine OK ====
```

Le fichier `prod-seed-report.json` généré localement peut être committé
pour traçabilité audit (laissé à l'appréciation du Board — pas obligatoire).

### Étape 6 — Vérification post-seed (sanity checks SQL)

Dans `SQL Editor` :

```sql
-- 1. 1 seule organisation AlyoS (cf. CLAUDE.md "1 seule organisation au démarrage")
SELECT id, name, subscription_tier FROM organizations;
-- Attendu : 1 ligne, id='11111111-1111-1111-1111-111111111111',
--          name='AlyoS Ingenierie', subscription_tier='studio'.

-- 2. 4 plateformes activees
SELECT code, display_name, auth_type, enabled FROM platforms ORDER BY code;
-- Attendu : 4 lignes : boamp / francmarches / mp_info / place (toutes enabled).

-- 3. 7 specialites architectes
SELECT count(*) FROM architect_specialties;
-- Attendu : 7.

-- 4. 12 prompts IA actifs
SELECT count(*), count(*) FILTER (WHERE active) AS active_count
FROM ai_prompts;
-- Attendu : 12 / 12.

-- 5. 1 search_profile actif AlyoS (cle metier du cron)
SELECT id, name, active, cron_time, cron_days, cpv_codes, geo_zones
FROM search_profiles
WHERE active = true;
-- Attendu : 1 ligne, name='Profil AlyoS BTP - sourcing principal',
--          cpv_codes={45000000,71000000}, geo_zones={33,40,47,64,33000}.

-- 6. Tables NON seedees -- doivent etre VIDES
SELECT 'users' AS t, count(*) FROM users
UNION ALL SELECT 'memberships', count(*) FROM memberships
UNION ALL SELECT 'tenders', count(*) FROM tenders
UNION ALL SELECT 'architects', count(*) FROM architects
UNION ALL SELECT 'ai_runs', count(*) FROM ai_runs
UNION ALL SELECT 'brevo_messages', count(*) FROM brevo_messages
UNION ALL SELECT 'audit_logs', count(*) FROM audit_logs;
-- Attendu : toutes a 0.
```

### Étape 7 — Création du 1er admin AlyoS (auth.users)

Le seed prod **ne crée pas** l'utilisateur admin (auth.users est managed par
Supabase Auth, hors périmètre Drizzle). Deux options pour créer le 1er admin :

#### Option A — Supabase Dashboard (recommandé pour le bootstrap initial)

1. Dashboard → projet `edifio-sourcing-prod` → `Authentication` → `Users`.
2. Bouton `Add user` → `Send invitation`.
3. Email : `steissier@alyosingenierie.fr` (ou autre admin AlyoS valide).
4. **Cocher** « Auto Confirm User » si on veut bypass la validation email
   (Phase A : Yann + Steve confirmeront via le flow standard).
5. L'utilisateur reçoit un magic link de définition initiale du mot de passe.
6. Au 1er login dans l'app `https://edifio-sourcing.vercel.app/login`, le
   middleware Next.js vérifie `@alyosingenierie.fr` et autorise l'accès.

#### Option B — API admin Supabase (script ops)

Si l'on veut automatiser (futur onboarding multiple utilisateurs) :

```typescript
// Pseudo-code -- script ops a executer manuellement avec SUPABASE_SERVICE_ROLE_KEY
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
await supabase.auth.admin.createUser({
  email: "steissier@alyosingenierie.fr",
  password: "<provisoire-16-car>", // cf. CLAUDE.md regles password
  email_confirm: true,
});
```

Cette option n'est PAS scriptée dans le repo en Phase A (pas nécessaire pour
le bootstrap). À écrire si besoin onboarding > 5 users via PR ultérieure.

#### Création des tables `users` + `memberships`

Important : le seed prod **ne touche pas** non plus aux tables `users` et
`memberships`. Ces deux tables sont peuplées **au 1er login** de l'admin
AlyoS (logique applicative dans `src/app/login/...` qui crée le row `users`
miroir de `auth.users` + le row `memberships` admin organisationId=ORG_A_ID).

Si le code applicatif ne fait pas ce miroir automatiquement, voir
`src/lib/auth/` pour le hook de post-login.

### Étape 8 — Validation fonctionnelle du cron

Une fois admin créé et `users` + `memberships` peuplés, valider que le cron
sourcing fonctionne :

#### Option A — Déclenchement manuel (curl)

```powershell
# CRON_SECRET = la variable d'env runtime cote Vercel (Project Settings → Env Vars)
$cronSecret = "<recupere-depuis-vercel-dashboard>"
curl.exe -X GET `
  -H "Authorization: Bearer $cronSecret" `
  "https://edifio-sourcing.vercel.app/api/cron/sourcing-run"
```

**Output attendu** : JSON avec un résumé du run (1 profile traité, N AO
fetchés, dedup, filter, insert).

#### Option B — Attendre le tick Vercel cron quotidien

Le cron Vercel est planifié `30 4 * * 1-5` UTC = 06h30 Paris en été
(CEST) / 05h30 en hiver (CET) — cf. `vercel.json` et
`DECISIONS.md` 2026-05-20 `fix/cron-schedule-paris`. Le tick suivant
produira automatiquement un appel GET sur `/api/cron/sourcing-run`.

**Vérification dans le Dashboard Vercel** → `edifio-sourcing` → `Logs` :
filtrer sur `cron/sourcing-run` → vérifier `200 OK` au lieu du précédent
`500 relation "search_profiles" does not exist`.

**Vérification BDD** (lendemain matin) :

```sql
SELECT count(*), max(created_at) FROM tenders;
-- Attendu : count > 0 (les AO BOAMP du jour sont insérés).
```

### Étape 9 — Nettoyage

```powershell
$env:DATABASE_URL = $null
$env:NODE_ENV = $null
# Ou simplement : fermer le terminal PowerShell.
```

**Vérifier** que `.env.local` n'a pas été modifié accidentellement :

```powershell
git status
# Doit etre clean sur les fichiers .env*.
```

---

## Runbook revert (rollback d'urgence)

Si l'init prod a foiré à mi-parcours (par exemple migration `0002_rls` qui
casse en milieu d'exécution) et qu'il faut revenir à un état propre :

**ATTENTION** : la commande ci-dessous **DROP TOUTES LES TABLES PUBLIQUES**
de la BDD prod. À n'exécuter QUE si :
- la BDD est vide ou ne contient que des données de seed (pas de données
  utilisateurs réelles) ;
- le Board a explicitement validé le revert ;
- on est sur la bonne URI (re-vérifier l'host avec `$env:DATABASE_URL -replace ...`).

```sql
-- DANGER : supprime toutes les tables publiques + leurs FK + leurs données.
-- À exécuter dans le SQL Editor Supabase, JAMAIS via script automatisé.

BEGIN;
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;

-- Nettoyer aussi la table interne Drizzle de tracking des migrations.
DROP SCHEMA IF EXISTS drizzle CASCADE;
COMMIT;
```

Puis reprendre depuis l'**Étape 3** (re-poser extensions + migrations + seed).

---

## Annexes

### A.1 — Liste des tables créées par les migrations (22 + 1 audit + 1 drizzle interne)

Tables métier (créées par `0001_schema_v1.sql`) :

| Table                  | Source domaine          | RLS FORCE |
|------------------------|-------------------------|-----------|
| organizations          | organizations.ts        | oui (1)   |
| users                  | users.ts                | oui       |
| memberships            | users.ts                | oui       |
| search_profiles        | config.ts               | oui       |
| platforms              | config.ts               | non (ref) |
| platform_credentials   | config.ts               | oui       |
| architect_specialties  | architects.ts           | non (ref) |
| architects             | architects.ts           | oui       |
| tenders                | tenders.ts              | oui       |
| tender_events          | tenders.ts              | oui       |
| tender_lots            | tenders.ts              | oui (2)   |
| selections             | selections.ts           | oui       |
| architect_responses    | selections.ts           | oui       |
| dossier_pieces         | selections.ts           | oui       |
| library_items          | library.ts              | oui       |
| ai_prompts             | ai.ts                   | non (ref) |
| ai_runs                | ai.ts                   | oui       |
| odoo_links             | integrations.ts         | oui       |
| brevo_messages         | integrations.ts         | oui       |
| notifications          | integrations.ts         | oui       |
| audit_logs             | audit.ts                | oui (3)   |
| learning_events        | tenders.ts              | oui       |

Notes :
- (1) `organizations` est sa propre racine multi-tenant — la policy
  vérifie que l'utilisateur appartient à cette org via memberships.
- (2) `tender_lots` n'a pas de colonne `organization_id` directe : la
  policy passe par EXISTS sur la table `tenders` parente.
- (3) `audit_logs` est protégée par 2 triggers BEFORE UPDATE/DELETE qui
  RAISE EXCEPTION (immutabilité, cf. `0002_rls.sql`).

Schéma interne :

| Schéma  | Table                    | Rôle                              |
|---------|--------------------------|-----------------------------------|
| drizzle | __drizzle_migrations     | Tracking des migrations Drizzle   |
| auth    | users (managed Supabase) | Identité (login, email, password) |

### A.2 — Liste des RLS policies actives (20 policies tenant_isolation + 1 insert_by_member)

Cf. `src/db/migrations/0002_rls.sql` pour la liste exhaustive. Vérification :

```sql
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
-- Attendu : 21 lignes (20 tenant_isolation + 1 architects insert_by_member).
```

### A.3 — Mapping migrations Drizzle ↔ tables

| Migration              | Contenu                                          |
|------------------------|--------------------------------------------------|
| 0000_init.sql          | CREATE TYPE `subscription_tier` (enum seul)      |
| 0001_schema_v1.sql     | 11 autres enums + 22 tables + index + FK         |
| 0002_rls.sql           | RLS FORCE + 21 policies + triggers immutabilité  |
| 0003_fk_supabase.sql   | FK `users.id` → `auth.users(id)` (post-Auth)     |

### A.4 — Commandes utiles ops

```powershell
# Etat des migrations appliquees
.\node_modules\.bin\tsx -e "import postgres from 'postgres'; const s = postgres(process.env.DATABASE_URL); s\`SELECT * FROM drizzle.__drizzle_migrations ORDER BY id\`.then(r => { console.log(r); s.end(); });"

# Compter les lignes par table seedee
.\node_modules\.bin\tsx -e "import postgres from 'postgres'; const s = postgres(process.env.DATABASE_URL); Promise.all(['organizations','platforms','architect_specialties','ai_prompts','search_profiles'].map(t => s.unsafe(\`SELECT '\${t}' AS t, count(*) FROM \${t}\`))).then(r => { console.log(r.flat()); s.end(); });"
```

### A.5 — Références croisées

- `CLAUDE.md` — règles globales projet, naming strict, périmètre interne AlyoS
- `DECISIONS.md` — log décisions techniques (notamment 2026-05-20 Phase A)
- `specs/adr_013_orm_drizzle.md` — ADR-013 choix ORM Drizzle
- `src/db/migrate.ts` — wrapper migration custom (extensions + drizzle migrator)
- `src/db/seed/prod.ts` — seed prod minimal (ce document)
- `src/db/seed/index.ts` — seed dev/CI (2 orgs, 200 AO, NE PAS exécuter en prod)
- `vercel.json` — schedule cron `30 4 * * 1-5` UTC (6h30 Paris été)

---

*Procédure rédigée le 2026-05-20 par Alex (DEV TEAM) — Phase A initialisation BDD prod.*
*Validation Board : Steve TEISSIER, exception explicite à la limite CLAUDE.md « pas d'opé prod hors Gate 9 ».*
*Exécution Phase B : Yann (ps_operator) avec URI prod fournie par Steve.*
