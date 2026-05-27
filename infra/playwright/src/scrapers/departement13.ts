/**
 * Scraper Département 13 — marches.departement13.fr
 *
 * Scraping non-authentifié du portail marchés publics du Département des Bouches-du-Rhône.
 *
 * Hypothèses sur la structure du site (portail de type Xdemat / AWS Marketplace) :
 *  - Page de liste    : https://marches.departement13.fr/?page=Entreprise.EntrepriseHome
 *  - Filtre date      : non exposé en GET — on récupère toutes les consultations ouvertes
 *  - Résultats        : table.listConsultation tbody tr, .consultation-row
 *  - Référence AO     : paramètre ConsultationRef dans l'URL de détail
 *  - Pagination       : lien ou bouton "Suivant" / numéros de page ou paramètre numPage
 *
 * Tous les sélecteurs sont entourés de try/catch — si le site change, le scraper
 * dégrade gracieusement (champ absent = undefined) plutôt que de planter.
 */

import type { Browser, BrowserContext, Page } from "playwright";
import type { ScrapedTenderRecord, ScrapeRequest } from "./types.js";

const BASE_URL = "https://marches.departement13.fr";
const SEARCH_URL = `${BASE_URL}/?page=Entreprise.EntrepriseHome`;

/** Timeout par navigation de page (ms) */
const PAGE_TIMEOUT_MS = 30_000;
/** Nombre maximum de pages de résultats à parcourir (garde-fou) */
const MAX_PAGES = 20;
/** Timeout global du scraping complet (ms) */
const GLOBAL_TIMEOUT_MS = 120_000;

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
 * Extrait la référence de consultation depuis une URL Xdemat.
 * Ex: "?page=Entreprise.DetailConsultation&ConsultationRef=ABC-123" → "ABC-123"
 * Fallback : slug final de l'URL.
 */
