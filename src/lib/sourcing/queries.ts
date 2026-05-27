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

import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lt, or, sql, lte } from "drizzle-orm";

import type { db as defaultDb } from "@/db/client";
import { tenderBriefs } from "@/db/schema/ai";
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
  /** URL de l'avis source sur la plateforme (ex. lien BOAMP) */
  sourceUrl: string | null;
  /** URL du DCE / RC sur la plateforme (si disponible) */
  dceUrl: string | null;
  /**
   * Payload brut de la plateforme — utilisé côté UI pour extraire :
   *  - le brief de l'AO (record.description / record.objet)
   *  - le département / code postal (record.departement)
   */
  rawData: import("@/db/types/jsonb").TenderRawData | null;
  /**
   * Exclusion réversible (migration 0013). `null` = AO visible dans le
   * digest. En pratique les rows retournées par `getTendersOfTheDay` ont
   * toujours `null` (filtré par `isNull(tenders.excludedAt)`). Exposé pour
   * la prop `isExcluded` de `TenderCardActions` (utile si vue « AO exclus »).
   */
  excludedAt: Date | null;
  /** Code postal du lieu d'exécution (dérivé au scraping, backfillé). null = non renseigné. */
  postalCode: string | null;
  /** Département (2-3 chars). null = non dérivable. */
  department: string | null;
  /**
   * Brief IA généré à la demande (null si jamais généré).
   * Lu depuis tender_briefs WHERE is_active = true via `getActiveBriefForTender`.
   * Chargé séparément pour ne pas complexifier la query principale.
   */
  activeBrief: string | null;
}

// ============================================================================
// Types tri + filtres « AO du jour »
// ============================================================================

/** Tri de la liste AO du jour. */
export type TenderSortOrder = "score" | "department" | "deadline";

/** Filtres + tri de la liste AO du jour. */
export interface TenderAoDuJourOptions {
  /** Tri (défaut : "score"). */
  sort?: TenderSortOrder;
  /**
   * Filtre département multi-select. `[]` ou omis = tous les départements.
   * Valeurs : codes comme "75", "2A", "971".
   */
  departments?: string[];
  /**
   * Fenêtre de clôture : N jours max avant deadline. `null` ou omis = tous.
   * Ex. `7` → deadline ≤ now() + 7 days.
   */
  closingDays?: 7 | 15 | 30 | null;
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
  options?: TenderAoDuJourOptions,
): Promise<TenderOfTheDay[]> {
  const { sort = "score", departments = [], closingDays = null } = options ?? {};

  // Filtres statiques (tenant + workflow)
  const baseConditions = [
    eq(tenders.organizationId, organizationId),
    eq(tenders.status, "sourced"),
    or(isNull(tenders.deadline), gt(tenders.deadline, sql`now()`)),
    // PR n°5 (Arbitrage Board B 2026-05-21) : exclure les AO différés
    // dont la date butoir n'est pas encore passée. Un AO sans différé
    // (deferred_until IS NULL) reste visible, ce qui couvre 100 % du
    // stock cron normal. À expiration, l'AO réapparait automatiquement
    // dans le digest.
    or(isNull(tenders.deferredUntil), lt(tenders.deferredUntil, sql`now()`)),
    // Migration 0013 : masquer les AO exclus par l'utilisateur.
    // excluded_at IS NULL = AO visible (comportement par défaut).
    isNull(tenders.excludedAt),
  ] as const;

  // Filtre département multi-select (optionnel)
  const deptCondition =
    departments.length > 0 ? inArray(tenders.department, departments) : undefined;

  // Filtre fenêtre de clôture (valeur typée 7|15|30 — pas de string libre)
  const closingCondition =
    closingDays != null
      ? lte(tenders.deadline, sql`now() + interval '${sql.raw(String(closingDays))} days'`)
      : undefined;

  const whereClause = and(
    ...baseConditions,
    ...(deptCondition ? [deptCondition] : []),
    ...(closingCondition ? [closingCondition] : []),
  );

  // ORDER BY selon le tri demandé
  const orderByClause =
    sort === "department"
      ? [sql`${tenders.department} ASC NULLS LAST`, sql`${tenders.score} DESC NULLS LAST`]
      : sort === "deadline"
        ? [sql`${tenders.deadline} ASC NULLS LAST`]
        : // "score" (défaut) — comportement initial aligné sur l'index partiel
          [sql`${tenders.score} DESC NULLS LAST`, desc(tenders.createdAt)];

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
      sourceUrl: tenders.sourceUrl,
      dceUrl: tenders.dceUrl,
      rawData: tenders.rawData,
      excludedAt: tenders.excludedAt,
      postalCode: tenders.postalCode,
      department: tenders.department,
    })
    .from(tenders)
    .innerJoin(platforms, eq(tenders.platformId, platforms.id))
    .where(whereClause)
    // NULLS LAST sur score (postgres-js + Drizzle : on passe par `sql` brut
    // pour `NULLS LAST` car l'helper `desc()` n'a pas d'option NULL ordering
    // expressif côté Drizzle 0.39).
    .orderBy(...orderByClause)
    .limit(50);

  // Le typage de `rows` est déjà conforme à `TenderOfTheDay[]` grâce à la
  // selection explicite — pas de transformation supplémentaire nécessaire.
  // `platforms.code` est l'enum strict `PlatformCode` côté schéma Drizzle.
  // `activeBrief` est null ici — chargé séparément via getActiveBriefForTender.
  return rows.map((r) => ({ ...r, activeBrief: null }));
}

