/**
 * Tests unitaires de `queries.ts` — edifio Sourcing PR n°4 (AO du jour V1).
 *
 * Source de vérité : `src/lib/sourcing/queries.ts` + spec §3.5/§3.7.
 *
 * Couvre côté unit :
 *  - `getTendersOfTheDay` : mapping 2-3 lignes mockées vers `TenderOfTheDay[]`
 *  - `getTendersOfTheDay` : retourne `[]` si zéro ligne en BDD
 *  - `getActiveSearchProfileName` : retourne `null` si aucun profil actif
 *  - `getActiveSearchProfileName` : retourne le nom si profil actif présent
 *
 * NB : le contrôle multi-tenant côté DB (refus cross-tenant via RLS) est
 * couvert par pgTAP, pas ici. Le présent test valide uniquement le contrat
 * Drizzle : que la chaîne fluide soit appelée avec les bons arguments et que
 * le résultat soit mappé tel quel vers le type public.
 *
 * Mock Drizzle : on simule la chaîne fluide
 * `.select().from().innerJoin().where().orderBy().limit()` (resp.
 * `.select().from().where().orderBy().limit()`) en capturant les arguments
 * pour assertions ciblées. Le pattern est aligné sur `insert.test.ts`.
 */

import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import type { DrizzleClient, TenderOfTheDay } from "./queries";
import { getActiveSearchProfileName, getTendersOfTheDay } from "./queries";

/**
 * Helper test : sérialise une expression Drizzle (typiquement le contenu de
 * `.where(...)`) en SQL texte via `PgDialect`. Permet de verrouiller la
 * structure du WHERE sans dépendre d'une vraie connexion BDD.
 *
 * Usage : `sqlOf(capture.whereExpr)` → renvoie quelque chose comme
 *   `"organization_id" = $1 and "status" = $2 and (...)`.
 */
function sqlOf(expr: unknown): string {
  const dialect = new PgDialect();
  // `sqlToQuery` attend un objet `SQL` ; les helpers `and`/`or` retournent
  // bien un `SQL` côté Drizzle 0.39. Cast minimal pour passer le typage test.
  return dialect.sqlToQuery(expr as Parameters<PgDialect["sqlToQuery"]>[0]).sql;
}

// ----------------------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------------------

const ORG_ALYOS = "11111111-1111-1111-1111-111111111111";

const tenderRow1: TenderOfTheDay = {
  id: "11110000-0000-0000-0000-000000000001",
  title: "Rénovation école Jean-Moulin",
  buyer: "Mairie de Saint-Étienne",
  amount: "850000.00",
  deadline: new Date("2026-05-28T15:00:00.000Z"),
  cpv: ["45214000"],
  score: "94.00",
  platformCode: "boamp",
  externalRef: "BOAMP-AO-001",
  deferredUntil: null,
  sourceUrl: null,
  dceUrl: null,
  rawData: null,
  excludedAt: null,
};

const tenderRow2: TenderOfTheDay = {
  id: "11110000-0000-0000-0000-000000000002",
  title: "Construction crèche multi-accueil",
  buyer: "CCAS Lyon 7",
  amount: "1200000.00",
  deadline: new Date("2026-06-14T17:00:00.000Z"),
  cpv: ["45215100", "45000000"],
  score: "81.00",
  platformCode: "place",
  externalRef: "PLACE-AO-002",
  deferredUntil: null,
  sourceUrl: null,
  dceUrl: null,
  rawData: null,
  excludedAt: null,
};

const tenderRow3: TenderOfTheDay = {
  id: "11110000-0000-0000-0000-000000000003",
  title: "Mission MOE médiathèque",
  buyer: "Communauté de communes",
  amount: null,
  deadline: null,
  cpv: [],
  score: null,
  platformCode: "francmarches",
  externalRef: "FM-AO-003",
  deferredUntil: null,
  sourceUrl: null,
  dceUrl: null,
  rawData: null,
  excludedAt: null,
};

/**
 * Row qui a été différée *dans le passé* — donc *réapparait* dans le digest.
 * En prod : `getTendersOfTheDay` filtre `deferred_until IS NULL OR
 * deferred_until < now()`. Un mock peut renvoyer cette ligne ; le test vérifie
 * que la projection conserve bien le champ `deferredUntil` (utile UI debug).
 */
const tenderRow4PreviouslyDeferred: TenderOfTheDay = {
  id: "11110000-0000-0000-0000-000000000004",
  title: "AO précédemment différé",
  buyer: "Mairie test deferral",
  amount: "500000.00",
  deadline: new Date("2026-07-01T12:00:00.000Z"),
  cpv: ["45000000"],
  score: "72.00",
  platformCode: "boamp",
  externalRef: "BOAMP-AO-004",
  // Différé expiré (1 heure dans le passé) — visible dans le digest
  deferredUntil: new Date(Date.now() - 60 * 60 * 1000),
  sourceUrl: null,
  dceUrl: null,
  rawData: null,
  excludedAt: null,
};

