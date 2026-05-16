// ============================================================================
// edge-function/scoring.ts — Simulation cron Edge Function (variante Prisma)
// ----------------------------------------------------------------------------
// Miroir strict de spike/drizzle/edge-function/scoring.ts (Phase 2a).
// MÊME logique de scoring 5 critères pondérés, MÊMES seuils, MÊMES sorties jsonl.
//
// IMPORTANT — limitation explicite Prisma + Edge Function (cf. Q2 Cowork) :
//   Ce script tourne sous Node + tsx, PAS sous Deno + supabase functions.
//   Le driver utilisé est @prisma/adapter-pg (côté Node, cf. src/db.ts).
//   La cible de production est @prisma/adapter-pg-deno (EXPÉRIMENTAL) sous
//   Supabase Edge Function Deno — non testable en Phase 2b (Data Proxy NO-GO).
//   Handicap structurel assumé du brief — point clé du rapport Phase 4 sur
//   le critère « compat Supabase + RLS » (15 %).
//
// Le script :
//   1. Lit 100 tenders 'sourced'
//   2. Pour chaque tender, calcule le score contre les 50 architectes →
//      retient le MEILLEUR architecte (1 ligne / tender, pas 5000)
//   3. Bench les 2 stratégies d'upsert :
//        - per_tender : loop de prisma.architectResponse.upsert(...)
//                       1 roundtrip réseau par tender (100 RTT)
//        - batch_100  : $queryRaw INSERT ... ON CONFLICT ... DO UPDATE
//                       1 seul roundtrip réseau pour 100 lignes
//   4. Append les mesures dans bench/raw-results.jsonl
//
// ÉCART DX MAJEUR Prisma vs Drizzle (critère 25 % Gate 5) :
//   Prisma N'A PAS de `upsertMany` natif. Pour la stratégie batch_100, on est
//   donc OBLIGÉS de descendre en $queryRaw avec un INSERT ... ON CONFLICT
//   construit à la main. C'est un écart documenté à mettre en regard avec
//   Drizzle qui supporte `.insert().onConflictDoUpdate()` en batch nativement
//   sur l'API typée. Conséquences sur le rapport Phase 4 :
//     - Type safety : perdue côté Prisma sur le batch (raw SQL)
//     - LoC : ~30 lignes de plus côté Prisma pour reconstruire le SQL
//     - Risque SQL injection : Prisma protège $queryRaw via prepared statements
//       (placeholders $1..$N), pas de risque réel mais discipline requise
//
// Sortie standalone (exit 0/1) compatible spawn depuis bench/run-all.ts.
// ============================================================================

import { mkdirSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import type { Architect, Tender } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma, pool } from "../src/db";

// ---------------------------------------------------------------------------
// CONFIG — chemins jsonl identiques au bench Drizzle (artefact attendu par
// run-all.ts côté Prisma).
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BENCH_RESULTS_PATH = join(__dirname, "..", "bench", "raw-results.jsonl");

type LogEntry = {
  ts: string;
  op: string;
  duration_ms: number;
  rows_affected?: number;
  iteration?: number;
  strategy?: "per_tender" | "batch_100";
  notes?: string;
};

function logBench(entry: LogEntry): void {
  mkdirSync(dirname(BENCH_RESULTS_PATH), { recursive: true });
  appendFileSync(BENCH_RESULTS_PATH, JSON.stringify(entry) + "\n");
}

// ---------------------------------------------------------------------------
// SCORING — logique IDENTIQUE au scoring Drizzle (5 critères pondérés)
// ---------------------------------------------------------------------------
// Pondération (somme = 100) :
//   - tier_bonus       (20)
//   - region_match     (25)
//   - budget_fit       (20)
//   - delay_score      (15)
//   - tutoiement_pref  (20)
//
// Retourne un score [0..100] arrondi à 2 décimales (numeric(5,2) BDD).

type ScoringHints = {
  preferred_tier?: "Sourcing" | "Cotraitance" | "Studio IA";
  complexity?: number;
  urgency?: number;
  eco_label_required?: boolean;
  cotraitance_required?: boolean;
  tutoiement_preferred?: boolean;
};

