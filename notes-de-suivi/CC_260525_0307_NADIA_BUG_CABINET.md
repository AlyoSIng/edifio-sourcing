# CC 2026-05-25 03:07 — Nadia — Bug `column architects.cabinet does not exist`

> Note de suivi Tandem en parallèle de l'enquête d'Alex sur le module Sourcing
> principal (ao-du-jour). Lecture seule sur tout — aucune commande d'écriture
> exécutée. Rapport rédigé pour soumission Steve + CTO.

---

## 1. Migration 0005 : la colonne `cabinet` est bien créée

**OUI — confirmé.** `src/db/migrations/0005_tandem_engine.sql:16` contient :

```sql
ALTER TABLE "architects" ADD COLUMN "cabinet" text NOT NULL;
```

Et la séquence complète de la refonte 2026-05-22 est intégralement présente
dans cette migration : ajout `cabinet`, `contact_name`, `website`, `siren`,
`zip`, `city`, `headcount`, `company_size`, `company_created_at`,
`odoo_external_id`, `preferred`, `active`, `solicitable` (GENERATED), puis
`DROP COLUMN` sur les 6 anciennes colonnes `firstname/lastname/title/siret/
references/partnership_status`, et la nouvelle UNIQUE sur `odoo_external_id`.

**Conclusion : `schema.ts` et `0005_tandem_engine.sql` sont cohérents.** Ma
refonte du 2026-05-22 a bien généré sa migration via `drizzle-kit generate`
(rien à régénérer côté Nadia). Le drift est donc **uniquement** côté apply prod.

Référence schema : `src/db/schema/architects.ts:68` (`cabinet: text("cabinet").notNull()`).

## 2. Seed `architects-fixture.ts` : cohérent

