# CC 2026-05-25 09:30 — Nadia · Tandem Étape 1 (plan court info)

**Auteur** : Nadia (`dev_tandem`) via Claude Code
**Destinataire** : Board (information — zone verte, je n'attends pas l'OK)
**Branche cible** : `feat/tandem-engine` (Yann créera depuis `feat/sourcing-mvp` au 1er commit)
**Plan parent** : `handoff/PLAN_TANDEM_NADIA_260522.md` (étape 1 sur 6)
**Effort cette étape** : ~1.5 j

---

## Contexte

J'ai lu : `.claude/agents/dev_tandem.md` (oui, Nadia, périmètre Tandem) ·
`handoff/PLAN_TANDEM_NADIA_260522.md` · `DECISIONS.md` (4 décisions Board
22/05 actées : Q1 pondération, Q3 RGPD code, Q4 `solicitable` GENERATED,
Q5 JWT clé dédiée) · `specs/architects_data_and_admin_v1.md` (mapping
Odoo cible) · `specs/audit_log_v1.md` (A1-A15 en place, A16 à allouer) ·
`specs/module_tandem_engine_v1.md` · le schéma Drizzle actuel + RLS
`0002_rls.sql`.

Audit Grep confirmé : **aucun code applicatif** (`src/app`, `src/lib`,
`src/components`) ne consomme `architects.firstname/lastname/title/siret/
references/partnershipStatus`. Seuls `src/db/schema/architects.ts` +
`src/db/seed/index.ts` les utilisent → refonte propre safe.

## Plan étape 1 (5 sous-étapes — zone verte)

1. **Refonte propre `src/db/schema/architects.ts`** : DROP des colonnes
   héritées (`firstname`, `lastname`, `title`, `siret`, `references`,
   `partnership_status`) + ADD des colonnes Tandem cibles : `cabinet`
   (NOT NULL), `contact_name` (nullable), `email` (nullable globalement
   mais clé `solicitable`), `phone`, `website`, `siren` (9 chars),
   `zip`, `city`, `headcount`, `company_size`, `company_created_at`,
   `odoo_external_id` UNIQUE, `preferred` (bool default false),
   `active` (bool default true — droit d'opposition RGPD),
   `solicitable` (GENERATED ALWAYS AS `email IS NOT NULL` STORED),
   `past_collabs_count` (int default 0). Conservation `tutoiement`,
   `notes`, `geoZones`, `specialtyCodes`. **DROP** de `partnership_status`
   à la fois colonne ET enum Postgres (orphelin après drop).

2. **`src/db/schema/selections.ts`** : ajout `tokenId` (FK nullable vers
   `architect_tokens.id`, ON DELETE SET NULL) + `followupSentAt`
   (timestamptz nullable) sur `architectResponses`.

3. **`src/db/schema/integrations.ts`** : refonte `odoo_opportunities`
   multi-opp : DROP UNIQUE(tender_id) + ADD `architect_id` (FK nullable)
   + ADD `origin` text avec CHECK `('solo'|'tandem')` + ADD `last_error`
   (text nullable, traçabilité retry) + 2 index partiels UNIQUE :
   `uniq_opp_solo (tender_id) WHERE architect_id IS NULL` +
   `uniq_opp_tandem (tender_id, architect_id) WHERE architect_id IS NOT NULL`.

4. **Nouvelle table `architect_opposition_tokens`** (page publique
   RGPD `/archi/oppose/[token]`) : `id`, `jti` text UNIQUE,
   `architect_id` FK, `organization_id` FK, `created_at`, `expires_at`,
   `used_at` nullable. Module dans `src/db/schema/selections.ts` (logique
   « tokens architectes »).

5. **Enum `auditAction` + spec** : ajout valeur `architect_response` à
   la fin du tableau (A16, ordre Postgres important — cf. commentaire
   actuel ligne 117). Ajout section A16 dans `specs/audit_log_v1.md`
   (payload Zod-ready : `tender_id`, `architect_id`, `response_status`
   ∈ `accepted|declined|info_requested`, `via_token boolean`, `token_jti`,
   `info_request_text` nullable).

6. **Seed fictif `src/db/seed/architects-fixture.ts`** (NEW) : 4 cabinets
   `@example.test` (mix TU/VOUS, spécialités riches/pauvres, zones
   variées). Idempotent sur `(organization_id, email)`. Gating
   `NODE_ENV !== 'production'`. Branchement conditionnel dans
   `src/db/seed/index.ts` (au lieu du faker generic).

7. **RLS** : `architect_opposition_tokens` ENABLE + FORCE RLS + policy
   `tenant_isolation` dans une migration custom séparée (ne pas toucher
   `0002_rls.sql` — append-only en migration nouvelle).

8. **pgTAP** : pose 2 fichiers `tests/rls/09_tandem_tables.sql` (cross-tenant
   sur `architect_responses`, `architect_tokens`, `architect_opposition_tokens`,
   `odoo_opportunities` multi-opp) + `tests/rls/10_audit_a16.sql`
   (A16 audit insert OK, UPDATE/DELETE rejet). **Coordination Camille
   (qa) ensuite** : elle complète les assertions fines, je pose la
   structure de base.

9. **Migration Drizzle** : `pnpm drizzle-kit generate` → vérification
   manuelle du SQL produit (cf. memory `feedback_postgres_dry_run_local`
   — drizzle-kit peut générer du DDL casse-pied). Dry-run local :
   `pnpm db:dry-run -SkipSeed` minimum (Docker postgres:15 + journal
   complet). Sans la branche `feat/tandem-engine` actuellement créée,
   je laisse les changes en working tree pour que Yann les commit
   ensuite.

## Hors-périmètre confirmé (Alex)

- ❌ `src/app/globals.css`, `tailwind.config.ts`, `src/components/ui/*`
- ❌ `src/db/schema/search_profiles.ts` (n'existe pas encore — Alex P2)
- ❌ Middleware (Alex P3) — ajout `/archi/*` à `PUBLIC_ROUTES` reporté étape 5
- ❌ `src/app/sourcing/admin/users/*` (Alex P3 bug)
- ❌ Aucun connecteur Odoo / matching / JWT cette étape (étapes 2-5)

## Coordination Alex

- `src/db/schema/enums.ts` — append-only sur `auditAction`. J'ajoute
  `architect_response` en dernière position. Alex pourra ajouter
  d'autres codes (admin architects `architect_edit`, etc.) après moi
  dans des commits séparés.
- Helper `normalize.ts` — pas dans cette étape (étape 2 matching).

## Risques cette étape

- 🟢 Pas de migration prod ; juste générée + dry-run local.
- 🟢 Pas de touche middleware / DATABASE_URL / secrets.
- 🟠 `partnership_status` est référencée dans 2 sites schema (seed) ;
  je drop l'enum si plus utilisé ailleurs (Grep confirmera). Si encore
  consommé en CSV import, je laisse l'enum vivant et je drop seulement
  la colonne — pas bloquant pour Tandem (la colonne n'est pas dans le
  périmètre matching).
- 🟠 Le `GENERATED ALWAYS AS STORED` n'est supporté qu'en Postgres 12+
  (Supabase = 15+, OK). Vérifié dans dry-run docker `postgres:15`.

## Rapport ensuite

Une fois ce plan livré : rapport ~250 mots au Board (fichiers modifiés,
migration nom + output, dry-run, seed, A16, RLS, git status, alertes).
Camille enchaîne sur les tests pgTAP fins, Hugo en revue.

---

*Plan court posté pour information — zone verte, je commence
immédiatement.*
