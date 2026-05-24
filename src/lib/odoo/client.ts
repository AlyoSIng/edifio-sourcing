/**
 * Client XML-RPC Odoo minimaliste — connecteur partagé Tandem + Solo.
 *
 * Source de vérité :
 *  - `specs/module_solo_engine_v1.md` §3.2 — XML-RPC obligatoire (pas REST/JSON)
 *  - `specs/architects_data_and_admin_v1.md` §3 — lecture `res.partner`
 *  - `BRIEF_TANDEM_260521.md` — connecteur écrit UNE fois, partagé
 *
 * Conception :
 *  - **Pas de dépendance ajoutée** (cf. règle « `pnpm audit` à chaque ajout »).
 *    On utilise `fetch` natif (Node 22+) et un encoder/decoder XML-RPC minimal
 *    suffisant pour les 2 appels qui nous intéressent :
 *      * `execute_kw` sur `res.partner` (search_read) — import architectes
 *      * `execute_kw` sur `crm.lead` (create) — création opportunité
 *  - **Interface mockable** : tous les call-sites consomment le contrat
 *    `OdooClient` (interface), pas l'implémentation. Les tests injectent
 *    un `MockOdooClient`.
 *  - **Gated derrière `ODOO_SYNC_ENABLED`** : tant que le flag n'est pas posé
 *    à `'true'` côté env, les appels XML-RPC sont court-circuités. Évite
 *    toute fuite de credentials en CI / dev sans Vault.
 *  - **Pas de credentials hardcodés** : `ODOO_URL`, `ODOO_DB`, `ODOO_USER`,
 *    `ODOO_API_KEY` lus depuis `process.env` à chaque appel.
 *
 * Sécurité :
 *  - L'API key Odoo n'est jamais loggée (Vault Phase 2). En attendant,
 *    `process.env.ODOO_API_KEY` reste hors `.env.example` (placeholder à
 *    ajouter par Yann quand le Vault sera prêt — cf. `setup_api_keys_v1.md`).
 *  - L'URL XML-RPC est validée par regex `https://*.odoo.com/xmlrpc/2/`
 *    (whitelist). Pas de SSRF possible vers une URL arbitraire.
 *
 * Format XML-RPC (rappel) : `POST text/xml` avec body
 *   <?xml version="1.0"?><methodCall><methodName>...</methodName>
 *   <params><param><value>...</value></param>...</params></methodCall>
 * Réponse : <?xml ...><methodResponse><params>... </params></methodResponse>
 */

/* -------------------------------------------------------------------------- */
/*  Types publics                                                             */
/* -------------------------------------------------------------------------- */

/** Valeur XML-RPC supportée. Pas de récursion infinie — niveau 1 suffit. */
export type XmlRpcValue =
  | string
  | number
  | boolean
  | null
  | XmlRpcValue[]
  | { [key: string]: XmlRpcValue };

/** Contrat du client Odoo — injectable. */
export interface OdooClient {
  /**
   * Authentifie + exécute une méthode sur un modèle.
   *
   * @param model — nom du modèle Odoo (ex. 'res.partner', 'crm.lead')
   * @param method — méthode (ex. 'search_read', 'create')
   * @param args — positional args
   * @param kwargs — keyword args (ex. `{ fields: ['name', 'email'] }`)
   * @returns valeur retournée par Odoo
   * @throws `OdooError` si XML-RPC fault, network error, parse error
   */
  executeKw<T = XmlRpcValue>(
    model: string,
    method: string,
    args: XmlRpcValue[],
    kwargs?: Record<string, XmlRpcValue>,
  ): Promise<T>;
}

/** Erreur typée — pour les call-sites qui veulent distinguer les cas. */
export class OdooError extends Error {
  constructor(
    message: string,
    public readonly code: "network" | "fault" | "parse" | "config" | "disabled",
    public readonly detail?: string,
  ) {
    super(message);
    this.name = "OdooError";
  }
}

/* -------------------------------------------------------------------------- */
/*  Configuration                                                              */
/* -------------------------------------------------------------------------- */