function safeHints(raw: unknown): ScoringHints {
  if (raw && typeof raw === "object" && "scoring_hints" in raw) {
    const h = (raw as { scoring_hints?: ScoringHints }).scoring_hints;
    if (h && typeof h === "object") return h;
  }
  return {};
}

function computeScore(tender: Tender, architect: Architect): number {
  const hints = safeHints(tender.rawData);

  // 1. Tier bonus
  const tierBonus = hints.preferred_tier === "Sourcing" ? 20 : 10;

  // 2. Region match
  const regionMatch = tender.geoZone && architect.geoZones.includes(tender.geoZone) ? 25 : 5;

  // 3. Budget fit — Prisma Decimal côté tender.amount. Conversion safe via
  //    .toNumber() (Decimal.js sous-jacent). Drizzle stocke en string → on
  //    avait Number(tender.amount). Comportement final identique.
  const amountNum = tender.amount ? Number(tender.amount.toString()) : 0;
  let budgetFit = 0;
  if (amountNum > 0) {
    if (amountNum >= 500_000 && amountNum <= 5_000_000) budgetFit = 20;
    else budgetFit = 10;
  }

  // 4. Delay score
  const urgency = hints.urgency ?? 2;
  const delayScore = urgency === 1 ? 15 : urgency === 2 ? 12 : 8;

  // 5. Tutoiement pref
  let tutoiementPref = 10;
  if (hints.tutoiement_preferred !== undefined) {
    tutoiementPref = hints.tutoiement_preferred === architect.tutoiement ? 20 : 5;
  }

  const total = tierBonus + regionMatch + budgetFit + delayScore + tutoiementPref;
  return Math.round(Math.min(total, 100) * 100) / 100;
}

// ---------------------------------------------------------------------------
// MATCHING — retourne le meilleur archi pour un tender donné
// ---------------------------------------------------------------------------

function pickBestArchitect(
  tender: Tender,
  archiPool: Architect[],
): { architect: Architect; score: number } | null {
  if (archiPool.length === 0) return null;
  let best = archiPool[0];
  if (!best) return null;
  let bestScore = computeScore(tender, best);
  for (let i = 1; i < archiPool.length; i++) {
    const a = archiPool[i];
    if (!a) continue;
    const s = computeScore(tender, a);
    if (s > bestScore) {
      best = a;
      bestScore = s;
    }
  }
  return { architect: best, score: bestScore };
}

// ---------------------------------------------------------------------------
// STRATÉGIE A — un upsert par tender (séquentiel, API Prisma typée)
// ---------------------------------------------------------------------------
// `prisma.architectResponse.upsert` : la contrainte UNIQUE (tender_id,
// architect_id) est reflétée Prisma sous la clé composée `tender_id_architect_id`.
// API DX correcte mais 1 roundtrip réseau par ligne — c'est précisément ce
// que le bench mesure face au batch.

async function scoreWithPerTenderUpsert(
  tendersList: Tender[],
  archiPool: Architect[],
  organizationId: string,
): Promise<{ totalMs: number; avgMs: number; rowsUpserted: number }> {
  const t0 = performance.now();
  let rowsUpserted = 0;
  for (const tender of tendersList) {
    const match = pickBestArchitect(tender, archiPool);
    if (!match) continue;
    await prisma.architectResponse.upsert({
      // Clé composite générée par Prisma à partir du @@unique du schema :
      //   @@unique([tenderId, architectId], map: "uq_architect_responses_tender_arch_spike")
      // → champ where : { tenderId_architectId: { tenderId, architectId } }
      where: {
        tenderId_architectId: {
          tenderId: tender.id,
          architectId: match.architect.id,
        },
      },
      create: {
        organizationId,
        tenderId: tender.id,
        architectId: match.architect.id,
        score: new Prisma.Decimal(match.score),
        rationale: `Score auto ${match.score} via Prisma spike scoring`,
        responseData: { strategy: "per_tender", score: match.score } as Prisma.InputJsonValue,
        status: "pending",
      },
      update: {
        score: new Prisma.Decimal(match.score),
        rationale: `Score auto ${match.score} (refresh per_tender)`,
        responseData: { strategy: "per_tender", score: match.score } as Prisma.InputJsonValue,
      },
    });
    rowsUpserted++;
  }
  const totalMs = performance.now() - t0;
  return {
    totalMs,
    avgMs: rowsUpserted > 0 ? totalMs / rowsUpserted : 0,
    rowsUpserted,
  };
}

