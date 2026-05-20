# REQUEST — Prérequis spike ORM Drizzle vs Prisma

**Date** : 2026-05-15 13:00
**De** : Alex (dev) via Board (Steve)
**Pour** : Sophie (CTO), Marc (CEO)
**Référence** : `notes-de-suivi/CC_260515_1243.md` (mémo prérequis détaillé)
**Échéance souhaitée** : avant J+1 si possible (sinon le spike démarre sur hypothèses, rework probable)
**Priorité** : haute — débloque le spike ORM (2 jours Alex)

## Contexte

Le spike ORM Drizzle vs Prisma est cadré Gate 5 (pondération : cold start 50 % · DX migrations+types 25 % · compat Supabase+RLS 15 % · maturité 10 %) sur un prototype `tenders` + `architects` + `architect_responses` avec RLS strict, jsonb et cron Edge Function de scoring 100 AO.

La lecture exhaustive de `specs/module_sourcing_engine_v1.md` et `specs/schema_v1.sql` a remonté 3 inconnues techniques susceptibles de fausser le bench si elles ne sont pas tranchées en amont. Aucune n'a de réponse évidente côté dev — d'où ce handoff.

## Question 1 — Taille moyenne attendue de `tenders.raw_data`

**Pourquoi ça compte** : la spec décrit `raw_data` comme le « payload brut Opendatasoft » sans plafond. Le bench central du spike est un upsert massif (1100-3300 AO/jour, cible < 10 min). Si la taille moyenne du jsonb dépasse un certain seuil, le goulot devient la sérialisation jsonb + I/O Postgres, et non l'ORM. La comparaison Drizzle vs Prisma mesurerait alors du bruit réseau et la pondération « cold start 50 % » perdrait son sens discriminant.

**Ce qu'on demande** : un ordre de grandeur attendu pour `tenders.raw_data` après parsing Odoo XML-RPC + Opendatasoft. Trois buckets suffisent : `< 10 KB` / `10-50 KB` / `> 50 KB`. Une estimation grossière vaut mieux qu'une mesure différée.

**Si `> 50 KB`** : le spike intègrera un test de pression spécifique sur la sérialisation jsonb, et la pondération Gate 5 mérite peut-être un point d'arbitrage Board.

## Question 2 — Statut Cowork sur Prisma Data Proxy en Edge Function Deno

**Pourquoi ça compte** : le point chaud d'écriture (cron de scoring + upsert tenders) vit dans une **Supabase Edge Function Deno**, pas dans une Route Handler Vercel Node. Prisma sur Deno n'a que deux chemins viables aujourd'hui : (a) driver-adapter avec postgres.js, encore marqué expérimental ; (b) Prisma Data Proxy (ex-Accelerate), qui ajoute un hop HTTP en latence et un coût mensuel. Drizzle tourne en Deno-native via postgres.js sans détour.

**Ce qu'on demande** : la position Cowork sur Prisma Data Proxy pour ce MVP interne. Trois statuts possibles, à trancher : **acceptable**, **acceptable sous conditions** (lesquelles), **no-go**. Aucun n'est pré-recommandé côté dev — la question est ouverte.

**Note d'impact** : si « no-go » ou « conditionnel coûteux », il faut le savoir avant le spike pour cadrer correctement le prototype Prisma (driver-adapter expérimental uniquement) et que le bench reste équitable.

## Question 3 — Nature de `tier` dans la logique de scoring IA

**Pourquoi ça compte** : la spec `module_sourcing_engine_v1.md` mentionne un seuil `Tier >= Cotraitance` dans le scoring IA complémentaire, mais `specs/schema_v1.sql` (figé Gate 5) ne contient aucune table `tiers` ni enum `tier`. Trois lectures possibles, indiscernables depuis les seules specs :

- (a) `tier` est un **enum Postgres** non encore posé en schéma v1, valeurs incluant `Cotraitance`
- (b) c'est une **vraie table** `tiers` (référentiel architectes premium) qui doit être pré-créée avant le spike
- (c) c'est **hors-scope MVP**, la logique sera mockée en Phase 1

**Ce qu'on demande** : laquelle des trois lectures est la bonne ?

**Si (b)** : la table doit être pré-posée (schéma + RLS + seed) avant le spike, sinon les prototypes Drizzle et Prisma ne porteront pas le même modèle et le bench sera incomparable.

## Décisions attendues

- [ ] Réponse Q1 — ordre de grandeur `tenders.raw_data` (< 10 KB / 10-50 KB / > 50 KB)
- [ ] Réponse Q2 — Prisma Data Proxy : acceptable / conditionnel / no-go
- [ ] Réponse Q3 — `tier` : enum / table / mock

Format de réponse libre. Ajouter une section `## Décisions Cowork` à la fin de ce fichier suffit. Alex enchaîne sur le spike dès que les 3 décisions sont posées.

---

*Handoff rédigé selon CLAUDE.md règle 4. Confirmation au Board postée côté chat Claude Code en parallèle.*
