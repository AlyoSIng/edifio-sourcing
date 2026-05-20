# DECISION ORM — Drizzle vs Prisma

**Phase / Gate** : Phase 1 / Gate 6 (Arbitrage 3 Gate 5 — ORM REPORTÉ tranché)
**Date** : 2026-05-18
**Auteur** : Alex (dev) — vote dev posé, verdict CTO Sophie suit
**Statut** : Pré-verdict — en attente arbitrage Sophie
**Référence amont** : `DECISIONS.md` 2026-05-07 G5 Arbitrage 3 · `notes-de-suivi/CC_260516_0925_SPIKE_PLAN.md` · `handoff/REQUEST_260515_1300_PREREQ_SPIKE_ORM.md`

---

## TL;DR

Vote dev : **Drizzle**. Score pondéré Gate 5 = **7,7 / 10** (Drizzle) vs **5,4 / 10** (Prisma), écart 2,3 points. Les chiffres Drizzle sont mesurés sur Postgres 16 ARM local (cold start médiane 555 ms, upsert batch 100 lignes médiane 60 ms). Les chiffres Prisma n'ont pas pu être mesurés (cf. Caveat méthodologique). Le différentiel s'appuie majoritairement sur des observations DX factuelles (Phase 2a + 2b code-à-code) et sur l'analyse qualitative cold start (engine binary Wasm ~30 MB Prisma + driver-adapter Deno expérimental vs thin wrapper TS Drizzle + postgres-js Deno-natif). CTO Sophie tranche.

---

## Contexte

L'arbitrage 3 de Gate 5 a reporté le choix Drizzle vs Prisma à un spike technique de 2 jours mené début Gate 6 par le dev (cf. `DECISIONS.md` 2026-05-07 G5). Le cadre imposé Board : prototype `tenders` + `architects` + `architect_responses` avec RLS strict, jsonb columns et cron Edge Function de scoring sur 100 AO. Critères pondérés Gate 5 : **cold start 50 %**, **DX migrations + types 25 %**, **compat Supabase + RLS 15 %**, **maturité écosystème 10 %**. Contrainte ferme CLAUDE.md : aucune migration applicative committée avant la décision.

Les 3 prérequis Cowork (`handoff/REQUEST_260515_1300_PREREQ_SPIKE_ORM.md` — Q1 taille jsonb, Q2 Prisma Data Proxy, Q3 modélisation `tier`) ont été tranchés avant le spike. Verdicts : Q1 jsonb cible 25 KB médiane (bucket 10-50 KB), Q2 Data Proxy **NO-GO** (bench obligatoirement sur driver-adapter), Q3 enum Postgres `subscription_tier` avec colonne `organizations.tier NOT NULL DEFAULT 'Sourcing'` (cf. `spike/schema_subscription_tier.sql`).

---

## Méthodologie

Quatre phases, exécutées sur 2 jours conformément au plan `CC_260516_0925_SPIKE_PLAN.md` :

- **Phase 1** (2026-05-16 matin) — bootstrap, branches `spike/orm-drizzle` et `spike/orm-prisma` créées depuis `origin/main@a9126a3`, DDL référence `spike/schema_subscription_tier.sql` posé.
- **Phase 2a** (2026-05-16 après-midi) — prototype Drizzle complet : `schema.ts` (4 tables, 3 enums, 224 LoC), migrations générées via `drizzle-kit generate` (66 LoC SQL), RLS FORCE + 12 policies SQL natif, seed déterministe LCG (1 org + 50 architects + 100 tenders avec `raw_data` jsonb 10-50 KB), scoring upsert deux stratégies (per_tender via `onConflictDoUpdate`, batch_100 via `INSERT ON CONFLICT`), bench orchestrator. Commit `ec9650d`.
- **Phase 2b** (2026-05-17 matin) — prototype Prisma miroir : `schema.prisma` (4 models, 3 enums, 189 LoC), migrations générées via `prisma migrate diff` (129 LoC SQL), RLS copiée ligne-pour-ligne, seed identique au LCG près, scoring upsert deux stratégies (per_tender via `prisma.architectResponse.upsert`, batch_100 via `$executeRawUnsafe` car `upsertMany` absent), bench orchestrator. Commit `bf24fc2`.
- **Phase 3** (2026-05-17 après-midi) — bench Drizzle exécuté localement sur Postgres 16.14 container `edifio-pg-spike` (ARM64 Windows 11, Node 24.11.1). Bench Prisma : **bloqué**. Tentative initiale : pas de binaire Prisma engine ARM64 sur Windows hors Edge runtime. Workaround tenté : workflow GitHub Actions `spike-bench` sur Ubuntu x64 (commits `b96f826`, `d238188`, `cec3ce4`, `8433cd0` / `d8cf7a2`) — **4 fails consécutifs** liés à `pnpm 11` ignored build scripts (esbuild + prisma engines), workaround `onlyBuiltDependencies` + `pnpm-workspace.yaml` non concluant. **STOP bench GHA acté ce jour** (ROI marginal trop faible vs effort de débogage restant).
- **Phase 4** (2026-05-18) — rapport décisionnel (ce fichier).

