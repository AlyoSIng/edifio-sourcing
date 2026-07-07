/**
 * Scraper Marchés Publics Info — www.marches-publics.info (plateforme AWS-Achat)
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ Ce site est protégé par un anti-bot qui renvoie un captcha 403 aux IP     │
 * │ datacenter classiques (dont Fly.io). On pilote donc un navigateur DISTANT │
 * │ Browserbase (https://browserbase.com) via CDP : ses IP passent l'anti-bot.│
 * │ Le paramètre `browser` (Playwright local) de la signature est IGNORÉ.     │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Moteur de recherche (constaté en découverte réelle le 2026-07-07) :
 *  - Formulaire POST `#formRech` action="/Annonces/lister" (jQuery + Bootstrap).
 *  - Type d'annonce = radio `IDE` : EC (En cours), A (Expirés), AAA (Attributions),
 *    DE (Données essentielles). On coche **EC = appels d'offres en cours**.
 *  - Mot-clé = input `#motCle` (name `txtLibre`). Sémantique **ET / phrase** :
 *    « maîtrise d'oeuvre » (76 avis) est plus restrictif que « maîtrise » (346).
 *    → On BOUCLE par mot-clé (union) plutôt que de tout coller (ET → 0 résultat).
 *  - Trop de résultats ⇒ le site refuse d'afficher la liste (« Veuillez préciser
 *    votre recherche ») et ne rend AUCUN bloc. Un mot-clé discriminant (une phrase
 *    métier) passe sous le seuil ; un mot trop générique est ignoré (warn).
 *  - Résultats server-rendered en blocs `div#entity` (id dupliqué, volontaire).
 *  - Pagination via GET `/Annonces/lister?pager_s=N` (l'état de recherche est en
 *    session serveur, conservé pour la durée de la session Browserbase).
 *
 * Champs d'un bloc résultat :
 *  - `.affiche_date_avis` → « Publié le JJ/MM/AA | Date limite : le JJ/MM/AA à HHhMM »
 *  - `h2.h2-avis`         → organisme acheteur (+ code postal entre parenthèses)
 *  - `.ref-acheteur`      → « [réf. XXX] »
 *  - `#titre_box` (texte) → objet de l'avis
 *  - a « Consulter l'avis » → URL de la fiche (relative /Annonces/MPI-pub-*.htm)
 *  - a « DCE » / « RC »     → liens dossier de consultation / règlement
 *
 * Toute extraction est défensive : un site qui change dégrade en champ absent,
 * il ne plante jamais le worker.
 */

import type { Browser } from "playwright";
import { chromium } from "playwright";
import type { ScrapedTenderRecord, ScrapeRequest } from "./types.js";

const BASE_URL = "https://www.marches-publics.info";
const SEARCH_URL = `${BASE_URL}/Annonces/lister`;

/** projectId Browserbase par défaut (ce n'est pas un secret, juste un identifiant). */
const DEFAULT_BROWSERBASE_PROJECT_ID = "c3dd9f26-0605-4c27-a5a1-836ecc5bf644";

/** Timeout par navigation de page (ms) */
const PAGE_TIMEOUT_MS = 45_000;
/** Nombre maximum de pages de résultats parcourues par mot-clé (garde-fou) */
const MAX_PAGES = 10;
/** Nombre maximum de mots-clés traités par run (borne le temps / coût session) */
const MAX_KEYWORDS = 8;
/** Timeout global du scraping complet (ms) — Browserbase facture à la session */
const GLOBAL_TIMEOUT_MS = 240_000;

// ---------------------------------------------------------------------------
// Helpers Browserbase
// ---------------------------------------------------------------------------

interface BrowserbaseSession {
  id: string;
  connectUrl: string;
}

/**
 * Crée une session Browserbase via l'API REST.
 * Tente d'abord avec proxies résidentiels (plan payant) ; retombe sans proxy
 * (plan free) si l'API renvoie 402. Les IP Browserbase (même sans proxy)
 * passent l'anti-bot de marches-publics.info à date.
 */
