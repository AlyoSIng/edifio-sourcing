/**
 * edifio Sourcing — Worker Playwright v1.0.0
 *
 * POST /v1/scrape — scraping AOs PLACE et Francmarchés.
 * Réponse immédiate 202 + scraping asynchrone + webhook résultat vers Vercel.
 *
 * Routes exposées :
 *  - GET  /healthz     → { status, version }
 *  - POST /v1/scrape   → { runId, estimatedDuration } (202) + scraping en background
 *
 * Sécurité : toutes les routes /v1/* nécessitent le header
 *   Authorization: Bearer <SCRAPER_TRIGGER_SECRET>
 *
 * Le browser Playwright est une instance partagée, réutilisée entre les jobs.
 * Il est fermé proprement au SIGTERM/SIGINT.
 */

import Fastify, { type FastifyInstance } from "fastify";
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { chromium, type Browser } from "playwright";
import { randomUUID } from "node:crypto";
import { scrapeFrancmarches } from "./scrapers/francmarches.js";
import { scrapePlace } from "./scrapers/place.js";
import { scrapeMarChesPublicsInfo } from "./scrapers/marchespublicsinfo.js";
import { scrapeMpe76 } from "./scrapers/mpe76.js";
import { scrapeMarchesOnline } from "./scrapers/marchesonline.js";
import { scrapeMarChesPublicsNormandie } from "./scrapers/marchespublicsnormandie.js";
import { scrapeMarEgionSud } from "./scrapers/maregionsud.js";
import { scrapeDepartement13 } from "./scrapers/departement13.js";
import type { ScrapeRequest, ScrapeJobResult, ScrapingPlatform } from "./scrapers/types.js";

const VERSION = "1.0.0";
const PORT = Number(process.env.PORT ?? 8080);
const HOST = "0.0.0.0";

// ---------------------------------------------------------------------------
// Lecture de l'environnement
// ---------------------------------------------------------------------------

function readEnv(name: string, opts: { required: boolean }): string | undefined {
  const value = process.env[name];
  if (!value || value.length === 0) {
    if (opts.required) {
      console.warn(`[env] Variable ${name} manquante`);
    }
    return undefined;
  }
  return value;
}

const SUPABASE_URL = readEnv("SUPABASE_URL", { required: true });
const SUPABASE_SERVICE_ROLE_KEY = readEnv("SUPABASE_SERVICE_ROLE_KEY", { required: true });
const SCRAPER_TRIGGER_SECRET = readEnv("SCRAPER_TRIGGER_SECRET", { required: true });
// WEBHOOK_TARGET_URL : URL Vercel par défaut si non fourni dans le corps de la requête
readEnv("WEBHOOK_TARGET_URL", { required: false });
// Browserbase : navigateur distant pour le scraper marches-publics.info (anti-bot).
// Non requis (fail-soft) : si absent, le scraper mp_info log un warn et retourne [].
// Les autres plateformes gardent le browser Playwright local.
readEnv("BROWSERBASE_API_KEY", { required: false });
readEnv("BROWSERBASE_PROJECT_ID", { required: false });

// ---------------------------------------------------------------------------
// Instance Playwright partagée
// ---------------------------------------------------------------------------

let browser: Browser | null = null;

/**
 * Retourne l'instance Playwright partagée.
 * En crée une nouvelle si elle n'existe pas ou si elle s'est déconnectée.
 */
async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    console.info("[browser] lancement d'un nouveau browser Chromium");
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-extensions",
      ],
    });
  }
  return browser;
}

// ---------------------------------------------------------------------------
// Setup Fastify
// ---------------------------------------------------------------------------

const app: FastifyInstance = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? "info",
  },
  disableRequestLogging: false,
});

// Healthcheck — pas d'auth requise
app.get("/healthz", async () => {
  return {
    status: "ok",
    version: VERSION,
    browser: browser?.isConnected() ? "connected" : "idle",
  };
});

// ---------------------------------------------------------------------------
// Webhook helper
// ---------------------------------------------------------------------------

/**
 * Envoie les résultats du scraping vers le webhook Vercel.
 * Non bloquant pour le worker : les erreurs sont logguées sans relance.
 */
async function postWebhook(webhookUrl: string, payload: ScrapeJobResult): Promise<void> {
  const secret = process.env.SCRAPER_TRIGGER_SECRET ?? "";
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.warn("[worker:webhook] HTTP non-OK:", res.status, webhookUrl);
    } else {
      console.info("[worker:webhook] résultats envoyés avec succès à", webhookUrl);
    }
  } catch (err) {
    console.error("[worker:webhook] erreur envoi résultats:", err);
  }
}

