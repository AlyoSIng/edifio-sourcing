// ============================================================================
// edge-function/scoring.ts — Simulation de la cron Edge Function de scoring
// ----------------------------------------------------------------------------
// IMPORTANT — limitation explicite :
//   Ce script tourne sous Node + tsx, PAS sous Deno + supabase functions.
//   La cible de production est une Supabase Edge Function (Deno runtime) qui
//   sera mesurée en Phase 3 si on a Supabase local opérationnel.
//   Le scoring time mesuré ici (durée de l'algorithme + roundtrips DB) reste
//   représentatif — les ms postgres-js sont identiques Deno/Node.
//   Le cold start Edge réel (~80-200 ms typique) ne peut PAS être mesuré ici :
//   ce qu'on mesure côté bench (run-all.ts cold_start) c'est le cold start
//   Node + import Drizzle, à interpréter avec cette nuance dans le rapport.
//
// Le script :
//   1. Lit 100 tenders mock (status 'sourced')
//   2. Pour chaque tender, calcule un score pondéré contre les 50 architectes
//      → on ne crée pas 100×50 = 5000 lignes ; on retient le MEILLEUR architecte
//        par tender (la décision « quel archi solliciter ») et on upsert UNE
//        ligne dans architect_responses.
//   3. Bench les 2 stratégies d'upsert : un par tender vs batch ON CONFLICT 100.
//   4. Append les mesures dans bench/raw-results.jsonl
//
// Sortie standalone (exit 0/1) compatible spawn depuis bench/run-all.ts.
// ============================================================================

import { mkdirSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL as pathToFileURLStatic } from "node:url";
import { eq, sql as drizzleSql } from "drizzle-orm";
import { db, sql as pgSql } from "../db";
import { architects, architectResponses, tenders, type Architect, type Tender } from "../schema";

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BENCH_RESULTS_PATH = join(__dirname, "..", "bench", "raw-results.jsonl");

// Log structuré JSON-ligne (jsonl). Compatible jq / découpage pgrep facile.
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
  // Crée le dossier bench/ s'il n'existe pas (cas premier run).
  mkdirSync(dirname(BENCH_RESULTS_PATH), { recursive: true });
  appendFileSync(BENCH_RESULTS_PATH, JSON.stringify(entry) + "\n");
}

