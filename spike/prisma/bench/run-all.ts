// ============================================================================
// bench/run-all.ts — Orchestrateur unique du bench Prisma (Phase 3)
// ----------------------------------------------------------------------------
// Miroir strict de spike/drizzle/bench/run-all.ts. Structure identique pour
// que le rapport Phase 4 compare des JSON aux mêmes schémas.
//
// Lance dans l'ordre :
//   1. Cold start  (5 itérations, process recyclé via spawn d'un sub-process)
//   2. Upsert      (5 itérations du scoring complet, collecte jsonl)
//   3. Migration replay (3 itérations `prisma db push` post DROP SCHEMA)
//
// Sortie : spike/prisma/bench/bench-results.json — structure identique au JSON
// Drizzle, champ "orm" = "prisma", "version" = version @prisma/client locale.
//
// Gestion d'erreur DB : fail propre avec message explicite si DATABASE_URL
// absent ou Postgres injoignable.
//
// Usage :
//   pnpm bench            # depuis spike/prisma/
//   tsx bench/run-all.ts  # direct
// ============================================================================

import { spawnSync, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { arch, platform, release, totalmem } from "node:os";

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SPIKE_ROOT = join(__dirname, "..");
const RAW_RESULTS = join(__dirname, "raw-results.jsonl");
const OUTPUT = join(__dirname, "bench-results.json");
const COLD_START_SCRIPT = join(__dirname, "cold-start-probe.ts");
const SCORING_SCRIPT = join(SPIKE_ROOT, "edge-function", "scoring.ts");
const SEED_SCRIPT = join(SPIKE_ROOT, "seed", "100-tenders.ts");

const COLD_START_ITERATIONS = Number(process.env.BENCH_COLD_START_ITER ?? "5");
const UPSERT_ITERATIONS = Number(process.env.BENCH_UPSERT_ITER ?? "5");
const MIGRATION_ITERATIONS = Number(process.env.BENCH_MIGRATION_ITER ?? "3");

// Version @prisma/client — lue dynamiquement du package.json local.
// Crucial pour la traçabilité bench Phase 4 (différence engine majeure entre
// Prisma 5/6 → cold start non comparable).
function readOrmVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(SPIKE_ROOT, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    return pkg.dependencies?.["@prisma/client"] ?? "unknown";
  } catch {
    return "unknown";
  }
}

// ---------------------------------------------------------------------------
// STATS HELPERS — identiques au bench Drizzle
// ---------------------------------------------------------------------------

type Stats = {
  median_ms: number;
  p95_ms: number;
  stdev_ms: number;
  mean_ms: number;
  iterations: number[];
};

