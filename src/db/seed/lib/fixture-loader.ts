/**
 * Charge la fixture BOAMP committee depuis src/db/seed/fixtures/boamp-real.json.
 *
 * Strategie de robustesse :
 *   - Si le fichier existe : on le lit (cas nominal en CI et en dev quotidien).
 *   - Si le fichier n'existe pas (ex. premier checkout, dev sans avoir lance
 *     `pnpm db:fetch-boamp`) : on bascule sur `buildMockFixture()` et on logge
 *     un warning explicite. Le seed reste fonctionnel mais la fixture n'est pas
 *     persistee.
 *
 * Module IO -- non testable unitairement avec mocks legers, valide indirectement
 * par le seed e2e CI.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildMockFixture } from "./fixture-mock";

export interface BoampFixturePayload {
  small: Record<string, unknown>[];
  medium: Record<string, unknown>[];
  large: Record<string, unknown>[];
  metadata: {
    fetched_at: string;
    total: number;
    distribution: { small: number; medium: number; large: number };
    median_kb: number;
    buckets_kb: { small: string; medium: string; large: string };
    source_url: string;
  };
}

const FIXTURE_PATH = resolve(process.cwd(), "src/db/seed/fixtures/boamp-real.json");

export function loadBoampFixture(): BoampFixturePayload {
  if (existsSync(FIXTURE_PATH)) {
    // eslint-disable-next-line no-console
    console.log(`[seed] Lecture fixture committee : ${FIXTURE_PATH}`);
    const raw = readFileSync(FIXTURE_PATH, "utf8");
    return JSON.parse(raw) as BoampFixturePayload;
  }
  // eslint-disable-next-line no-console
  console.warn(
    "[seed] Fixture BOAMP introuvable -> fallback MOCK. Lance `pnpm db:fetch-boamp` (ou `--mock`) pour persister une fixture committee.",
  );
  const m = buildMockFixture();
  return {
    small: m.small,
    medium: m.medium,
    large: m.large,
    metadata: {
      fetched_at: new Date().toISOString(),
      total: m.small.length + m.medium.length + m.large.length,
      distribution: { small: m.small.length, medium: m.medium.length, large: m.large.length },
      median_kb: 25,
      buckets_kb: { small: "9-11", medium: "22-28", large: "42-48" },
      source_url: "MOCK (fallback fixture absente)",
    },
  };
}
