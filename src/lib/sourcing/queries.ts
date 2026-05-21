/**
 * Helpers data lecture seule — AO du jour + profil de recherche actif.
 *
 * Source de vérité :
 *  - `specs/module_sourcing_engine_v1.md` §3.5 (filter) + §3.7 (insert tenders)
 *  - `src/db/schema/tenders.ts` (index partiel `idx_tenders_score`
 *     `(organization_id, score DESC) WHERE status='sourced'`)
 *  - `src/db/schema/config.ts` (table `search_profiles`)
 *
 * ----------------------------------------------------------------------------
 * Périmètre V1 read-only (PR n°4 — branche `feat/sourcing-ao-du-jour-list`)
 * ----------------------------------------------------------------------------
 * Ce module n'expose **que des fonctions de lecture**. La PR n°5 (actions
 * Sélectionner / Différer / Rejeter) ajoutera les helpers de transition
 * `tenders.status` couplés à l'audit log A4 `tender_select`.
 *
 * Filtre tenant : **explicite et obligatoire** via paramètre `organizationId`.
 * Le client Drizzle (`src/db/client.ts`) ouvre la connexion avec le rôle
 * Postgres `postgres` qui bypass implicitement les policies RLS non-FORCE —
 * cette ligne de défense applicative est donc critique. RLS reste en
 * defense-in-depth (tests pgTAP couvrent le cross-tenant).
 *
 * Le helper `db` est un Proxy lazy : tant qu'aucune méthode `.select`/`.insert`
 * n'est appelée, `DATABASE_URL` n'est pas lu (cf. JSDoc `src/db/client.ts`).
 * Conséquence pour cette PR : la page `/sourcing/ao-du-jour` peut importer
 * `getTendersOfTheDay` au top-level sans casser `next build` env-clean —
 * l'évaluation `DATABASE_URL` survient uniquement quand le Server Component
 * `Page()` appelle effectivement le helper.
 */

