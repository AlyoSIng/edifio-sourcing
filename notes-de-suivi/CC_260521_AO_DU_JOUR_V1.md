# PR n°4 — Page `/sourcing/ao-du-jour` V1 read-only

**Date** : 2026-05-21
**Auteur** : Alex (DEV) via Board (Steve)
**Branche** : `feat/sourcing-ao-du-jour-list`
**Référence amont** :
  - `specs/module_sourcing_engine_v1.md` §3.5 + §3.7
  - `design/maquettes/maquettes_v1.html` lignes 173-225 (Maquette 1 mobile + Maquette 2 desktop)
  - `CLAUDE.md` §3 « 1 seule organisation au démarrage : AlyoS »
  - `DECISIONS.md` 2026-05-20 (seed prod minimal + init BDD prod Phase A)

**Statut** : Code livré, tests verts, prête à ouvrir vers `main` (Yann).

---

## Synthèse

Première page applicative consommatrice de la BDD `tenders` peuplée par le cron BOAMP (PR n°3 mergée 2026-05-20). Affiche la liste des AO sourcés du jour pour AlyoS, triés par score décroissant, en V1 strictement **read-only** (aucun bouton d'action câblé).

C'est la première PR qui matérialise visuellement le pipeline `cron → fetch BOAMP → normalize → dedup → filter → score → insert` livré par les PR 1-3.

---

## Scope V1

### Inclus
- Page Server Component `src/app/sourcing/ao-du-jour/page.tsx`
- Helper data lecture `getTendersOfTheDay()` + `getActiveSearchProfileName()`
- Composants `TenderCard` (carte AO) + `EmptyState` (placeholder « aucun AO »)
- Formatage FR (montant euros, deadline jour+mois, date longue)
- Auth check défensif (`createSupabaseServerClient()` + `redirect("/login")`)
- Constante centralisée `ALYOS_ORG_ID` partagée seeds + app
- 2 scénarios E2E (redirect non-auth + page rendue auth)

### Hors scope (PR ultérieures)
- Actions Sélectionner / Différer / Rejeter (PR n°5 avec audit log A4 `tender_select` + transition `selected_solo` / `selected_tandem` via modal Solo/Tandem cf. Maquette 3)
- Filtres / tri interactif (pills mobile Maquette 1 §190-194)
- Vue Kanban groupée par statut (Maquette 2 desktop persona Sandrine)
- Fiche AO détaillée (Maquette 6)
- Pagination (volume cible ≤ 50 AO/jour, `LIMIT 50` suffit en V1)

---

## Décisions techniques structurantes

### 1. Mono-tenancy V1 via constante centralisée

**Décision** : créer `src/lib/constants/organization.ts` qui exporte `ALYOS_ORG_ID` + `ALYOS_ORG_NAME` (UUID stable `11111111-1111-1111-1111-111111111111`), importé en source unique par les seeds (`index.ts`, `prod.ts`) et l'app.

**Justification** :
- Phase MVP 100 % AlyoS interne (CLAUDE.md §3 « 1 seule organisation au démarrage : AlyoS »)
- La table `memberships` n'est **pas peuplée** par l'admin API actuelle (cf. grep `src/app/api/admin/users/route.ts` qui ne crée que `auth.users` + metadata)
- Une lookup `getCurrentOrgId(userId)` via `memberships` est donc impossible côté app au démarrage Phase 2 reportée
- DRY strict : éviter qu'un drift entre seed dev / seed prod / app crée une org « fantôme » impossible à débugger

**Passage Phase 2 multi-tenant documenté en JSDoc** : remplacer par une lookup `memberships(userId)` + peupler `public.users` / `public.memberships` au 1er login via un hook auth Supabase. La constante restera utile comme historique du tenant fondateur AlyoS.

### 2. V1 strictement read-only — pas de stubs d'actions

**Décision** : pas de boutons « Sélectionner » / « Différer » / « Rejeter » sur la `TenderCard`. JSDoc explicite sur le composant pour signaler la PR suivante.

**Justification** :
- Honnêteté UX > stubs morts qui font « rien » au clic
- L'audit log A4 `tender_select` exige un payload typé non trivial (cf. `specs/audit_log_v1.md`) qu'on ne peut pas câbler à la sauvette
- La transition `tenders.status` (sourced → selected_solo / selected_tandem) impose la modal de choix Solo/Tandem (Maquette 3) — packagée naturellement avec la PR n°5

### 3. Filtre tenant explicite dans la SQL — RLS en defense-in-depth

**Décision** : `WHERE tenders.organization_id = $1` explicite dans `getTendersOfTheDay`. La RLS est **active côté DB** (cf. migration `0002_rls.sql`) mais bypassée implicitement par le rôle Postgres `postgres` utilisé par notre client postgres-js (`DATABASE_URL` direct, pas JWT Supabase).

**Justification** : le filtre applicatif est la ligne de défense primaire. RLS reste en defense-in-depth (couverture pgTAP cross-tenant déjà en place).

### 4. Tri `score DESC NULLS LAST, created_at DESC` aligné index partiel

**Décision** : utiliser l'index `idx_tenders_score` `(organization_id, score DESC) WHERE status='sourced'` posé par la migration 0001.

**Conséquence** : la query planner choisit l'index pour la première clé de tri. Le tie-break sur `created_at` se fait en mémoire pour les AO de score égal (volume cible négligeable). `NULLS LAST` exprimé via `sql\`${tenders.score} DESC NULLS LAST\`` car Drizzle 0.39 n'a pas d'helper natif `desc().nullsLast()`.

### 5. Lazy DB client préservé — `next build` env-clean OK

**Décision** : la page importe `db` mais n'invoque `.select()` que dans le corps de la fonction `Page()` async, pas en module-scope. Conséquence : `DATABASE_URL` n'est jamais lu au build, le Proxy lazy reste neutre.

**Vérification** : conforme à la mémoire `feedback_nextjs_build_env_clean.md`.

---

## Fichiers créés

- `src/lib/constants/organization.ts` — constantes `ALYOS_ORG_ID` + `ALYOS_ORG_NAME` partagées seeds + app
- `src/lib/sourcing/queries.ts` — helpers data `getTendersOfTheDay` + `getActiveSearchProfileName`
- `src/lib/sourcing/queries.test.ts` — 5 tests Vitest (mapping, vide, projection, profil null, profil présent)
- `src/app/sourcing/ao-du-jour/page.tsx` — Server Component (auth + data + layout)
- `src/app/sourcing/ao-du-jour/TenderCard.tsx` — composant carte AO (read-only)
- `src/app/sourcing/ao-du-jour/EmptyState.tsx` — composant état vide
- `src/app/sourcing/ao-du-jour/format.ts` — utils `formatAmount` / `formatDeadline` / `formatTodayLongFr`
- `e2e/ao-du-jour.spec.ts` — 2 scénarios Playwright (redirect login + page rendue)
- `notes-de-suivi/CC_260521_AO_DU_JOUR_V1.md` — la présente note

## Fichiers modifiés

- `src/db/seed/index.ts` — import constantes + re-export `ORG_A_ID` / `ORG_A_NAME` (zero impact sémantique, refactor DRY)
- `src/db/seed/prod.ts` — idem (re-export pour préserver `prod.test.ts`)
- `DECISIONS.md` — nouvelle section `2026-05-21 — PR n°4 : page liste AO du jour V1 read-only`

---

## Validations passées

| Vérification | Résultat |
|---|---|
| `pnpm vitest run src/lib/sourcing/queries.test.ts` | À renseigner par run final |
| `pnpm vitest run src/db/seed/prod.test.ts` (régression refactor seeds) | À renseigner par run final |
| `pnpm vitest run src/lib/audit/index.test.ts` (utilise `ORG_A_ID` en dur, vérif non-régression) | À renseigner par run final |
| `pnpm exec tsc --noEmit` (strict, 0 `any`, 0 `@ts-ignore`) | À renseigner par run final |
| E2E `pnpm test:e2e` | Non exécuté (lent + webServer requis — Yann lancera côté CI) |
| `next build` env-clean | Non exécuté (responsabilité Yann avant push, cf. brief Board) |

---

## Prochaine PR identifiée

**PR n°5 — Actions AO du jour (Sélectionner / Différer / Rejeter) + modal Solo/Tandem**

Périmètre :
- Composant `<TenderActionsRow>` côté client (`"use client"`) avec les 3 boutons
- Server Actions : `selectTenderAction(tenderId, mode)`, `deferTenderAction(tenderId)`, `rejectTenderAction(tenderId, reason)`
- Audit log A4 `tender_select` + A4 bis pour `defer` / `reject` (à vérifier que l'enum les couvre, sinon amender la spec `audit_log_v1.md`)
- Transition `tenders.status` : `sourced` → `selected_solo` / `selected_tandem` / `dropped`
- Modal Solo/Tandem (Maquette 3) — composant client `<SelectModeModal>` exposé via dialog shadcn
- E2E S1 : sélectionner un AO en Solo → vérifier qu'il quitte la liste du jour
- E2E S2 : différer un AO → vérifier qu'il reste mais grisé (ou disparaît selon décision UX)

Pré-requis : alignement audit log spec si `tender_defer` / `tender_reject` ne sont pas dans l'enum `audit_action` (à vérifier en ouverture PR n°5).