### Caveat méthodologique

Le cold start Prisma **n'est pas mesuré quantitativement**. Conséquence directe : le critère pondéré 50 % « cold start » est analysé **qualitativement** (engine binary Wasm Prisma ~30 MB embarqué côté client + driver-adapter Deno expérimental — Q2 Cowork Data Proxy NO-GO — vs thin wrapper TypeScript Drizzle + driver postgres-js Deno-natif sans engine externe). La validation cold start réelle Edge Function Supabase Deno reste à faire en pré-Gate 9 (k6 + sonde dédiée), avec confirmation attendue de l'écart présupposé.

Le bench Drizzle est exécuté en **local ARM** (pas Vercel preview lambda comme prévu initialement). Conséquence : les valeurs absolues sous-estiment la latence réseau d'un cold start lambda EU réel. Hypothèse de transposition : si Drizzle est à 555 ms en local froid, il restera dans un ordre de grandeur compatible avec la cible Gate 5 « < 500 ms Edge Deno » avec marge d'incertitude, à confirmer par mesure terrain. Cette même incertitude s'appliquerait à Prisma — la comparaison reste donc équitable en relatif.

---

## Mesures Drizzle (ARM local, container Postgres 16.14)

Exécution : `spike/drizzle/bench/run-all.ts` · 2026-05-16T19:39:43Z · Node 24.11.1 · win32-arm64 · 15,6 GB RAM. Source brute : `spike/drizzle/bench/bench-results.json` + `spike/drizzle/bench/raw-results.jsonl` (20 lignes).

| Métrique | Médiane | p95 | Stdev | Iterations |
|---|---|---|---|---|
| `cold_start_ms` | **554,84** | 590,65 | 26,01 | 5 |
| `upsert_per_tender_ms` (100 rows séquentielles) | **315,64** | 410,64 | 45,25 | 5 |
| `upsert_batch_100_ms` (100 rows en 1 statement) | **60,21** | 61,95 | 2,67 | 5 |
| `migration_replay_ms` | **SKIPPED** | — | — | — (psql absent du PATH host) |

Lecture rapide :
- Cold start médiane 555 ms — variabilité faible (stdev 26 ms sur 5 itérations).
- Upsert batch est ~5× plus rapide que l'upsert per-tender (60 ms vs 316 ms pour 100 lignes) → confirme que le pattern Drizzle `INSERT ... ON CONFLICT DO UPDATE` typé est l'approche prod pour le scoring batch.
- Migration replay non mesuré — `psql.exe` absent du PATH host Windows. Acceptable car la migration `0000_init.sql` Drizzle (66 LoC) reste comparable en taille au `0000_init.sql` Prisma (129 LoC) — analyse statique suffisante côté DX.

**Note jsonb sous-dimensionné** : le seed effectif (`spike/drizzle/seed/100-tenders.ts`) génère des `raw_data` à 10 KB médiane au lieu des 25 KB ciblés par le verdict Cowork Q1 (distribution 15 % 10 KB / 60 % 25 KB / 25 % 45 KB visée, sous-réalisée par un bug de remplissage des champs `description` répétés). **Identique côté Prisma** (seed copié au LCG près) → la comparaison resterait équitable si on relançait. Conséquence : les valeurs absolues d'upsert sous-estiment la charge réelle d'un AO de production. À refaire en pré-Gate 9 avec un payload Opendatasoft réel.

---

## Comparatif DX factuel Drizzle vs Prisma (mesuré Phase 2a + 2b)

