/**
 * edifio Sourcing — Worker Playwright (squelette Gate 6).
 *
 * Squelette hello-world :
 *  - Fastify sur PORT (Fly.io convention).
 *  - GET  /healthz     → { status, version }
 *  - POST /v1/scrape   → stub protégé par Bearer SCRAPER_TRIGGER_SECRET.
 *  - Subscribe Supabase Realtime channel `orchestrator-scraping`.
 *  - Graceful shutdown SIGTERM (unsubscribe + close).
 *
 * Pas de logique Playwright réelle ici — c'est juste qu'on puisse
 * `docker build` + `docker run` et avoir un health check vert.
 */
import Fastify, { type FastifyInstance } from "fastify";
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const VERSION = "0.1.0";
const PORT = Number(process.env.PORT ?? 8080);
const HOST = "0.0.0.0";

// --- Lecture stricte de l'environnement -------------------------------------

function readEnv(name: string, opts: { required: boolean }): string | undefined {
  const value = process.env[name];
  if (!value || value.length === 0) {
    if (opts.required) {
      // En squelette, on log mais on ne crash pas — un build local sans secrets
      // doit pouvoir démarrer et répondre /healthz. Le Realtime sera juste désactivé.
      console.warn(`[env] Variable ${name} manquante`);
    }
    return undefined;
  }
  return value;
}

const SUPABASE_URL = readEnv("SUPABASE_URL", { required: true });
const SUPABASE_SERVICE_ROLE_KEY = readEnv("SUPABASE_SERVICE_ROLE_KEY", { required: true });
const SCRAPER_TRIGGER_SECRET = readEnv("SCRAPER_TRIGGER_SECRET", { required: true });
// WEBHOOK_TARGET_URL pas utilisé dans le squelette mais documenté.
readEnv("WEBHOOK_TARGET_URL", { required: false });

// --- Setup Fastify ----------------------------------------------------------

const app: FastifyInstance = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? "info",
  },
  disableRequestLogging: false,
});

app.get("/healthz", async () => {
  return { status: "ok", version: VERSION };
});

interface ScrapeBody {
  tender_id?: string;
  odoo_url?: string;
}

app.post<{ Body: ScrapeBody }>("/v1/scrape", async (request, reply) => {
  // Auth bearer.
  const auth = request.headers["authorization"];
  if (!SCRAPER_TRIGGER_SECRET) {
    return reply.code(503).send({ error: "scraper_secret_not_configured" });
  }
  if (!auth || auth !== `Bearer ${SCRAPER_TRIGGER_SECRET}`) {
    return reply.code(401).send({ error: "unauthorized" });
  }

  const body = request.body ?? {};
  if (!body.tender_id || !body.odoo_url) {
    return reply.code(400).send({ error: "missing_fields", required: ["tender_id", "odoo_url"] });
  }

  // Stub — pas d'orchestration Playwright réelle pour Gate 6.
  const jobId = randomUUID();
  request.log.info({ jobId, tenderId: body.tender_id }, "scrape accepted (stub)");
  return reply.code(202).send({ accepted: true, job_id: jobId });
});

// --- Supabase Realtime ------------------------------------------------------

let supabase: SupabaseClient | null = null;
let realtimeChannel: RealtimeChannel | null = null;

function setupRealtime(): void {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    app.log.warn("Supabase env manquants — Realtime désactivé (squelette).");
    return;
  }
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  realtimeChannel = supabase
    .channel("orchestrator-scraping")
    .on("broadcast", { event: "*" }, (payload) => {
      app.log.info({ payload }, "realtime message received");
    })
    .subscribe((status) => {
      app.log.info({ status }, "realtime channel status");
    });
}

// --- Graceful shutdown ------------------------------------------------------

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, "shutdown initiated");
  try {
    if (realtimeChannel && supabase) {
      await supabase.removeChannel(realtimeChannel);
      app.log.info("realtime channel removed");
    }
  } catch (err) {
    app.log.error({ err }, "error removing realtime channel");
  }
  try {
    await app.close();
    app.log.info("fastify closed");
  } catch (err) {
    app.log.error({ err }, "error closing fastify");
  }
  process.exit(0);
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

// --- Bootstrap --------------------------------------------------------------

async function main(): Promise<void> {
  setupRealtime();
  await app.listen({ host: HOST, port: PORT });
  app.log.info({ port: PORT, version: VERSION }, "edifio playwright worker ready");
}

main().catch((err) => {
  console.error("fatal startup error", err);
  process.exit(1);
});
