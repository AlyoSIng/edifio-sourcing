# CR visio cadrage migration `edifio-sourcing` → monorepo Suivi+ACT

**Date** : 2026-06-07
**Présents** : Sébastien TEISSIER (lead Suivi+ACT), Steve TEISSIER (Sourcing), Claude Code (sub-agent dev Sourcing)
**Format** : synchrone écrit (90 min équivalent)
**Référence** : prompt système `.claude/agents/suivi_act_reviewer.md` v1 — 7 juin 2026
**Statut** : v1.1 — Q6 actée Steve (B-en-2-temps). Calendrier consolidé à confirmer avant 11 juin midi. Inventaire superadmin (9 tables, pas 3) à arbitrer ensuite.

---

## Point 1 — Tag/backup + branche `feat/sourcing-merge`

✅ **Côté Sourcing validé** : tag `pre-migration-2026-06-15` + branche `backup/pre-migration-2026-06-15` poussés sur GitHub `AlyoSIng/edifio-sourcing`. URLs vérifiées.

✅ **Côté Suivi+ACT — actions prises** :
- Tag `pre-merge-sourcing-2026-06-15` à créer sur `alyos-suivi-chantier.main` HEAD courant. À faire avant 12 juin (avant Lot 1 Sourcing qui ne nous touche pas, mais filet de sécurité).
- Branche `backup/pre-merge-sourcing-2026-06-15` idem.
- Branche `feat/sourcing-merge` créée le **1er juillet matin** depuis `main` à jour. C'est la branche d'intégration, pas de merge direct dans `main` avant Lot 11.

→ Action Sébastien : exécution ce week-end (8-9 juin), confirmation par commit dans `docs/DELIVERY_SOURCING_MIGRATION.md` §99.

---

## Point 2 — Validation des 8 garde-fous appris côté Sourcing

✅ Compréhension validée sur G1-G8. Reformulations correctes, rien à reprendre.

3 compléments :

