# Transposition donnees prod Sourcing -> BDD monorepo (bascule 14/06)

Outillage du **Lot 2e** (sprint bascule monorepo, runbook
`docs/RUNBOOK_BASCULE_MONOREPO_140626.md` etapes 2/4/5). Ecrit par Alex (dev) le
10/06 au soir. **Aucun de ces scripts n'a ete execute contre une BDD** : dry-run
sur banc local jeudi 11/06, run reel dimanche 14/06.

Tous les `.ps1` et `.sql` sont 100 % ASCII (PS 5.1 sans BOM, incident accents du 10/06).

## Fichiers

| Fichier | Role | Cible BDD | Qui |
|---|---|---|---|
| `sourcing-tables.txt` | Liste canonique des 49 tables (source : `0129_sourcing_schema.sql`) | - | - |
| `01-export-source.ps1` | pg_dump data-only PLAIN (49 tables) + 4 CSV identity + counts | **Sourcing prod (lecture seule)** | Steve |
| `02-transform.ps1` | Rewrite `public.*` -> `sourcing.*` + en-tete TRUNCATE/replica | aucune | Steve ou Alex |
| `03-identity-and-billing.sql` | Orgs / auth.users / identities / profiles / billing PROTECT | monorepo (via 04) | Sebastien + Steve |
| `04-load-data.ps1` | Orchestration : 03 + counts + donnees, **1 transaction psql** | **monorepo (ecriture)** | Steve (Sebastien supervise) |
| `05-assertions.sql` | 12 assertions Camille + smoke RLS, mono-bloc DO (SQL Editor ok) | monorepo (lecture) | Steve (Camille declare PASS/FAIL) |

## Sequence d'execution

### Jeudi 11/06 - dry-run sur banc local (obligatoire avant GO)

1. Banc : container `postgres:17` + `scripts/migration/dryrun-supabase-stubs.sql`
   + migrations monorepo `0001` -> `0131` (commandes docker lancees par Steve -
   Docker inaccessible depuis les outils Claude Code).
2. `01-export-source.ps1 -UseDocker` avec PG* pointant la **source** (prod Sourcing
   ou un restore local du backup du 10/06 - prefere pour le banc).
3. `02-transform.ps1`
4. `04-load-data.ps1 -UseDocker -AllowLocal` avec PG* pointant le **banc**.
5. `05-assertions.sql` sur le banc. Pour que le smoke RLS (S13/S14) fonctionne sur
   le banc, remplacer le stub `auth.uid()` par une version qui lit les claims :

   ```sql
   CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
     SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
   $$ LANGUAGE sql STABLE;
   ```

   Sinon : `rls_smoke_strict := false` dans le DECLARE de 05 (banc uniquement,
   JAMAIS dimanche).
6. **Critere GO P1 : rejouer 04 puis 05 une 2e fois -> memes assertions vertes**
   (l'idempotence vient du TRUNCATE+COPY et des ON CONFLICT de 03).

### Dimanche 14/06 - reel

1. Etape 2 runbook (8h10) : PG* = **Sourcing prod** (Session Pooler eu-west-1,
   `postgres.loogmtltwkhvczdiurqs`) -> `01-export-source.ps1 -UseDocker`
   (post-gel des ecritures). NB : remplace les commandes 2b/2c du runbook v1
   (dump PLAIN requis par 02, pas `-Fc` ; counts inclus).
2. `02-transform.ps1` (hors ligne, ~secondes).
3. Etape 4 runbook (8h45) : PG* = **monorepo prod** (Session Pooler eu-west-3,
   `postgres.<MONOREPO-REF>`) -> `04-load-data.ps1 -UseDocker` -> taper
   `PROD-CONFIRMER`. Echec = ROLLBACK automatique (cas R2).
4. Etape 5 runbook (9h20) : `05-assertions.sql` (SQL Editor mono-bloc ou psql).
5. Apres PASS Camille (optionnel, propre) :
   `DROP TABLE IF EXISTS sourcing.migration_source_counts;`

## Choix techniques (decides Lot 2e, a challenger en review)

1. **Transform sans sed aveugle** : pg_dump avec `--quote-all-identifiers` +
   machine a etats dans 02 (les lignes entre `FROM stdin;` et `\.` ne sont
   JAMAIS touchees). Seules les lignes statement `COPY "public"."<t>" (...) FROM stdin;`
   dont `<t>` appartient a la liste explicite des 49 tables sont reecrites.
   Table inconnue ou identity dans le dump = ECHEC du transform.
2. **`audit_logs.actor_role` enum -> text** : aucun cast necessaire, le format
   texte de COPY transporte les labels tels quels (idem pour les 10 enums
   `public.*` -> `sourcing.*`, memes labels).
3. **Trigger `handle_new_user` (0001) LAISSE ACTIF** pendant l'INSERT auth.users.
   Le desactiver exigerait d'etre owner de `auth.users` (`supabase_auth_admin`),
   ce que le role postgres n'est pas. Il cree des profiles provisoires (org
   fallback slug `alyos`, role `member`) que l'upsert profiles de 03 corrige
   dans la meme transaction.
4. **Trigger anti-escalade profiles (0063/0091) bypasse** via
   `set_config('request.jwt.claims', '{"role":"service_role"}')` (le trigger
   accepte service_role) - sinon l'upsert de `organization_id`/`is_superadmin`
   est rejete quand on passe par psql/postgres.
5. **`session_replication_role = replica` pendant le COPY des donnees**
   (en-tete du fichier transforme) : l'ordre du dump n'est pas FK-safe
   (ex. `response_files.be_id` -> `bureaux_etudes` creee apres). Implication :
   FK non verifiees au chargement -> **l'assertion A8 (anti-jointures sur
   toutes les FK du schema sourcing) est le filet obligatoire**. La phase
   identity (03) tourne AVANT ce SET, triggers et FK actifs.