// ---------------------------------------------------------------------------
// STRATÉGIE B — batch ON CONFLICT en une seule requête $queryRaw
// ---------------------------------------------------------------------------
// PRISMA N'A PAS D'UPSERTMANY NATIF. On descend donc en SQL brut via
// $queryRawUnsafe + Prisma.sql tagged template pour interpoler les valeurs
// avec prepared statements (placeholders $1..$N).
//
// Pattern PG standard : INSERT ... VALUES (...), (...), ... ON CONFLICT (a, b)
// DO UPDATE SET col = EXCLUDED.col. EXCLUDED référence la row "qui aurait été
// insérée" → c'est la source des valeurs d'update.
//
// SÉCURITÉ : tous les paramètres dynamiques passent par les placeholders
// `$1, $2, …` (pas de string concat). Prisma.sql gère l'échappement.
//
// LoC supplémentaire vs Drizzle : ~30 lignes pour reconstruire le statement.
// À documenter dans le rapport Phase 4 — c'est un point clé de l'écart DX.

async function scoreWithBatchUpsert(
  tendersList: Tender[],
  archiPool: Architect[],
  organizationId: string,
): Promise<{ totalMs: number; avgMs: number; rowsUpserted: number }> {
  const t0 = performance.now();
  // Préparation du batch en mémoire (intégrée dans la mesure pour cohérence
  // bench bout-en-bout avec le Drizzle).
  type BatchRow = {
    id: string;
    organizationId: string;
    tenderId: string;
    architectId: string;
    score: number;
    rationale: string;
    responseData: Record<string, unknown>;
    status: string;
  };
  const batch: BatchRow[] = [];
  for (const tender of tendersList) {
    const match = pickBestArchitect(tender, archiPool);
    if (!match) continue;
    batch.push({
      // ID pré-généré JS — l'INSERT raw a besoin d'un id explicite (le
      // dbgenerated(gen_random_uuid()) du schéma n'est appliqué que si l'on
      // omet la colonne au niveau SQL, ce qui complique le placeholder set).
      id: randomUUID(),
      organizationId,
      tenderId: tender.id,
      architectId: match.architect.id,
      score: match.score,
      rationale: `Score auto ${match.score} via Prisma spike scoring`,
      responseData: { strategy: "batch_100", score: match.score },
      status: "pending",
    });
  }
  if (batch.length === 0) {
    return { totalMs: performance.now() - t0, avgMs: 0, rowsUpserted: 0 };
  }

  // Construction du VALUES (...), (...), ... avec placeholders.
  // 8 colonnes par row → ($1..$8), ($9..$16), ...
  const COLS_PER_ROW = 8;
  const valuesClauses: string[] = [];
  const params: unknown[] = [];
  batch.forEach((row, i) => {
    const base = i * COLS_PER_ROW;
    valuesClauses.push(
      `($${base + 1}::uuid, $${base + 2}::uuid, $${base + 3}::uuid, $${base + 4}::uuid, ` +
        `$${base + 5}::numeric(5,2), $${base + 6}::text, $${base + 7}::jsonb, ` +
        `$${base + 8}::architect_response_status)`,
    );
    params.push(
      row.id,
      row.organizationId,
      row.tenderId,
      row.architectId,
      row.score,
      row.rationale,
      JSON.stringify(row.responseData),
      row.status,
    );
  });

  const sql =
    "INSERT INTO architect_responses " +
    "(id, organization_id, tender_id, architect_id, score, rationale, response_data, status) " +
    "VALUES " +
    valuesClauses.join(", ") +
    " ON CONFLICT (tender_id, architect_id) DO UPDATE SET " +
    "score = EXCLUDED.score, " +
    "rationale = EXCLUDED.rationale, " +
    "response_data = EXCLUDED.response_data";

  // $executeRawUnsafe : retourne le rowsAffected (INSERT + UPDATE de conflit).
  // Sécurisé via placeholders Prisma — pas de string concat utilisateur.
  const rowsAffected = await prisma.$executeRawUnsafe(sql, ...params);
  const totalMs = performance.now() - t0;
  return {
    totalMs,
    avgMs: batch.length > 0 ? totalMs / batch.length : 0,
    rowsUpserted: typeof rowsAffected === "number" ? rowsAffected : batch.length,
  };
}