async function createBrowserbaseSession(
  apiKey: string,
  projectId: string,
): Promise<BrowserbaseSession> {
  const attempts: Array<Record<string, unknown>> = [
    { projectId, proxies: true },
    { projectId },
  ];

  let lastError = "";
  for (const body of attempts) {
    const res = await fetch("https://api.browserbase.com/v1/sessions", {
      method: "POST",
      headers: { "X-BB-API-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 201) {
      const json = (await res.json()) as BrowserbaseSession;
      console.info(
        `[marchespublicsinfo] session Browserbase ${json.id} créée (proxies=${Boolean(body["proxies"])})`,
      );
      return json;
    }
    lastError = `HTTP ${res.status} ${(await res.text()).slice(0, 160)}`;
    // 402 = proxies non inclus dans le plan → on tente la variante sans proxy.
    if (res.status !== 402) break;
  }
  throw new Error(`création session Browserbase impossible: ${lastError}`);
}

/**
 * Libère explicitement une session Browserbase (best-effort).
 * `browser.close()` suffit en général, mais on force le REQUEST_RELEASE pour
 * ne pas laisser filer une session facturée en cas de fermeture partielle.
 */
async function releaseBrowserbaseSession(
  apiKey: string,
  projectId: string,
  sessionId: string,
): Promise<void> {
  try {
    await fetch(`https://api.browserbase.com/v1/sessions/${sessionId}`, {
      method: "POST",
      headers: { "X-BB-API-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, status: "REQUEST_RELEASE" }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    console.warn("[marchespublicsinfo] release session échoué (ignoré):", err);
  }
}

/**
 * Ouvre une session Browserbase, connecte Playwright en CDP, exécute `fn`,
 * puis ferme proprement (browser + release session). Toute la logique de
 * scraping vit dans `fn`.
 */
async function withBrowserbaseSession<T>(
  apiKey: string,
  projectId: string,
  fn: (browser: Browser) => Promise<T>,
): Promise<T> {
  const session = await createBrowserbaseSession(apiKey, projectId);
  const browser = await chromium.connectOverCDP(session.connectUrl);
  try {
    return await fn(browser);
  } finally {
    try {
      await browser.close();
    } catch (err) {
      console.warn("[marchespublicsinfo] fermeture browser échouée (ignoré):", err);
    }
    await releaseBrowserbaseSession(apiKey, projectId, session.id);
  }
}

// ---------------------------------------------------------------------------
// Helpers de parsing
// ---------------------------------------------------------------------------

/**
 * Parse une date FR « JJ/MM/AA » ou « JJ/MM/AAAA », avec heure optionnelle
 * (« à HHhMM »), vers ISO 8601. Année sur 2 chiffres → 20AA.
 * Retourne undefined si le format n'est pas reconnu.
 */
function parseFrenchDate(day: string, month: string, year: string, time?: string): string | undefined {
  if (!day || !month || !year) return undefined;
  const yyyy = year.length === 2 ? `20${year}` : year;
  const iso = `${yyyy}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined;
  if (time) {
    const t = time.match(/(\d{1,2})h(\d{2})/);
    if (t && t[1] && t[2]) {
      return `${iso}T${t[1].padStart(2, "0")}:${t[2]}:00`;
    }
  }
  return iso;
}

/** Extrait « Publié le JJ/MM/AA » d'une ligne de date. */
function parsePublicationDate(dateRow: string): string | undefined {
  const m = dateRow.match(/Publié le\s+(\d{2})\/(\d{2})\/(\d{2,4})/i);
  if (!m) return undefined;
  return parseFrenchDate(m[1] ?? "", m[2] ?? "", m[3] ?? "");
}

/** Extrait « Date limite : le JJ/MM/AA à HHhMM » d'une ligne de date. */
function parseDeadline(dateRow: string): string | undefined {
  const m = dateRow.match(/Date limite\s*:\s*le\s+(\d{2})\/(\d{2})\/(\d{2,4})(?:\s*à\s*(\d{1,2}h\d{2}))?/i);
  if (!m) return undefined;
  return parseFrenchDate(m[1] ?? "", m[2] ?? "", m[3] ?? "", m[4]);
}

/**
 * Extrait la référence lisible « [réf. XXX] » → « XXX ».
 * Utilisée en fallback ; l'externalRef stable reste le slug de la fiche.
 */
function cleanRef(rawRef: string): string | undefined {
  const m = rawRef.match(/\[réf\.\s*([^\]]+)\]/i);
  return m && m[1] ? m[1].trim() : undefined;
}

/**
 * Déduit un externalRef stable et unique depuis l'URL de la fiche.
 * Ex : « /Annonces/MPI-pub-2026181995.htm » → « MPI-pub-2026181995 ».
 */
function refFromFicheUrl(href: string): string | undefined {
  const m = href.match(/\/([A-Za-z0-9-]+)\.htm(?:\?|#|$)/);
  return m && m[1] ? m[1] : undefined;
}

/** Absolutise une URL relative du site. */
function toAbsoluteUrl(href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  return `${BASE_URL}${href.startsWith("/") ? "" : "/"}${href}`;
}

/** Date ISO (YYYY-MM-DD) minimale à conserver, dérivée de lastRunAt. */
function floorDate(iso: string): string {
  return iso.substring(0, 10);
}

// ---------------------------------------------------------------------------
// Extraction des blocs résultat (exécutée dans le contexte page)
// ---------------------------------------------------------------------------

/** Enregistrement brut extrait du DOM (avant normalisation Node). */
interface RawResult {
  dateRow: string;
  buyer: string;
  ref: string;
  objet: string;
  ficheHref: string | null;
  dceHref: string | null;
}

/**
 * Extrait les blocs `div#entity` de la page courante.
 * `page` est un objet Playwright ; l'évaluation se fait côté navigateur.
 */
async function extractResultsOnPage(page: import("playwright").Page): Promise<RawResult[]> {
  try {
    return await page.evaluate(() => {
      const blocks = Array.from(document.querySelectorAll("div#entity"));
      const norm = (s: string | null | undefined) => (s || "").replace(/\s+/g, " ").trim();
      return blocks.map((el) => {
        const q = (sel: string) => el.querySelector(sel);
        const anchors = Array.from(el.querySelectorAll("a[href]"));
        const consulter = anchors.find((a) => /consulter/i.test(a.textContent || ""));
        const dce = anchors.find((a) => /^\s*DCE\s*$/i.test(a.textContent || ""));

        // Objet : texte de #titre_box moins la référence et les tags [Marché ...]
        const titreBox = q("#titre_box");
        let objet = "";
        if (titreBox) {
          objet = norm(titreBox.textContent)
            .replace(/\[réf\.[^\]]*\]/gi, "")
            .replace(/\[Marché[^\]]*\]?/gi, "")
            .trim();
        }

        return {
          dateRow: norm(q(".affiche_date_avis")?.textContent),
          buyer: norm(q("h2.h2-avis")?.textContent),
          ref: norm(q(".ref-acheteur")?.textContent),
          objet: objet.slice(0, 400),
          ficheHref: consulter ? consulter.getAttribute("href") : null,
          dceHref: dce ? dce.getAttribute("href") : null,
        } as RawResult;
      });
    });
  } catch (err) {
    console.warn("[marchespublicsinfo] extraction blocs échouée:", err);
    return [];
  }
}

/**
 * Numéro de la dernière page de résultats, lu dans la pagination
 * (« 1 2 3 4 5 … 8 » → 8). Retourne 1 si pas de pagination.
 */
async function extractLastPage(page: import("playwright").Page): Promise<number> {
  try {
    const nums = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("a[href*='pager_s']"))
        .map((a) => {
          const m = (a.getAttribute("href") || "").match(/pager_s=(\d+)/);
          return m && m[1] ? Number(m[1]) : NaN;
        })
        .filter((n) => Number.isFinite(n) && n > 1);
    });
    return nums.length ? Math.max(...nums) : 1;
  } catch {
    return 1;
  }
}

/**
 * Charge une page de résultats (GET `?pager_s=N`) et en extrait les blocs.
 * Le rendu de ce site est intermittent (un même pager_s renvoie parfois 0 bloc,
 * parfois la page pleine) → on réessaie une fois sur page vide.
 */
async function extractPageWithRetry(
  page: import("playwright").Page,
  pageNum: number,
): Promise<RawResult[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await page.goto(`${SEARCH_URL}?pager_s=${pageNum}`, {
        waitUntil: "networkidle",
        timeout: PAGE_TIMEOUT_MS,
      });
      // Attend qu'au moins un bloc soit rendu ; sinon lève et on réessaie.
      await page.waitForSelector("div#entity", { timeout: 12_000 });
      return await extractResultsOnPage(page);
    } catch {
      // page vide (fin de résultats ou rendu transitoire) — on retente une fois
    }
  }
  return [];
}

