/**
 * Scraper PLACE — marchés-publics.gouv.fr (scraping authentifié)
 *
 * PLACE est le portail officiel des marchés publics français.
 * Ce scraper :
 *  1. Se connecte avec les credentials fournis dans ScrapeRequest.
 *  2. Navigue vers la recherche d'appels d'offres.
 *  3. Filtre par date de publication ≥ lastRunAt.
 *  4. Pagine et extrait les données de chaque AO.
 *  5. Se déconnecte proprement à la fin.
 *
 * Sélecteurs connus du portail PLACE (peuvent évoluer avec les mises à jour du portail) :
 *  - Formulaire login  : input[name="login"], input[name="password"], button[type="submit"]
 *  - Recherche AO      : /index.php?page=entreprise.EntrepriseRecherche
 *  - Date de pub       : champ "dateDebut" ou "date_debut" dans le formulaire de recherche
 *  - Liste résultats   : <table> avec <tbody> et <tr> par AO
 *  - Référence         : colonne "Référence" / "Numéro de consultation"
 *  - Intitulé          : colonne "Objet" / "Libellé"
 *  - Acheteur          : colonne "Acheteur" / "Organisme"
 *  - Date limite       : colonne "Date limite"
 *  - Pagination        : lien ou bouton "Suivant" / numéros de page
 */

import type { Browser, BrowserContext, Page } from "playwright";
import type { ScrapedTenderRecord, ScrapeRequest } from "./types.js";

const BASE_URL = "https://www.marches-publics.gouv.fr";
const LOGIN_URL = `${BASE_URL}/index.php?page=entreprise.EntrepriseLogin&action=login`;
const SEARCH_URL = `${BASE_URL}/index.php?page=entreprise.EntrepriseRecherche`;

/** Timeout par navigation de page (ms) */
const PAGE_TIMEOUT_MS = 30_000;
/** Nombre maximum de pages de résultats (garde-fou) */
const MAX_PAGES = 30;
/** Timeout global du scraping complet (ms) — plus long que Francmarchés car login */
const GLOBAL_TIMEOUT_MS = 120_000;

/** User-agent réaliste */
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Pause aléatoire entre 100 et 300 ms pour imiter un comportement humain.
 */
function jitter(): Promise<void> {
  const ms = 100 + Math.floor(Math.random() * 200);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Tente de parser une date en format FR ("JJ/MM/AAAA") ou ISO vers ISO 8601.
 * Retourne undefined si le format n'est pas reconnu.
 */
function parseDate(raw: string): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.substring(0, 10);
  const frMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (frMatch) {
    const d = frMatch[1] ?? "";
    const m = frMatch[2] ?? "";
    const y = frMatch[3] ?? "";
    return `${y}-${m}-${d}`;
  }
  return undefined;
}

/**
 * Tente d'extraire des codes CPV (8 chiffres) depuis un texte.
 */
function extractCpvCodes(text: string): string[] | undefined {
  const matches = text.match(/\b\d{8}\b/g);
  if (!matches || matches.length === 0) return undefined;
  return [...new Set(matches)];
}

// ---------------------------------------------------------------------------
// Étape 1 — Authentification
// ---------------------------------------------------------------------------

/**
 * Authentifie l'utilisateur sur le portail PLACE.
 * Lance une erreur si le login échoue (mauvais credentials ou captcha).
 */
async function login(page: Page, username: string, password: string): Promise<void> {
  console.info("[place] login en cours...");

  await page.goto(LOGIN_URL, {
    waitUntil: "domcontentloaded",
    timeout: PAGE_TIMEOUT_MS,
  });

  // Remplissage du formulaire de connexion
  try {
    await page.fill('input[name="login"], input[name="username"], input[type="email"]', username);
    await page.fill('input[name="password"], input[type="password"]', password);
    await page.click('button[type="submit"], input[type="submit"], [class*="login"] button');
  } catch (err) {
    throw new Error(`[place] impossible de remplir le formulaire de login: ${String(err)}`);
  }

  // Attendre la redirection post-login
  try {
    await page.waitForLoadState("domcontentloaded", { timeout: PAGE_TIMEOUT_MS });
  } catch (err) {
    throw new Error(`[place] timeout après soumission du formulaire de login: ${String(err)}`);
  }

  // Vérification que le login a réussi (absence de message d'erreur)
  const currentUrl = page.url();
  const hasError = await page
    .$("[class*='error'], [class*='erreur'], .alert-danger, #error-message")
    .then((el) => el !== null)
    .catch(() => false);

  if (hasError || currentUrl.includes("action=login")) {
    throw new Error("[place] échec d'authentification — vérifier les credentials");
  }

  console.info("[place] login réussi, URL courante:", currentUrl);
}

