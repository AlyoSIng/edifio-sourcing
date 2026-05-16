# Spike ORM Drizzle vs Prisma — Plan détaillé Phases 2 à 4

**Date** : 2026-05-16 09:25
**Auteur** : Alex (DEV)
**Phase courante** : Phase 1 (bootstrap) — exécutée en parallèle
**Référence amont** : `handoff/ANSWER_260515_1430_PREREQ_SPIKE_ORM.md` (verdicts Cowork sur les 3 prérequis Q1/Q2/Q3) + `notes-de-suivi/CC_260515_1243.md` (mémo prérequis initial Alex)
**Cadre Gate 5** : pondération `cold start 50 % · DX migrations+types 25 % · compat Supabase+RLS 15 % · maturité 10 %` (DECISIONS.md 2026-05-07 G5 Arbitrage 3)

---

## Synthèse exécutive

Phase 1 (aujourd'hui) : 2 branches `spike/orm-drizzle` et `spike/orm-prisma` créées depuis `origin/main@a9126a3`. Fichier de référence `spike/schema_subscription_tier.sql` posé (enum + ALTER organizations). Aucun prototype installé, aucune dépendance npm/pnpm ajoutée.

Phases 2 à 4 : ~12 à 16 h de travail effectif réparties sur **2 jours pleins** (J+1 Drizzle + bench partiel, J+2 Prisma + bench complet + rapport). Estimation initiale du mémo prérequis (CC_260515_1243.md) : 16 h. Estimation révisée : **13-15 h** une fois les 3 prérequis Cowork tranchés (gain ~1-3 h sur l'incertitude qui justifiait le handoff).

---

## Phase 2a — Prototype Drizzle (~4 à 6 h)

### Stratégie de placement

**Branche** : `spike/orm-drizzle` (déjà créée depuis `origin/main`, ref `a9126a3`).
**Structure** : sous-dossier dédié `spike/drizzle/` à la racine du repo, **pas** dans `src/`. Justification :
- Le spike est par essence jetable (un seul des deux dossiers survivra à la décision ORM).
- Placer sous `src/` impose des contraintes TypeScript projet (tsconfig path aliases, lint, build Next.js) qui ne servent pas au bench.
- L'isolation `spike/drizzle/` permet un `pnpm install` local indépendant du `package.json` racine, ce qui respecte la consigne « pas d'installation pnpm au niveau racine » et évite la pollution du `pnpm-lock.yaml` projet.

Arborescence cible :

```
spike/drizzle/
  package.json            # workspace isolé, scripts dédiés
  tsconfig.json
  drizzle.config.ts
  schema.ts               # tenders + architects + architect_responses + organizations
  migrations/0000_init.sql
  migrations/0001_subscription_tier.sql  # reprise du spike/schema_subscription_tier.sql
  rls/policies.sql
  seed/seed_100_tenders.ts
  bench/cold_start.ts
  bench/upsert.ts
  bench/scoring.ts
  edge-function/scoring.ts
  README.md               # méthodo + comment relancer
```

### Versions pinnées

À pinner explicitement dans `package.json` pour garantir reproductibilité :

- `drizzle-orm@^0.39` (dernière minor stable Q1 2026)
- `drizzle-kit@^0.30` (génération migrations + introspect)
- `postgres@^3.4` (driver postgres.js — compat Deno + Node)
- `typescript@5.6` (aligné projet racine)
- `tsx@^4.19` (exécution scripts bench)
- `dotenv@^16.4` (chargement `.env.local`)

### Étapes Phase 2a (séquentielles)

1. **Init workspace** : `pnpm init` dans `spike/drizzle/`, ajout des deps ci-dessus. ~15 min.
2. **Schema TS** : porter en `schema.ts` les 4 tables (`organizations`, `tenders`, `architects`, `architect_responses`) depuis `specs/schema_v1.sql`. Inclure jsonb columns (`raw_data` 10-50 KB conformément verdict Q1), enum `subscription_tier` (Q3). ~45 min.
3. **Migrations** : `drizzle-kit generate` pour produire `0000_init.sql`, puis ajouter manuellement le DDL `subscription_tier` depuis `spike/schema_subscription_tier.sql`. **Mesure : durée de génération.** ~30 min.
4. **RLS** : poser policies `FORCE ROW LEVEL SECURITY` + politiques par `organization_id` (helpers `current_user_org_id()` repris de schema_v1.sql §3). Test pgTAP isolé `architect_responses` cross-tenant. ~45 min.
5. **Seed 100 AO** : générateur TS qui peuple `tenders` avec 100 lignes, `raw_data` jsonb réaliste 10-50 KB (bucket Q1) — utiliser un échantillon Opendatasoft sauvegardé en fixture. ~30 min.
6. **Cron Edge Function scoring** : Supabase Edge Function Deno, postgres.js direct (Drizzle est Deno-native via postgres.js). Score = règle simple sur 5 critères tenders × architects. ~45 min.
7. **Instrumentation bench** : `bench/cold_start.ts` mesure le temps init du client Drizzle (premier query après froid), `bench/upsert.ts` mesure latence p50/p95 sur 100 upserts séquentiels, `bench/scoring.ts` mesure durée totale du scoring sur 100 AO. ~45 min.

### Mesures à capturer

Toutes les mesures sont à exécuter **3 fois minimum** (médiane retenue, p95 reporté).

| Métrique | Unité | Cible info | Pondération Gate 5 |
|---|---|---|---|
| Cold start (Edge Function Deno, premier query) | ms | < 500 | 50 % |
| Cold start (Vercel Node Route Handler, premier query) | ms | < 300 | 50 % |
| Latence upsert single row (chaud) | ms p50 / p95 | informatif | 50 % (rattaché cold start élargi) |
| Durée scoring 100 AO (bout-en-bout) | s | < 60 | 50 % |
| Durée `drizzle-kit generate` | ms | informatif | 25 % (DX) |
| LoC `schema.ts` | count | informatif | 25 % (DX) |
| LoC migrations RLS | count | informatif | 15 % (compat) |
| Types TS générés (présence, exactitude jsonb, enum) | qualitatif | excellent attendu | 25 % (DX) |
| Compat RLS FORCE (test cross-tenant rouge attendu) | bool | passé | 15 % |
| Maturité écosystème (issues GitHub ouvertes ORM, dernier release) | qualitatif | informatif | 10 % |

---

## Phase 2b — Prototype Prisma (~4 à 6 h)

### Stratégie de placement

**Branche** : `spike/orm-prisma` (déjà créée depuis `origin/main`, ref `a9126a3`).
**Structure** : `spike/prisma/` symétrique au Drizzle. Même justification d'isolement.

Arborescence cible :

```
spike/prisma/
  package.json
  tsconfig.json
  prisma/schema.prisma
  prisma/migrations/20260516_init/migration.sql
  prisma/migrations/20260516_subscription_tier/migration.sql
  rls/policies.sql                   # appliqué hors Prisma (RLS non géré nativement)
  seed/seed_100_tenders.ts
  bench/cold_start.ts
  bench/upsert.ts
  bench/scoring.ts
  edge-function/scoring.ts
  README.md
  KNOWN_ISSUES.md                    # driver-adapter Deno : limitations rencontrées
```

### Versions pinnées

- `prisma@^6.0` + `@prisma/client@^6.0` (Q1 2026 stable)
- `@prisma/adapter-pg@^6.0` (driver-adapter PostgreSQL pour Node)
- `@prisma/driver-adapter-utils@^6.0` (helpers Deno expérimental)
- `pg@^8.13` (driver bas niveau côté Node)
- `postgres@^3.4` (pour le côté Deno Edge Function, comme Drizzle)
- `typescript@5.6` (identique Drizzle)
- `tsx@^4.19`
- `dotenv@^16.4`

### Contrainte Q2 (verdict Cowork)

**Prisma Data Proxy : NO-GO.** Le prototype Prisma s'exécute **exclusivement** via `driver-adapter` :
- Côté Node (Vercel Route Handler) : `@prisma/adapter-pg` stable.
- Côté Deno (Supabase Edge Function) : driver-adapter `postgres.js` marqué expérimental dans la doc Prisma. Le handicap structurel est **assumé** par le Board pour garantir un bench équitable (pas de Data Proxy qui changerait la nature des mesures de cold start).

### Risques DX anticipés

1. **Driver-adapter Deno encore expérimental** → API susceptible de changer entre versions mineures, types TS parfois incomplets sur les jsonb génériques. Documenter chaque écart dans `spike/prisma/KNOWN_ISSUES.md`.
2. **RLS non géré nativement par Prisma** → policies SQL appliquées **hors Prisma** (script `psql` ou Supabase SQL editor). Identique à Drizzle (qui ne gère pas RLS non plus côté ORM), mais à mentionner explicitement dans le rapport pour ne pas pénaliser à tort un des deux.
3. **`prisma migrate dev` vs `prisma migrate deploy`** : seul `deploy` est viable en CI Vercel (pas d'environnement interactif). Le bench DX se fera sur `migrate deploy` exclusivement.
4. **Type `jsonb` Prisma → `JsonValue` (untyped)** vs Drizzle (`$type<...>()` permet de spécifier le shape TS). Critère DX migrations+types (25 %).

### Étapes Phase 2b (séquentielles)

Identiques à Phase 2a, adaptées Prisma. ~15 min plus longues sur le total à cause du tooling Prisma plus verbeux (génération client séparée).

### Mesures à capturer

Identiques au tableau Phase 2a. Reportées dans la même grille comparative en Phase 3.

---

## Phase 3 — Bench (~2 h)

### Méthodologie

1. **Itérations** : 5 cold starts par environnement (Vercel preview + local), 100 upserts par run, 3 runs scoring complets. **Médiane** retenue comme valeur principale, **p95** reporté comme indicateur de queue.
2. **Environnement Vercel preview** :
   - Branche dédiée `bench/run-NNN` créée temporairement pour déclencher des previews jetables.
   - Chaque mesure de cold start = nouveau deploy preview (force le cold init de la lambda).
   - Pas de bench en `--prod` (verrouillé CLAUDE.md).
3. **Environnement local** : `pnpm dev` Next.js + Supabase local CLI. Sert de référence stable (pas de variabilité réseau).
4. **Isolation** : Drizzle et Prisma exécutés sur **bases Supabase séparées** (deux projets preview) pour éviter toute pollution croisée d'index, vacuum, statistiques.
5. **Scripts** : `spike/bench/run-all.ts` au niveau du `spike/` racine, qui invoque les deux sous-dossiers et produit un CSV `bench-results-260518.csv`.

### Tableau de scoring final

À produire en sortie de Phase 3, format attendu :

| Critère | Pondération | Drizzle (valeur) | Drizzle (note /10) | Prisma (valeur) | Prisma (note /10) |
|---|---|---|---|---|---|
| Cold start (médiane Vercel preview) | 50 % | … ms | … | … ms | … |
| DX migrations + types | 25 % | qualitatif + LoC | … | qualitatif + LoC | … |
| Compat Supabase + RLS | 15 % | passe / écueils | … | passe / écueils | … |
| Maturité écosystème | 10 % | qualitatif | … | qualitatif | … |
| **Total pondéré** | 100 % | | **… /10** | | **… /10** |

Note finale = somme pondérée. Écart < 0,5 point = à arbitrage CTO (le bench n'est pas discriminant). Écart > 1 point = verdict bench clair.

---

## Phase 4 — Rapport et décision (~1 h)

### Structure du document de gate

Fichier cible : `gates/06_ORM/DECISION_ORM_260518.md` (date prévisionnelle, ajustable si bench prend du retard).

Sections :

1. **Contexte** — rappel Gate 5 Arbitrage 3, pondération imposée, 3 prérequis Cowork tranchés.
2. **Méthodologie** — environnements, itérations, scripts, biais connus.
3. **Résultats** — tableau de scoring final + graphiques (cold start distribution box plot).
4. **Analyse qualitative** — DX migrations, qualité types TS, expérience Deno, robustesse RLS.
5. **Vote dev** — recommandation Alex avec score pondéré et justification écrite. **1 ORM recommandé, l'autre éliminé.**
6. **Verdict CTO** — section à remplir par Sophie après lecture du rapport.
7. **Conséquences** — actions à enchaîner après décision (suppression de la branche perdante, démarrage migration applicative officielle, mise à jour `DECISIONS.md`, mise à jour CLAUDE.md sur le tooling retenu).
8. **Alternatives rejetées** — Kysely, raw SQL, pg-promise (déjà éliminés Gate 5 mais référencés pour traçabilité ADR).

### Format vote dev + verdict CTO

```markdown
## Vote dev (Alex)

Recommandation : **[Drizzle | Prisma]**
Score pondéré : X,Y / 10 vs Z,W / 10
Justification (3 à 5 lignes) : …

## Verdict CTO (Sophie)

[ ] Validation vote dev tel quel
[ ] Validation avec réserve : …
[ ] Désaccord — arbitrage Board demandé via `handoff/REQUEST_…`

Date verdict : 2026-05-…
```

### Mise à jour DECISIONS.md

Entrée à ajouter en sortie de Gate 6 :

```
- **2026-05-18 · G6 · CTO Sophie · ORM retenu = [X].** [BOARD-OK si désaccord, sinon DÉCISION CTO]
  *Spike 2 jours [DEV Alex]. Score Gate 5 : … vs … Conséquences : migration officielle posée sur la branche `feat/sourcing-mvp`, branche `spike/orm-[Y]` archivée et supprimée localement après merge du DECISION_ORM_260518.md sur main.*
```

---

## Garde-fous transverses (rappels)

1. **Aucune migration applicative committée** sur `src/db/migrations/`, `drizzle/`, ou `prisma/migrations/` au niveau du package racine tant que la décision ORM n'est pas tranchée. Les migrations vivent dans `spike/drizzle/` et `spike/prisma/` (isolées, jetables). CLAUDE.md règle stricte.
2. **Pas de `pnpm install` sur le `package.json` racine** durant le spike. Toutes les deps spike sont dans `spike/drizzle/package.json` et `spike/prisma/package.json`.
3. **Pas de `--prod` Vercel** (verrouillé `.claude/settings.local.json`).
4. **Yann** commit et push toutes les modifications du spike. Alex prépare le code et le staging, ouvre les PR via demande à Yann.
5. **Notification au Board** à chaque transition de phase (fin Phase 2a → message « prototype Drizzle prêt », fin Phase 2b → idem, fin Phase 3 → CSV bench disponible, fin Phase 4 → rapport posé).

---

## Estimation totale révisée

| Phase | Estimation initiale (CC_260515_1243.md) | Estimation révisée (post-verdicts Cowork) | Delta |
|---|---|---|---|
| Phase 1 — bootstrap | ~1 h | ~45 min | -15 min (Q3 tranché, pas d'allers-retours) |
| Phase 2a — Drizzle | ~5 h | ~4-5 h | stable |
| Phase 2b — Prisma | ~5 h | ~4-5 h | stable (Q2 tranché évite l'option Data Proxy, gain ~30 min) |
| Phase 3 — bench | ~3 h | ~2 h | -1 h (Q1 10-50 KB stable, pas de test de pression jsonb additionnel) |
| Phase 4 — rapport | ~2 h | ~1 h | -1 h (structure pré-définie ci-dessus) |
| **Total** | **~16 h** | **~12-14 h** | **gain ~2-4 h** |

Calendrier prévisionnel :
- **2026-05-16 (J)** : Phase 1 close + démarrage Phase 2a si OK Board.
- **2026-05-17 (J+1)** : Phase 2a finie + Phase 2b en cours.
- **2026-05-18 (J+2)** : Phase 2b finie + Phase 3 bench + Phase 4 rapport. Verdict CTO en fin de journée.

---

*Mémo rédigé selon CLAUDE.md workflow standard étape 3 (plan court avant exécution). Pas de Phase 2 lancée aujourd'hui — STOP après Phase 1 conformément au brief Board.*