// ============================================================================
// 3. TenderSelected + getTendersSelected — liste « Sélectionnés »
// ============================================================================

/**
 * Extension de `TenderOfTheDay` pour les pages Sélectionnés et Réponse Solo.
 * On expose le `status` en type narrow pour le routing CTA côté UI.
 */
export interface TenderSelected extends TenderOfTheDay {
  status: "selected_solo" | "selected_tandem";
}

/**
 * Retourne les AO sélectionnés (solo + tandem) pour l'organisation passée.
 *
 * Filtres :
 *  - `organization_id = $1` (multi-tenant explicite)
 *  - `status IN ('selected_solo', 'selected_tandem')`
 *  - `deadline IS NULL OR deadline > now()` (on masque les AO dont la date
 *    de remise est dépassée — cf. même logique que `getTendersOfTheDay`)
 *
 * Tri : `deadline ASC NULLS LAST` — les AO avec clôture imminente en premier.
 * Limite : 100 (MVP — si > 100 AO sélectionnés, le contexte métier a changé).
 *
 * @param organizationId — UUID du tenant courant
 * @param client         — instance Drizzle (mock-friendly)
 */
export async function getTendersSelected(
  organizationId: string,
  client: DrizzleClient,
): Promise<TenderSelected[]> {
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
      status: tenders.status,
    })
    .from(tenders)
    .innerJoin(platforms, eq(tenders.platformId, platforms.id))
    .where(
      and(
        eq(tenders.organizationId, organizationId),
        inArray(tenders.status, ["selected_solo", "selected_tandem"]),
        or(isNull(tenders.deadline), gt(tenders.deadline, sql`now()`)),
      ),
    )
    .orderBy(sql`${tenders.deadline} ASC NULLS LAST`)
    .limit(100);

  // Le statut issu de Drizzle est le type enum Postgres broad — on le rétrécit
  // via `as` après avoir filtré IN sur les 2 valeurs cibles. TypeScript seul
  // ne peut pas inférer la restriction ; le WHERE IN garantit la validité.
  return rows.map((r) => ({ ...r, activeBrief: null })) as TenderSelected[];
}

// ============================================================================
// 4. getTendersSolo — liste « Réponse solo »
// ============================================================================