// ---------------------------------------------------------------------------
// Validation du corps de la requête /v1/scrape
// ---------------------------------------------------------------------------

type ScrapePlatform = ScrapingPlatform;

const VALID_PLATFORMS = new Set<ScrapingPlatform>([
  "place",
  "francmarches",
  "marchespublicsinfo",
  "mpe76",
  "marchesonline",
  "marchespublicsnormandie",
  "maregionsud",
  "departement13",
]);

interface ScrapeBodyRaw {
  platform?: unknown;
  profileFilters?: unknown;
  lastRunAt?: unknown;
  profileId?: unknown;
  orgId?: unknown;
  webhookUrl?: unknown;
  credentials?: unknown;
}

function isValidPlatform(value: unknown): value is ScrapePlatform {
  return typeof value === "string" && VALID_PLATFORMS.has(value as ScrapingPlatform);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseProfileFilters(raw: unknown): ScrapeRequest["profileFilters"] {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const result: ScrapeRequest["profileFilters"] = {};

  if (Array.isArray(obj["keywords"])) {
    result.keywords = obj["keywords"].filter((k): k is string => typeof k === "string");
  }
  if (Array.isArray(obj["geoZones"])) {
    result.geoZones = obj["geoZones"].filter((z): z is string => typeof z === "string");
  }
  return result;
}

function parseCredentials(raw: unknown): ScrapeRequest["credentials"] | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  return {
    username: typeof obj["username"] === "string" ? obj["username"] : undefined,
    password: typeof obj["password"] === "string" ? obj["password"] : undefined,
  };
}

/**
 * Credentials de plateforme depuis l'ENVIRONNEMENT du worker (secrets Fly), en
 * REPLI quand le payload ne les fournit pas.
 *
 * Fix 2026-07-07 : le monorepo (`triggerScrapeJob`) n'envoie PAS de
 * `credentials` dans le body → PLACE, qui exige un login (cf. `place.ts`),
 * échouait systématiquement sur « PLACE credentials required » alors que le
 * worker porte bien `PLACE_USERNAME` / `PLACE_PASSWORD` en secrets Fly (jamais
 * lus jusqu'ici). On les injecte ici. Retourne `undefined` si la plateforme
 * n'exige pas d'auth ou si les secrets sont absents (fail-soft — le scraper
 * lèvera alors son erreur explicite).
 */
