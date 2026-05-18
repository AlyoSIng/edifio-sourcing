# ADR-013 — ORM retenu : Drizzle (Gate 5 Arbitrage 3 tranché)

**Date** : 2026-05-18
**Statut** : Acceptée — validée Board le 2026-05-18
**Auteur** : [CTO Sophie] (verdict) sur la base du spike [DEV Alex] (vote dev)
**Pilote** : Sophie
**Précédence** : Cette ADR clôt l'**Arbitrage 3 de Gate 5** (cf. `DECISIONS.md` 2026-05-07 G5).
**Références amont** :
- `gates/06_ORM/DECISION_ORM_260518.md` — rapport spike (219 lignes)
- `handoff/ANSWER_260515_1430_PREREQ_SPIKE_ORM.md` — 3 prérequis Cowork (Q1/Q2/Q3) tranchés avant spike
- `gates/05_ARCHI/05_ARCHI_260507.md` — pondération critères validée Board
- `specs/adr_006_to_010.md` — ADR-006 repo dédié, contexte stack

---

## Contexte

La Gate 5 (Architecture, validée Board 2026-05-07) a figé la stack edifio Sourcing : Next.js 14 App Router + Supabase EU (Postgres + Auth + Storage + Realtime + Edge Functions) + Vercel EU + Fly.io EU. Sur le poste ORM TypeScript, **trois Arbitrages Board** étaient encore en suspens :

- Arbitrage 1 : Auth Supabase magic-link vs password — tranché ADR-007 (password)
- Arbitrage 2 : Compte Vercel — tranché ADR-008 (compte perso temporaire à migrer)
- **Arbitrage 3 : ORM TypeScript Drizzle vs Prisma — reporté à un spike technique de 2 jours mené début Gate 6 par Alex.**

La contrainte ferme `CLAUDE.md` interdisait toute migration applicative committée avant la décision. Critères pondérés validés Gate 5 :

| Critère | Pondération | Motivation |
|---|---|---|
| Cold start (Edge Function Deno) | **50 %** | Cible Gate 5 : cron scoring 1100-3300 AO/jour < 10 min. Le point chaud d'écriture vit en Edge Deno → la latence d'init ORM est critique. |
| DX migrations + types | **25 %** | 22+ tables au schéma v1, 9 colonnes jsonb, 12 policies RLS. 10-12 semaines de dev MVP → coût des frictions ORM répétées. |
| Compat Supabase + RLS | **15 %** | RLS FORCE obligatoire (multi-tenant), driver Deno requis (Edge runtime). |
| Maturité écosystème | **10 %** | Communauté, GUI, docs, adoption industrielle. |

Les **3 prérequis Cowork** ont été tranchés avant lancement du spike (handoff Alex 2026-05-15) :
- **Q1** — taille `tenders.raw_data` = bucket 10-50 KB (25 KB médiane cible)
- **Q2** — Prisma Data Proxy = **NO-GO** (latence + coût + budget). Prisma forcément testé via driver-adapter Deno expérimental.
- **Q3** — `tier` = enum Postgres `subscription_tier` à pré-poser (pas table dédiée, pas mock).

---

## Décision

**ORM TypeScript retenu : Drizzle 0.39 + drizzle-kit 0.30 + postgres-js 3.4.**

- Schema déclaratif TypeScript (`spike/drizzle/schema.ts` → futur `src/db/schema.ts`)
- Migrations générées via `drizzle-kit generate` (SQL versionné lisible)
- Migrations appliquées via `drizzle-kit migrate` (CI Vercel)
- Driver Edge Function Deno = `postgres-js` (natif Deno, sans engine externe)
- RLS Postgres FORCE = SQL natif hors ORM (`db/rls/policies.sql`, 12 policies + helpers `current_organization_id()` / `current_user_role_text()`)
- Triggers Postgres custom (`audit_logs` immutable, `touch_updated_at`) = SQL natif dans migrations

---

## Motifs (4 critères pondérés détaillés)

### Critère 1 — Cold start (50 %) : Drizzle 8 / Prisma 4

**Mesuré Drizzle** (ARM local Postgres 16.14, Node 24.11.1, win32-arm64) :
- `cold_start_ms` médiane **555 ms**, p95 591 ms, stdev 26 ms (5 itérations)
- `upsert_batch_100_ms` médiane **60 ms** (100 lignes en 1 statement)
- `upsert_per_tender_ms` médiane **316 ms** (100 lignes séquentielles)

