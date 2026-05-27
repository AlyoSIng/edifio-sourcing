/**
 * Scraper Marchés Online — www.marchesonline.com
 *
 * Scraping non-authentifié de la liste des appels d'offres en Normandie.
 *
 * Hypothèses sur la structure du site (à ajuster si le site évolue) :
 *  - Page de liste   : https://www.marchesonline.com/appels-offres/lieu/normandie-R23
 *  - Résultats       : `[class*='result'] li`, `[class*='appel'] article`, `table tbody tr`
 *  - Référence AO    : extrait du slug d'URL /appels-offres/<REF>
 *  - Pagination      : lien "Suivant", rel=next, ou paramètre GET `?page=N`
 *
 * Tous les sélecteurs sont entourés de try/catch — si le site change, le scraper
 * dégrade gracieusement (champ absent = undefined) plutôt que de planter.
 */

import type { Browser, BrowserContext, Page } from "playwright";
import type { ScrapedTenderRecord, ScrapeRequest } from "./types.js";

const BASE_URL = "https://www.marchesonline.com";
const SEARCH_URL = `${BASE_URL}/appels-offres/lieu/normandie-R23`;

/** Timeout par navigation de page (ms) */
const PAGE_TIMEOUT_MS = 30_000;
/** Nombre maximum de pages de résultats à parcourir (garde-fou) */
const MAX_PAGES = 20;
/** Timeout global du scraping complet (ms) */
const GLOBAL_TIMEOUT_MS = 90_000;

/** User-agent réaliste pour éviter les blocages de base */
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Pause aléatoire entre 100 et 300 ms pour imiter un comportement humain
 * et éviter le rate-limiting côté serveur.
 */