// ---------------------------------------------------------------------------
// SCORING — logique simplifiée mais réaliste
// ---------------------------------------------------------------------------
// 5 critères pondérés (somme = 100) :
//   - tier_bonus       (20)  : préférence tier dans raw_data.scoring_hints
//   - region_match     (25)  : tender.geo_zone ∈ architect.geo_zones ?
//   - budget_fit       (20)  : tender.amount dans la plage cible de l'archi
//   - delay_score      (15)  : urgency × disponibilité (mock)
//   - tutoiement_pref  (20)  : alignement préférence tu/vous tender/archi
//
// La fonction retourne un score [0..100] arrondi à 2 décimales (cohérent avec
// numeric(5,2) en BDD).

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

  // 1. Tier bonus — toujours appliqué (le seed pose tier = 'Sourcing' partout
  //    pour la 1 org. On regarde le tier "préféré" par le tender).
  // Sur Phase 3 ce critère pourra discriminer si on seed plusieurs orgs.
  const tierBonus = hints.preferred_tier === "Sourcing" ? 20 : 10;

  // 2. Region match — exact si la zone tender est dans les zones archi.
  const regionMatch = tender.geoZone && architect.geoZones.includes(tender.geoZone) ? 25 : 5;

  // 3. Budget fit — heuristique : amount entre 500K et 5M = sweet spot 20 ;
  //    sinon 10 ; pas de montant = 0.
  const amountNum = tender.amount ? Number(tender.amount) : 0;
  let budgetFit = 0;
  if (amountNum > 0) {
    if (amountNum >= 500_000 && amountNum <= 5_000_000) budgetFit = 20;
    else budgetFit = 10;
  }

  // 4. Delay score — urgency 3 (urgent) avec deadline proche pénalise un peu
  //    ; urgency 1 (souple) score plein.
  const urgency = hints.urgency ?? 2;
  const delayScore = urgency === 1 ? 15 : urgency === 2 ? 12 : 8;

  // 5. Tutoiement pref — si tender demande tu et archi accepte tu → 20.
  //    Si neutre (tender ne demande rien) → 10.
  //    Si désaccord → 5.
  let tutoiementPref = 10;
  if (hints.tutoiement_preferred !== undefined) {
    tutoiementPref = hints.tutoiement_preferred === architect.tutoiement ? 20 : 5;
  }

  const total = tierBonus + regionMatch + budgetFit + delayScore + tutoiementPref;
  // Borne à 100 par sécurité (max théorique = 20+25+20+15+20 = 100).
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
// STRATÉGIE A — un upsert par tender (séquentiel)
// ---------------------------------------------------------------------------
// Mesure : durée totale + durée moyenne par upsert. Avantage : code simple,
// pression I/O réseau visible. Inconvénient : roundtrip par ligne.

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
    await db
      .insert(architectResponses)
      .values({
        organizationId,
        tenderId: tender.id,
        architectId: match.architect.id,
        score: String(match.score),
        rationale: `Score auto ${match.score} via Drizzle spike scoring`,
        responseData: { strategy: "per_tender", score: match.score },
        status: "pending",
      })
      .onConflictDoUpdate({
        target: [architectResponses.tenderId, architectResponses.architectId],
        set: {
          score: String(match.score),
          rationale: `Score auto ${match.score} (refresh per_tender)`,
          responseData: { strategy: "per_tender", score: match.score },
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
// STRATÉGIE B — batch ON CONFLICT en une seule requête
// ---------------------------------------------------------------------------
// Mesure : durée totale + durée moyenne (artificielle, mais comparable).
// Avantage : un seul roundtrip TCP, pas d'overhead protocole par ligne.

async function scoreWithBatchUpsert(
  tendersList: Tender[],
  archiPool: Architect[],
  organizationId: string,
): Promise<{ totalMs: number; avgMs: number; rowsUpserted: number }> {
  const t0 = performance.now();
  // Préparer le batch en mémoire d'abord (hors mesure ? non, on garde dedans
  // pour comparer le coût total bout-en-bout — c'est ce qui compte côté Edge).
  const batch: Array<typeof architectResponses.$inferInsert> = [];
  for (const tender of tendersList) {
    const match = pickBestArchitect(tender, archiPool);
    if (!match) continue;
    batch.push({
      organizationId,
      tenderId: tender.id,
      architectId: match.architect.id,
      score: String(match.score),
      rationale: `Score auto ${match.score} via Drizzle spike scoring`,
      responseData: { strategy: "batch_100", score: match.score },
      status: "pending",
    });
  }
  if (batch.length === 0) {
    return { totalMs: performance.now() - t0, avgMs: 0, rowsUpserted: 0 };
  }
  await db
    .insert(architectResponses)
    .values(batch)
    .onConflictDoUpdate({
      target: [architectResponses.tenderId, architectResponses.architectId],
      set: {
        // En batch, on utilise drizzleSql avec EXCLUDED pour appliquer la
        // valeur du nouveau row sur le conflit (pattern PG standard).
        score: drizzleSql`excluded.score`,
        rationale: drizzleSql`excluded.rationale`,
        responseData: drizzleSql`excluded.response_data`,
      },
    });
  const totalMs = performance.now() - t0;
  return {
    totalMs,
    avgMs: batch.length > 0 ? totalMs / batch.length : 0,
    rowsUpserted: batch.length,
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
  // 1. Fetch tenders 'sourced' (filtre métier — Phase 3 on pourrait élargir)
  const tStart = performance.now();
  const tendersList = await db
    .select()
    .from(tenders)
    .where(eq(tenders.status, "sourced"))
    .limit(100);
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

  // 2. Fetch tous les architectes (50, pas de pagination en MVP)
  const aStart = performance.now();
  const archiList = await db.select().from(architects).limit(500);
  const fetchArchitectsMs = performance.now() - aStart;
  logBench({
    ts: new Date().toISOString(),
    op: "fetch_architects",
    duration_ms: Math.round(fetchArchitectsMs * 100) / 100,
    rows_affected: archiList.length,
    iteration,
  });

  // On suppose 1 seule org (le seed pose AlyoS) → on lit l'org du premier tender.
  const organizationId = tendersList[0]?.organizationId;
  if (!organizationId) {
    throw new Error("scoring: tender sans organization_id (anomalie seed)");
  }

  // 3. Stratégie A : per_tender
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

  // 4. Stratégie B : batch_100
  // On ne tronque pas — la table contient déjà les lignes du per_tender ; le
  // batch fera donc des UPDATE sur conflit (pas des INSERT). C'est OK pour le
  // bench : on mesure la stratégie d'upsert, pas la stratégie d'insert pur.
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
  await pgSql.end();
}

// Détection main robuste cross-OS (cf. seed/100-tenders.ts pour rationale).
// pathToFileURL importé en statique (Windows : file:///C:/...).
const isMain = (() => {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURLStatic(process.argv[1]).href;
  } catch {
    return false;
  }
})();

if (isMain) {
  main().catch((err) => {
    console.error("[scoring] FATAL", err);
    process.exit(1);
  });
}