**Non mesuré Prisma** : bench GHA bloqué après 4 fails consécutifs liés à pnpm 11 ignored build scripts (esbuild + prisma engines). Workaround `onlyBuiltDependencies` + `pnpm-workspace.yaml` non concluant. STOP acté ROI marginal.

**Analyse qualitative Prisma** :
- Prisma 6.4.1 embarque un **engine binary Wasm ~30 MB** instancié à chaque cold start côté client.
- Sur Edge Function Deno, doit passer par `@prisma/adapter-pg-deno` **flagué experimental** dans la doc officielle.
- Overhead Wasm typique 150-400 ms additionnel par-dessus la connexion DB.
- Extrapolation cold start typique Prisma sur Edge Deno : **700-1100 ms** (non confirmé par mesure directe).

Drizzle = thin wrapper TS + `postgres-js` Deno-natif stable → init dominée par la connexion TCP Postgres (~50-150 ms chaud, ~300-600 ms froid Supabase Frankfurt). La mesure ARM locale 555 ms confirme l'ordre de grandeur dans un contexte plus chargé que la lambda Vercel.

**Vote critère 1 : Drizzle (confiance modérée — à confirmer pré-Gate 9 par bench Edge Function réel — voir conditions).**

### Critère 2 — DX migrations + types (25 %) : Drizzle 8 / Prisma 6

**3 écarts DX disqualifiants Prisma observés au code (Phase 2a + 2b du spike) :**

1. **`upsertMany` absent du client Prisma.** Le bench scoring batch_100 a dû être réécrit en `$executeRawUnsafe` avec construction manuelle des placeholders SQL. Côté Drizzle, `db.insert(architectResponses).values(rows).onConflictDoUpdate({...})` est typé end-to-end (8 lignes). Sur 1100-3300 AO/jour cible scoring quotidien, c'est **répété chaque batch** → écart structurel.

2. **`Json` opaque côté Prisma vs `jsonb().$type<T>()` typé fort Drizzle.** Schéma v1 contient **9 colonnes jsonb** (`tenders.raw_data`, `tender_events.data`, `ai_runs.output`, `brevo_messages.events`, `audit_logs.data`, +4 colonnes annexes). Multiplier le pattern `$type<T>()` × 9 = 9 sources de bugs runtime évitées par le compilateur Drizzle.

3. **`TRUNCATE` absent de l'API Prisma.** Le reset bench utilise `deleteMany` cascade (lent + verrous longs) ou `$executeRawUnsafe('TRUNCATE...')`. Côté Drizzle, `db.execute(sql.raw('TRUNCATE...'))` est natif. Impact opérationnel limité, mais **symptomatique** de la philosophie « API safety » Prisma qui ferme l'accès au SQL avancé alors qu'on a besoin de l'inverse.

**Avantages légitimes Prisma compensant partiellement** :
- `schema.prisma` 189 LoC vs `schema.ts` Drizzle 224 LoC (-15 % concision)
- Prisma Studio GUI mature et soigné (vs Drizzle Studio en beta)
- `prisma generate` du client TS plus mature

**Vote critère 2 : Drizzle (confiance haute, factuel, 3 écarts répétables sur tout le module sourcing engine).**

### Critère 3 — Compat Supabase + RLS (15 %) : Drizzle 8 / Prisma 6

**RLS Postgres FORCE = parité stricte.** Aucun des deux ORM ne supporte les policies RLS au niveau du schema. Les deux prototypes posent les politiques en SQL natif (`rls/policies.sql`, 12 policies + helpers `current_organization_id()` / `current_user_role_text()`, copiées ligne-pour-ligne entre les deux branches).

**À acter pour les futurs ADR** : **aucun ORM TS n'apporte de valeur ajoutée pour la RLS Postgres.** Le pgTAP + les 12 policies dans `rls/policies.sql` resteront identiques quel que soit l'ORM retenu. Conséquence : pas de critère discriminant pour Drizzle vs Prisma sur la RLS proprement dite — seule la maintenabilité du SQL natif compte (équivalente entre les deux).

**Driver Edge Function Deno** :
- **Drizzle** : `postgres-js` nativement Deno-compatible et **stable** (production-ready, Supabase recommande).
- **Prisma** : `@prisma/adapter-pg-deno` flagué **`experimental`** dans la doc Prisma officielle. Q2 Cowork ayant écarté Data Proxy en NO-GO (latence + coût + budget), c'est la **seule porte d'entrée Prisma viable sur Deno** — et c'est une porte expérimentale.