import { and, asc, desc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";

import type { db as defaultDb } from "@/db/client";
import { platforms, searchProfiles } from "@/db/schema/config";
import { tenders } from "@/db/schema/tenders";

import type { PlatformCode } from "./types";

/** Type minimal du client Drizzle exposé (mock-friendly côté tests). */
export type DrizzleClient = typeof defaultDb;

// ============================================================================
// 1. Type de retour public — projection narrow pour la page UI
// ============================================================================

/**
 * Projection d'un AO « du jour » pour affichage dans la liste read-only.
 *
 * Choix typage :
 *  - `amount` / `score` exposés en `string | null` (sortie brute Drizzle pour
 *    `numeric` Postgres — l'UI les formate via `Intl.NumberFormat` côté
 *    composant). Pas de coercion `Number(...)` ici pour préserver la précision
 *    décimale (BPU avec centimes, scoring 2 décimales).
 *  - `deadline` en `Date | null` (timestamp with time zone Postgres → `Date`
 *    via postgres-js + Drizzle).
 *  - `cpv` en `string[]` — toujours présent (default array vide DB), donc pas
 *    de `null`.
 *  - `platformCode` typé `PlatformCode` (enum strict) — la jointure avec
 *    `platforms` garantit qu'on récupère bien une des 4 valeurs seedées.
 *  - `externalRef` exposé pour traçabilité UI (affichage en font-mono)
 *    + futur lien deep vers la plateforme source.
 */
export interface TenderOfTheDay {
  id: string;
  title: string;
  buyer: string;
  amount: string | null;
  deadline: Date | null;
  cpv: string[];
  score: string | null;
  platformCode: PlatformCode;
  externalRef: string;
  /**
   * Différé utilisateur (PR n°5). `null` = pas différé. Une valeur future
   * exclurait la ligne du résultat de `getTendersOfTheDay` (cf. filtre WHERE),
   * donc en pratique pour les rows retournées : soit `null`, soit une date
   * passée. Exposé pour debug et pour un futur tag UI « précédemment différé ».
   */
  deferredUntil: Date | null;
}

// ============================================================================
// 2. getTendersOfTheDay — liste « AO du jour » filtrée tenant + actifs
// ============================================================================

/**
 * Retourne les AO « du jour » pour l'organisation passée — V1 read-only.
 *
 * Filtres :
 *  - `tenders.organization_id = $1` (multi-tenant explicite — cf. JSDoc module)
 *  - `tenders.status = 'sourced'` (uniquement les AO non-encore-traités)
 *  - `tenders.deadline IS NULL OR tenders.deadline > now()` (on masque les AO
 *    dont la date de remise est dépassée — un AO sans deadline reste affiché,
 *    cas BOAMP « deadline TBD » observé sur certains avis)
 *
 * Tri : `score DESC NULLS LAST, created_at DESC` — aligné sur l'index partiel
 * `idx_tenders_score (organization_id, score DESC) WHERE status='sourced'`
 * (cf. `src/db/schema/tenders.ts`). Postgres choisira l'index pour la
 * première clé ; le tie-break sur `created_at` se fait en mémoire pour les
 * AO de score égal (volume cible ≤ 50 lignes, négligeable).
 *
 * Limite : `LIMIT 50` — la liste UI V1 affiche tout, pas de pagination. Si
 * un jour le cron flood au-delà de 50, on basculera vers une vraie pagination
 * (table view PR ultérieure). Pour le MVP AlyoS attendu ~5-30 AO/jour
 * (cf. spec §1), la borne dure 50 est confortable.
 *
 * @param organizationId — UUID du tenant courant (cf. `ALYOS_ORG_ID` en V1)
 * @param client         — instance Drizzle (default: `db` lazy ; injection
 *                          test via mock)
 */
export async function getTendersOfTheDay(
  organizationId: string,
  client: DrizzleClient,
): Promise<TenderOfTheDay[]> {
  const rows = await client
    .select({
      id: tenders.id,
      title: tenders.title,
      buyer: tenders.buyer,
      amount: tenders.amount,
      deadline: tenders.deadline,
      cpv: tenders.cpv,
      score: tenders.score,
      platformCode: platforms.code,
      externalRef: tenders.externalRef,
      deferredUntil: tenders.deferredUntil,
    })
    .from(tenders)
    .innerJoin(platforms, eq(tenders.platformId, platforms.id))
    .where(
      and(
        eq(tenders.organizationId, organizationId),
        eq(tenders.status, "sourced"),
        or(isNull(tenders.deadline), gt(tenders.deadline, sql`now()`)),
        // PR n°5 (Arbitrage Board B 2026-05-21) : exclure les AO différés
        // dont la date butoir n'est pas encore passée. Un AO sans différé
        // (deferred_until IS NULL) reste visible, ce qui couvre 100 % du
        // stock cron normal. À expiration, l'AO réapparait automatiquement
        // dans le digest.
        or(isNull(tenders.deferredUntil), lt(tenders.deferredUntil, sql`now()`)),
      ),
    )
    // NULLS LAST sur score (postgres-js + Drizzle : on passe par `sql` brut
    // pour `NULLS LAST` car l'helper `desc()` n'a pas d'option NULL ordering
    // expressif côté Drizzle 0.39).
    .orderBy(sql`${tenders.score} DESC NULLS LAST`, desc(tenders.createdAt))
    .limit(50);

  // Le typage de `rows` est déjà conforme à `TenderOfTheDay[]` grâce à la
  // selection explicite — pas de transformation supplémentaire nécessaire.
  // `platforms.code` est l'enum strict `PlatformCode` côté schéma Drizzle.
  return rows;
}

// ============================================================================
// 3. getActiveSearchProfileName — nom du profil actif (header UI)
// ============================================================================

/**
 * Retourne le nom du premier `search_profile` actif de l'organisation, ou
 * `null` si aucun profil actif. Utilisé pour afficher « profil ERP travaux »
 * dans le header de `/sourcing/ao-du-jour` (cf. Maquette 1 §189).
 *
 * Filtres :
 *  - `organization_id = $1` (multi-tenant explicite)
 *  - `active = TRUE` (l'index partiel `idx_search_profiles_org WHERE active`
 *    sera utilisé par le planner)
 *
 * Ordre + limite : `ORDER BY created_at ASC LIMIT 1` — V1 mono-profil AlyoS
 * (cf. seed prod `Profil AlyoS BTP - sourcing principal`). Si plusieurs
 * profils actifs existent un jour, on prendra le plus ancien (stabilité
 * d'affichage). Le choix « ASC » est documenté ici pour qu'on puisse le
 * changer en lecture si la spec V2 le demande.
 *
 * @param organizationId — UUID du tenant courant
 * @param client         — instance Drizzle (default: `db` lazy ; mock-friendly)
 */
export async function getActiveSearchProfileName(
  organizationId: string,
  client: DrizzleClient,
): Promise<string | null> {
  const rows = await client
    .select({ name: searchProfiles.name })
    .from(searchProfiles)
    .where(and(eq(searchProfiles.organizationId, organizationId), eq(searchProfiles.active, true)))
    .orderBy(asc(searchProfiles.createdAt))
    .limit(1);

  const head = rows[0];
  return head ? head.name : null;
}