function jitter(): Promise<void> {
  const ms = 100 + Math.floor(Math.random() * 200);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extrait le slug de référence depuis une URL de fiche AO.
 * Ex: "/appels-offres/REF-123" → "REF-123"
 * Ex: "/appels-offres/REF-123/" → "REF-123"
 */
function extractRefFromUrl(url: string): string {
  const clean = url.replace(/\/$/, "");
  const parts = clean.split("/");
  return parts[parts.length - 1] ?? url;
}

/**
 * Tente d'extraire un code CPV (8 chiffres) depuis une chaîne de texte.
 * Retourne un tableau de codes uniques ou undefined si rien trouvé.
 */
function extractCpvCodes(text: string): string[] | undefined {
  const matches = text.match(/\b\d{8}\b/g);
  if (!matches || matches.length === 0) return undefined;
  return [...new Set(matches)];
}

/**
 * Tente de parser une date en format FR ("JJ/MM/AAAA") ou ISO vers ISO 8601.
 * Retourne undefined si le format n'est pas reconnu.
 */
function parseDate(raw: string): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  // Format ISO déjà correct
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.substring(0, 10);
  }
  // Format FR : JJ/MM/AAAA
  const frMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (frMatch) {
    const d = frMatch[1] ?? "";
    const m = frMatch[2] ?? "";
    const y = frMatch[3] ?? "";
    return `${y}-${m}-${d}`;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Extraction d'une fiche AO individuelle
// ---------------------------------------------------------------------------

/**
 * Extrait les données d'une fiche AO depuis sa page de détail.
 * Toutes les extractions sont protégées — un échec partiel n'est pas fatal.
 */
async function extractTenderDetail(
  page: Page,
  href: string,
): Promise<Partial<ScrapedTenderRecord>> {
  const detail: Partial<ScrapedTenderRecord> = {};

  try {
    const target = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    await page.goto(target, {
      waitUntil: "domcontentloaded",
      timeout: PAGE_TIMEOUT_MS,
    });
  } catch (err) {
    console.warn("[marchesonline] navigation fiche échouée:", href, err);
    return detail;
  }

  // Titre
  try {
    const h1 = await page.$eval(
      "h1, h2.title, .ao-title, [class*='titre'], [class*='objet']",
      (el) => el.textContent?.trim() ?? "",
    );
    if (h1) detail.title = h1;
  } catch {
    // champ optionnel
  }

  // Acheteur / organisme
  try {
    const buyerText = await page.$eval(
      "[class*='acheteur'], [class*='organisme'], [data-label*='Acheteur'], [data-label*='Organisme']",
      (el) => el.textContent?.trim() ?? "",
    );
    if (buyerText) detail.buyer = buyerText;
  } catch {
    // champ optionnel
  }

  // Date limite de remise des offres
  try {
    const deadlineText = await page.$eval(
      "[class*='date-limite'], [class*='deadline'], [data-label*='Date limite'], [data-label*='Clôture']",
      (el) => el.textContent?.trim() ?? "",
    );
    if (deadlineText) detail.deadline = parseDate(deadlineText);
  } catch {
    // champ optionnel
  }

  // Procédure
  try {
    const procText = await page.$eval(
      "[class*='procedure'], [data-label*='Procédure'], [data-label*='Type']",
      (el) => el.textContent?.trim() ?? "",
    );
    if (procText) detail.procedure = procText;
  } catch {
    // champ optionnel
  }

  // Description
  try {
    const descText = await page.$eval(
      "[class*='description'], [class*='objet'], .ao-description, .ao-objet",
      (el) => el.textContent?.trim() ?? "",
    );
    if (descText) detail.description = descText.substring(0, 500);
  } catch {
    // champ optionnel
  }

  // CPV — rechercher des patterns numérique 8 chiffres dans le texte complet
  try {
    const bodyText = await page.$eval("body", (el) => el.textContent ?? "");
    const cpv = extractCpvCodes(bodyText);
    if (cpv) detail.cpv = cpv;
  } catch {
    // champ optionnel
  }

  // URL DCE (lien vers dossier de consultation)
  try {
    const dceHref = await page.$eval(
      "a[href*='dce'], a[href*='DCE'], a[class*='dce'], a[class*='telecharger']",
      (el) => (el as HTMLAnchorElement).href ?? "",
    );
    if (dceHref) detail.dceUrl = dceHref;
  } catch {
    // champ optionnel
  }

  return detail;
}

// ---------------------------------------------------------------------------
// Extraction de la liste des AOs (page de résultats)
// ---------------------------------------------------------------------------

interface ListItem {
  href: string;
  titleText?: string;
  buyerText?: string;
  deadlineText?: string;
}

/**
 * Extrait les éléments de liste présents sur la page courante.
 * Stratégie dégradée : plusieurs tentatives de sélecteurs.
 */
async function extractListItems(page: Page): Promise<ListItem[]> {
  const items: ListItem[] = [];

  try {
    const rows = await page.$$("[class*='result'] li, [class*='appel'] article, table tbody tr");

    for (const row of rows) {
      try {
        // Lien vers la fiche détail
        const linkEl = await row.$("a[href*='/appels-offres/']");
        if (!linkEl) continue;

        const href = await linkEl.getAttribute("href");
        if (!href) continue;

        const titleText = await row
          .$eval(
            "h2, h3, [class*='titre'], [class*='title'], [class*='objet']",
            (el) => el.textContent?.trim() ?? "",
          )
          .catch(() => undefined);

        const buyerText = await row
          .$eval("[class*='acheteur'], [class*='organisme']", (el) => el.textContent?.trim() ?? "")
          .catch(() => undefined);

        const deadlineText = await row
          .$eval(
            "[class*='date'], [class*='echeance'], [class*='limite']",
            (el) => el.textContent?.trim() ?? "",
          )
          .catch(() => undefined);

        items.push({ href, titleText, buyerText, deadlineText });
      } catch (err) {
        console.warn("[marchesonline] extraction ligne échouée:", err);
      }
    }
  } catch (err) {
    console.warn("[marchesonline] extraction liste échouée:", err);
  }

  return items;
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

/**
 * Tente de cliquer sur le lien "page suivante".
 * Supporte les boutons JS, les liens rel=next et les paramètres GET ?page=N.
 * Retourne true si la navigation a eu lieu, false si on est à la dernière page.
 */
async function goToNextPage(page: Page): Promise<boolean> {
  try {
    const nextLink = await page.$(
      "a[rel='next'], a[aria-label*='suivant' i], a[class*='next'], a:has-text('Suivant'), a:has-text('suivant'), [class*='pagination'] a:last-child, a[href*='page=']",
    );
    if (!nextLink) return false;

    const href = await nextLink.getAttribute("href");
    if (!href) return false;

    await nextLink.click();
    await page.waitForLoadState("domcontentloaded", { timeout: PAGE_TIMEOUT_MS });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Point d'entrée public
// ---------------------------------------------------------------------------

/**
 * Scrappe les appels d'offres récents sur Marchés Online (région Normandie).
 *
 * @param req - Paramètres du job (profil, filtres, date plancher)
 * @param browser - Instance Playwright partagée (gérée par le worker)
 * @returns Liste des AOs collectés (peut être vide si aucun résultat)
 */
export async function scrapeMarchesOnline(
  req: ScrapeRequest,
  browser: Browser,
): Promise<ScrapedTenderRecord[]> {
  const tenders: ScrapedTenderRecord[] = [];
  let context: BrowserContext | null = null;

  // Timeout global : on annule tout si dépassé
  const deadline = Date.now() + GLOBAL_TIMEOUT_MS;

  try {
    context = await browser.newContext({
      userAgent: USER_AGENT,
      locale: "fr-FR",
      timezoneId: "Europe/Paris",
    });
    const page = await context.newPage();

    // Mots-clés de recherche du profil
    const searchParams = new URLSearchParams();
    if (req.profileFilters.keywords && req.profileFilters.keywords.length > 0) {
      searchParams.set("q", req.profileFilters.keywords.join(" "));
    }

    const startUrl = searchParams.toString()
      ? `${SEARCH_URL}?${searchParams.toString()}`
      : SEARCH_URL;

    console.info(`[marchesonline] navigation vers ${startUrl}`);
    try {
      await page.goto(startUrl, {
        waitUntil: "domcontentloaded",
        timeout: PAGE_TIMEOUT_MS,
      });
    } catch (err) {
      console.error("[marchesonline] échec navigation page initiale:", err);
      return [];
    }

    // Parcours des pages de résultats
    for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex++) {
      if (Date.now() >= deadline) {
        console.warn("[marchesonline] timeout global atteint à la page", pageIndex);
        break;
      }

      const items = await extractListItems(page);
      console.info(`[marchesonline] page ${pageIndex + 1} — ${items.length} éléments`);

      if (items.length === 0) break;

      // Extraction des détails pour chaque AO
      const detailPage = await context.newPage();
      for (const item of items) {
        if (Date.now() >= deadline) break;

        try {
          const externalRef = extractRefFromUrl(item.href);
          const sourceUrl = item.href.startsWith("http") ? item.href : `${BASE_URL}${item.href}`;

          // Données de la liste (fallback si la fiche détail échoue)
          const listData: Partial<ScrapedTenderRecord> = {
            title: item.titleText,
            buyer: item.buyerText,
            deadline: item.deadlineText ? parseDate(item.deadlineText) : undefined,
          };

          // Enrichissement depuis la fiche détail
          const detail = await extractTenderDetail(detailPage, item.href);

          const record: ScrapedTenderRecord = {
            externalRef,
            title: detail.title ?? listData.title ?? "(sans titre)",
            buyer: detail.buyer ?? listData.buyer ?? "(acheteur inconnu)",
            cpv: detail.cpv,
            amount: detail.amount,
            deadline: detail.deadline ?? listData.deadline,
            questionsDeadline: detail.questionsDeadline,
            dceUrl: detail.dceUrl,
            sourceUrl,
            procedure: detail.procedure,
            description: detail.description,
          };

          tenders.push(record);
          await jitter();
        } catch (err) {
          console.warn("[marchesonline] extraction AO échouée:", item.href, err);
          // Continuer avec le suivant
        }
      }
      await detailPage.close();

      // Tenter d'aller à la page suivante
      const hasNext = await goToNextPage(page);
      if (!hasNext) break;

      await jitter();
    }
  } finally {
    if (context) {
      try {
        await context.close();
      } catch (err) {
        console.warn("[marchesonline] erreur fermeture context:", err);
      }
    }
  }

  console.info(`[marchesonline] scraping terminé — ${tenders.length} AOs collectés`);
  return tenders;
}