// ---------------------------------------------------------------------------
// Normalisation d'un résultat brut → ScrapedTenderRecord
// ---------------------------------------------------------------------------

function toRecord(raw: RawResult): ScrapedTenderRecord | null {
  const ficheHref = raw.ficheHref;
  if (!ficheHref) return null; // sans fiche, l'AO n'est pas exploitable

  const sourceUrl = toAbsoluteUrl(ficheHref);
  const externalRef = refFromFicheUrl(ficheHref) ?? cleanRef(raw.ref) ?? sourceUrl;

  const record: ScrapedTenderRecord = {
    externalRef,
    title: raw.objet || "(sans objet)",
    buyer: raw.buyer || "(acheteur inconnu)",
    sourceUrl,
  };

  const deadline = parseDeadline(raw.dateRow);
  if (deadline) record.deadline = deadline;

  if (raw.dceHref) record.dceUrl = toAbsoluteUrl(raw.dceHref);

  const humanRef = cleanRef(raw.ref);
  if (humanRef) record.description = `Réf. acheteur : ${humanRef}`;

  return record;
}

// ---------------------------------------------------------------------------
// Recherche pour un mot-clé (POST + pagination)
// ---------------------------------------------------------------------------

/**
 * Lance une recherche « En cours » pour un mot-clé, parcourt les pages de
 * résultats et retourne les enregistrements bruts. Défensif : ne jette pas.
 */