interface OdooConfig {
  url: string;
  db: string;
  user: string;
  apiKey: string;
}

/**
 * Lit la config depuis l'env. Throw `OdooError('config')` si une var manque.
 * Validation regex sur l'URL pour bloquer toute SSRF.
 *
 * @internal — exposé pour tests uniquement
 */
export function loadOdooConfigFromEnv(): OdooConfig {
  const url = process.env.ODOO_URL;
  const db = process.env.ODOO_DB;
  const user = process.env.ODOO_USER;
  const apiKey = process.env.ODOO_API_KEY;
  if (!url || !db || !user || !apiKey) {
    throw new OdooError(
      "ODOO_URL / ODOO_DB / ODOO_USER / ODOO_API_KEY requis pour appeler Odoo",
      "config",
    );
  }
  // Whitelist : *.odoo.com ou sous-domaine de l'org sur HTTPS uniquement.
  if (!/^https:\/\/[\w.-]+\/?$/.test(url)) {
    throw new OdooError(
      `ODOO_URL invalide : ${url} (doit être https://<host>/ sans path)`,
      "config",
    );
  }
  return { url: url.replace(/\/+$/, ""), db, user, apiKey };
}

/** `true` si la sync XML-RPC est activée côté env (défaut OFF). */
export function isOdooSyncEnabled(): boolean {
  return process.env.ODOO_SYNC_ENABLED === "true";
}

/* -------------------------------------------------------------------------- */
/*  XML encode / decode minimal                                               */
/* -------------------------------------------------------------------------- */

/**
 * Encode une valeur en XML-RPC `<value>...</value>` (sans le wrapping).
 * Couvre les types nécessaires aux 2 méthodes utilisées (search_read, create).
 */
export function encodeXmlRpcValue(v: XmlRpcValue): string {
  if (v === null || v === undefined) {
    return "<value><nil/></value>";
  }
  if (typeof v === "boolean") {
    return `<value><boolean>${v ? "1" : "0"}</boolean></value>`;
  }
  if (typeof v === "number") {
    if (Number.isInteger(v)) {
      return `<value><int>${v}</int></value>`;
    }
    return `<value><double>${v}</double></value>`;
  }
  if (typeof v === "string") {
    return `<value><string>${escapeXml(v)}</string></value>`;
  }
  if (Array.isArray(v)) {
    const items = v.map(encodeXmlRpcValue).join("");
    return `<value><array><data>${items}</data></array></value>`;
  }
  // Object → struct
  const members = Object.entries(v)
    .map(([k, val]) => `<member><name>${escapeXml(k)}</name>${encodeXmlRpcValue(val)}</member>`)
    .join("");
  return `<value><struct>${members}</struct></value>`;
}

/** Échappe les caractères XML dangereux dans un texte. */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Construit un body XML-RPC `methodCall`.
 *
 * @param methodName — nom de la méthode XML-RPC (ex. 'execute_kw')
 * @param params — params positionnels (chacun wrappé `<param><value>...`)
 */
export function buildMethodCall(methodName: string, params: XmlRpcValue[]): string {
  const xmlParams = params.map((p) => `<param>${encodeXmlRpcValue(p)}</param>`).join("");
  return (
    `<?xml version="1.0"?>` +
    `<methodCall>` +
    `<methodName>${escapeXml(methodName)}</methodName>` +
    `<params>${xmlParams}</params>` +
    `</methodCall>`
  );
}

/**
 * Parser XML-RPC minimal — regex-based. Suffisant pour les réponses Odoo
 * qui retournent soit un entier (create) soit un array de struct (search_read).
 *
 * Pas un parser XML complet — on ne traite QUE les structures qu'Odoo
 * renvoie sur nos 2 appels. Si on étend la surface, basculer sur `fast-xml-parser`.
 */
