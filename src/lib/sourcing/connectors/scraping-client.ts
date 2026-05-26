/**
 * Client HTTP pour le worker Playwright Fly.io — edifio Sourcing.
 *
 * Déclenche un job de scraping sur le container Fly.io et retourne
 * le runId immédiatement (le résultat arrive via webhook plus tard).
 *
 * Contrat API worker (POST /v1/scrape) :
 *  - Réponse 202 : `{ runId: string, estimatedDuration: number }`
 *  - Le worker POST ensuite les résultats vers `webhookUrl`
 *    avec `Authorization: Bearer ${SCRAPER_TRIGGER_SECRET}`.
 *
 * Variables d'env requises :
 *  - SCRAPER_BASE_URL  — URL de base du worker (ex: https://edifio-playwright-worker.fly.dev)
 *  - SCRAPER_TRIGGER_SECRET — Bearer token partagé worker ↔ webhook Next.js
 */

export type ScrapingPlatform = "place" | "francmarches";

export interface ScrapingJobRequest {
  platform: ScrapingPlatform;
  profileFilters: {
    keywords?: string[];
    geoZones?: string[];
  };
  lastRunAt: Date;
  profileId: string;
  orgId: string;
  webhookUrl: string;
  credentials?: {
    username?: string;
    password?: string;
  };
}

export interface ScrapingJobAck {
  runId: string;
  estimatedDuration: number;
}

/** Levée quand le worker Fly.io est absent ou mal configuré. Traitée comme
 *  un skip non-bloquant côté cron (pas de plantage du pipeline BOAMP). */
export class ScraperUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScraperUnavailableError";
  }
}

/**
 * Déclenche un job de scraping sur le worker Fly.io.
 *
 * - Timeout court (10 s) : on ne bloque pas le cron sur l'indisponibilité
 *   du worker — le pipeline BOAMP ne doit pas en pâtir.
 * - Retourne un `ScrapingJobAck` dès la réponse 202.
 * - Lève `ScraperUnavailableError` sur tout problème réseau ou HTTP ≠ 202,
 *   ce qui permet au cron de logger et continuer sans planter.
 *
 * @param req — paramètres du job (plateforme, filtres, profileId, webhookUrl…)
 * @param opts — optionnel, injection de `fetch` pour les tests unitaires
 */
export async function triggerScrapeJob(
  req: ScrapingJobRequest,
  opts?: { fetch?: typeof fetch },
): Promise<ScrapingJobAck> {
  const baseUrl = process.env.SCRAPER_BASE_URL;
  const secret = process.env.SCRAPER_TRIGGER_SECRET;

  if (!baseUrl || !secret) {
    throw new ScraperUnavailableError(
      "SCRAPER_BASE_URL ou SCRAPER_TRIGGER_SECRET non configuré — scraping désactivé.",
    );
  }

  const fetchImpl = opts?.fetch ?? globalThis.fetch;
  const url = `${baseUrl.replace(/\/$/, "")}/v1/scrape`;

  const body = {
    platform: req.platform,
    profileFilters: req.profileFilters,
    lastRunAt: req.lastRunAt.toISOString(),
    profileId: req.profileId,
    orgId: req.orgId,
    webhookUrl: req.webhookUrl,
    ...(req.credentials ? { credentials: req.credentials } : {}),
  };

  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new ScraperUnavailableError(
      `Worker Fly.io injoignable : ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (res.status === 202) {
    return (await res.json()) as ScrapingJobAck;
  }

  throw new ScraperUnavailableError(`Worker Fly.io HTTP ${res.status} sur POST /v1/scrape`);
}