// ---------------------------------------------------------------------------
// Étape 2 — Lancement de la recherche avec filtre date
// ---------------------------------------------------------------------------

/**
 * Navigue vers la page de recherche et applique le filtre de date.
 */
async function navigateToSearch(page: Page, lastRunAt: string): Promise<void> {
  const dateStr = lastRunAt.substring(0, 10); // YYYY-MM-DD
  // Convertir en format FR pour les champs qui l'attendent
  const parts = dateStr.split("-");
  const year = parts[0] ?? "";
  const month = parts[1] ?? "";
  const day = parts[2] ?? "";
  const dateFr = `${day}/${month}/${year}`;

  await page.goto(SEARCH_URL, {
    waitUntil: "domcontentloaded",
    timeout: PAGE_TIMEOUT_MS,
  });

  // Remplir le champ date de début de publication
  try {
    // Plusieurs nommages possibles selon version du portail
    const dateField = await page.$(
      'input[name="dateDebut"], input[name="date_debut"], input[name="date_from"], input[placeholder*="date" i]',
    );
    if (dateField) {
      await dateField.fill(dateFr);
      console.info("[place] filtre date_debut appliqué:", dateFr);
    } else {
      console.warn("[place] champ date_debut non trouvé — recherche sans filtre date");
    }
  } catch (err) {
    console.warn("[place] erreur remplissage date:", err);
  }

  // Soumettre la recherche
  try {
    await page.click(
      'button[type="submit"], input[type="submit"], [class*="rechercher"] button, [class*="search"] button',
    );
    await page.waitForLoadState("domcontentloaded", { timeout: PAGE_TIMEOUT_MS });
  } catch (err) {
    console.warn("[place] erreur soumission formulaire recherche:", err);
  }
}

// ---------------------------------------------------------------------------
// Étape 3 — Extraction des lignes du tableau de résultats
// ---------------------------------------------------------------------------

interface PlaceListItem {
  externalRef: string;
  title?: string;
  buyer?: string;
  deadline?: string;
  href?: string;
}

/**
 * Extrait les lignes du tableau de résultats sur la page courante.
 */
async function extractResultRows(page: Page): Promise<PlaceListItem[]> {
  const items: PlaceListItem[] = [];

  try {
    const rows = await page.$$("table tbody tr, [class*='result'] tr, [class*='liste'] tr");
    if (rows.length === 0) {
      console.info("[place] aucune ligne dans le tableau de résultats");
      return items;
    }

    for (const row of rows) {
      try {
        // Référence — première colonne ou colonne nommée
        const refText = await row
          .$eval(
            "td:nth-child(1), [class*='reference'], [class*='numero']",
            (el) => el.textContent?.trim() ?? "",
          )
          .catch(() => "");

        if (!refText) continue; // Ligne d'en-tête ou vide

        // Lien vers la fiche (si disponible)
        const href = await row
          .$eval("a[href]", (el) => (el as HTMLAnchorElement).getAttribute("href") ?? "")
          .catch(() => undefined);

        // Objet / intitulé
        const title = await row
          .$eval(
            "td:nth-child(2), [class*='objet'], [class*='libelle'], [class*='titre']",
            (el) => el.textContent?.trim() ?? "",
          )
          .catch(() => undefined);

        // Acheteur
        const buyer = await row
          .$eval(
            "td:nth-child(3), [class*='acheteur'], [class*='organisme']",
            (el) => el.textContent?.trim() ?? "",
          )
          .catch(() => undefined);

        // Date limite
        const deadlineRaw = await row
          .$eval(
            "td:nth-child(4), [class*='date-limite'], [class*='echeance'], [class*='cloture']",
            (el) => el.textContent?.trim() ?? "",
          )
          .catch(() => undefined);

        items.push({
          externalRef: refText,
          title: title || undefined,
          buyer: buyer || undefined,
          deadline: deadlineRaw ? parseDate(deadlineRaw) : undefined,
          href: href || undefined,
        });
      } catch (err) {
        console.warn("[place] extraction ligne échouée:", err);
      }
    }
  } catch (err) {
    console.warn("[place] extraction tableau résultats échouée:", err);
  }

  return items;
}

