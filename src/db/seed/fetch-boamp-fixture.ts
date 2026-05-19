/**
 * Script ONE-SHOT : fetch BOAMP -> anonymise -> committe `boamp-real.json`
 * ---------------------------------------------------------------------------
 * NE PAS lancer en CI / prod. Execution manuelle uniquement, par Yann ou
 * Steve, quand on veut rafraichir la fixture. Le seed quotidien (db:seed) lit
 * le JSON deja committe -- il ne tape PAS sur l'API.
 *
 * Source : API publique Opendatasoft BOAMP v2.1 (sans cle).
 *   https://data.boamp.fr/api/explore/v2.1/catalog/datasets/boamp/records
 *
 * Strategie :
 *   1. Pagine en 3 requetes parallele (offset 0, 100, 200 -- limit 100 chacune)
 *      pour ramener ~300 records BOAMP recents.
 *   2. Anonymise chaque record (emails, telephones, noms personnes physiques).
 *      Les noms d'organismes publics sont conserves (info publique).
 *   3. Mesure la taille KB de chaque record JSON-serialise et regroupe en 3
 *      buckets : small (~10 KB), medium (~25 KB), large (~45 KB).
 *   4. Resample si necessaire pour atteindre 60 / 240 / 100 (= 360 records au
 *      total, soit 2 x 180 par org dans le seed, large marge pour le tirage).
 *   5. Serialise en `src/db/seed/fixtures/boamp-real.json`.
 *
 * Lancement : `pnpm db:fetch-boamp` (script package.json).
 *
 * Sortie console : recap distribution + mediane + taille fichier.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { anonymize, emptyStats, type AnonymizationStats } from "./lib/anonymize";
import {
  computeDistribution,
  medianKb,
  rangeKb,
  resampleToTarget,
  TARGET_RATIOS,
} from "./lib/distribution";
import { buildMockFixture } from "./lib/fixture-mock";

const BOAMP_BASE_URL = "https://data.boamp.fr/api/explore/v2.1/catalog/datasets/boamp/records";

/** Taille cible par bucket pour le pool de fixture (genereux : 2 orgs x 100). */
const FIXTURE_TARGETS = {
  small: 60,
  medium: 240,
  large: 100,
} as const;

/** Structure du fichier `boamp-real.json` committe. */
export interface BoampFixture {
  small: unknown[];
  medium: unknown[];
  large: unknown[];
  metadata: {
    fetched_at: string;
    total: number;
    distribution: { small: number; medium: number; large: number };
    median_kb: number;
    buckets_kb: { small: string; medium: string; large: string };
    anonymization: AnonymizationStats;
    source_url: string;
  };
}

interface OpendatasoftV2Response {
  total_count: number;
  results: Record<string, unknown>[];
}