// ----------------------------------------------------------------------------
// Mock builder
// ----------------------------------------------------------------------------

interface SelectCapture {
  selection?: Record<string, unknown>;
  fromTable?: unknown;
  joinTable?: unknown;
  joinCondition?: unknown;
  whereExpr?: unknown;
  orderByArgs?: unknown[];
  limitN?: number;
}

/**
 * Construit un faux client Drizzle qui retourne `rows` pour la chaîne
 * `.select().from().innerJoin?().where().orderBy().limit()`.
 *
 * Cas couverts :
 *  - chaîne AVEC `.innerJoin()` (getTendersOfTheDay)
 *  - chaîne SANS `.innerJoin()` (getActiveSearchProfileName)
 */
function buildFakeDb<TRow>(rows: TRow[]): { db: DrizzleClient; capture: SelectCapture } {
  const capture: SelectCapture = {};

  const orderByThenLimit = {
    orderBy: (...args: unknown[]) => {
      capture.orderByArgs = args;
      return {
        limit: (n: number) => {
          capture.limitN = n;
          return Promise.resolve(rows);
        },
      };
    },
  };

  const whereThenOrderBy = {
    where: (expr: unknown) => {
      capture.whereExpr = expr;
      return orderByThenLimit;
    },
  };

  const fakeDb = {
    select: (selection: Record<string, unknown>) => {
      capture.selection = selection;
      return {
        from: (table: unknown) => {
          capture.fromTable = table;
          return {
            // Variante avec jointure (tenders × platforms)
            innerJoin: (joinTable: unknown, joinCondition: unknown) => {
              capture.joinTable = joinTable;
              capture.joinCondition = joinCondition;
              return whereThenOrderBy;
            },
            // Variante sans jointure (search_profiles seul)
            where: (expr: unknown) => {
              capture.whereExpr = expr;
              return orderByThenLimit;
            },
          };
        },
      };
    },
  };

  return {
    db: fakeDb as unknown as DrizzleClient,
    capture,
  };
}

// ----------------------------------------------------------------------------
// getTendersOfTheDay
// ----------------------------------------------------------------------------