// ---------------------------------------------------------------------------
// MAIN — orchestration scoring complet
// ---------------------------------------------------------------------------

export type ScoringRunResult = {
  perTender: { totalMs: number; avgMs: number; rowsUpserted: number };
  batch: { totalMs: number; avgMs: number; rowsUpserted: number };
  fetchTendersMs: number;
  fetchArchitectsMs: number;
  iteration: number;
};

export async function runScoring(iteration = 1): Promise<ScoringRunResult> {
  // 1. Fetch tenders 'sourced'
  const tStart = performance.now();
  const tendersList = await prisma.tender.findMany({
    where: { status: "sourced" },
    take: 100,
  });
  const fetchTendersMs = performance.now() - tStart;
  logBench({
    ts: new Date().toISOString(),
    op: "fetch_tenders",
    duration_ms: Math.round(fetchTendersMs * 100) / 100,
    rows_affected: tendersList.length,
    iteration,
  });

  if (tendersList.length === 0) {
    throw new Error("scoring: 0 tender — exécuter seed/100-tenders.ts d'abord");
  }

  // 2. Fetch tous les architectes (50, pas de pagination MVP)
  const aStart = performance.now();
  const archiList = await prisma.architect.findMany({ take: 500 });
  const fetchArchitectsMs = performance.now() - aStart;
  logBench({
    ts: new Date().toISOString(),
    op: "fetch_architects",
    duration_ms: Math.round(fetchArchitectsMs * 100) / 100,
    rows_affected: archiList.length,
    iteration,
  });

  // On suppose 1 seule org (AlyoS — cf. seed) → on lit l'org du premier tender.
  const organizationId = tendersList[0]?.organizationId;
  if (!organizationId) {
    throw new Error("scoring: tender sans organization_id (anomalie seed)");
  }

  // 3. Stratégie A : per_tender (loop d'upserts API Prisma typée)
  const perTender = await scoreWithPerTenderUpsert(tendersList, archiList, organizationId);
  logBench({
    ts: new Date().toISOString(),
    op: "upsert",
    duration_ms: Math.round(perTender.totalMs * 100) / 100,
    rows_affected: perTender.rowsUpserted,
    strategy: "per_tender",
    iteration,
    notes: `avg_ms_per_row=${perTender.avgMs.toFixed(2)}`,
  });

  // 4. Stratégie B : batch_100 ($queryRaw ON CONFLICT)
  // Pas de truncate — la table contient déjà les rows du per_tender ; le batch
  // produit donc des UPDATE sur conflit (pattern identique au bench Drizzle).
  const batch = await scoreWithBatchUpsert(tendersList, archiList, organizationId);
  logBench({
    ts: new Date().toISOString(),
    op: "upsert",
    duration_ms: Math.round(batch.totalMs * 100) / 100,
    rows_affected: batch.rowsUpserted,
    strategy: "batch_100",
    iteration,
    notes: `avg_ms_per_row=${batch.avgMs.toFixed(2)}`,
  });

  return {
    perTender,
    batch,
    fetchTendersMs,
    fetchArchitectsMs,
    iteration,
  };
}

// ---------------------------------------------------------------------------
// CLI direct
// ---------------------------------------------------------------------------

async function main() {
  const iter = Number(process.env.SCORING_ITERATION ?? "1");
  console.log(`[scoring] start iteration=${iter}`);
  const result = await runScoring(iter);
  console.log("[scoring] per_tender:", {
    totalMs: result.perTender.totalMs.toFixed(2),
    avgMs: result.perTender.avgMs.toFixed(2),
    rows: result.perTender.rowsUpserted,
  });
  console.log("[scoring] batch_100:", {
    totalMs: result.batch.totalMs.toFixed(2),
    avgMs: result.batch.avgMs.toFixed(2),
    rows: result.batch.rowsUpserted,
  });
  await prisma.$disconnect();
  await pool.end();
}

const isMain = (() => {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

if (isMain) {
  main().catch(async (err) => {
    console.error("[scoring] FATAL", err);
    await prisma.$disconnect().catch(() => undefined);
    await pool.end().catch(() => undefined);
    process.exit(1);
  });
}