function envCredentialsFor(platform: ScrapingPlatform): ScrapeRequest["credentials"] | undefined {
  if (platform === "place") {
    const username = process.env.PLACE_USERNAME;
    const password = process.env.PLACE_PASSWORD;
    if (username && username.length > 0 && password && password.length > 0) {
      return { username, password };
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Logique de scraping en background
// ---------------------------------------------------------------------------

/**
 * Lance le scraping pour le job donné, puis poste les résultats via webhook.
 * Appelé en process.nextTick depuis le handler /v1/scrape.
 */
async function runScrapingJob(req: ScrapeRequest, runId: string): Promise<void> {
  const startedAt = Date.now();
  console.info(`[worker] job ${runId} démarré — plateforme: ${req.platform}`);

  let tenders: ScrapeJobResult["tenders"] = null;
  let errorMsg: string | undefined;

  try {
    const b = await getBrowser();

    switch (req.platform) {
      case "francmarches":
        tenders = await scrapeFrancmarches(req, b);
        break;
      case "marchespublicsinfo":
        tenders = await scrapeMarChesPublicsInfo(req, b);
        break;
      case "mpe76":
        tenders = await scrapeMpe76(req, b);
        break;
      case "marchesonline":
        tenders = await scrapeMarchesOnline(req, b);
        break;
      case "marchespublicsnormandie":
        tenders = await scrapeMarChesPublicsNormandie(req, b);
        break;
      case "maregionsud":
        tenders = await scrapeMarEgionSud(req, b);
        break;
      case "departement13":
        tenders = await scrapeDepartement13(req, b);
        break;
      default:
        // "place" — garanti par la validation en amont
        tenders = await scrapePlace(req, b);
        break;
    }

    console.info(
      `[worker] job ${runId} terminé — ${tenders?.length ?? 0} AOs en ${Date.now() - startedAt}ms`,
    );
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[worker] job ${runId} échoué:`, errorMsg);
    // tenders reste null pour signaler l'échec au webhook
  }

  const result: ScrapeJobResult = {
    runId,
    platform: req.platform,
    profileId: req.profileId,
    orgId: req.orgId,
    tenders,
    error: errorMsg,
    durationMs: Date.now() - startedAt,
  };

  await postWebhook(req.webhookUrl, result);
}

// ---------------------------------------------------------------------------
// Route POST /v1/scrape
// ---------------------------------------------------------------------------

app.post<{ Body: ScrapeBodyRaw }>("/v1/scrape", async (request, reply) => {
  // Authentification Bearer
  if (!SCRAPER_TRIGGER_SECRET) {
    return reply.code(503).send({ error: "scraper_secret_not_configured" });
  }
  const auth = request.headers["authorization"];
  if (!auth || auth !== `Bearer ${SCRAPER_TRIGGER_SECRET}`) {
    return reply.code(401).send({ error: "unauthorized" });
  }

  const body = (request.body ?? {}) as ScrapeBodyRaw;

  // Validation des champs requis
  if (!isValidPlatform(body.platform)) {
    return reply.code(400).send({
      error: "invalid_platform",
      message: `platform doit être l'une de : ${[...VALID_PLATFORMS].join(", ")}`,
    });
  }
  if (!isNonEmptyString(body.profileId)) {
    return reply.code(400).send({ error: "missing_field", field: "profileId" });
  }
  if (!isNonEmptyString(body.orgId)) {
    return reply.code(400).send({ error: "missing_field", field: "orgId" });
  }
  if (!isNonEmptyString(body.webhookUrl)) {
    return reply.code(400).send({ error: "missing_field", field: "webhookUrl" });
  }
  if (!isNonEmptyString(body.lastRunAt)) {
    return reply.code(400).send({ error: "missing_field", field: "lastRunAt" });
  }

  const scrapeReq: ScrapeRequest = {
    platform: body.platform,
    profileId: body.profileId,
    orgId: body.orgId,
    webhookUrl: body.webhookUrl,
    lastRunAt: body.lastRunAt,
    profileFilters: parseProfileFilters(body.profileFilters),
    // Repli sur les secrets Fly du worker (PLACE_USERNAME/PASSWORD) quand le
    // payload ne porte pas de credentials — cas nominal du cron monorepo.
    credentials: parseCredentials(body.credentials) ?? envCredentialsFor(body.platform),
  };

  const runId = randomUUID();

  request.log.info(
    { runId, platform: scrapeReq.platform, profileId: scrapeReq.profileId },
    "scrape job accepted",
  );

  // Réponse immédiate 202 — le scraping se fait en background
  const estimatedDuration =
    scrapeReq.platform === "place" ||
    scrapeReq.platform === "maregionsud" ||
    scrapeReq.platform === "departement13"
      ? 120
      : 90;
  void reply.code(202).send({ runId, estimatedDuration });

  // Lancement en background — process.nextTick pour ne pas bloquer la réponse HTTP
  process.nextTick(() => {
    runScrapingJob(scrapeReq, runId).catch((err) => {
      console.error(`[worker] erreur inattendue dans runScrapingJob ${runId}:`, err);
    });
  });
});

// ---------------------------------------------------------------------------
// Supabase Realtime
// ---------------------------------------------------------------------------

let supabase: SupabaseClient | null = null;
let realtimeChannel: RealtimeChannel | null = null;

function setupRealtime(): void {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    app.log.warn("Supabase env manquants — Realtime désactivé.");
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

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, "shutdown initiated");

  // 1. Fermer le canal Supabase Realtime
  try {
    if (realtimeChannel && supabase) {
      await supabase.removeChannel(realtimeChannel);
      app.log.info("realtime channel removed");
    }
  } catch (err) {
    app.log.error({ err }, "error removing realtime channel");
  }

  // 2. Fermer le browser Playwright
  try {
    if (browser && browser.isConnected()) {
      await browser.close();
      app.log.info("playwright browser closed");
    }
  } catch (err) {
    app.log.error({ err }, "error closing playwright browser");
  }

  // 3. Fermer Fastify
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

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  setupRealtime();
  await app.listen({ host: HOST, port: PORT });
  app.log.info({ port: PORT, version: VERSION }, "edifio playwright worker ready");
}

main().catch((err) => {
  console.error("fatal startup error", err);
  process.exit(1);
});
