/**
 * Tests du connecteur BOAMP — edifio Sourcing.
 *
 * Source de vérité : `notes-de-suivi/DRAFT_PR2_BOAMP_CONNECTOR.md` §Étape 2/7.
 *
 * Couvre :
 *  - pagination (2 pages puis vide → concaténation correcte)
 *  - retry sur 429 (puis 200 → succès)
 *  - retry sur 500 (puis 200 → succès)
 *  - erreur définitive (500×3 → throw)
 *  - erreur non-retryable (404 → throw immédiat sans retry)
 *  - URL construite contient bien `where=...` et `sort=...`
 *  - mapping record Opendatasoft → `RawTender`
 *
 * Pas de réseau réel : `fetch` est intégralement mocké via `opts.fetch`.
 */

import { describe, expect, it, vi } from "vitest";

import fixture from "@/db/seed/fixtures/boamp-real.json";

import type { BoampApiRecord } from "../types";
import { createBoampConnector } from "./boamp";

/**
 * Construit une Response JSON Opendatasoft v2 conforme à partir de records
 * `BoampApiRecord` projetés (forme `fields`).
 */
function odsResponse(records: BoampApiRecord[], total: number): Response {
  return new Response(
    JSON.stringify({
      total_count: total,
      records: records.map((fields) => ({ record: { fields } })),
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
  it("inclut where=datepublication >= <ISO> et sort=datepublication desc", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(odsResponse([], 0));
    const connector = createBoampConnector({ fetch: fetchMock });

    const lastRun = new Date("2026-05-01T00:00:00.000Z");
    await connector.fetchSinceLastRun("profile-uuid", lastRun);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call0 = fetchMock.mock.calls[0];
    expect(call0).toBeDefined();
    const calledUrl = String(call0?.[0]);
    expect(calledUrl).toContain("data.boamp.fr/api/2/datasets/boamp/records");

    // Lecture robuste via URLSearchParams — découple l'assertion du choix
    // d'encoding (`+` vs `%20`) fait par URLSearchParams sous le capot.
    const params = new URL(calledUrl).searchParams;
    expect(params.get("rows")).toBe("1000");
    expect(params.get("start")).toBe("0");
    expect(params.get("where")).toBe('datepublication >= "2026-05-01T00:00:00.000Z"');
    expect(params.get("sort")).toBe("datepublication desc");
  });
});

describe("createBoampConnector — pagination", () => {
  it("concatène les records de 2 pages puis stoppe sur page vide", async () => {
    const page1: BoampApiRecord[] = sample;
    const page2: BoampApiRecord[] = [at(fixtureBuckets.small, 1), at(fixtureBuckets.medium, 1)];

    // total_count volontairement plus grand (10) que la somme réelle (3+2)
    // pour forcer l'appel à la 3e page (vide) — sert à valider la condition
    // d'arrêt sur `records.length === 0` indépendamment du total_count.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(odsResponse(page1, 10))
      .mockResolvedValueOnce(odsResponse(page2, 10))
      .mockResolvedValueOnce(odsResponse([], 10));

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
    // Le start incrémente bien de PAGE_SIZE (1000) à chaque appel
    const call1 = fetchMock.mock.calls[1];
    const call2 = fetchMock.mock.calls[2];
    expect(call1).toBeDefined();
    expect(call2).toBeDefined();
    expect(String(call1?.[0])).toContain("start=1000");
    expect(String(call2?.[0])).toContain("start=2000");
  });

  it("stoppe quand total_count est atteint, sans appel supplémentaire", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(odsResponse(sample, 3));
    const connector = createBoampConnector({ fetch: fetchMock });
    const result = await connector.fetchSinceLastRun("p", new Date());

    expect(result).toHaveLength(3);
    // Une seule page suffit car records.length >= total_count
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("createBoampConnector — mapping RawTender", () => {
  it("projette idweb → externalRef, platformCode=boamp, rawData.platform_code=boamp", async () => {
    const s0 = at(sample, 0);
    const fetchMock = vi.fn().mockResolvedValueOnce(odsResponse([s0], 1));
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

  it("jette si un wrapper Opendatasoft est dépourvu de record.fields", async () => {
    const malformed = new Response(JSON.stringify({ total_count: 1, records: [{}] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    const fetchMock = vi.fn().mockResolvedValueOnce(malformed);
    const connector = createBoampConnector({ fetch: fetchMock });
    await expect(connector.fetchSinceLastRun("p", new Date())).rejects.toThrow(
      /schéma Opendatasoft inattendu/,
    );
  });

  it("jette si un fields n'a pas d'idweb", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(odsResponse([{ objet: "sans idweb" } as BoampApiRecord], 1));
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
      .mockResolvedValueOnce(odsResponse([at(sample, 0)], 1));

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
      .mockResolvedValueOnce(odsResponse([at(sample, 1)], 1));

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