async function searchKeyword(
  page: import("playwright").Page,
  keyword: string,
  floorIso: string,
  deadlineMs: number,
): Promise<RawResult[]> {
  const collected: RawResult[] = [];

  try {
    // 1. Repartir d'un état serveur propre : la recherche est mémorisée en
    //    session (cookie). Sans purge, le formulaire ne se réaffiche pas
    //    correctement entre deux mots-clés (#sub invisible). On vide les cookies
    //    → GET /Annonces/lister renvoie un formulaire vierge, comme au 1er appel.
    await page.context().clearCookies().catch(() => undefined);
    await page.goto(SEARCH_URL, { waitUntil: "networkidle", timeout: PAGE_TIMEOUT_MS });
    await page.waitForSelector("#sub", { state: "visible", timeout: PAGE_TIMEOUT_MS });

    // 2. Cocher « En cours » + saisir le mot-clé.
    await page.check("#typeEC").catch(() => undefined);
    await page.fill("#motCle", "").catch(() => undefined);
    await page.fill("#motCle", keyword).catch(() => undefined);

    // 3. Soumettre (POST /Annonces/lister).
    await Promise.all([
      page.waitForLoadState("networkidle", { timeout: PAGE_TIMEOUT_MS }),
      page.click("#sub"),
    ]);
  } catch (err) {
    console.warn(`[marchespublicsinfo] recherche "${keyword}" — échec soumission:`, err);
    return collected;
  }

  // 4. Le site refuse-t-il d'afficher (trop de résultats) ?
  const bodyText = await page.evaluate(() => document.body?.innerText ?? "").catch(() => "");
  if (/Veuillez préciser/i.test(bodyText)) {
    console.warn(
      `[marchespublicsinfo] mot-clé "${keyword}" trop générique (le site demande de préciser) — ignoré`,
    );
    return collected;
  }

  // 5. Page 1 (déjà rendue par le POST).
  collected.push(...(await extractResultsOnPage(page)));
  console.info(`[marchespublicsinfo] "${keyword}" page 1 — ${collected.length} blocs`);

  // 6. Pagination : on parcourt SÉQUENTIELLEMENT 2..dernière page (bornée par
  //    MAX_PAGES). La pagination affichée est tronquée (« 1 2 3 4 5 … 8 ») donc
  //    on itère tous les numéros, pas seulement ceux listés. Le 1er bloc de
  //    chaque page est un avis épinglé récurrent → le dédoublonnage par
  //    externalRef en amont l'absorbe. On ne s'arrête PAS sur une page vide
  //    (rendu intermittent : une page suivante peut encore contenir des avis).
  const lastPage = Math.min(await extractLastPage(page), MAX_PAGES);
  for (let pageNum = 2; pageNum <= lastPage; pageNum++) {
    if (Date.now() >= deadlineMs) {
      console.warn("[marchespublicsinfo] timeout global atteint pendant la pagination");
      break;
    }
    const pageResults = await extractPageWithRetry(page, pageNum);
    collected.push(...pageResults);
    console.info(`[marchespublicsinfo] "${keyword}" page ${pageNum}/${lastPage} — +${pageResults.length} blocs`);
  }

  // Filtre incrémental : on ne garde que les avis publiés depuis lastRunAt.
  // Un avis à date de publication non parseable est conservé (prudence).
  return collected.filter((r) => {
    const pub = parsePublicationDate(r.dateRow);
    return !pub || pub >= floorIso;
  });
}