// ---------------------------------------------------------------------------
// Étape 4 — Extraction du détail d'un AO
// ---------------------------------------------------------------------------

/**
 * Navigue vers la fiche d'un AO et enrichit les données extraites depuis la liste.
 */
async function extractTenderDetail(
  page: Page,
  href: string,
): Promise<Partial<ScrapedTenderRecord>> {
  const detail: Partial<ScrapedTenderRecord> = {};

  try {
    const fullUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    await page.goto(fullUrl, {
      waitUntil: "domcontentloaded",
      timeout: PAGE_TIMEOUT_MS,
    });
  } catch (err) {
    console.warn("[place] navigation fiche échouée:", href, err);
    return detail;
  }

  // Procédure
  try {
    const procText = await page.$eval(
      "[class*='procedure'], [data-label*='Procédure'], [data-label*='Type'], th:has-text('Procédure') + td",
      (el) => el.textContent?.trim() ?? "",
    );
    if (procText) detail.procedure = procText;
  } catch {
    // optionnel
  }

  // Description / Objet détaillé
  try {
    const descText = await page.$eval(
      "[class*='description'], [class*='objet-complet'], th:has-text('Objet') + td",
      (el) => el.textContent?.trim() ?? "",
    );
    if (descText) detail.description = descText.substring(0, 500);
  } catch {
    // optionnel
  }

  // Date de questions
  try {
    const questionsText = await page.$eval(
      "[class*='question'], th:has-text('questions') + td, th:has-text('Questions') + td",
      (el) => el.textContent?.trim() ?? "",
    );
    if (questionsText) detail.questionsDeadline = parseDate(questionsText);
  } catch {
    // optionnel
  }

  // CPV
  try {
    const bodyText = await page.$eval("body", (el) => el.textContent ?? "");
    const cpv = extractCpvCodes(bodyText);
    if (cpv) detail.cpv = cpv;
  } catch {
    // optionnel
  }

  // URL DCE
  try {
    const dceHref = await page.$eval(
      "a[href*='dce'], a[href*='DCE'], a[href*='telecharger'], a[class*='dce']",
      (el) => (el as HTMLAnchorElement).href ?? "",
    );
    if (dceHref) detail.dceUrl = dceHref;
  } catch {
    // optionnel
  }

  return detail;
}

// ---------------------------------------------------------------------------
// Étape 5 — Pagination
// ---------------------------------------------------------------------------

/**
 * Tente de naviguer vers la page suivante des résultats.
 * Retourne true si une page suivante existait.
 */