async function fetchPage(offset: number, limit: number): Promise<Record<string, unknown>[]> {
  const url = `${BOAMP_BASE_URL}?limit=${limit}&offset=${offset}`;
  // eslint-disable-next-line no-console
  console.log(`[fetch-boamp] GET ${url}`);
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "edifio-sourcing-seed/0.1 (interne AlyoS Ingenierie)",
    },
  });
  if (!res.ok) {
    throw new Error(`[fetch-boamp] HTTP ${res.status} sur ${url}`);
  }
  const json = (await res.json()) as OpendatasoftV2Response;
  return json.results;
}

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log("[fetch-boamp] ==== ETAPE 5 -- fetch BOAMP one-shot ====");

  // Mode mock explicite (--mock) : pas de fetch reseau, on genere des records
  // synthetiquement plausibles 100% PII-free. Utile en env sans acces sortant
  // (CI, sandbox Claude Code, postes hors-LAN entreprise).
  const useMock = process.argv.includes("--mock") || process.env.BOAMP_FIXTURE_MOCK === "1";

  let rawRecords: Record<string, unknown>[];
  let mode: "live" | "mock" = "live";

  if (useMock) {
    mode = "mock";
    // eslint-disable-next-line no-console
    console.log("[fetch-boamp] MODE MOCK (--mock) : generation synthetique locale.");
    const m = buildMockFixture();
    rawRecords = [...m.small, ...m.medium, ...m.large];
  } else {
    try {
      // 3 pages parallele pour ramener ~300 records (BOAMP rend max 100 / req).
      const pages = await Promise.all([
        fetchPage(0, 100),
        fetchPage(100, 100),
        fetchPage(200, 100),
      ]);
      rawRecords = pages.flat();
    } catch (err) {
      // Fallback mock automatique sur erreur reseau / DNS.
      mode = "mock";
      // eslint-disable-next-line no-console
      console.warn(
        `[fetch-boamp] Acces reseau BOAMP echoue (${(err as Error).message}). Fallback MODE MOCK.`,
      );
      const m = buildMockFixture();
      rawRecords = [...m.small, ...m.medium, ...m.large];
    }
  }
  // eslint-disable-next-line no-console
  console.log(`[fetch-boamp] ${rawRecords.length} records BOAMP recuperes (mode=${mode}).`);

  // Anonymisation (idempotente sur du mock deja PII-free, ne nuit pas).
  const stats = emptyStats();
  const anonRecords = rawRecords.map((rec, i) => anonymize(rec, stats, i));
  // eslint-disable-next-line no-console
  console.log(
    `[fetch-boamp] Anonymisation : ${stats.emails} emails / ${stats.phones} tels / ${stats.names} noms reecrits.`,
  );

  // Distribution naturelle
  const dist = computeDistribution(anonRecords);
  // eslint-disable-next-line no-console
  console.log(
    `[fetch-boamp] Distribution naturelle : small=${dist.small.length}, medium=${dist.medium.length}, large=${dist.large.length}, hors plage=${dist.excluded}.`,
  );

  // Resample si necessaire pour atteindre les cibles
  const small = resampleToTarget(dist.small, FIXTURE_TARGETS.small, 11);
  const medium = resampleToTarget(dist.medium, FIXTURE_TARGETS.medium, 22);
  const large = resampleToTarget(dist.large, FIXTURE_TARGETS.large, 33);

  const all = [...small, ...medium, ...large];
  const median = medianKb(all);
  const ranges = {
    small: rangeKb(small),
    medium: rangeKb(medium),
    large: rangeKb(large),
  };

  const fixture: BoampFixture = {
    small,
    medium,
    large,
    metadata: {
      fetched_at: new Date().toISOString(),
      total: all.length,
      distribution: { small: small.length, medium: medium.length, large: large.length },
      median_kb: Number(median.toFixed(3)),
      buckets_kb: {
        small: `${ranges.small.min.toFixed(2)}-${ranges.small.max.toFixed(2)}`,
        medium: `${ranges.medium.min.toFixed(2)}-${ranges.medium.max.toFixed(2)}`,
        large: `${ranges.large.min.toFixed(2)}-${ranges.large.max.toFixed(2)}`,
      },
      anonymization: stats,
      source_url: mode === "live" ? BOAMP_BASE_URL : "MOCK (buildMockFixture)",
    },
  };

  const outPath = resolve(process.cwd(), "src/db/seed/fixtures/boamp-real.json");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(fixture, null, 2), "utf8");

  const fileSize = JSON.stringify(fixture).length;
  // eslint-disable-next-line no-console
  console.log(`[fetch-boamp] ==== Fixture ecrite : ${outPath}`);
  // eslint-disable-next-line no-console
  console.log(`[fetch-boamp] Taille fichier : ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
  // eslint-disable-next-line no-console
  console.log(`[fetch-boamp] Mediane KB : ${median.toFixed(2)}`);
  // eslint-disable-next-line no-console
  console.log(
    `[fetch-boamp] Cibles ratios : small=${(TARGET_RATIOS.small * 100).toFixed(0)}% medium=${(TARGET_RATIOS.medium * 100).toFixed(0)}% large=${(TARGET_RATIOS.large * 100).toFixed(0)}%.`,
  );
}

// Guarde entry : ne lance main() que si execute directement via `tsx ...`.
const isDirectRun =
  process.argv[1]?.replace(/\\/g, "/").endsWith("src/db/seed/fetch-boamp-fixture.ts") ?? false;

if (isDirectRun) {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  main().catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error("[fetch-boamp] FAIL", err);
    process.exitCode = 1;
  });
}

/**
 * Export pour faciliter le mock dans les tests unitaires (`fetchPage` mockable
 * via vi.mock si un jour on couvre `main()` -- pas le cas a l'etape 5).
 */
export { fetchPage, main as fetchBoampFixtureMain };