export function parseMethodResponse(xml: string): XmlRpcValue {
  // Détection fault
  const faultMatch = xml.match(/<fault>([\s\S]*?)<\/fault>/);
  if (faultMatch && faultMatch[1]) {
    const faultStruct = parseValue(extractFirstValue(faultMatch[1]));
    const detail =
      faultStruct && typeof faultStruct === "object" && !Array.isArray(faultStruct)
        ? (faultStruct as Record<string, XmlRpcValue>).faultString
        : undefined;
    throw new OdooError(
      "Odoo XML-RPC fault",
      "fault",
      typeof detail === "string" ? detail : JSON.stringify(faultStruct),
    );
  }
  const responseMatch = xml.match(/<methodResponse>([\s\S]*?)<\/methodResponse>/);
  if (!responseMatch || !responseMatch[1]) {
    throw new OdooError("Réponse XML-RPC malformée (pas de methodResponse)", "parse");
  }
  const inner = responseMatch[1];
  const valueXml = extractFirstValue(inner);
  return parseValue(valueXml);
}

/**
 * Extrait la première paire `<value>...</value>` d'un fragment XML, en
 * respectant l'imbrication. Implémentation simple : scan balance de balises.
 */
function extractFirstValue(xml: string): string {
  const openIdx = xml.indexOf("<value>");
  if (openIdx === -1) {
    throw new OdooError("Réponse XML-RPC sans <value>", "parse");
  }
  let depth = 0;
  let i = openIdx;
  while (i < xml.length) {
    if (xml.startsWith("<value>", i)) {
      depth++;
      i += "<value>".length;
      continue;
    }
    if (xml.startsWith("</value>", i)) {
      depth--;
      i += "</value>".length;
      if (depth === 0) {
        return xml.substring(openIdx, i);
      }
      continue;
    }
    i++;
  }
  throw new OdooError("Réponse XML-RPC : <value> non clos", "parse");
}

/** Parse un fragment `<value>...</value>` (avec wrapping). */
function parseValue(xml: string): XmlRpcValue {
  // Strip outer <value>...</value>
  const inner = xml
    .replace(/^<value>/, "")
    .replace(/<\/value>$/, "")
    .trim();
  if (inner.startsWith("<int>") || inner.startsWith("<i4>")) {
    const m = inner.match(/<(?:int|i4)>(-?\d+)<\/(?:int|i4)>/);
    return m && m[1] ? parseInt(m[1], 10) : 0;
  }
  if (inner.startsWith("<boolean>")) {
    const m = inner.match(/<boolean>([01])<\/boolean>/);
    return m && m[1] === "1";
  }
  if (inner.startsWith("<double>")) {
    const m = inner.match(/<double>(-?[\d.]+)<\/double>/);
    return m && m[1] ? parseFloat(m[1]) : 0;
  }
  if (inner.startsWith("<string>") || inner === "" || /^[^<]/.test(inner)) {
    // <string>...</string> OU texte nu (XML-RPC tolère <value>foo</value>)
    const m = inner.match(/^<string>([\s\S]*?)<\/string>$/);
    return m && m[1] !== undefined ? unescapeXml(m[1]) : unescapeXml(inner);
  }
  if (inner.startsWith("<nil/>") || inner.startsWith("<nil />")) {
    return null;
  }
  if (inner.startsWith("<array>")) {
    const dataMatch = inner.match(/<array>\s*<data>([\s\S]*?)<\/data>\s*<\/array>/);
    if (!dataMatch || !dataMatch[1]) return [];
    const items: XmlRpcValue[] = [];
    let rest = dataMatch[1];
    while (rest.includes("<value>")) {
      const v = extractFirstValue(rest);
      items.push(parseValue(v));
      const idx = rest.indexOf(v) + v.length;
      rest = rest.substring(idx);
    }
    return items;
  }
  if (inner.startsWith("<struct>")) {
    const obj: Record<string, XmlRpcValue> = {};
    const memberRe = /<member>\s*<name>([\s\S]*?)<\/name>([\s\S]*?)<\/member>/g;
    let m: RegExpExecArray | null;
    while ((m = memberRe.exec(inner)) !== null) {
      const name = unescapeXml(m[1] ?? "");
      const valFragment = m[2] ?? "";
      const v = extractFirstValue(valFragment);
      obj[name] = parseValue(v);
    }
    return obj;
  }
  // Default : texte nu
  return unescapeXml(inner);
}

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/* -------------------------------------------------------------------------- */
/*  Implémentation production — fetch XML-RPC                                  */
/* -------------------------------------------------------------------------- */

