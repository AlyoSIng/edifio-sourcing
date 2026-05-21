/**
 * Tests du connecteur BOAMP — edifio Sourcing.
 *
 * Source de vérité : `notes-de-suivi/DRAFT_PR2_BOAMP_CONNECTOR.md` §Étape 2/7.
 *
 * Refacto 2026-05-21 (incident P1 prod) : endpoint Opendatasoft v2.1 — réponses
 * FLAT (`results[]`, pas de wrapper `record.fields`), pagination `limit/offset`
 * au lieu de `rows/start`, champ `dateparution` au lieu de `datepublication`.
 *
 * Couvre :
 *  - pagination (2 pages puis vide → concaténation correcte)
 *  - pagination >100 records (transition page 1 → page 2 avec total_count)
 *  - retry sur 429 (puis 200 → succès)
 *  - retry sur 500 (puis 200 → succès)
 *  - erreur définitive (500×3 → throw)
 *  - erreur non-retryable (404 → throw immédiat sans retry)
 *  - URL construite contient bien `where=...` et `order_by=...`
 *  - mapping record Opendatasoft → `RawTender`
 *
 * Pas de réseau réel : `fetch` est intégralement mocké via `opts.fetch`.
 */

import { describe, expect, it, vi } from "vitest";

import fixture from "@/db/seed/fixtures/boamp-real.json";

import type { BoampApiRecord } from "../types";
import { createBoampConnector } from "./boamp";

/**
 * Construit une Response JSON Opendatasoft v2.1 conforme — forme FLAT.
 * En v2.1 les records sont directement dans `results[]`, plus de wrapper
 * `record.fields` (cf. doc explore API).
 */
