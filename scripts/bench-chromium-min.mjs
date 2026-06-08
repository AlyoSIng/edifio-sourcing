#!/usr/bin/env node
/**
 * Bench `@sparticuz/chromium-min` — Lot 0b POC migration vers Vercel Function.
 *
 * Steve 2026-06-08 — script JETABLE, branche spike/cron-vercel-chromium.
 *
 * Usage :
 *   node scripts/bench-chromium-min.mjs
 *
 * Mesure 3 runs back-to-back (cold + 2 warms) sur une page publique BOAMP :
 *   - launchMs       : durée d'init du browser (cold = download chromium)
 *   - navigationMs   : durée du goto + domcontentloaded
 *   - scrapingMs     : extraction DOM (10 premiers résultats)
 *   - totalMs        : somme
 *   - memoryPeakMB   : pic heapUsed via setInterval(100ms)
 *   - nbResults      : sanity check (0 = scraping foiré)
 *
 * Verdict basé sur les seuils Sébastien :
 *   - durée < 50 s
 *   - RAM pic < 500 Mo
 */

import chromium from "@sparticuz/chromium-min";
import puppeteer from "puppeteer-core";

const CHROMIUM_REMOTE_URL =
  "https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar";

const TARGET_URL = "https://www.boamp.fr/pages/recherche/?searchText=ingenierie";
const FALLBACK_URL = "https://www.francemarches.com/recherche?q=ingenierie";
const NB_RUNS = 3;
const SEUIL_DUREE_MS = 50_000;
const SEUIL_RAM_MB = 500;

/**
 * Démarre un poll mémoire toutes les 100 ms. Retourne `stop()` qui renvoie
 * le pic en Mo.
 */
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

/**
 * Lance 1 run : init browser → goto URL → extract 10 résultats → close.
 */
async function runOnce(url, runIndex) {
  const stopPoll = startMemoryPoll();
  const t0 = Date.now();

  // 1) Launch
  const tLaunch0 = Date.now();
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(CHROMIUM_REMOTE_URL),
    headless: chromium.headless,
  });
  const launchMs = Date.now() - tLaunch0;

  // 2) Navigation
  const page = await browser.newPage();
  const tNav0 = Date.now();
  let navigationMs = -1;
  let scrapingMs = -1;
  let nbResults = -1;
  let error = null;

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    navigationMs = Date.now() - tNav0;

    // 3) Scraping — chercher liens / titres dans la page
    const tScr0 = Date.now();
    const results = await page.evaluate(() => {
      // Tentative générique : tous les <a> avec un href + un texte non vide
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
  } catch (err) {
    error = err.message || String(err);
  }

  await browser.close();
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

async function main() {
  console.log("=== Bench @sparticuz/chromium-min v149 ===");
  console.log(`Cible : ${TARGET_URL}`);
  console.log(`Runs  : ${NB_RUNS} (1 cold + ${NB_RUNS - 1} warm)`);
  console.log(`Seuil : < ${SEUIL_DUREE_MS / 1000}s + < ${SEUIL_RAM_MB} Mo`);
  console.log();

  const results = [];
  let urlUsed = TARGET_URL;

  for (let i = 0; i < NB_RUNS; i++) {
    process.stdout.write(`Run ${i + 1}/${NB_RUNS} (${i === 0 ? "cold" : "warm"})... `);
    try {
      const r = await runOnce(urlUsed, i + 1);
      results.push(r);
      console.log(
        `total=${r.totalMs}ms  launch=${r.launchMs}ms  nav=${r.navigationMs}ms  scrape=${r.scrapingMs}ms  ram=${r.memoryPeakMB}Mo  nb=${r.nbResults}` +
          (r.error ? `  ERR=${r.error.slice(0, 80)}` : ""),
      );

      // Bascule fallback si BOAMP refuse le user-agent headless
      if (i === 0 && r.nbResults === 0 && urlUsed === TARGET_URL) {
        console.log(`  → 0 résultats, bascule fallback ${FALLBACK_URL}`);
        urlUsed = FALLBACK_URL;
      }
    } catch (err) {
      console.error(`  FATAL: ${err.message || err}`);
      results.push({
        runIndex: i + 1,
        launchMs: -1,
        navigationMs: -1,
        scrapingMs: -1,
        totalMs: -1,
        memoryPeakMB: -1,
        nbResults: -1,
        error: err.message || String(err),
      });
    }
  }

  // Récap
  console.log();
  console.log("=== Résultats ===");
  console.log(JSON.stringify(results, null, 2));

  const warmRuns = results.slice(1).filter((r) => r.error === null);
  if (warmRuns.length === 0) {
    console.log();
    console.log("Verdict : DONNÉES INSUFFISANTES (tous les runs ont échoué)");
    process.exit(1);
  }

  const avgTotal = Math.round(
    warmRuns.reduce((sum, r) => sum + r.totalMs, 0) / warmRuns.length,
  );
  const maxRam = Math.max(...warmRuns.map((r) => r.memoryPeakMB));
  const coldTotal = results[0].totalMs;

  console.log();
  console.log("=== Moyennes warm ===");
  console.log(`Durée moyenne (warm) : ${avgTotal} ms (seuil ${SEUIL_DUREE_MS} ms)`);
  console.log(`RAM pic max (warm)   : ${maxRam} Mo (seuil ${SEUIL_RAM_MB} Mo)`);
  console.log(`Cold start           : ${coldTotal} ms`);

  const passDuree = avgTotal < SEUIL_DUREE_MS;
  const passRam = maxRam < SEUIL_RAM_MB;

  console.log();
  console.log("=== Verdict ===");
  if (passDuree && passRam) {
    console.log("✅ BASCULE VERCEL OK — seuils Sébastien respectés sur les warms.");
  } else {
    console.log("🔴 RESTE FLY.IO :");
    if (!passDuree) console.log(`  - Durée moyenne ${avgTotal} ms ≥ seuil ${SEUIL_DUREE_MS} ms`);
    if (!passRam) console.log(`  - RAM pic max ${maxRam} Mo ≥ seuil ${SEUIL_RAM_MB} Mo`);
  }
}

main().catch((err) => {
  console.error("Erreur fatale :", err);
  process.exit(1);
});