// ---------------------------------------------------------------------------
// Sélection des mots-clés discriminants
// ---------------------------------------------------------------------------

/**
 * Prépare la liste de mots-clés à rechercher : nettoie, dédoublonne, cap à
 * MAX_KEYWORDS. Le moteur fait un ET/phrase, donc chaque entrée doit rester
 * une expression discriminante (idéalement une phrase métier courte).
 */
function selectKeywords(keywords: string[] | undefined): string[] {
  if (!keywords || keywords.length === 0) return [];
  const cleaned = keywords
    .map((k) => k.trim())
    .filter((k) => k.length >= 3);
  return [...new Set(cleaned)].slice(0, MAX_KEYWORDS);
}

// ---------------------------------------------------------------------------
// Point d'entrée public
// ---------------------------------------------------------------------------

/**
 * Scrappe les appels d'offres en cours sur marches-publics.info via Browserbase.
 *
 * Le paramètre `browser` (Playwright local du worker) est volontairement ignoré :
 * ce site nécessite un navigateur distant Browserbase pour passer l'anti-bot.
 *
 * @param req - Paramètres du job (profil, filtres, date plancher)
 * @param _browser - Instance Playwright locale (IGNORÉE — voir en-tête de fichier)
 * @returns Liste des AOs collectés (vide si secret absent ou aucun résultat)
 */
export async function scrapeMarChesPublicsInfo(
  req: ScrapeRequest,
  _browser: Browser,
): Promise<ScrapedTenderRecord[]> {
  const apiKey = process.env.BROWSERBASE_API_KEY;
  const projectId = process.env.BROWSERBASE_PROJECT_ID ?? DEFAULT_BROWSERBASE_PROJECT_ID;

  // Fail-soft : sans clé Browserbase, on ne casse pas le worker.
  if (!apiKey) {
    console.warn(
      "[marchespublicsinfo] BROWSERBASE_API_KEY absent — scraper désactivé, retour []",
    );
    return [];
  }

  const keywords = selectKeywords(req.profileFilters.keywords);
  if (keywords.length === 0) {
    console.warn(
      "[marchespublicsinfo] aucun mot-clé discriminant dans le profil — retour [] (le moteur refuse une recherche non ciblée)",
    );
    return [];
  }

  const floorIso = floorDate(req.lastRunAt);
  const globalDeadlineMs = Date.now() + GLOBAL_TIMEOUT_MS;
  // Dédoublonnage inter-mots-clés par externalRef (union des recherches).
  const byRef = new Map<string, ScrapedTenderRecord>();

  try {
    await withBrowserbaseSession(apiKey, projectId, async (browser) => {
      const context = browser.contexts()[0] ?? (await browser.newContext());
      // Shim `__name` : le worker tourne via tsx/esbuild (keepNames), qui enveloppe
      // les fonctions nommées de nos callbacks page.evaluate() dans un helper
      // `__name(...)` inexistant côté navigateur → ReferenceError. On injecte un
      // no-op idempotent avant chaque navigation. (source string = non transpilée)
      await context.addInitScript(
        "window.__name = window.__name || function (fn) { return fn; };",
      );
      const page = context.pages()[0] ?? (await context.newPage());

      for (const keyword of keywords) {
        if (Date.now() >= globalDeadlineMs) {
          console.warn("[marchespublicsinfo] timeout global atteint — arrêt des mots-clés restants");
          break;
        }
        const raws = await searchKeyword(page, keyword, floorIso, globalDeadlineMs);
        for (const raw of raws) {
          const record = toRecord(raw);
          if (record && !byRef.has(record.externalRef)) {
            byRef.set(record.externalRef, record);
          }
        }
      }
    });
  } catch (err) {
    // Une erreur Browserbase (session, réseau, anti-bot) ne doit pas casser le worker.
    console.error("[marchespublicsinfo] erreur fatale scraping (retour partiel):", err);
  }

  const tenders = [...byRef.values()];
  console.info(`[marchespublicsinfo] scraping terminé — ${tenders.length} AOs uniques collectés`);
  return tenders;
}