6. **TRUNCATE des 49 tables avant COPY** : idempotence (GO P1) + purge des
   seeds `0131` (`platforms`, etc.) dont les ids genereraient des collisions
   avec les ids prod references par `tenders.platform_id`. Les referentiels
   charges sont donc CEUX DE LA PROD (ids preserves). TRUNCATE passe sur
   `audit_logs` (les triggers d'immutabilite sont ROW-level UPDATE/DELETE).
7. **auth.users reconstitue** depuis 5 colonnes exportees + colonnes GoTrue
   synthetisees (instance_id zero, aud/role `authenticated`,
   `confirmation_token`/`recovery_token`/`email_change`/`email_change_token_new`
   = `''` car GoTrue plante sur NULL). Construction dynamique limitee aux
   colonnes reellement presentes -> compatible stub du banc.
   **auth.identities genere** (provider `email`, `provider_id` = user id) au
   lieu d'etre dumpe - suffisant pour le login email+password, et la table
   n'existe pas sur le banc (etape sautee avec NOTICE).
8. **Roles** : `admin->admin`, `user->member`, `viewer->viewer` (arbitrage
   Sebastien 10/06), `superadmin->role admin + is_superadmin=true`. En plus,
   `is_admin = true` pour les admins (le monorepo lit ce flag sur certains
   ecrans Suivi, cf. 0039) et `must_change_password` /
   `provisional_password_expires_at` repris du user_metadata source.
9. **Billing PROTECT** : `trial_until = trial_ends_at` (0049, lu du CSV exporte
   dimanche = valeur prod exacte), `trial_status = 'actif'`,
   `modules_actifs += "sourcing"`, `is_active = true`. Override possible
   (`protect_trial_until_override` dans 03) + egalite stricte dans 05
   (`protect_trial_until_expected`, a coller vendredi). Aucun event insere dans
   `organization_trial_events` (le check `event_type` n'a pas de valeur
   "migration" - le cron relance-trial repart de zero, voulu).

## Points d'arbitrage RESTANTS (a trancher vendredi 12/06 au plus tard)

- **C1 - Deux orgs "AlyoS" vont coexister.** Le seed 0001 du monorepo a cree
  `AlyoS Ingenierie` (slug `alyos`, id aleatoire) pour Suivi ; la transposition
  insere l'org Sourcing `11111111-...` (slug genere `alyos-ingenierie`, ids
  preserves comme demande). 03 emet un WARNING `ARBITRAGE C1`. Si on veut UNE
  seule org AlyoS (SSO 7.7 + un seul profil par user !), il faut un remap :
  `UPDATE sourcing.<t> SET organization_id = <id_cible> WHERE organization_id = <id_source>`
  sur les tables a colonne organization_id/org_id + le profile - a scripter
  SEULEMENT si l'arbitrage le demande. **Lien direct avec C2.**
- **C2 - Collision email auth.users** (Steve & co ont-ils deja un compte
  monorepo ? - runbook Annexe C #4). 03 ABORT avec le detail (id source vs id
  monorepo), rien n'est ecrase. Resolution manuelle : garder l'id monorepo et
  remapper les `user_id`/`actor_id`/`*_by` dans les donnees AVANT rechargement,
  ou supprimer le compte monorepo vide. A tester jeudi avec la reponse reelle.
- **C3 - Promotion superadmin de steissier@** : AUCUN membership `superadmin`
  en prod Sourcing (steissier@ est `admin`), mais le smoke 7.9 du runbook exige
  `is_superadmin = true` pour Steve. 03 le promeut via l'allowlist
  `superadmin_emails` (precedent : 0039 monorepo). A valider par Sebastien
  (c'est SON flag "fondateur" cote Suivi).
- **C4 - Valeur stricte du trial PROTECT** : relever samedi
  (`SELECT trial_ends_at FROM organizations WHERE id = '08e73ef3-...'` sur la
  prod Sourcing) et coller dans `protect_trial_until_expected` (05) + runbook A6.
- **C5 - Exceptions RLS de l'assertion A9** (3 tables referentiels sans RLS,
  2 sans FORCE, fidele a 0129/prod) : divergence vs le "100%" du runbook v1 -
  PASS/FAIL a confirmer par Camille.
- **C6 - Colonnes organizations NON transposees** : `odoo_config` (!),
  `logo_url`, `primary_color`, `font_family`, `siren`, `siret`,
  `subscription_tier`/`subscription_status`/`stripe_customer_id` (0049 drop,
  Q3). `odoo_config` est le seul fonctionnellement chaud (sync Odoo AlyoS) :
  decider ou il vit dans le monorepo (colonne ? settings ?) avant lundi.
  Le CSV `identity-organizations.csv` contient TOUT : rien n'est perdu sur disque.
- **C7 - `users.architect_notifications_seen_at` non porte** (pas de colonne
  cible) : le badge "X nouvelles reponses" repart de zero. Perte assumee ?
- **C8 - Storage** : les `storage_path` transposes pointent des buckets du
  projet Frankfurt. Transposition des objets Storage = runbook Annexe C #9
  (hors perimetre de ce tooling).

## Conflits identite - procedure (resume)

1. 03 ABORT (`GARDE KO: COLLISION EMAIL ...`) -> transaction annulee, rien a nettoyer.
2. Arbitrer (C2). Si remap : produire la table de correspondance, adapter les
   CSV/donnees, relancer 04.
3. Si un run PRECEDENT avait commite des auth.users a nettoyer : runbook
   Annexe A cas R2 (`DELETE FROM auth.identities/auth.users WHERE email IN (...)`,
   uniquement les emails absents du monorepo avant la bascule).
