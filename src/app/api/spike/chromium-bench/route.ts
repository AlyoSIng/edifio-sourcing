/**
 * API route SPIKE — bench `@sparticuz/chromium-min` sur Vercel Function.
 *
 * Steve 2026-06-08 — Lot 0b POC migration. Route JETABLE qui vit
 * uniquement sur la branche `spike/cron-vercel-chromium`. Ne sera PAS
 * mergée sur main.
 *
 * Pourquoi cette route : `chromium-min` ne tourne pas en local Windows
 * (binaire Linux x64). Pour mesurer durée + RAM dans l'environnement
 * cible (Vercel Function Linux), on lance un preview deploy et on
 * appelle cet endpoint.
 *
 * Usage :
 *   curl -H "x-spike-token: $SPIKE_TOKEN" https://edifio-sourcing-spike-XXX.vercel.app/api/spike/chromium-bench
 *
 * Sécurité (POC, pas prod) :
 *  - Garde minimale via header `x-spike-token` qui doit matcher
 *    `SPIKE_TOKEN` (env var Vercel preview). Si non setté → 403.
 *
 * Runtime : `nodejs` (puppeteer-core incompat Edge). maxDuration 60 s
 * (limite Vercel Pro Function).
 */

import { NextResponse } from "next/server";
import chromium from "@sparticuz/chromium-min";
import puppeteer from "puppeteer-core";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const CHROMIUM_REMOTE_URL =
  "https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar";

const TARGET_URL = "https://www.boamp.fr/pages/recherche/?searchText=ingenierie";
const FALLBACK_URL = "https://www.francemarches.com/recherche?q=ingenierie";
const NB_RUNS = 3;
const SEUIL_DUREE_MS = 50_000;
const SEUIL_RAM_MB = 500;

interface RunResult {
  runIndex: number;
  launchMs: number;
  navigationMs: number;
  scrapingMs: number;
  totalMs: number;
  memoryPeakMB: number;
  nbResults: number;
  error: string | null;
}

function startMemoryPoll() {
  let peak = 0;
  const interval = setInterval(() => {
    const used = process.memoryUsage().heapUsed / 1024 / 1024;
    if (used > peak) peak = used;
  }, 100);
  return () => {
    clearInterval(interval);
    return Math.round(peak);
  };
}

async function runOnce(url: string, runIndex: number): Promise<RunResult> {
  const stopPoll = startMemoryPoll();
  const t0 = Date.now();
  let launchMs = -1;
  let navigationMs = -1;
  let scrapingMs = -1;
  let nbResults = -1;
  let error: string | null = null;

  try {
    const tLaunch0 = Date.now();
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(CHROMIUM_REMOTE_URL),
      headless: chromium.headless,
    });
    launchMs = Date.now() - tLaunch0;

    const page = await browser.newPage();

    const tNav0 = Date.now();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    navigationMs = Date.now() - tNav0;

    const tScr0 = Date.now();
    const results = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll("a")).filter((a) => {
        const text = (a.textContent || "").trim();
        return text.length > 10 && text.length < 300 && a.getAttribute("href");
      });
      return anchors.slice(0, 10).map((a) => ({
        text: (a.textContent || "").trim().slice(0, 100),
        href: a.getAttribute("href"),
      }));
    });
    scrapingMs = Date.now() - tScr0;
    nbResults = results.length;

    await browser.close();
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const totalMs = Date.now() - t0;
  const memoryPeakMB = stopPoll();

  return {
    runIndex,
    launchMs,
    navigationMs,
    scrapingMs,
    totalMs,
    memoryPeakMB,
    nbResults,
    error,
  };
}

export async function GET(request: Request): Promise<NextResponse> {
  const expected = process.env.SPIKE_TOKEN;
  if (!expected) {
    return NextResponse.json({ ok: false, error: "spike_token_not_configured" }, { status: 500 });
  }
  const provided = request.headers.get("x-spike-token");
  if (provided !== expected) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const useFallback = url.searchParams.get("fallback") === "1";
  const targetUrl = useFallback ? FALLBACK_URL : TARGET_URL;

  const results: RunResult[] = [];
  for (let i = 0; i < NB_RUNS; i++) {
    const r = await runOnce(targetUrl, i + 1);
    results.push(r);
  }

  const warmRuns = results.slice(1).filter((r) => r.error === null);
  let verdict: "PASS" | "FAIL" | "INSUFFICIENT" = "INSUFFICIENT";
  let avgTotalWarm: number | null = null;
  let maxRamWarm: number | null = null;

  if (warmRuns.length > 0) {
    avgTotalWarm = Math.round(warmRuns.reduce((s, r) => s + r.totalMs, 0) / warmRuns.length);
    maxRamWarm = Math.max(...warmRuns.map((r) => r.memoryPeakMB));
    const passDuree = avgTotalWarm < SEUIL_DUREE_MS;
    const passRam = maxRamWarm < SEUIL_RAM_MB;
    verdict = passDuree && passRam ? "PASS" : "FAIL";
  }

  return NextResponse.json({
    ok: true,
    targetUrl,
    seuilDureeMs: SEUIL_DUREE_MS,
    seuilRamMB: SEUIL_RAM_MB,
    coldRun: results[0],
    warmRuns: results.slice(1),
    avgTotalWarm,
    maxRamWarm,
    verdict,
  });
}