function extractRefFromUrl(url: string): string {
  try {
    const fullUrl = url.startsWith("http") ? url : `${BASE_URL}/${url.replace(/^\//, "")}`;
    const parsed = new URL(fullUrl);
    const ref = parsed.searchParams.get("ConsultationRef");
    if (ref && ref.trim().length > 0) return ref.trim();
  } catch {
    // URL malformée — fallback slug
  }
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
// Extraction d'une fiche AO individuelle (portail Xdemat)
// ---------------------------------------------------------------------------

/**
 * Extrait les données d'une fiche AO depuis sa page de détail Xdemat.
 * Les champs sont généralement dans des <td> après un label en <th> ou <td class="label">.
 * Toutes les extractions sont protégées — un échec partiel n'est pas fatal.
 */
async function extractTenderDetail(
  page: Page,
  href: string,
): Promise<Partial<ScrapedTenderRecord>> {
  const detail: Partial<ScrapedTenderRecord> = {};

  try {
    const target = href.startsWith("http") ? href : `${BASE_URL}/${href.replace(/^\//, "")}`;
    await page.goto(target, {
      waitUntil: "domcontentloaded",
      timeout: PAGE_TIMEOUT_MS,
    });
  } catch (err) {
    console.warn("[departement13] navigation fiche échouée:", href, err);
    return detail;
  }

  // Titre / Objet de la consultation
  try {
    const titleText = await page.$eval(
      "h1, h2, [class*='titre'], [class*='objet'], [id*='objet'], td[class*='objet']",
      (el) => el.textContent?.trim() ?? "",
    );
    if (titleText) detail.title = titleText;
  } catch {
    // champ optionnel
  }

  // Acheteur / organisme
  try {
    const buyerText = await page.$eval(
      "[class*='acheteur'], [class*='organisme'], [id*='organisme'], td[class*='acheteur']",
      (el) => el.textContent?.trim() ?? "",
    );
    if (buyerText) detail.buyer = buyerText;
  } catch {
    // champ optionnel
  }

  // Date limite de remise des offres
  try {
    const deadlineText = await page.$eval(
      "[class*='date-limite'], [class*='dateLimite'], [id*='dateLimite'], [class*='deadline']",
      (el) => el.textContent?.trim() ?? "",
    );
    if (deadlineText) detail.deadline = parseDate(deadlineText);
  } catch {
    // champ optionnel
  }

  // Procédure
  try {
    const procText = await page.$eval(
      "[class*='procedure'], [id*='procedure'], [class*='typeProcedure']",
      (el) => el.textContent?.trim() ?? "",
    );
    if (procText) detail.procedure = procText;
  } catch {
    // champ optionnel
  }

  // Description
  try {
    const descText = await page.$eval(
      "[class*='description'], [id*='description'], [class*='objet'], .consultation-objet",
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
      "a[href*='dce'], a[href*='DCE'], a[href*='dossier'], a[class*='dce'], a[class*='telecharger']",
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
 * Stratégie dégradée : plusieurs tentatives de sélecteurs Xdemat.
 */
async function extractListItems(page: Page): Promise<ListItem[]> {
  const items: ListItem[] = [];

  try {
    const rows = await page.$$(
      "table.listConsultation tbody tr, table[class*='consultation'] tbody tr, .consultation-row, [class*='liste-consultation'] li",
    );

    for (const row of rows) {
      try {
        // Lien vers la fiche détail
        const linkEl = await row.$(
          "a[href*='page=Entreprise.DetailConsultation'], a[href*='ConsultationRef=']",
        );
        if (!linkEl) continue;

        const href = await linkEl.getAttribute("href");
        if (!href) continue;

        const titleText = await row
          .$eval(
            "h2, h3, [class*='titre'], [class*='title'], [class*='objet'], td.objet",
            (el) => el.textContent?.trim() ?? "",
          )
          .catch(() => undefined);

        const buyerText = await row
          .$eval(
            "[class*='acheteur'], [class*='organisme'], td.organisme",
            (el) => el.textContent?.trim() ?? "",
          )
          .catch(() => undefined);

        const deadlineText = await row
          .$eval(
            "[class*='date'], [class*='echeance'], [class*='limite'], td.dateLimite",
            (el) => el.textContent?.trim() ?? "",
          )
          .catch(() => undefined);

        items.push({ href, titleText, buyerText, deadlineText });
      } catch (err) {
        console.warn("[departement13] extraction ligne échouée:", err);
      }
    }
  } catch (err) {
    console.warn("[departement13] extraction liste échouée:", err);
  }

  return items;
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

/**
 * Tente de naviguer vers la page suivante (portail Xdemat).
 * Retourne true si la navigation a eu lieu, false si on est à la dernière page.
 */
async function goToNextPage(page: Page): Promise<boolean> {
  try {
    const nextLink = await page.$(
      "a[rel='next'], a[aria-label*='suivant' i], a[class*='next'], a:has-text('Suivant'), a:has-text('suivant'), [class*='pagination'] a:last-child, a[href*='numPage=']",
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
 * Scrappe les appels d'offres récents sur le portail du Département 13 (Bouches-du-Rhône).
 *
 * @param req - Paramètres du job (profil, filtres, date plancher)
 * @param browser - Instance Playwright partagée (gérée par le worker)
 * @returns Liste des AOs collectés (peut être vide si aucun résultat)
 */
export async function scrapeDepartement13(
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

    // Page d'accueil du portail — liste des consultations ouvertes
    const startUrl = SEARCH_URL;

    console.info(`[departement13] navigation vers ${startUrl}`);
    try {
      await page.goto(startUrl, {
        waitUntil: "domcontentloaded",
        timeout: PAGE_TIMEOUT_MS,
      });
    } catch (err) {
      console.error("[departement13] échec navigation page initiale:", err);
      return [];
    }

    // Parcours des pages de résultats
    for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex++) {
      if (Date.now() >= deadline) {
        console.warn("[departement13] timeout global atteint à la page", pageIndex);
        break;
      }

      const items = await extractListItems(page);
      console.info(`[departement13] page ${pageIndex + 1} — ${items.length} éléments`);

      if (items.length === 0) break;

      // Filtrage par date plancher (lastRunAt)
      const lastRunDate = req.lastRunAt.substring(0, 10);

      // Extraction des détails pour chaque AO
      const detailPage = await context.newPage();
      for (const item of items) {
        if (Date.now() >= deadline) break;

        try {
          const externalRef = extractRefFromUrl(item.href);
          const sourceUrl = item.href.startsWith("http")
            ? item.href
            : `${BASE_URL}/${item.href.replace(/^\//, "")}`;

          // Filtrage date : si la deadline est antérieure à lastRunDate, on saute
          if (item.deadlineText) {
            const parsed = parseDate(item.deadlineText);
            if (parsed && parsed < lastRunDate) continue;
          }

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
          console.warn("[departement13] extraction AO échouée:", item.href, err);
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
        console.warn("[departement13] erreur fermeture context:", err);
      }
    }
  }

  console.info(`[departement13] scraping terminé — ${tenders.length} AOs collectés`);
  return tenders;
}
