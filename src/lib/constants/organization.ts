/**
 * Constantes organisation — edifio Sourcing.
 *
 * ============================================================================
 * MVP MONO-TENANT V1 — source de vérité partagée seeds + app
 * ============================================================================
 *
 * Décision Board (CLAUDE.md §3 « Décisions d'architecture actées 2026-05-10 ») :
 *
 *   « Usage 100 % interne AlyoS Ingénierie. MVP utilisé exclusivement par les
 *     collaborateurs AlyoS. Multi-tenancy SaaS multi-clients reportée en
 *     Phase 2. Le schéma BDD reste multi-tenant (RLS + `organization_id`) pour
 *     préparer l'ouverture sans dette technique. **1 seule organisation au
 *     démarrage : AlyoS.** »
 *
 * Conséquence pratique pour les pages applicatives V1 (`/sourcing/ao-du-jour`,
 * etc.) : on ne dérive PAS l'`organization_id` depuis une lookup `memberships`
 * — la table `memberships` n'est même pas peuplée par l'admin API actuelle
 * (cf. `src/app/api/admin/users/route.ts` qui ne crée que `auth.users` +
 * metadata, pas de ligne dans le `public.users` / `public.memberships`).
 *
 * On centralise donc ici l'UUID stable AlyoS, **identique** à celui posé par
 * les deux seeds (`src/db/seed/index.ts` ORG_A_ID, `src/db/seed/prod.ts`
 * ORG_A_ID). Toute requête applicative qui a besoin du tenant courant
 * importe `ALYOS_ORG_ID` depuis ce module — DRY et auditable.
 *
 * ============================================================================
 * RLS — defense in depth, pas ligne de défense unique
 * ============================================================================
 *
 * Le client Drizzle `src/db/client.ts` se connecte via `DATABASE_URL` direct
 * (rôle Postgres `postgres`), pas via un JWT Supabase. Les policies RLS posées
 * dans `0002_rls.sql` sont DECLARÉES sur 100 % des tables multi-tenant mais
 * sont implicitement bypassées par le rôle `postgres` (sauf si on passe par
 * `auth.uid()` + JWT). Conséquence : **le filtre `WHERE organization_id = $1`
 * est obligatoire et explicite dans la SQL applicative** — c'est notre ligne
 * de défense applicative. RLS reste en defense-in-depth (couverture pgTAP
 * test cross-tenant systematic, cf. `tests/rls/`).
 *
 * ============================================================================
 * Passage Phase 2 multi-tenant (À FAIRE QUAND OUVERTURE SaaS)
 * ============================================================================
 *
 * Au passage Phase 2 multi-tenant :
 *   1. supprimer l'usage de `ALYOS_ORG_ID` dans les pages applicatives ;
 *   2. remplacer par un helper `getCurrentOrgId(userId)` qui fait une lookup
 *      `SELECT organization_id FROM memberships WHERE user_id = $1` (cf.
 *      table `memberships`, déjà en place schéma v1) ;
 *   3. peupler `memberships` au 1er login via un hook auth Supabase (le row
 *      `auth.users` ne suffit pas — il faut bien créer `public.users` +
 *      `public.memberships`) ;
 *   4. router applicatif basé sur l'org (path-based `/o/[slug]/...` ou
 *      session-based selon arbitrage Phase 2).
 *
 * Ce fichier reste utile en Phase 2 comme constante du tenant historique
 * AlyoS — il peut juste ne plus être l'unique source de vérité.
 */

/**
 * UUID stable de l'organisation AlyoS Ingénierie — tenant unique du MVP V1.
 *
 * **Doit rester strictement identique** à :
 *   - `src/db/seed/index.ts` (constante `ORG_A_ID`, ligne ~75)
 *   - `src/db/seed/prod.ts`  (constante `ORG_A_ID`, ligne ~86)
 *
 * Sinon : état incohérent en BDD (seed prod pose une org, l'app cherche une
 * autre org → 0 résultats systématiques sans erreur explicite).
 *
 * @see CLAUDE.md §3 « 1 seule organisation au démarrage : AlyoS »
 * @see DECISIONS.md 2026-05-20 « Périmètre seed prod minimal validé »
 */
export const ALYOS_ORG_ID = "11111111-1111-1111-1111-111111111111" as const;

/**
 * Nom canonique de l'organisation AlyoS — affichable UI sans transformation.
 *
 * **Note encoding** : sans accent (« AlyoS Ingenierie »), pour cohérence avec
 * le seed dev qui n'utilise pas d'accents dans le code source (cf. JSDoc
 * `src/db/seed/index.ts:78`). L'UI peut overrider en affichage si besoin
 * d'accent (« AlyoS Ingénierie » avec « é »).
 */
export const ALYOS_ORG_NAME = "AlyoS Ingenierie" as const;