**Scoring 1100-3300 AO/jour < 10 min cible + cron Vercel `30 6 * * 1-5`** (cf. `specs/module_sourcing_engine_v1.md` §3) : le point chaud d'écriture vit en Edge Function Deno → la compat Deno pèse en réalité plus que les 15 % nominaux ne le laissent croire. **Mais pondération Gate 5 inchangée pour cohérence Board.**

**Vote critère 3 : Drizzle (confiance haute, driver Deno stable vs expérimental).**

### Critère 4 — Maturité écosystème (10 %) : Prisma 9 / Drizzle 6

**Prisma gagne légitimement ce critère** :
- ~30 000 questions Stack Overflow vs ~2 000 Drizzle
- Documentation Prisma exhaustive avec tutos par cas d'usage
- Prisma Studio mature et soigné (Drizzle Studio en beta)
- `prisma migrate deploy` outil de référence en CI Vercel pour la communauté
- Adoption industrielle Prisma : Vercel, Notion, Reddit

**Mais 10 % de pondération seulement.** Sur le périmètre MVP edifio Sourcing (Supabase + Postgres + RLS + jsonb + cron), pas de fonctionnalités exotiques qui exigeraient l'ampleur Prisma. La maturité Drizzle est suffisante. L'équipe a effectivement plus d'expérience Prisma → buffer 1-2 jours dans planning Gate 6 pour la rampe Drizzle (accepté).

**Vote critère 4 : Prisma (confiance haute, factuel).**

---

## Calcul scoring final (audité par CTO)

| Critère | Poids | Drizzle | Prisma |
|---|---|---|---|
| Cold start | 50 % | 8 → 4,00 | 4 → 2,00 |
| DX migrations + types | 25 % | 8 → 2,00 | 6 → 1,50 |
| Compat Supabase + RLS | 15 % | 8 → 1,20 | 6 → 0,90 |
| Maturité écosystème | 10 % | 6 → 0,60 | 9 → 0,90 |
| **Total pondéré** | **100 %** | **7,80** | **5,30** |