function computeStats(iterations: number[]): Stats {
  if (iterations.length === 0) {
    return { median_ms: 0, p95_ms: 0, stdev_ms: 0, mean_ms: 0, iterations: [] };
  }
  const sorted = [...iterations].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const p95Idx = Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1);
  const p95 = sorted[p95Idx] ?? 0;
  const mean = iterations.reduce((s, v) => s + v, 0) / iterations.length;
  const variance = iterations.reduce((s, v) => s + (v - mean) ** 2, 0) / iterations.length;
  const stdev = Math.sqrt(variance);
  return {
    median_ms: round2(median),
    p95_ms: round2(p95),
    stdev_ms: round2(stdev),
    mean_ms: round2(mean),
    iterations: iterations.map(round2),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// 1. COLD START — spawn de sub-processes pour forcer le recyclage
// ---------------------------------------------------------------------------
// On délègue à cold-start-probe.ts qui mesure ça en isolation et imprime
// `COLD_START_MS=<n>` sur stdout. Le runner parse cette ligne.
//
// POINT CLÉ Phase 4 — handicap structurel attendu :
//   Le cold start Prisma inclut le chargement du Prisma engine (Wasm ~30 MB
//   avec previewFeatures.driverAdapters). C'est le candidat principal au
//   différentiel cold start vs drizzle-orm (thin wrapper). À documenter dans
//   le rapport Phase 4 sous le critère 50 % Gate 5.

async function runColdStart(): Promise<Stats> {
  const iterations: number[] = [];
  console.log(`\n[bench] cold-start × ${COLD_START_ITERATIONS}`);
  for (let i = 0; i < COLD_START_ITERATIONS; i++) {
    const res = spawnSync("npx", ["tsx", COLD_START_SCRIPT], {
      cwd: SPIKE_ROOT,
      env: process.env,
      encoding: "utf8",
      // Windows : npx est un .cmd, shell:true requis. Cross-platform-safe.
      shell: true,
      timeout: 30_000,
    });
    if (res.status !== 0) {
      throw new Error(
        `[bench] cold-start iteration ${i + 1} failed (exit=${res.status}):\n${res.stderr}`,
      );
    }
    const match = res.stdout.match(/COLD_START_MS=([\d.]+)/);
    if (!match || !match[1]) {
      throw new Error(
        `[bench] cold-start iteration ${i + 1} : marker absent dans stdout :\n${res.stdout}`,
      );
    }
    const ms = Number(match[1]);
    iterations.push(ms);
    console.log(`  iter ${i + 1}/${COLD_START_ITERATIONS} → ${ms.toFixed(2)} ms`);
  }
  return computeStats(iterations);
}

// ---------------------------------------------------------------------------
// 2. UPSERT — réutilise scoring.ts comme black box
// ---------------------------------------------------------------------------
// Reset du jsonl en début, seed UNE fois, puis N runs scoring en sub-process.
// Chaque itération parse les entrées 'upsert' du jsonl filtrées par iteration.

type UpsertStrategyResult = { per_tender_ms: number; batch_100_ms: number };

async function runUpsert(): Promise<{
  per_tender: Stats;
  batch_100: Stats;
}> {
  console.log(`\n[bench] upsert × ${UPSERT_ITERATIONS} (after seed)`);
  if (existsSync(RAW_RESULTS)) {
    rmSync(RAW_RESULTS);
  }
  mkdirSync(dirname(RAW_RESULTS), { recursive: true });

  // Seed déterministe (1 fois — données stables, scoring rejoué N fois dessus).
  console.log("  [seed] running…");
  const seedRes = spawnSync("npx", ["tsx", SEED_SCRIPT], {
    cwd: SPIKE_ROOT,
    env: process.env,
    encoding: "utf8",
    shell: true,
    timeout: 120_000,
  });
  if (seedRes.status !== 0) {
    throw new Error(`[bench] seed failed:\n${seedRes.stderr}`);
  }

  const perTenderRuns: number[] = [];
  const batch100Runs: number[] = [];
  for (let i = 1; i <= UPSERT_ITERATIONS; i++) {
    const res = spawnSync("npx", ["tsx", SCORING_SCRIPT], {
      cwd: SPIKE_ROOT,
      env: { ...process.env, SCORING_ITERATION: String(i) },
      encoding: "utf8",
      shell: true,
      timeout: 180_000,
    });
    if (res.status !== 0) {
      throw new Error(`[bench] scoring iteration ${i} failed:\n${res.stderr}`);
    }
    const parsed = parseUpsertEntries(i);
    if (!parsed) {
      throw new Error(`[bench] scoring iter ${i} : entrées jsonl absentes après run`);
    }
    perTenderRuns.push(parsed.per_tender_ms);
    batch100Runs.push(parsed.batch_100_ms);
    console.log(
      `  iter ${i}/${UPSERT_ITERATIONS} → per_tender=${parsed.per_tender_ms.toFixed(2)} ms, ` +
        `batch_100=${parsed.batch_100_ms.toFixed(2)} ms`,
    );
  }
  return {
    per_tender: computeStats(perTenderRuns),
    batch_100: computeStats(batch100Runs),
  };
}

function parseUpsertEntries(iteration: number): UpsertStrategyResult | null {
  if (!existsSync(RAW_RESULTS)) return null;
  const lines = readFileSync(RAW_RESULTS, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0);
  let perTender = -1;
  let batch100 = -1;
  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as {
        op?: string;
        strategy?: string;
        iteration?: number;
        duration_ms?: number;
      };
      if (entry.op !== "upsert") continue;
      if (entry.iteration !== iteration) continue;
      if (entry.strategy === "per_tender" && typeof entry.duration_ms === "number") {
        perTender = entry.duration_ms;
      } else if (entry.strategy === "batch_100" && typeof entry.duration_ms === "number") {
        batch100 = entry.duration_ms;
      }
    } catch {
      // Ligne corrompue — on l'ignore. Pas bloquant.
    }
  }
  if (perTender < 0 || batch100 < 0) return null;
  return { per_tender_ms: perTender, batch_100_ms: batch100 };
}