/**
 * Retourne les AO sélectionnés uniquement en mode Solo.
 *
 * Filtres :
 *  - `organization_id = $1`
 *  - `status = 'selected_solo'`
 *  - `deadline IS NULL OR deadline > now()`
 *
 * Tri + limite : identiques à `getTendersSelected`.
 *
 * @param organizationId — UUID du tenant courant
 * @param client         — instance Drizzle (mock-friendly)
 */
export async function getTendersSolo(
  organizationId: string,
  client: DrizzleClient,
): Promise<TenderSelected[]> {
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
      status: tenders.status,
    })
    .from(tenders)
    .innerJoin(platforms, eq(tenders.platformId, platforms.id))
    .where(
      and(
        eq(tenders.organizationId, organizationId),
        eq(tenders.status, "selected_solo"),
        or(isNull(tenders.deadline), gt(tenders.deadline, sql`now()`)),
      ),
    )
    .orderBy(sql`${tenders.deadline} ASC NULLS LAST`)
    .limit(100);

  return rows.map((r) => ({ ...r, activeBrief: null })) as TenderSelected[];
}

// ============================================================================
// 5. getTendersDeferred — liste « Différés »
// ============================================================================

/**
 * Retourne les AO différés dont l'échéance de report n'est pas encore atteinte.
 *
 * Filtres :
 *  - `organization_id = $1`
 *  - `deferred_until IS NOT NULL` ET `deferred_until > now()` — seuls les AO
 *    effectivement « en attente » (pas encore revenus dans le digest).
 *
 * Tri : `deferred_until ASC` — les AO qui reviennent le plus tôt en premier
 * (l'utilisateur peut anticiper ceux qui reviendront bientôt).
 * Limite : 100.
 *
 * Note : contrairement aux autres helpers, il n'y a PAS de filtre sur
 * `deadline > now()` ici : un AO différé dont la deadline est dépassée mérite
 * d'être visible pour que l'utilisateur puisse le gérer consciemment (le
 * différer encore ou l'écarter). Ce choix est intentionnel MVP.
 *
 * @param organizationId — UUID du tenant courant
 * @param client         — instance Drizzle (mock-friendly)
 */
export async function getTendersDeferred(
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
      sourceUrl: tenders.sourceUrl,
      dceUrl: tenders.dceUrl,
      rawData: tenders.rawData,
      excludedAt: tenders.excludedAt,
      postalCode: tenders.postalCode,
      department: tenders.department,
    })
    .from(tenders)
    .innerJoin(platforms, eq(tenders.platformId, platforms.id))
    .where(
      and(
        eq(tenders.organizationId, organizationId),
        isNotNull(tenders.deferredUntil),
        gt(tenders.deferredUntil, sql`now()`),
      ),
    )
    .orderBy(asc(tenders.deferredUntil))
    .limit(100);

  return rows.map((r) => ({ ...r, activeBrief: null }));
}

// ============================================================================
// 6. getActiveBriefForTender — brief IA actif pour un AO
// ============================================================================

/**
 * Retourne le texte du brief IA actif pour un AO, ou `null` si aucun.
 *
 * Chargement séparé de `getTendersOfTheDay` pour éviter de complexifier
 * le SELECT principal avec un LATERAL JOIN sur un schéma Drizzle strict.
 *
 * @param tenderId       UUID du tender
 * @param organizationId UUID du tenant courant
 * @param client         Instance Drizzle (mock-friendly)
 */
export async function getActiveBriefForTender(
  tenderId: string,
  organizationId: string,
  client: DrizzleClient,
): Promise<string | null> {
  const rows = await client
    .select({ content: tenderBriefs.content })
    .from(tenderBriefs)
    .where(
      and(
        eq(tenderBriefs.tenderId, tenderId),
        eq(tenderBriefs.organizationId, organizationId),
        eq(tenderBriefs.isActive, true),
      ),
    )
    .limit(1);

  return rows[0]?.content ?? null;
}

// ============================================================================
// 7. getActiveSearchProfileName — nom du profil actif (header UI)
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
