/**
 * Spike Lot 0b — helper de launch chromium pour benchmark.
 *
 * Steve 2026-06-08 — POC `@sparticuz/chromium-min` pour décider si le cron
 * `sourcing-run` peut migrer du worker Fly.io vers une Vercel Function.
 *
 * Code JETABLE — branche `spike/cron-vercel-chromium`, ne sera pas mergé tel
 * quel. Sert uniquement à mesurer durée d'init + RAM pic + cold start.
 *
 * Seuils de bascule Vercel (visio cadrage 2026-06-07 §4 — Sébastien) :
 *  - durée < 50 s
 *  - RAM pic < 500 Mo
 */

import chromium from "@sparticuz/chromium-min";
import puppeteer, { type Browser } from "puppeteer-core";

/**
 * URL distante du binaire chromium pack. Doit correspondre à la version
 * de `@sparticuz/chromium-min` installée (cf. package.json).
 *
 * v149 cf. https://github.com/Sparticuz/chromium/releases
 */
const CHROMIUM_REMOTE_URL =
  "https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar";

export interface LaunchResult {
  browser: Browser;
  /** Durée du `puppeteer.launch()` en ms (inclut download chromium au 1er run). */
  launchMs: number;
}

/**
 * Lance un browser headless via `@sparticuz/chromium-min` + `puppeteer-core`,
 * dans la configuration qui serait utilisée par une Vercel Function.
 *
 * @returns le browser + la durée d'init
 */
export async function launchChromium(): Promise<LaunchResult> {
  const t0 = Date.now();
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(CHROMIUM_REMOTE_URL),
    headless: chromium.headless,
  });
  return { browser, launchMs: Date.now() - t0 };
}