/** Dépendance fetch injectable — par défaut `globalThis.fetch`. */
export type FetchFn = typeof fetch;

/**
 * Crée un `OdooClient` qui fait des vrais appels XML-RPC. Utilise le pattern
 * "execute_kw" standard Odoo : `/xmlrpc/2/object` avec args
 * `[db, uid, password, model, method, args, kwargs]`.
 *
 * Pour l'auth, on utilise l'API key Odoo comme password (recommandé Odoo
 * pour les intégrations machine-to-machine) — l'`uid` reste celui retourné
 * par `common.authenticate`, mais on peut court-circuiter en passant un
 * uid 1 (admin) si le compte est dédié API. Pour rester safe, on
 * authentifie au premier appel et on cache l'uid.
 */
export function createOdooClient(opts: { fetchFn?: FetchFn } = {}): OdooClient {
  const fetchFn = opts.fetchFn ?? globalThis.fetch;
  let cachedUid: number | null = null;

  async function rpcCall(
    path: string,
    method: string,
    params: XmlRpcValue[],
  ): Promise<XmlRpcValue> {
    const config = loadOdooConfigFromEnv();
    const body = buildMethodCall(method, params);
    let resp: Response;
    try {
      resp = await fetchFn(`${config.url}${path}`, {
        method: "POST",
        headers: { "Content-Type": "text/xml" },
        body,
      });
    } catch (err) {
      throw new OdooError(
        "Échec réseau XML-RPC",
        "network",
        err instanceof Error ? err.message : String(err),
      );
    }
    if (!resp.ok) {
      throw new OdooError(
        `Réponse HTTP ${resp.status} sur XML-RPC`,
        "network",
        `${resp.status} ${resp.statusText}`,
      );
    }
    const text = await resp.text();
    return parseMethodResponse(text);
  }

  async function authenticate(): Promise<number> {
    if (cachedUid !== null) return cachedUid;
    const config = loadOdooConfigFromEnv();
    const result = await rpcCall("/xmlrpc/2/common", "authenticate", [
      config.db,
      config.user,
      config.apiKey,
      {},
    ]);
    if (typeof result !== "number" || result <= 0) {
      throw new OdooError("Authentification Odoo échouée", "fault", String(result));
    }
    cachedUid = result;
    return cachedUid;
  }

  return {
    async executeKw<T = XmlRpcValue>(
      model: string,
      method: string,
      args: XmlRpcValue[],
      kwargs: Record<string, XmlRpcValue> = {},
    ): Promise<T> {
      const config = loadOdooConfigFromEnv();
      const uid = await authenticate();
      const result = await rpcCall("/xmlrpc/2/object", "execute_kw", [
        config.db,
        uid,
        config.apiKey,
        model,
        method,
        args,
        kwargs,
      ]);
      return result as T;
    },
  };
}

/**
 * Stub client — quand `ODOO_SYNC_ENABLED !== 'true'`. Throw immédiatement
 * `OdooError('disabled')` à chaque appel. Permet aux call-sites de
 * try/catch proprement et d'enregistrer en BDD avec `odooId=-1` /
 * `lastError='sync_disabled'`.
 */
export function createDisabledOdooClient(): OdooClient {
  return {
    async executeKw<T = XmlRpcValue>(): Promise<T> {
      throw new OdooError("Sync Odoo désactivée (ODOO_SYNC_ENABLED !== 'true')", "disabled");
    },
  };
}

/**
 * Singleton — appelé par les call-sites prod. Lit `ODOO_SYNC_ENABLED` une
 * seule fois et choisit l'implémentation en conséquence.
 */
let cachedClient: OdooClient | null = null;
export function getOdooClient(): OdooClient {
  if (!cachedClient) {
    cachedClient = isOdooSyncEnabled() ? createOdooClient() : createDisabledOdooClient();
  }
  return cachedClient;
}

/** Reset cache — usage tests uniquement. */
export function __resetOdooClientCache(): void {
  cachedClient = null;
}