async function goToNextPage(page: Page): Promise<boolean> {
  try {
    const nextLink = await page.$(
      "a[rel='next'], a[aria-label*='suivant' i], a[class*='next'], a:has-text('Suivant'), a:has-text('suivant'), [class*='pagination'] a:last-child",
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
// Étape 6 — Déconnexion propre
// ---------------------------------------------------------------------------

/**
 * Tente une déconnexion propre du portail pour libérer la session.
 * Non bloquant : un échec de logout n'est pas critique.
 */
async function logout(page: Page): Promise<void> {
  try {
    const logoutLink = await page.$(
      "a[href*='logout'], a[href*='deconnexion'], a:has-text('Déconnexion'), a:has-text('Se déconnecter')",
    );
    if (logoutLink) {
      await logoutLink.click();
      await page.waitForLoadState("domcontentloaded", { timeout: PAGE_TIMEOUT_MS });
      console.info("[place] déconnexion effectuée");
    } else {
      console.warn("[place] lien de déconnexion non trouvé — session abandonnée");
    }
  } catch (err) {
    console.warn("[place] erreur lors du logout:", err);
  }
}

// ---------------------------------------------------------------------------
// Point d'entrée public
// ---------------------------------------------------------------------------

/**
 * Scrappe les appels d'offres récents sur le portail PLACE (marchés-publics.gouv.fr).
 *
 * @param req - Paramètres du job (profil, filtres, date plancher, credentials)
 * @param browser - Instance Playwright partagée (gérée par le worker)
 * @returns Liste des AOs collectés (peut être vide si aucun résultat)
 * @throws {Error} Si les credentials sont absents ou si le login échoue
 */
export async function scrapePlace(
  req: ScrapeRequest,
  browser: Browser,
): Promise<ScrapedTenderRecord[]> {
  // Validation des credentials — obligatoires pour PLACE
  if (
    !req.credentials?.username ||
    req.credentials.username.trim() === "" ||
    !req.credentials?.password ||
    req.credentials.password.trim() === ""
  ) {
    throw new Error("PLACE credentials required");
  }

  const { username, password } = req.credentials as { username: string; password: string };
  const tenders: ScrapedTenderRecord[] = [];
  let context: BrowserContext | null = null;

  const deadline = Date.now() + GLOBAL_TIMEOUT_MS;

  try {
    context = await browser.newContext({
      userAgent: USER_AGENT,
      locale: "fr-FR",
      timezoneId: "Europe/Paris",
    });
    const page = await context.newPage();

    // 1. Login
    await login(page, username, password);

    // 2. Navigation vers la recherche + filtre date
    await navigateToSearch(page, req.lastRunAt);

    // 3. Parcours des pages de résultats
    const detailPage = await context.newPage();

    for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex++) {
      if (Date.now() >= deadline) {
        console.warn("[place] timeout global atteint à la page", pageIndex);
        break;
      }

      const items = await extractResultRows(page);
      console.info(`[place] page ${pageIndex + 1} — ${items.length} lignes extraites`);

      if (items.length === 0) break;

      for (const item of items) {
        if (Date.now() >= deadline) break;

        try {
          // URL de la fiche
          const sourceUrl = item.href
            ? item.href.startsWith("http")
              ? item.href
              : `${BASE_URL}${item.href}`
            : `${BASE_URL}/index.php?page=entreprise.EntrepriseConsultation&ref=${encodeURIComponent(item.externalRef)}`;

          // Enrichissement depuis la fiche détail (si URL disponible)
          const detail: Partial<ScrapedTenderRecord> = item.href
            ? await extractTenderDetail(detailPage, item.href)
            : {};

          const record: ScrapedTenderRecord = {
            externalRef: item.externalRef,
            title: detail.title ?? item.title ?? "(sans titre)",
            buyer: detail.buyer ?? item.buyer ?? "(acheteur inconnu)",
            cpv: detail.cpv,
            amount: detail.amount,
            deadline: detail.deadline ?? item.deadline,
            questionsDeadline: detail.questionsDeadline,
            dceUrl: detail.dceUrl,
            sourceUrl,
            procedure: detail.procedure,
            description: detail.description,
          };

          tenders.push(record);
          await jitter();
        } catch (err) {
          console.warn("[place] extraction AO échouée:", item.externalRef, err);
          // Continuer avec le suivant
        }
      }

      // Page suivante
      const hasNext = await goToNextPage(page);
      if (!hasNext) break;

      await jitter();
    }

    await detailPage.close();

    // 4. Déconnexion propre
    await logout(page);
  } finally {
    if (context) {
      try {
        await context.close();
      } catch (err) {
        console.warn("[place] erreur fermeture context:", err);
      }
    }
  }

  console.info(`[place] scraping terminé — ${tenders.length} AOs collectés`);
  return tenders;
}
