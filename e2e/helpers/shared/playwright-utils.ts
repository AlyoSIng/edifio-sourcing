/**
 * Helpers shared — utilitaires Playwright génériques.
 *
 * Indépendants de la fixture multi-org / supabase-js. Réutilisables dans le
 * monorepo `alyos-suivi-chantier` post-bascule 18 juillet 2026.
 *
 * Couvre :
 *   - waitForRedirect : assert qu'une page atteint un pattern d'URL.
 *   - assertNoLeak    : vérifie qu'aucun champ sensible n'apparaît dans le
 *     DOM ni dans les réponses réseau (anti-leak cross-tenant, S10/S13).
 */

import { expect, type Page, type Response } from "@playwright/test";

// ─── waitForRedirect ─────────────────────────────────────────────────────────

/**
 * Attend que l'URL de la page corresponde à `urlPattern`. Wrapper léger sur
 * `page.waitForURL` avec un timeout par défaut aligné sur les autres specs
 * multi-org (15 s — laisse le temps au middleware + redirect serveur).
 *
 * Renvoie l'URL effective atteinte pour les asserts post-redirect.
 */
export async function waitForRedirect(
  page: Page,
  urlPattern: RegExp | string,
  options: { timeout?: number } = {},
): Promise<string> {
  const timeout = options.timeout ?? 15_000;
  await page.waitForURL(urlPattern, { timeout });
  return page.url();
}

// ─── assertNoLeak ────────────────────────────────────────────────────────────

/**
 * Vérifie qu'aucun champ sensible n'apparaît :
 *   1. Dans le DOM HTML de la page courante.
 *   2. Dans les corps des réponses réseau capturées depuis `startListening`.
 *
 * Usage idiomatique :
 *
 *   const listener = startNetworkLeakListener(page);
 *   await page.goto("/cotraitant/abc");
 *   await assertNoLeak(page, ["organization_id", "AlyoS Ingénierie"], listener);
 *
 * Pattern critique pour S10 (page /no-org sans leak AlyoS) et S13 (page
 * cotraitant publique sans org_id exposé).
 *
 * **Limitation** : la version simple ci-dessous inspecte uniquement le DOM
 * (suffit pour les pages SSR comme `/cotraitant/[token]`). Pour les pages
 * client-heavy avec fetch côté browser, utiliser `startNetworkLeakListener`
 * en amont et passer son retour dans `networkListener`.
 */
export async function assertNoLeak(
  page: Page,
  sensitiveFields: string[],
  networkListener?: NetworkLeakListener,
): Promise<void> {
  const html = await page.content();
  for (const field of sensitiveFields) {
    expect(html, `DOM ne doit pas exposer "${field}"`).not.toContain(field);
  }

  if (networkListener) {
    const responses = networkListener.getResponses();
    for (const captured of responses) {
      for (const field of sensitiveFields) {
        expect(
          captured.body,
          `Network response ${captured.url} ne doit pas exposer "${field}"`,
        ).not.toContain(field);
      }
    }
  }
}

// ─── Network leak listener ──────────────────────────────────────────────────

interface CapturedResponse {
  url: string;
  status: number;
  body: string;
}

export interface NetworkLeakListener {
  getResponses(): CapturedResponse[];
  stop(): void;
}

/**
 * Démarre un listener sur les réponses réseau de la page. Capture le body
 * texte des réponses JSON/HTML pour permettre un check de leak a posteriori.
 *
 * **Garde** : on filtre `urlFilter` pour éviter de stocker des kilomètres de
 * statics (images, fonts). Par défaut on garde uniquement les réponses
 * JSON ou HTML.
 */
export function startNetworkLeakListener(
  page: Page,
  options: { urlFilter?: (url: string) => boolean } = {},
): NetworkLeakListener {
  const captured: CapturedResponse[] = [];
  const filter = options.urlFilter ?? defaultUrlFilter;

  const handler = async (response: Response) => {
    try {
      const url = response.url();
      if (!filter(url)) return;
      const contentType = response.headers()["content-type"] ?? "";
      // Ne capture que ce qui peut contenir des données structurées.
      if (!/json|html|javascript/i.test(contentType)) return;
      const body = await response.text().catch(() => "");
      captured.push({ url, status: response.status(), body });
    } catch {
      // best-effort, on ne fait pas planter le test pour un body unreadable.
    }
  };

  page.on("response", handler);
  return {
    getResponses: () => captured.slice(),
    stop: () => page.off("response", handler),
  };
}

function defaultUrlFilter(url: string): boolean {
  // Ignore les statics évidents.
  if (/\.(png|jpg|jpeg|webp|gif|svg|ico|woff2?|ttf|otf|css)(\?|$)/i.test(url)) return false;
  return true;
}