Lecture seule (pas d'exécution locale faite — Alex et moi en lecture-only tant
que le plan n'est pas validé). Le fichier `src/db/seed/architects-fixture.ts`
peuple `cabinet` sur les 6 fixtures (cabinetTu1 / cabinetTu2 / cabinetVous1 /
cabinetVous2 / cabinetInactif / cabinetSansEmail), valeurs `text NOT NULL`
correctement renseignées. `src/db/seed/index.ts:148` (faker batch 50/org)
peuple aussi `cabinet: ${faker.company.name()} Architectes`. **Aucun trou
de couverture.**

`src/lib/brevo/variables.ts:106` lit `input.architect.cabinet` avec fallback
`"votre cabinet"` si chaîne vide — donc même si une fiche prod avait un
`cabinet = ''`, le rendering Brevo ne planterait pas (mais le NOT NULL DB
l'interdit de toute façon).

**Verdict : si l'apply prod est correct, le seed et le Brevo passent.**

## 3. Stratégie `__drizzle_migrations` : **bootstrap des 0000-0004 PUIS apply 0005-0006**

État acté côté Alex : journal `__drizzle_migrations` vide en prod, donc
drizzle-kit n'a JAMAIS été l'autorité prod. Mais la prod a fonctionné, donc
les objets DDL des migrations 0000-0004 ont été créés autrement (vraisemblablement
psql direct ou outil tiers, à confirmer avec Yann).

### Options envisagées

**Option A — full reset prod (`drizzle-kit migrate` from scratch sur DB vidée)**
- Apply 0000 → 0006 dans l'ordre.
- Implique TRUNCATE complet ou DROP/CREATE de toutes les tables.
- **PERTE DATA prod garantie** → rejet immédiat. Prod est déjà utilisée
  (cf. baseline profil AlyoS BTP 22/05 17h03 dans ma memory + seed BOAMP
  vivant). On ne reset pas.

**Option B (recommandée) — bootstrap `__drizzle_migrations` puis apply incrémental**
1. INSERT manuel dans `__drizzle_migrations` des 5 lignes 0000-0004 marquées
   comme déjà appliquées (hash + created_at). Référence Drizzle Kit standard :
   ```sql
   INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
   VALUES
     ('<hash_0000>', <ts>),
     ('<hash_0001>', <ts>),
     ('<hash_0002>', <ts>),
     ('<hash_0003>', <ts>),
     ('<hash_0004>', <ts>);
   ```
   Les hash se récupèrent dans `src/db/migrations/meta/_journal.json` (champ
   `tag` × `hash`).
2. **AUDIT pré-bootstrap** : vérifier en prod via psql que les objets DDL
   attendus par 0000-0004 sont bien présents et identiques. Si écart →
   stop, escalade CTO (Option A ou patch DDL ciblé).
3. **Test idempotence** : sur dump prod local, jouer le bootstrap puis
   `pnpm drizzle-kit migrate` et confirmer qu'il n'applique QUE 0005 + 0006.
4. Apply officiel 0005 + 0006 en prod (commande lancée par Steve dans sa
   session, cf. memory `feedback_ops_prod_user_runs_migration.md`).
5. Smoke test : `SELECT cabinet FROM architects LIMIT 1;` + audit log
   `architect_response` (code A16 du nouvel enum) disponible + RLS architects
   toujours actif.

### Risques Option B

- **Hash mismatch** : si Drizzle a régénéré un journal entre-temps, les hash
  inscrits doivent correspondre EXACTEMENT à ceux de `meta/_journal.json` du
  HEAD courant. À vérifier avant exécution.
- **Objets DDL prod ≠ migrations 0000-0004** : si la prod a été modifiée à
  la main avec un schéma divergent, le `migrate` 0005 va casser sur un
  `ALTER TABLE` d'un objet qui n'existe pas comme attendu. **Audit indispensable.**
- **FK orphelines** : si prod a des `architects` avec ancien modèle
  (firstname/lastname NOT NULL), le DROP COLUMN passera mais le précédent
  ADD COLUMN cabinet NOT NULL **échouera sans DEFAULT** sur des lignes
  existantes. **À vérifier impérativement** : combien de lignes dans
  `architects` prod ? Si > 0, il faut soit (a) un `DEFAULT ''` temporaire
  dans le ADD COLUMN, soit (b) un backfill UPDATE avant le NOT NULL.

### Recommandation finale

**Option B avec 3 garde-fous bloquants** :
1. Audit prod préalable (DDL + nombre de lignes architects) — par Yann/Steve.
2. Dry-run complet sur dump prod local (container postgres:15) — par moi.
3. Backup snapshot Supabase immédiatement avant l'apply — par Yann.

Si l'audit révèle des lignes `architects` existantes en prod → patch DDL
ciblé (ADD COLUMN avec DEFAULT '' puis backfill SIREN/cabinet depuis l'export
Odoo puis DROP DEFAULT) — escalade CTO obligatoire (zone orange).

## 4. Risques RLS Tandem post-migration (0006_tandem_rls)

Lu `0006_tandem_rls.sql` (45 lignes). Ne touche QUE à `architect_opposition_tokens`
(nouvelle table créée par 0005) : ENABLE + FORCE RLS + 1 policy `tenant_isolation`.

**Aucun risque pour la table `architects` refondue** : les policies existantes
(`tenant_isolation` USING `organization_id = current_organization_id()` +
`insert_by_member` AS RESTRICTIVE) sont posées par `0002_rls.sql` et ne
référencent **aucune** des colonnes droppées (`firstname/lastname/title/siret/
references/partnership_status`). La refonte 0005 est donc RLS-safe : les
policies survivent au DROP COLUMN sans CASCADE nécessaire.

Idem `architect_responses` (ajout `token_id` + `followup_sent_at` en 0005) :
policy existante intacte (USING organization_id), pas de policy spécifique
sur les nouvelles colonnes.

**Verdict : aucun risque RLS post-migration.** À sécuriser quand même par
`pnpm test:rls` (pgTAP) en CI après apply.

## 5. Coordination avec Alex

- Alex enquête sur le module Sourcing principal (ao-du-jour) — je ne touche pas.
- Je laisse cette note dédiée Nadia (plus pratique que d'attendre l'ouverture
  d'un fichier partagé). Lien à inclure dans le plan unifié.
- Aucun commit / push de mon côté — réservé Yann après validation CTO.

## 6. Action items proposés (zone 🔴, Board obligatoire)

1. **Yann** : audit prod psql (`\d architects` + `SELECT COUNT(*) FROM architects`
   + `SELECT count(*) FROM information_schema.tables WHERE table_schema='public'`)
   pour cartographier l'état réel.
2. **Yann** : récupérer les hash du journal Drizzle local (`meta/_journal.json`)
   et préparer le SQL de bootstrap `__drizzle_migrations`.
3. **Nadia** (moi) : dry-run sur dump prod local — confirme idempotence bootstrap
   + apply 0005-0006 sans erreur.
4. **Steve / CTO** : arbitrer si Option B-strict ou patch DDL ciblé selon
   résultat audit (zone orange si lignes existantes architects).
5. **Yann** : snapshot Supabase + apply migration officiel.
6. **Nadia** : smoke test prod (`SELECT cabinet FROM architects LIMIT 1` +
   `pnpm test:rls` ciblé architects/architect_responses).

---

**Fichiers consultés** (absolus) :
- `C:\Dev\edifio-sourcing\src\db\schema\architects.ts`
- `C:\Dev\edifio-sourcing\src\db\migrations\0001_schema_v1.sql`
- `C:\Dev\edifio-sourcing\src\db\migrations\0002_rls.sql`
- `C:\Dev\edifio-sourcing\src\db\migrations\0005_tandem_engine.sql`
- `C:\Dev\edifio-sourcing\src\db\migrations\0006_tandem_rls.sql`
- `C:\Dev\edifio-sourcing\src\db\seed\architects-fixture.ts`
- `C:\Dev\edifio-sourcing\src\db\seed\index.ts`
- `C:\Dev\edifio-sourcing\src\lib\brevo\variables.ts`