function mockV21Response(records: BoampApiRecord[], totalCount?: number): Response {
  return new Response(
    JSON.stringify({
      total_count: totalCount ?? records.length,
      results: records,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

/**
 * Echantillons réels tirés de la fixture committee. Trois buckets pour
 * couvrir small/medium/large (description_marche de tailles variables).
 */
const fixtureBuckets = fixture as {
  small: BoampApiRecord[];
  medium: BoampApiRecord[];
  large: BoampApiRecord[];
};

/**
 * Accès indexé non-undefined — `noUncheckedIndexedAccess` exige le narrow.
 * On lève si l'index est out-of-range (signal clair côté test).
 */
function at<T>(arr: T[], i: number): T {
  const v = arr[i];
  if (v === undefined) throw new Error(`fixture out-of-range: index ${i}`);
  return v;
}

const sample: BoampApiRecord[] = [
  at(fixtureBuckets.small, 0),
  at(fixtureBuckets.medium, 0),
  at(fixtureBuckets.large, 0),
];

describe("createBoampConnector — URL construite", () => {
  it("cible le bon host + path v2.1 avec params limit/offset/where/order_by", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(mockV21Response([], 0));
    const connector = createBoampConnector({ fetch: fetchMock });

    const lastRun = new Date("2026-05-01T00:00:00.000Z");
    await connector.fetchSinceLastRun("profile-uuid", lastRun);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call0 = fetchMock.mock.calls[0];
    expect(call0).toBeDefined();
    const calledUrl = String(call0?.[0]);

    // Host + path v2.1 (portail Opendatasoft DILA officiel, pas l'ancien
    // `data.boamp.fr/api/2/...` décommissionné).
    const parsed = new URL(calledUrl);
    expect(parsed.host).toBe("boamp-datadila.opendatasoft.com");
    expect(parsed.pathname).toBe("/api/explore/v2.1/catalog/datasets/boamp/records");

    // Lecture robuste via URLSearchParams — découple l'assertion du choix
    // d'encoding (`+` vs `%20`) fait par URLSearchParams sous le capot.
    const params = parsed.searchParams;
    expect(params.get("limit")).toBe("100");
    expect(params.get("offset")).toBe("0");
    // v2.1 utilise `dateparution` (pas `datepublication` v2)
    expect(params.get("where")).toBe('dateparution >= "2026-05-01T00:00:00.000Z"');
    // v2.1 utilise `order_by` (pas `sort` v2)
    expect(params.get("order_by")).toBe("dateparution desc");
  });
});

describe("createBoampConnector — pagination", () => {
  it("concatène les records de 2 pages puis stoppe sur page vide", async () => {
    const page1: BoampApiRecord[] = sample;
    const page2: BoampApiRecord[] = [at(fixtureBuckets.small, 1), at(fixtureBuckets.medium, 1)];

    // total_count volontairement plus grand (10) que la somme réelle (3+2)
    // pour forcer l'appel à la 3e page (vide) — sert à valider la condition
    // d'arrêt sur `results.length === 0` indépendamment du total_count.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockV21Response(page1, 10))
      .mockResolvedValueOnce(mockV21Response(page2, 10))
      .mockResolvedValueOnce(mockV21Response([], 10));

    const connector = createBoampConnector({ fetch: fetchMock });
    const result = await connector.fetchSinceLastRun("p", new Date("2026-04-01T00:00:00.000Z"));

    expect(result).toHaveLength(5);
    expect(result.map((r) => r.externalRef)).toEqual([
      at(page1, 0).idweb,
      at(page1, 1).idweb,
      at(page1, 2).idweb,
      at(page2, 0).idweb,
      at(page2, 1).idweb,
    ]);
    // 3 appels : page1 + page2 + page vide
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // L'offset incrémente bien de PAGE_SIZE (100) à chaque appel
    const call1 = fetchMock.mock.calls[1];
    const call2 = fetchMock.mock.calls[2];
    expect(call1).toBeDefined();
    expect(call2).toBeDefined();
    expect(String(call1?.[0])).toContain("offset=100");
    expect(String(call2?.[0])).toContain("offset=200");
  });

  it("stoppe quand total_count est atteint, sans appel supplémentaire", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(mockV21Response(sample, 3));
    const connector = createBoampConnector({ fetch: fetchMock });
    const result = await connector.fetchSinceLastRun("p", new Date());

    expect(result).toHaveLength(3);
    // Une seule page suffit car results.length >= total_count
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("pagine correctement >100 records (transition page 1 → page 2 avec total_count)", async () => {
    // Steve a explicitement demandé ce test (cf. brief 2026-05-21) pour
    // valider le comportement réel en prod avec un volume > PAGE_SIZE.
    // Scénario : total_count=187, 100 records page 1 (offset=0) puis 87
    // records page 2 (offset=100). La condition d'arrêt sur
    // `accumulator.length >= total_count` doit déclencher AVANT toute 3e
    // requête → exactement 2 appels fetch attendus.
    const seed = at(fixtureBuckets.small, 0);

    /** Forge un record clone avec un idweb numéroté `REC-NNN`. */
    function forge(n: number): BoampApiRecord {
      const id = `REC-${String(n).padStart(3, "0")}`;
      return { ...seed, idweb: id };
    }

    const page1: BoampApiRecord[] = Array.from({ length: 100 }, (_, i) => forge(i + 1));
    const page2: BoampApiRecord[] = Array.from({ length: 87 }, (_, i) => forge(i + 101));

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockV21Response(page1, 187))
      .mockResolvedValueOnce(mockV21Response(page2, 187));

    const connector = createBoampConnector({ fetch: fetchMock });
    const result = await connector.fetchSinceLastRun("p", new Date("2026-04-01T00:00:00.000Z"));

    expect(result).toHaveLength(187);
    expect(at(result, 0).externalRef).toBe("REC-001");
    // Transition page 1 → page 2
    expect(at(result, 99).externalRef).toBe("REC-100");
    expect(at(result, 100).externalRef).toBe("REC-101");
    expect(at(result, 186).externalRef).toBe("REC-187");

    // Condition d'arrêt = total_count atteint après la 2e page → exactement
    // 2 appels fetch (pas de 3e appel offset=200 superflu).
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Vérification de l'enchaînement offset=0 puis offset=100
    const call0 = fetchMock.mock.calls[0];
    const call1 = fetchMock.mock.calls[1];
    expect(call0).toBeDefined();
    expect(call1).toBeDefined();
    expect(String(call0?.[0])).toContain("offset=0");
    expect(String(call1?.[0])).toContain("offset=100");
  });
});

describe("createBoampConnector — mapping RawTender", () => {
  it("projette idweb → externalRef, platformCode=boamp, rawData.platform_code=boamp", async () => {
    const s0 = at(sample, 0);
    const fetchMock = vi.fn().mockResolvedValueOnce(mockV21Response([s0], 1));
    const connector = createBoampConnector({ fetch: fetchMock });
    const [first] = await connector.fetchSinceLastRun("p", new Date());

    expect(first).toBeDefined();
    if (!first) throw new Error("first undefined");
    expect(first.externalRef).toBe(s0.idweb);
    expect(first.platformCode).toBe("boamp");
    expect(first.rawData.platform_code).toBe("boamp");
    expect(first.rawData.record).toMatchObject({
      idweb: s0.idweb,
      objet: s0.objet,
    });
    // fetchedAt est un ISO 8601 valide
    expect(() => new Date(first.fetchedAt).toISOString()).not.toThrow();
  });

  it("retourne [] sur une réponse `results: []` sans itération supplémentaire", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(mockV21Response([], 0));
    const connector = createBoampConnector({ fetch: fetchMock });
    const result = await connector.fetchSinceLastRun("p", new Date());
    expect(result).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("jette si un fields n'a pas d'idweb", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockV21Response([{ objet: "sans idweb" } as BoampApiRecord], 1));
    const connector = createBoampConnector({ fetch: fetchMock });
    await expect(connector.fetchSinceLastRun("p", new Date())).rejects.toThrow(
      /sans idweb exploitable/,
    );
  });
});

describe("createBoampConnector — retry", () => {
  it("retry sur 429 puis succès au 2e essai", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("rate limit", { status: 429 }))
      .mockResolvedValueOnce(mockV21Response([at(sample, 0)], 1));

    const connector = createBoampConnector({ fetch: fetchMock });
    const result = await connector.fetchSinceLastRun("p", new Date());

    expect(result).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retry sur 503 puis succès au 3e essai", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("oups", { status: 500 }))
      .mockResolvedValueOnce(new Response("oups", { status: 503 }))
      .mockResolvedValueOnce(mockV21Response([at(sample, 1)], 1));

    const connector = createBoampConnector({ fetch: fetchMock });
    const result = await connector.fetchSinceLastRun("p", new Date());

    expect(result).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("jette une erreur exploitable après 3×500", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("server down", { status: 500 }));

    const connector = createBoampConnector({ fetch: fetchMock });
    await expect(connector.fetchSinceLastRun("p", new Date())).rejects.toThrow(
      /BOAMP API a échoué après 3 tentatives/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("ne retry PAS sur 404 (non-retryable) et jette immédiatement", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("not found", { status: 404 }));
    const connector = createBoampConnector({ fetch: fetchMock });
    await expect(connector.fetchSinceLastRun("p", new Date())).rejects.toThrow(/non-retryable/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
}, 30_000);