**Écart 2,50 points** (TL;DR rapport annonce 2,3 par arrondi, Sophie a re-vérifié l'arithmétique → 2,50 retenu).

**Stress-test robustesse** : si on relâche la note cold start Drizzle 8 → 6 (concession agressive au caveat non-mesuré), Drizzle = (6 × 0,50) + 2,00 + 1,20 + 0,60 = **6,80** vs Prisma 5,30 = **écart 1,50 point**. Toujours discriminant > seuil 1 point d'arbitrage CTO posé Gate 5. **La décision résiste à un stress-test agressif.**

---

## Conditions formelles de validation CTO (3 conditions)

### Condition 1 — Bench cold start Edge Function Supabase Deno réel = **bloquant pré-Gate 9**

- Cible : preview Vercel + Edge Function Deno + Supabase Frankfurt
- Outils : k6 charge test + sonde cold start dédiée
- Cas : 100 invocations cold start ré-déployées + 1000 invocations warm
- Métriques : médiane, p95, p99 cold + warm
- **Seuil de validation** :
  - Si écart Drizzle vs Prisma cold start < 200 ms → **post-mortem** + ADR-013 amendé v1.1 + revérification du score critère 1
  - Si écart conforme extrapolation (200 ms+) → **validation finale** ADR-013

### Condition 2 — Re-seed avec payload Opendatasoft réel à la première PR module sourcing engine

- Le seed effectif du spike générait des `raw_data` à **10 KB médiane** au lieu des **25 KB visés** par le verdict Cowork Q1 (bug de remplissage `description` répétés)
- À refaire avec payload Opendatasoft BOAMP réel
- Distribution cible : 15 % 10 KB / 60 % 25 KB / 25 % 45 KB
- Bench upsert relancé sur seed réaliste → comparaison à la valeur 60 ms médiane batch_100 du spike

### Condition 3 — Conservation 30 jours des branches spike

- `spike/orm-drizzle` et `spike/orm-prisma` **conservées sur origin** jusqu'au 2026-06-17
- Si la mesure pré-Gate 9 (condition 1) invalide la trajectoire Drizzle → bascule Prisma possible avec coût modeste (schema déclaratif + migrations SQL portables)
- Yann a un reminder programmé : `git push origin --delete spike/orm-drizzle` + `git push origin --delete spike/orm-prisma` à exécuter le **2026-06-17 SI condition 1 validée**
- Conservation locale conseillée 90j supplémentaires (purge complète 2026-09-15)

---

## Conséquences

### Techniques

- `package.json` racine reçoit : `drizzle-orm@0.39.x`, `drizzle-kit@0.30.x`, `postgres@3.4.x` (versions pinned reproductibles, alignées sur le spike validé)
- `CLAUDE.md` section « Commandes utiles » alignée Drizzle :
  - `pnpm drizzle-kit generate` (génère migrations)
  - `pnpm drizzle-kit migrate` (applique migrations)
  - `pnpm db:seed` (seed Opendatasoft réel)
  - `pnpm db:reset` (TRUNCATE + reseed)
- `CLAUDE.md` section « Limites strictes » : ligne « Committer une migration BDD avant la décision ORM » **SUPPRIMÉE** (décision prise)
- `CLAUDE.md` section « État du projet au démarrage Gate 6 » : statut ORM passé de « décision REPORTÉE → spike de 2 jours » à « décision ACTÉE 2026-05-18 → Drizzle 0.39 »

### Opérationnelles

- DEV Alex démarre la **première PR module sourcing engine** sur base Drizzle :
  - (a) Migration `0000_init.sql` enum `subscription_tier` + colonne `organizations.tier`
  - (b) Schema Drizzle v1 complet (22+ tables)
  - (c) RLS FORCE 12 policies + helpers SQL natif
  - (d) Seed avec payload Opendatasoft réel (condition 2)
  - Effort estimé : ~9-13 jours sur 2-2.5 semaines (cf. `specs/module_sourcing_engine_v1.md`)
- **Pas de carry-over** du spike : la PR repart propre depuis `feat/sourcing-mvp` pour garantir une base maintenance-friendly (le spike est référence pédagogique, pas base de code prod)
- CI Vercel : workflow `drizzle migrate deploy` à ajouter en pré-déploiement
- pgTAP RLS : workflow CI existant inchangé (RLS reste SQL natif hors ORM)

### Risques résiduels documentés

1. **Cold start Prisma non mesuré quantitativement.** Voir condition 1.
2. **Maturité écosystème Drizzle inférieure.** Buffer 1-2 jours dans planning Gate 6 pour rampe d'apprentissage équipe (acquis Prisma sur projets antérieurs, Drizzle nouveau).
3. **Driver-adapter Deno Prisma reste un mouvement d'écosystème.** Si Prisma stabilise l'adapter Deno en Q3-Q4 2026 ET déprécie l'engine binary Wasm, la décision dev pourrait être révisée. Coût de bascule Drizzle → Prisma ultérieur estimé modeste (schema déclaratif + migrations SQL portables). Inversement, si Prisma déprécie l'adapter Deno → Drizzle reste safe.
4. **Bench Drizzle local ARM ne reflète pas le runtime lambda Vercel EU production.** Ordres de grandeur informatifs, pas absolus. Reconfirmé en preview Vercel + Edge Deno en pré-Gate 9 (condition 1).

---

## Alternatives rejetées (rappel + bilan)

| Alternative | Raison du rejet (Gate 5 + spike) |
|---|---|
| **Prisma 6.4.1** | Score pondéré 5,30 / 10 vs Drizzle 7,80 / 10. 3 écarts DX disqualifiants (`upsertMany`, `Json` opaque, `TRUNCATE`). Driver Deno expérimental. Cold start Wasm 30 MB extrapolé 700-1100 ms. |
| **Kysely** | Query builder TS pur sans schema déclaratif. Rejeté Gate 5 : migrations + introspection moins matures que Drizzle / Prisma pour projet greenfield 22+ tables. |
| **Raw SQL + node-postgres** | Trop verbeux pour 22+ tables, perte typage TS, dette de maintenance prohibitive sur 10-12 semaines de dev MVP. |
| **pg-promise** | ORM-light Node-only, pas d'écosystème migrations, incompatible Edge Function Deno. |
| **TypeORM** | Abandonné côté communauté + classes decorator-based incompatibles avec la philosophie functional du projet. |

---

## Versionning ADR

- **v1.0** — 2026-05-18 — Création initiale, validation Board OUI, Drizzle retenu sous 3 conditions.
- **v1.1** (à venir) — pré-Gate 9 — Amendement après bench cold start Edge Function réel (condition 1). Soit validation finale, soit pivot.

---

*ADR-013 lié au rapport spike `gates/06_ORM/DECISION_ORM_260518.md` et tracé dans `DECISIONS.md` batch n°11. Référencé depuis `INDEX.md` section « ADR ». À mettre à jour v1.1 après bench Edge Function pré-Gate 9.*