describe("getTendersOfTheDay", () => {
  it("mappe 3 lignes Drizzle vers TenderOfTheDay[] sans transformation", async () => {
    const { db, capture } = buildFakeDb<TenderOfTheDay>([tenderRow1, tenderRow2, tenderRow3]);

    const result = await getTendersOfTheDay(ORG_ALYOS, db);

    // Vérification stricte du mapping (pas de transformation, projection brute).
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual(tenderRow1);
    expect(result[1]).toEqual(tenderRow2);
    expect(result[2]).toEqual(tenderRow3);

    // La chaîne fluide est complète : select → from → innerJoin → where → orderBy → limit.
    expect(capture.selection).toBeDefined();
    expect(capture.joinTable).toBeDefined();
    expect(capture.joinCondition).toBeDefined();
    expect(capture.whereExpr).toBeDefined();
    expect(capture.orderByArgs).toBeDefined();
    expect(capture.orderByArgs).toHaveLength(2); // score DESC NULLS LAST + createdAt DESC
    expect(capture.limitN).toBe(50);
  });

  it("retourne [] si aucune ligne en BDD", async () => {
    const { db, capture } = buildFakeDb<TenderOfTheDay>([]);

    const result = await getTendersOfTheDay(ORG_ALYOS, db);

    expect(result).toEqual([]);
    // La chaîne a bien été appelée jusqu'au .limit() (consommation Promise).
    expect(capture.limitN).toBe(50);
  });

  it("inclut bien la colonne externalRef + platformCode dans la projection", async () => {
    const { db } = buildFakeDb<TenderOfTheDay>([tenderRow1]);

    const result = await getTendersOfTheDay(ORG_ALYOS, db);

    // Garde-fou contre un futur refactor qui oublierait ces colonnes.
    expect(result[0]?.externalRef).toBe("BOAMP-AO-001");
    expect(result[0]?.platformCode).toBe("boamp");
  });

  /**
   * Verrou structural sur les 4 conditions du WHERE — Addendum spec 2026-05-24
   * §Exigence 1 (filtre AO du jour conforme).
   *
   * Le WHERE doit AND-er :
   *  1. `organization_id = $`                         (multi-tenant)
   *  2. `status = 'sourced'`                          (uniquement AO actifs)
   *  3. `deadline IS NULL OR deadline > now()`        (deadline future ou TBD)
   *  4. `deferred_until IS NULL OR deferred_until < now()` (différé expiré ou pas)
   *
   * On sérialise l'expression Drizzle en SQL texte via `PgDialect.sqlToQuery`
   * et on assert sur la présence des fragments distinctifs. Toute disparition
   * silencieuse d'une condition (ex. quelqu'un retire le filtre `deferred_until`
   * lors d'un refacto) pète ce test.
   */
  it("WHERE applique bien les 4 conditions org / status / deadline / deferred_until", async () => {
    const { db, capture } = buildFakeDb<TenderOfTheDay>([]);

    await getTendersOfTheDay(ORG_ALYOS, db);

    expect(capture.whereExpr).toBeDefined();
    const sql = sqlOf(capture.whereExpr);

    // (1) Multi-tenant : organization_id
    expect(sql).toMatch(/"organization_id"\s*=/);
    // (2) Status = sourced (la valeur est passée en paramètre $N, on cherche
    // juste la colonne)
    expect(sql).toMatch(/"status"\s*=/);
    // (3) Deadline : IS NULL OR > now()
    expect(sql).toMatch(/"deadline"\s+is\s+null/i);
    expect(sql).toMatch(/"deadline"\s*>\s*now\(\)/i);
    // (4) Deferred until : IS NULL OR < now() — exigence PR n°5
    expect(sql).toMatch(/"deferred_until"\s+is\s+null/i);
    expect(sql).toMatch(/"deferred_until"\s*<\s*now\(\)/i);
  });

  /**
   * PR n°5 (Arbitrage Board B 2026-05-21) : projection `deferredUntil`.
   *
   * Le filtre WHERE `deferred_until IS NULL OR deferred_until < now()` est
   * appliqué côté SQL ; on ne peut pas le tester sans BDD réelle. En revanche
   * on vérifie ici que :
   *  - la projection expose bien `deferredUntil`
   *  - une ligne précédemment différée mais expirée est conservée telle quelle
   *
   * Le rejet d'une ligne *encore* différée (deferred_until > now()) est couvert
   * par le test pgTAP 08_tender_actions_cross_tenant.sql + manuellement.
   */
  it("expose deferredUntil dans la projection — null par défaut", async () => {
    const { db } = buildFakeDb<TenderOfTheDay>([tenderRow1, tenderRow2, tenderRow3]);

    const result = await getTendersOfTheDay(ORG_ALYOS, db);

    expect(result[0]?.deferredUntil).toBeNull();
    expect(result[1]?.deferredUntil).toBeNull();
    expect(result[2]?.deferredUntil).toBeNull();
  });

  it("garde un AO précédemment différé (deferred_until expiré) — réapparait dans digest", async () => {
    // Cas semblable au cron du lendemain : un AO différé 24h hier matin doit
    // réapparaitre aujourd'hui. Le mock simule la sortie SQL post-filtre.
    const { db } = buildFakeDb<TenderOfTheDay>([tenderRow4PreviouslyDeferred]);

    const result = await getTendersOfTheDay(ORG_ALYOS, db);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(tenderRow4PreviouslyDeferred.id);
    // Le champ deferredUntil est exposé tel quel pour debug — pas filtré
    // applicativement, c'est le SQL qui filtre.
    expect(result[0]?.deferredUntil).toBeInstanceOf(Date);
  });

  /**
   * Contrat de propagation d'erreur (hotfix PR #22 — Board 2026-05-21).
   *
   * Le helper `getTendersOfTheDay` NE DOIT PAS try/catch en interne : c'est
   * la couche appelante (page Server Component `/sourcing/ao-du-jour`) qui
   * décide quoi faire d'un échec — bascule sur `ErrorBanner` + `console.error`
   * structuré (cf. JSDoc `page.tsx` et alignement sur `src/lib/audit/index.ts`).
   *
   * Si un futur refactor déplace par erreur le try/catch dans ce helper,
   * la page perdrait l'info d'erreur et afficherait silencieusement
   * l'EmptyState — comportement trompeur. Ce test verrouille la séparation
   * des responsabilités.
   */
  it("propage l'erreur si le client Drizzle throw (pas de try/catch interne)", async () => {
    const boomError = new Error("DATABASE_URL is not set");
    const fakeDb = {
      select: () => {
        throw boomError;
      },
    } as unknown as DrizzleClient;

    await expect(getTendersOfTheDay(ORG_ALYOS, fakeDb)).rejects.toThrow("DATABASE_URL is not set");
  });
});

// ----------------------------------------------------------------------------
// getActiveSearchProfileName
// ----------------------------------------------------------------------------

describe("getActiveSearchProfileName", () => {
  it("retourne le nom du profil quand un profil actif existe", async () => {
    const { db, capture } = buildFakeDb<{ name: string }>([
      { name: "Profil AlyoS BTP - sourcing principal" },
    ]);

    const result = await getActiveSearchProfileName(ORG_ALYOS, db);

    expect(result).toBe("Profil AlyoS BTP - sourcing principal");
    expect(capture.limitN).toBe(1);
    expect(capture.whereExpr).toBeDefined();
  });

  it("retourne null si aucun profil actif", async () => {
    const { db, capture } = buildFakeDb<{ name: string }>([]);

    const result = await getActiveSearchProfileName(ORG_ALYOS, db);

    expect(result).toBeNull();
    // La chaîne a bien tourné (LIMIT 1).
    expect(capture.limitN).toBe(1);
  });
});