// ---------------------------------------------------------------------------
// 3. MIGRATION REPLAY
// ---------------------------------------------------------------------------
// Équivalent Prisma au `drizzle-kit drop + push` : `prisma db push --force-reset`
// recrée le schéma from scratch en supprimant les données. Plus simple et plus
// fidèle à l'outillage Prisma natif que de passer par psql DROP SCHEMA.
//
// Cf. https://www.prisma.io/docs/orm/reference/prisma-cli-reference#db-push
//
// --accept-data-loss : Prisma demande confirmation interactive sinon. Le flag
// l'évite (équivalent à `--force-reset` qui inclut déjà ce comportement).

async function runMigrationReplay(): Promise<Stats | { skipped: true; reason: string }> {
  console.log(`\n[bench] migration-replay × ${MIGRATION_ITERATIONS}`);
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return { skipped: true, reason: "DATABASE_URL non défini" };
  }
  // Détection prisma CLI disponible (devDep installée — node_modules attendu).
  try {
    execFileSync("npx", ["prisma", "--version"], {
      stdio: "ignore",
      cwd: SPIKE_ROOT,
      shell: true,
    });
  } catch {
    return {
      skipped: true,
      reason: "prisma CLI introuvable (pnpm install requis dans spike/prisma/)",
    };
  }
  const iterations: number[] = [];
  for (let i = 0; i < MIGRATION_ITERATIONS; i++) {
    // `prisma db push --force-reset --accept-data-loss` :
    //   - DROP les objets du schéma cible
    //   - recrée from schema.prisma
    //   - équivalent applicatif d'un drizzle-kit drop + push
    const t0 = performance.now();
    const pushRes = spawnSync(
      "npx",
      ["prisma", "db", "push", "--force-reset", "--accept-data-loss", "--skip-generate"],
      {
        cwd: SPIKE_ROOT,
        env: process.env,
        encoding: "utf8",
        shell: true,
        timeout: 120_000,
      },
    );
    if (pushRes.status !== 0) {
      throw new Error(`[bench] prisma db push iter ${i + 1} failed:\n${pushRes.stderr}`);
    }
    const elapsed = performance.now() - t0;
    iterations.push(elapsed);
    console.log(`  iter ${i + 1}/${MIGRATION_ITERATIONS} → ${elapsed.toFixed(2)} ms`);
  }
  return computeStats(iterations);
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

async function main() {
  console.log("[bench] === Prisma bench runner ===");
  console.log(`[bench] node=${process.version}, platform=${platform()}-${arch()}`);

  const ormVersion = readOrmVersion();
  const databaseUrlSet = Boolean(process.env.DATABASE_URL);
  if (!databaseUrlSet) {
    console.error(
      "[bench] ERREUR : DATABASE_URL non défini. Le bench requiert un Postgres " +
        "accessible (Supabase local ou projet preview). Copier .env.example vers " +
        ".env.local et renseigner DATABASE_URL.",
    );
    process.exit(1);
  }

  const machine = {
    platform: `${platform()}-${arch()}`,
    os_release: release(),
    node: process.version,
    total_mem_gb: Math.round((totalmem() / 1024 ** 3) * 10) / 10,
  };

  const coldStart = await runColdStart();
  const upsert = await runUpsert();
  const migrationReplay = await runMigrationReplay();

  const result = {
    orm: "prisma",
    version: ormVersion,
    timestamp: new Date().toISOString(),
    machine,
    iterations_config: {
      cold_start: COLD_START_ITERATIONS,
      upsert: UPSERT_ITERATIONS,
      migration: MIGRATION_ITERATIONS,
    },
    metrics: {
      cold_start: coldStart,
      upsert_per_tender: upsert.per_tender,
      upsert_batch_100: upsert.batch_100,
      migration_replay: migrationReplay,
    },
  };

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2) + "\n");
  console.log(`\n[bench] OK — résultats écrits dans ${OUTPUT}`);
  console.log("[bench] résumé :");
  console.log(`  cold_start         median=${coldStart.median_ms} ms, p95=${coldStart.p95_ms} ms`);
  console.log(
    `  upsert_per_tender  median=${upsert.per_tender.median_ms} ms, p95=${upsert.per_tender.p95_ms} ms`,
  );
  console.log(
    `  upsert_batch_100   median=${upsert.batch_100.median_ms} ms, p95=${upsert.batch_100.p95_ms} ms`,
  );
  if ("skipped" in migrationReplay) {
    console.log(`  migration_replay   SKIPPED (${migrationReplay.reason})`);
  } else {
    console.log(
      `  migration_replay   median=${migrationReplay.median_ms} ms, p95=${migrationReplay.p95_ms} ms`,
    );
  }
}

main().catch((err) => {
  console.error("[bench] FATAL", err instanceof Error ? err.message : err);
  process.exit(1);
});