- **G1** : ajouter `next.config.mjs` à la liste « à la marge ». Modifications de cette config doivent passer en commit séparé avec review Sébastien dédiée, jamais mélangées à du code Sourcing.
- **G3** : la règle ESLint sera fournie côté Suivi+ACT dans le kickoff du 1er juillet. Pas la peine de la préfigurer côté Sourcing.
- **G7** : préciser ordre dans la migration → (1) `CREATE SCHEMA sourcing`, (2) `REVOKE ALL ON SCHEMA sourcing FROM public`, (3) `GRANT USAGE ON SCHEMA sourcing TO authenticated, service_role`, (4) `CREATE TABLE...`, (5) `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, (6) policies, (7) `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA sourcing TO authenticated`, (8) `ALTER DEFAULT PRIVILEGES IN SCHEMA sourcing GRANT ALL ON TABLES TO authenticated`. Sinon bug §7.5 reproduit.

---

## Point 3 — Confirmation Q1-Q5, Q7-Q10

| Q | Position §9 | Confirmation |
|---|---|---|
| Q1 | BDD partagée d'emblée, projet Supabase unique, migrations Sourcing renumérotées 0138+ | ✅ confirmé |
| Q2 | supabase-js direct, `lib/db/<entity>.ts`, drop Drizzle au Lot 2 | ✅ confirmé |
| Q3 | Adopter modèle billing 0115, drop 0049 Sourcing | ✅ confirmé (sous réserve Point 4 sur scénario pack) |
| Q4 | Bench Vercel chromium-min Lot 5 avant arbitrage | ✅ confirmé |
| Q5 | Bascule samedi 18 juillet 8h-11h | ✅ confirmé |
| Q7 | Vitest introduit lot 7bis, `*.test.ts` colocated | ✅ confirmé |
| Q8 | Migrations DB manuelles, Sébastien applique en Studio | ✅ confirmé |
| Q9 | = Q4 | ✅ confirmé |
| Q10 | Visio 7-14 juin → kickoff 1/7 → bascule 18/7 → post-mortem 25/7 | ✅ confirmé |

Ces 9 points sont gelés sauf escalade Board.

---

## Point 4 — Q6 billing pack groupé (avis technique Sébastien)

**Position technique tranchée — scénario B mais déployé en 2 temps.**

### Analyse des 3 scénarios

**Scénario A (3 abos autonomes)** :
- Compatible 0115 sans aucune modif, supporte le mode « 1 Stripe Subscription par produit ».
- ❌ Côté business : casse la promesse Suite edifio et empêche tarif groupé attractif.
- ❌ Côté UX admin : 3 invoices, 3 facturations, friction client. On l'a déjà vu sur ACT solo, peu satisfaisant.
- ❌ Côté tech : duplication webhooks `customer.subscription.*` à dispatcher sur 3 modules.

**Scénario B (Subscription multi-items, 1 invoice)** :
- ✅ Stripe Subscription multi-items = pattern natif Stripe, robuste, bien documenté.
- ✅ 1 invoice consolidée, line items détaillés par produit. UX comptable propre.
- ✅ Compatible 0115 moyennant extension `contract_summary` pour stocker un array de `price_id` au lieu d'un scalaire.
- ✅ Permet remise pack via `coupon` Stripe appliqué à la Subscription entière (ex. -20 % si 3 modules actifs).
- ⚠️ Migration `subscription_items` table à ajouter (1-1 avec rows Stripe), webhook `subscription_items.*` à câbler.
- ⚠️ Logique `modules_actifs` JSONB dérivée des line items actifs (sync à faire dans le webhook).

**Scénario C (bundle dynamique prorata)** :
- ❌ Stripe prorata avec ajout/suppression de modules en cours de mois = source de bugs et de tickets support. Vu sur ACT, on ne le souhaite pas répéter.
- ❌ Complexité non justifiée au MVP. À reporter Phase 2 si pertinent.

### Recommandation : **B en 2 temps**

1. **18 juillet (bascule)** : déploiement Scénario A simplifié — chaque module a son `price_id`, mais on prépare déjà `contract_summary.items` comme array. Pas de remise pack. Les 3 abos sont indépendants. Risque migration zéro.
2. **Sprint 9.E (août-septembre 2026)** : activation Scénario B complet — coupon « Suite edifio -20 % » + 1 seule Subscription multi-items + UI admin de souscription groupée. Migration `contract_summary` déjà compatible.

**Compatibilité Sprint 9.E** : le modèle 0115 supporte déjà la mécanique `trial_status` + cron `relance-trial`. Le passage A → B se fait avec une migration `0NNNN_subscription_multi_items.sql` qui :
- Ajoute table `contract_items` (id, contract_id, price_id, quantity, started_at, ended_at)
- Migre les rows `contract_summary.price_id` scalaire → `contract_items` row unique
- Hook webhook `subscription_items.created/deleted` pour sync `modules_actifs`

**🔴 Décision attendue de Steve avant 11 juin midi** : valide-tu B-en-2-temps ?
**⚠️ Refus explicite du Scénario C au MVP**.

### ✅ Décision Steve (7 juin 2026, post-CR)

**B-en-2-temps validé.**
- Phase 1 (18 juillet 2026) : Scénario A simplifié, 3 abos `price_id` distincts, pas de remise pack.
- Phase 2 (Sprint 9.E août-septembre 2026) : pack groupé Suite edifio -20 % via Subscription multi-items.

---

## Point 5 — Calendrier Lots 1-7 + jalons

**Validation globale : OK avec 3 ajustements.**

### Dépendances mal ordonnées

❌ **Lot 4 swap libs en parallèle Lot 3** : risqué. `exceljs → xlsx` peut casser des helpers utilisés par les modules pures portables du Lot 3. → **Lot 4 séquentiel AVANT Lot 3**.

❌ **Lot 5 cron + bench Vercel 12-14 juillet** : trop tard. Le bench doit avoir tourné AVANT le 12 juillet. → POC `spike/cron-vercel-chromium` doit livrer résultat **avant le 25 juin**.

❌ **Lots 7 + 8 + 9 + 10 concentrés 15-17 juillet** : 4 lots en 3 jours = stress et bugs intégration. → Étaler.

### Lots intermédiaires ajoutés

🆕 **Lot 2bis — Suppression Drizzle et nettoyage `db/schema/`** : à insérer entre Lot 2 et Lot 3. 1 journée.
🆕 **Lot 6bis — Vitest setup + portage tests critiques** : 15 juillet matin avant Lot 7. Demi-journée.

### Calendrier consolidé proposé

```
Lot 0     12-14 juin   Préparation (Sourcing en cours)
Lot 0b    12-25 juin   POC cron Vercel chromium-min (livrable AVANT 1/7)
Lot 1     12-17 juin   Upgrade Next 15 / React 19 sur Sourcing.main
Lot 2     1-7 juillet  Drizzle → supabase-js
Lot 2bis  8 juillet    Suppression Drizzle + nettoyage db/schema
Lot 4     9-10 juillet Swap libs (exceljs→xlsx, fflate→docxtemplater)
Lot 3    11-12 juillet Modules pures portables
Lot 5    13-14 juillet Sourcing engine cron + arbitrage Q4 final
Lot 6    14-15 juillet IA Anthropic + logAiUsage obligatoire
Lot 6bis 15 juillet AM Vitest setup + tests critiques portés
Lot 7    15-16 juillet Cotraitance Tandem
Lot 8    16 juillet    Dossier IA
Lot 9    16 juillet    Bibliothèque (parallèle Lot 8)
Lot 10   17 juillet    Admin + Superadmin
GEL      17 juillet PM Code freeze, derniers smoke tests
Lot 11   18 juillet 8-11h  Bascule DNS
Lot 12   25 juillet   Post-mortem
```

→ Action Sébastien : pousse ce calendrier dans `docs/DELIVERY_SOURCING_MIGRATION.md` §99 ce week-end. Action Sourcing : confirme ou propose ajustements **avant le 11 juin midi**.

---

## Point 6 — Tables superadmin à fusionner

**Position : Scénario C (hybride).**

### Arbitrage par table

| Table | Stratégie | Justification |
|---|---|---|
| `formations` | **Fusion** (`public.formations` + colonne `module text[]`) | Cross-module naturel |
| `news_items` + `user_news_reads` | **Fusion** avec `module text[]` sur news_items | Centre de notifications unifié |
| `support_tickets` | **Fusion** avec colonne `module` text | Un seul backoffice support |
| `roadmap_items` | **Cloisonnement** (`sourcing.roadmap_items`) | Roadmap métier différente par module |
| `guided_tests` | **Cloisonnement** (`sourcing.guided_tests`) | Spécifique parcours Sourcing |
| `pitch_blocks` | **Cloisonnement** (`sourcing.pitch_blocks`) | Spécifique métier |
| `market_study_blocks` | **Cloisonnement** (`sourcing.market_study_blocks`) | Spécifique métier |

### Conséquences techniques

- 3 tables fusionnées : migration `0NNNN_merge_superadmin_tables.sql` qui aligne les schémas Sourcing → modèle commun, avec backfill `module='sourcing'` sur les rows existantes.
- RLS sur tables fusionnées : `(module = ANY(array_intersect_with_user_modules())) OR is_superadmin()`. Helper SQL à créer dans `common/`.
- 4 tables cloisonnées : migration habituelle schema `sourcing` (cf. G7).

→ Action Sébastien : valider l'inventaire côté monorepo (existence réelle de `support_tickets` et `formations` côté Suivi+ACT) avant 11 juin.

---

## Point 7 — Q&A + actions

### Actions confirmées

**Côté Sourcing (Claude Code)** :
- [x] Tag + branche backup poussés sur GitHub `edifio-sourcing` (7 juin)
- [x] Catalogue Drizzle → loaders supabase-js (Lot 0a) — en cours
- [ ] **POC `@sparticuz/chromium-min` sur `spike/cron-vercel-chromium`** — livrable bench (durée + RAM pic) **avant 25 juin**
- [ ] Démarrage Lot 1 upgrade Next 15 / React 19 sur `chore/upgrade-next15-react19` dès le 12 juin
- [ ] Confirmer calendrier consolidé Point 5 **avant 11 juin midi**

**Côté Suivi+ACT (Sébastien)** :
- [ ] Tag `pre-merge-sourcing-2026-06-15` + branche `backup/pre-merge-sourcing-2026-06-15` ce week-end (8-9 juin)
- [ ] Création `feat/sourcing-merge` sur `main` à jour le 1er juillet matin
- [ ] MAJ `docs/DELIVERY_SOURCING_MIGRATION.md` §99 avec arbitrages de ce CR — d'ici 9 juin soir
- [ ] Préparer ESLint config `import/no-restricted-paths` pour `modules/sourcing/*` — livrée au kickoff 1er juillet
- [ ] Inventaire tables superadmin monorepo (Point 6) — d'ici 11 juin

### Décisions prises (pour archivage)

1. Backup tag/branche des deux repos OK, branche `feat/sourcing-merge` au 1er juillet
2. 8 garde-fous validés, complément G7 sur ordre des instructions migration
3. Q1, Q2, Q3, Q4, Q5, Q7, Q8, Q9, Q10 confirmés §9 sans modification
4. **Q6 : scénario B-en-2-temps acté par Steve (7 juin)**. 3 abos `price_id` distincts au 18/7, pack groupé -20 % Sprint 9.E.
5. Calendrier Lots 1-12 consolidé avec inversion Lot 3/4, ajout Lot 2bis et Lot 6bis, POC cron livrable avancé au 25 juin
6. Superadmin : scénario C hybride

### Escalades Sébastien → Steve (cf. §11 prompt système)

- **[ESCALADE] Q6 scénario billing pack** — recommandation B-en-2-temps, **✅ acté par Steve le 7 juin** (B-en-2-temps).

### Prochaine sync

- **11 juin** : Steve confirme Q6 + calendrier + inventaire superadmin
- **25 juin** : livrable POC cron Vercel chromium-min côté Sourcing
- **1er juillet** : kickoff Lot 2, Sébastien crée `feat/sourcing-merge` et livre ESLint config

---

*FIN CR — 7 sections couvertes. Archivage à valider par Steve.*