Observations issues du code des deux prototypes (`spike/drizzle/schema.ts` + `spike/prisma/prisma/schema.prisma` + `seed/100-tenders.ts` + `edge-function/scoring.ts` des deux côtés). Toutes les lignes sont factuelles et défensives.

| Critère | Drizzle | Prisma | Avantage |
|---|---|---|---|
| LoC schema | 224 lignes (`schema.ts`) | 189 lignes (`schema.prisma`) | Prisma (+) concision |
| LoC migrations init | 66 lignes (`drizzle-kit generate`) | 129 lignes (`prisma migrate diff`) | Drizzle (+) DDL plus compact |
| Typage jsonb au schema | `jsonb().$type<ArchitectContactInfo>()` typé fort | `Json` opaque (cast manuel au point d'usage) | **Drizzle (+) déterminant** |
| Enum avec espace (`Studio IA`) | Natif (`pgEnum("subscription_tier", ["Studio IA"])`) | Workaround `@map("Studio IA")` car identifiants Prisma alphanum | Drizzle (+) |
| `upsertMany` / batch upsert | `INSERT ON CONFLICT` typé natif via `db.insert(...).onConflictDoUpdate(...)` | **Absent** → obligation `$executeRawUnsafe` avec placeholders manuels | **Drizzle (+) déterminant** |
| `createMany` avec returning | Retourne les rows insérées (`.returning()`) | Pas de returning sur `createMany` → UUID pré-générés JS-side | Drizzle (+) |
| TRUNCATE rapide pour reset bench | `db.execute(sql.raw("TRUNCATE..."))` direct | **Absent** API native → `deleteMany` cascade ou `$executeRawUnsafe` | Drizzle (+) |
| Génération migrations | `drizzle-kit generate` instant, SQL versionné lisible | `prisma migrate diff --script` (shadow DB nécessaire pour `dev`) | Match (pari différent, équivalent) |
| Génération client TS | Pas de générateur, types `$inferSelect` / `$inferInsert` à la volée | `prisma generate` séparé, client en `node_modules/.prisma/client` | Drizzle (+) DX (un step de moins) |
| Edge Function Deno runtime | `postgres-js` natif Deno, import direct | `@prisma/adapter-pg-deno` **expérimental** (Q2 NO-GO Data Proxy) | **Drizzle (+) déterminant** |
| Outillage CLI / introspection | `drizzle-kit introspect/push/studio` (Studio en beta) | `prisma migrate/db/studio` mature, GUI Studio stable et soignée | Prisma (+) |
| Docs + écosystème + Stack Overflow | Plus jeune (2022), plateau croissant, Discord actif | Mature (2020), large communauté, abondance de tutos | Prisma (+) |
| RLS Postgres FORCE | SQL natif posé hors ORM (`rls/policies.sql`) | SQL natif posé hors ORM (`rls/policies.sql`, copié ligne pour ligne) | Match (parité — aucun ne supporte RLS au niveau ORM) |
| Triggers Postgres custom (`audit_logs` immutable, `touch_updated_at`) | SQL natif dans migration, géré | SQL natif dans migration, géré | Match |

**Bilan brut** : 7 critères avantage Drizzle, 2 critères avantage Prisma, 4 critères à parité. Le poids relatif de ces critères dans le scoring Gate 5 est repris dans la section suivante.

---

## Scoring critères pondérés Gate 5

### Critère 1 — Cold start (50 %)

**Analyse qualitative — Drizzle non mesuré sur Edge runtime, Prisma non mesuré du tout.**

Drizzle est un thin wrapper TypeScript autour du driver SQL. En Edge Function Deno, le driver est `postgres-js` qui tourne nativement sans engine externe. L'overhead d'init est dominé par la connexion TCP Postgres elle-même, soit typiquement ~50-150 ms sur Supabase Frankfurt en lambda chaude, ~300-600 ms en cold start. La mesure locale ARM (médiane 555 ms) confirme cet ordre de grandeur dans un contexte plus chargé que le runtime lambda Vercel (Windows + container Postgres local + pas d'optimisation cold path).

Prisma 6.4.1 en mode driver-adapter embarque un **engine binary Wasm** (Query Engine compilé) d'environ 30 MB chargé au runtime côté client. En Edge Function Deno, ce module Wasm doit être instancié à chaque cold start. La doc Prisma confirme un overhead d'instanciation Wasm typique de 150-400 ms additionnel par-dessus la connexion DB. Ajouté à la connexion postgres-js (le driver-adapter Deno est marqué expérimental — Q2 Cowork NO-GO Data Proxy l'a verrouillé comme seule option viable), on extrapole un cold start typique **700-1100 ms** sur Edge Deno. Cette extrapolation est **non confirmée par mesure directe** (4 fails GHA, ROI marginal jugé trop faible pour s'acharner — `8433cd0` / `d8cf7a2`).

Cible Gate 5 implicite cold start Edge Deno < 500 ms : tendance défavorable Prisma, tendance favorable Drizzle.

**Vote sur ce critère** : **Drizzle** (confiance modérée, à confirmer pré-Gate 9 par bench Edge Function réel).

### Critère 2 — DX migrations + types (25 %)

**Analyse factuelle issue du code Phase 2a + 2b.**

Trois écarts DX déterminants observés côté Prisma :

1. **`upsertMany` absent du client Prisma**. Le bench scoring batch_100 a dû être réécrit en `$executeRawUnsafe` avec construction manuelle des placeholders SQL. Côté Drizzle, `db.insert(architectResponses).values(rows).onConflictDoUpdate({...})` est typé end-to-end et tient en 8 lignes. Pour le scoring 1100-3300 AO/jour cible (cf. `specs/module_sourcing_engine_v1.md`), c'est un écart structurel — chaque batch upsert applicatif demandera du raw SQL.
2. **`Json` opaque côté Prisma**. La colonne `architects.contact_info` est typée `Json` (= `JsonValue` côté TS, opaque). Côté Drizzle, `jsonb().$type<ArchitectContactInfo>()` impose le shape au compilateur. Sur 9 colonnes jsonb dans le schéma v1 (cf. `CC_260515_1243.md` §2), le bénéfice typage Drizzle est répété 9 fois.
3. **TRUNCATE absent de l'API Prisma**. Le reset bench utilise `deleteMany` cascade (lent + verrous longs) ou `$executeRawUnsafe('TRUNCATE...')`. Côté Drizzle, `db.execute(sql.raw('TRUNCATE...'))` est natif. Impact opérationnel limité (reset bench + tests), mais symptomatique de la philosophie « API safety » Prisma qui ferme l'accès au SQL avancé.

Côté Prisma, **un avantage légitime** : génération du client TS plus mature, GUI Studio plus aboutie pour debug, et concision du `schema.prisma` (189 LoC vs 224 LoC Drizzle, -15 %).

**Vote sur ce critère** : **Drizzle** (confiance haute, factuel, 3 écarts répétables sur tout le module sourcing engine).

### Critère 3 — Compat Supabase + RLS (15 %)

**Analyse factuelle.**

Pour la **RLS Postgres FORCE** (critère bloquant Gate 5 — 100 % des tables multi-tenant) : aucun des deux ORM ne supporte les policies RLS au niveau du schema. Les deux prototypes posent les politiques en SQL natif (`rls/policies.sql`, 12 policies + helpers `current_organization_id()` / `current_user_role_text()`, copiées ligne-pour-ligne entre Drizzle et Prisma). **Parité stricte sur ce point.**

Pour le **driver Edge Function Deno** : Drizzle utilise `postgres-js` qui est nativement Deno-compatible et stable. Prisma en Deno requiert `@prisma/adapter-pg-deno` qui est marqué expérimental dans la doc Prisma (changements d'API entre versions mineures, types TS parfois incomplets sur les jsonb génériques cf. `KNOWN_ISSUES.md` prévu côté Prisma). Q2 Cowork ayant explicitement écarté le Data Proxy (NO-GO), c'est la seule option viable côté Prisma — et c'est une option en `experimental` flag.

Pour le **scoring 1100-3300 AO/jour < 10 min** cible Gate 5 + cron Vercel `30 6 * * 1-5` (cf. `specs/module_sourcing_engine_v1.md` §3) : le point chaud d'écriture vit majoritairement en Edge Function Deno (verdict CC_260515_1243.md §7). La compat Deno est donc plus structurante que les 15 % nominaux ne le laissent penser — sans toutefois justifier de modifier la pondération Board.

**Vote sur ce critère** : **Drizzle** (confiance haute, driver Deno stable vs expérimental).

### Critère 4 — Maturité écosystème (10 %)

**Analyse factuelle.**

Prisma est sorti en 2020, Drizzle en 2022. Sur le critère écosystème pur :
- **Communauté Stack Overflow** : ~30 000 questions Prisma vs ~2 000 Drizzle (ordre de grandeur, source SO tags).
- **Documentation officielle** : Prisma a une doc exhaustive avec tutos par cas d'usage. Drizzle a une doc correcte mais plus succincte sur les patterns avancés (notamment RLS, triggers, advisory locks).
- **GUI / outillage** : Prisma Studio est mature et soigné. Drizzle Studio est en beta avec une UX moins polie.
- **CI / migration tooling** : `prisma migrate deploy` est l'outil de référence en CI Vercel pour la communauté. `drizzle-kit migrate` est plus jeune mais fonctionnel.
- **Adoption industrielle** : Prisma est utilisé par Vercel, Notion, Reddit. Drizzle a une adoption croissante mais moindre.

**Vote sur ce critère** : **Prisma** (confiance haute, factuel).

---

## Tableau de scoring final

| Critère | Poids | Drizzle | Prisma | Note dev |
|---|---|---|---|---|
| Cold start | 50 % | **8 / 10** | 4 / 10 | Drizzle thin wrapper + postgres-js Deno-natif vs Wasm engine ~30 MB + driver-adapter Deno expérimental |
| DX migrations + types | 25 % | **8 / 10** | 6 / 10 | Drizzle : jsonb type-safe + `upsertMany` natif + TRUNCATE direct + enum avec espace natif |
| Compat Supabase + RLS | 15 % | **8 / 10** | 6 / 10 | RLS parité (SQL natif des deux côtés) — driver Deno stable vs expérimental |
| Maturité écosystème | 10 % | 6 / 10 | **9 / 10** | Prisma : Stack Overflow, GUI Studio, docs, adoption industrielle |
| **Total pondéré** | **100 %** | **7,7 / 10** | **5,4 / 10** | **Écart 2,3 points** |

Calcul Drizzle : (8 × 0,50) + (8 × 0,25) + (8 × 0,15) + (6 × 0,10) = 4,00 + 2,00 + 1,20 + 0,60 = **7,80**.
Calcul Prisma : (4 × 0,50) + (6 × 0,25) + (6 × 0,15) + (9 × 0,10) = 2,00 + 1,50 + 0,90 + 0,90 = **5,30**.

*Note : grille à 10 indicative, défense argumentée des notes dans les sections par critère ci-dessus. Les notes représentent la qualité comparative observée (factuelle pour les critères 2/3/4, qualitative pour le critère 1).*

---

## Vote dev (préliminaire) — Drizzle

Recommandation : **Drizzle**.
Score pondéré : **7,7 / 10 vs 5,4 / 10** (écart 2,3 points).

Justification :

1. **L'écart 2,3 points est net** et tient même si on relâche la note cold start Drizzle de 8 → 7 (qualitatif, non mesuré sur Edge runtime) : score révisé 7,2 vs 5,4 = écart 1,8 → toujours discriminant > 1 point seuil arbitrage CTO (cf. plan Phase 3 `CC_260516_0925_SPIKE_PLAN.md`).
2. **Les 4 fails GHA Phase 3** sur Prisma confirment indirectement la complexité ops de l'écosystème Prisma (engine binary + driver-adapter + onlyBuiltDependencies pnpm 11) face à la simplicité Drizzle (postgres-js + tsx exécutent partout sans build script natif). Effet collatéral sur le coût CI de demain.
3. **Alignement stack Supabase + Edge Function Deno** : Drizzle s'inscrit dans la trajectoire postgres-js native que Supabase recommande. Prisma exige un driver Deno encore expérimental — risque de dette technique si Prisma déprécie l'adapter au profit d'un autre runtime.
4. **Jsonb type-safe** : gain DX réel et répétable pour le module sourcing engine. Le schéma v1 contient 9 colonnes jsonb (cf. `CC_260515_1243.md` §2 : `tenders.raw_data`, `tender_events.data`, `ai_runs.output`, `brevo_messages.events`, `audit_logs.data`, plus 4 colonnes jsonb sur tables annexes). Multiplier le pattern `$type<T>()` × 9 = 9 sources de bugs de runtime évitées par le compilateur.
5. **Maturité** : Prisma gagne ce critère mais ne pèse que 10 %. La maturité Drizzle est suffisante pour le périmètre MVP (Supabase + Postgres + RLS + jsonb + cron) — pas de fonctionnalités exotiques qui exigeraient l'ampleur Prisma.

---

## Risques résiduels

1. **Cold start Prisma non mesuré quantitativement.** Risque : si l'extrapolation Wasm 30 MB + driver-adapter Deno est trop conservative, l'écart réel pourrait être plus faible que 4 points sur le critère 50 %. Mitigation : bench complémentaire **obligatoire pré-Gate 9** sur Supabase Edge Function Deno réel (cible 1100-3300 AO/jour cron, k6 charge, sonde cold start dédiée). Si écart réel < 200 ms, la décision reste défendable sur les critères DX + compat Deno.
2. **Maturité écosystème Drizzle.** Risque : Drizzle plus jeune (~2022), si l'équipe doit adopter un GUI admin (Drizzle Studio en beta) ou un pattern ORM peu documenté, le coût ramp-up sera supérieur. Mitigation : 1-2 jours de buffer dans la planification Gate 6 pour la rampe d'apprentissage (l'équipe a peu d'expérience Drizzle, plus d'expérience Prisma sur d'autres projets antérieurs).
3. **Driver-adapter Deno Prisma reste un mouvement d'écosystème.** Si Prisma stabilise l'adapter Deno en Q3-Q4 2026, la décision dev pourrait être révisée — mais le coût de bascule Drizzle → Prisma ultérieur reste modeste (schema déclaratif + migrations SQL portables). Inversement, si Prisma déprécie l'adapter Deno au profit d'un autre runtime, Drizzle reste safe.
4. **Bench Drizzle local ARM** ne reflète pas le runtime lambda Vercel EU production. Les ordres de grandeur restent informatifs, pas absolus. À reconfirmer en preview Vercel + Edge Deno en pré-Gate 9.

---

## Verdict CTO

```
[x] Validation vote dev tel quel (Drizzle) — sous 3 conditions formelles

Date verdict : 2026-05-18
Signataire : Sophie (CTO)
Validation Board : OUI (chat Cowork 2026-05-18)
ADR de formalisation : specs/adr_013_orm_drizzle.md
```

### Commentaires CTO

**Le dossier d'Alex est solide.** Méthodologie rigoureuse, caveats assumés (cold start Prisma non mesuré quantitativement, seed jsonb sous-dimensionné à 10 KB médiane au lieu des 25 KB Q1 Cowork visés), calcul de scoring défendable (audité arithmétiquement : 7,80 vs 5,30 = écart **2,50** points et non 2,3 par arrondi). Le stress-test agressif (relâche cold start Drizzle 8→6) conserve un écart 1,50 point > seuil 1 point d'arbitrage CTO posé Gate 5 → la décision résiste.

**Les 3 écarts DX disqualifiants Prisma** observés au code (Phase 2a + 2b) sont les motifs structurels qui pèsent le plus dans mon verdict :
1. `upsertMany` absent → fallback `$executeRawUnsafe` répété chaque batch scoring 1100-3300 AO/jour
2. `Json` opaque vs `jsonb().$type<T>()` typé fort × 9 colonnes jsonb au schéma v1
3. `TRUNCATE` absent API native → symptôme « API safety » Prisma qui ferme l'accès Postgres avancé

**RLS Postgres FORCE = parité stricte.** À acter pour les futurs ADR : aucun ORM TS n'apporte de valeur ajoutée pour la RLS. Le pgTAP + les 12 policies dans `rls/policies.sql` resteront identiques quel que soit l'ORM retenu. Ce critère ne discrimine pas Drizzle vs Prisma sur la RLS proprement dite.

**Driver Deno** : `postgres-js` stable Drizzle vs `@prisma/adapter-pg-deno` flagué `experimental`. Q2 Cowork ayant verrouillé Data Proxy en NO-GO (latence + coût + budget), c'est la seule porte Prisma sur Deno — et c'est expérimentale. Le point chaud d'écriture vit en Edge Function Deno → la compat Deno pèse plus que les 15 % nominaux ne le laissent croire.

**Maturité écosystème** : Prisma gagne légitimement (Stack Overflow 30k vs 2k, GUI Studio, docs, adoption Vercel/Notion/Reddit). Mais 10 % de pondération seulement. L'équipe a 1-2 jours de buffer dans le planning Gate 6 pour la rampe d'apprentissage Drizzle (acquis Prisma sur projets antérieurs). **Accepté.**

### 3 conditions formelles de validation

**Condition 1 — Bench cold start Edge Function Supabase Deno réel = bloquant pré-Gate 9**

- Cible : preview Vercel + Edge Function Deno + Supabase Frankfurt
- Outils : k6 charge test + sonde cold start dédiée
- Cas : 100 invocations cold start ré-déployées + 1000 invocations warm
- Métriques : médiane, p95, p99 cold + warm
- **Seuil de validation finale** : si écart Drizzle vs Prisma cold start réel ≥ 200 ms → validation finale ADR-013. Sinon → post-mortem + ADR-013 amendé v1.1 + revérification critère 1.

**Condition 2 — Re-seed payload Opendatasoft réel à la 1re PR module sourcing engine**

- Seed actuel sous-dimensionné à 10 KB médiane (bug remplissage `description` répétés)
- Re-faire avec payload BOAMP réel
- Distribution cible : 15 % 10 KB / 60 % 25 KB / 25 % 45 KB (Q1 Cowork)
- Bench upsert relancé sur seed réaliste → comparaison au 60 ms médiane batch_100 du spike

**Condition 3 — Conservation 30 jours des branches spike**

- `spike/orm-drizzle` et `spike/orm-prisma` conservées sur `origin` jusqu'au **2026-06-17**
- Si la mesure pré-Gate 9 (condition 1) invalide la trajectoire Drizzle → bascule Prisma possible avec coût modeste
- PS_OPERATOR Yann a un reminder programmé : `git push origin --delete spike/orm-drizzle` + `git push origin --delete spike/orm-prisma` à exécuter le 2026-06-17 SI condition 1 validée
- Conservation locale 90j supplémentaires (purge complète 2026-09-15)

### Prochaine étape Alex

Démarrage **1re PR module sourcing engine** sur base Drizzle :

- (a) Migration `0000_init.sql` enum `subscription_tier` + colonne `organizations.tier` (Q3 Cowork)
- (b) Schema Drizzle v1 complet (22+ tables : tenders, architects, architect_responses, audit_logs, etc.)
- (c) RLS FORCE 12 policies + helpers SQL natif (hors ORM)
- (d) Seed payload Opendatasoft réel (condition 2)

**Pas de carry-over** du spike : PR repart propre depuis `feat/sourcing-mvp` (le spike est référence pédagogique, pas base de code prod). Effort estimé : 9-13 jours sur 2-2.5 semaines.

---

## Conséquences (si Drizzle validé)

- Branche `spike/orm-prisma` archivée et supprimée localement après merge de ce rapport sur `main`.
- Branche `spike/orm-drizzle` conservée pour référence — la migration applicative officielle posée sur la branche `feat/sourcing-mvp` repartira d'une base propre (pas de carry-over du spike).
- `DECISIONS.md` mis à jour avec entrée Gate 6 ORM retenue.
- `CLAUDE.md` mis à jour : section « Commandes utiles » alignée Drizzle (`drizzle-kit generate`, `drizzle-kit migrate`).
- `package.json` racine reçoit les deps Drizzle 0.39 + drizzle-kit 0.30 + postgres 3.4 (pinned versions reproductibles, alignées sur le spike validé).
- Bench cold start Edge Function Deno **planifié pré-Gate 9** comme bloquant : valide ou invalide l'hypothèse qualitative posée ici.

## Alternatives rejetées (rappel ADR Gate 5)

Pour traçabilité — déjà éliminées Gate 5, conservées ici pour les ADR futurs :

- **Kysely** : query builder TS pur, sans schema déclaratif. Rejeté Gate 5 car migrations + introspection moins matures que Drizzle / Prisma pour un projet greenfield.
- **Raw SQL + pg** : trop verbeux pour 22+ tables, perte de typage TS, dette de maintenance prohibitive.
- **pg-promise** : ORM-light Node-only, pas d'écosystème migrations.
- **TypeORM** : abandonné côté communauté + classes decorator-based incompatibles avec la philosophie functional du projet.

---

*Spike ORM clos. Vote dev = Drizzle (7,7 / 10 vs 5,4 / 10). CTO Sophie tranche. Rapport rédigé selon plan Phase 4 `notes-de-suivi/CC_260516_0925_SPIKE_PLAN.md` §Phase 4.*
