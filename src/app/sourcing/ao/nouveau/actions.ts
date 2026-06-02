"use server";

/**
 * Server Actions — création et enrichissement d'un AO manuel (consultation privée).
 *
 * Actions exposées :
 *   - `createPrivateTender`      : crée un AO manuel depuis un formulaire
 *   - `enrichTenderFromUrlAction`: enrichit les champs depuis une URL d'annonce
 *
 * Sécurité :
 *  - Auth check systématique
 *  - Validation MIME + taille côté serveur (jamais côté client seul)
 *  - `externalRef` = UUID v4 généré côté serveur (jamais depuis le client)
 *  - `dceUrl` = URL publique signée Supabase Storage (si fichier uploadé)
 *  - SSRF check sur toutes les URLs externes (HTTPS only, pas d'IP privée)
 *
 * Source de vérité : brief Board feat/boamp-dce-ao-manuel (2026-05-27).
 */

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";

import { db } from "@/db/client";
import { platforms } from "@/db/schema/config";
import { tenders, tenderDocuments } from "@/db/schema/tenders";
import { isAdmin, toUserProfile } from "@/lib/auth/types";
import { getRequiredOrgId } from "@/lib/auth/get-required-org-id";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";

// ============================================================================
// Constantes
// ============================================================================

/** Taille maximale du fichier DCE : 50 Mo. */
const MAX_DCE_SIZE_BYTES = 50 * 1024 * 1024;

/** Types MIME acceptés pour le DCE. */
const ALLOWED_DCE_MIME = new Set([
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream", // Certains navigateurs envoient ZIP sans MIME précis
]);

/** Bucket Supabase pour les documents liés aux tenders. */
const BUCKET = "tender_documents";

// ============================================================================
// Types de retour
// ============================================================================

export type CreatePrivateTenderResult =
  | { ok: true; tenderId: string }
  | { ok: false; error: string };

// ============================================================================
// Helpers
// ============================================================================

/**
 * Sanitize un nom de fichier pour usage dans un chemin Storage :
 * remplace espaces et caractères spéciaux par des underscores.
 */
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
}

/**
 * Génère un UUID v4 pseudo-aléatoire côté serveur.
 * Utilise `crypto.randomUUID()` disponible en Node.js 14.17+.
 */
function newUuid(): string {
  return crypto.randomUUID();
}

// ============================================================================
// Action principale
// ============================================================================

/**
 * Crée un AO manuel (consultation privée).
 *
 * Champs FormData attendus :
 *  - `title`          — string, obligatoire, max 500 chars
 *  - `description`    — string, optionnel, max 2000 chars
 *  - `buyerName`      — string, optionnel
 *  - `deadline`       — string ISO date, obligatoire
 *  - `estimatedValue` — string number, optionnel (en euros)
 *  - `department`     — string code département (2-3 chars), optionnel
 *  - `marketType`     — string : "moe" | "services" | "travaux" | "fournitures" | "autre"
 *  - `dceFile`        — File, optionnel (PDF ou ZIP, max 50 Mo)
 *  - `notes`          — string, optionnel
 */
export async function createPrivateTender(formData: FormData): Promise<CreatePrivateTenderResult> {
  // 1. Auth check + isAdmin
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "not_authenticated" };

  const profile = toUserProfile(user);
  if (!isAdmin(profile)) return { ok: false, error: "forbidden_role" };

  const orgId = await getRequiredOrgId(user.id);

  // 2. Extraction des champs
  const title = formData.get("title");
  const description = formData.get("description");
  const buyerName = formData.get("buyerName");
  const deadlineRaw = formData.get("deadline");
  const estimatedValueRaw = formData.get("estimatedValue");
  const department = formData.get("department");
  const marketType = formData.get("marketType");
  const dceFile = formData.get("dceFile");
  const notes = formData.get("notes");
  const sourceUrlRaw = formData.get("sourceUrl");

  // 3. Validation des champs obligatoires
  if (typeof title !== "string" || title.trim().length === 0) {
    return { ok: false, error: "Le titre est obligatoire." };
  }
  if (title.trim().length > 500) {
    return { ok: false, error: "Le titre ne peut pas dépasser 500 caractères." };
  }
  if (typeof description === "string" && description.length > 2000) {
    return { ok: false, error: "La description ne peut pas dépasser 2000 caractères." };
  }
  if (typeof deadlineRaw !== "string" || deadlineRaw.trim() === "") {
    return { ok: false, error: "La date limite de réponse est obligatoire." };
  }
  const deadline = new Date(deadlineRaw);
  if (Number.isNaN(deadline.getTime())) {
    return { ok: false, error: "La date limite de réponse est invalide." };
  }

  // Validation type de marché
  const VALID_MARKET_TYPES = new Set(["moe", "services", "travaux", "fournitures", "autre"]);
  const marketTypeStr = typeof marketType === "string" ? marketType.trim() : "";
  if (marketTypeStr && !VALID_MARKET_TYPES.has(marketTypeStr)) {
    return { ok: false, error: "Type de marché invalide." };
  }

  // Validation département (2-3 chars alphanumériques)
  const departmentStr = typeof department === "string" ? department.trim() : "";
  if (departmentStr && !/^[0-9A-Za-z]{1,3}$/.test(departmentStr)) {
    return { ok: false, error: "Code département invalide (ex : 75, 2A, 971)." };
  }

  // URL de l'annonce officielle — alimente tenders.source_url
  // Validation minimaliste : on accepte uniquement les URLs HTTPS (sinon NULL).
  // Le bouton "Détecter ↗" et le lien "Voir l'annonce en ligne" sur la page dossier
  // dépendent de la présence de cette colonne.
  const sourceUrlStr = typeof sourceUrlRaw === "string" ? sourceUrlRaw.trim() : "";
  const finalSourceUrl = sourceUrlStr.startsWith("https://") ? sourceUrlStr : null;

  // Montant estimé
  let amount: string | null = null;
  if (typeof estimatedValueRaw === "string" && estimatedValueRaw.trim() !== "") {
    const parsed = parseFloat(estimatedValueRaw.replace(",", "."));
    if (Number.isNaN(parsed) || parsed < 0) {
      return { ok: false, error: "Le montant estimé doit être un nombre positif." };
    }
    amount = parsed.toFixed(2);
  }

  // 4. Upload DCE si fichier fourni
  let dceUrl: string | null = null;
  let dceStoragePath: string | null = null;
  let dceFileSizeBytes: number | null = null;
  let dceFileFormat: string | null = null;
  let dceFileName: string | null = null;

  if (dceFile instanceof File && dceFile.size > 0) {
    // Validation taille
    if (dceFile.size > MAX_DCE_SIZE_BYTES) {
      return { ok: false, error: "Le fichier DCE ne peut pas dépasser 50 Mo." };
    }

    // Validation MIME — on accepte aussi les ZIP mal typés via l'extension
    const mimeOk = ALLOWED_DCE_MIME.has(dceFile.type);
    const extOk = /\.(pdf|zip)$/i.test(dceFile.name);
    if (!mimeOk && !extOk) {
      return { ok: false, error: "Format de fichier non accepté (PDF ou ZIP uniquement)." };
    }

    const supabaseAdmin = createSupabaseAdminClient();
    const fileExt = dceFile.name.split(".").pop()?.toLowerCase() ?? "bin";
    const sanitized = sanitizeFilename(dceFile.name);
    const fileUuid = newUuid();
    dceStoragePath = `${orgId}/${fileUuid}_${sanitized}`;
    dceFileName = dceFile.name;
    dceFileSizeBytes = dceFile.size;
    dceFileFormat = fileExt;

    const arrayBuffer = await dceFile.arrayBuffer();
    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(dceStoragePath, arrayBuffer, {
        contentType: dceFile.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      console.error("[ao-nouveau:upload-dce]", uploadError);
      return { ok: false, error: `Erreur upload DCE : ${uploadError.message}` };
    }

    // URL publique signée (expire dans 10 ans — le DCE reste longtemps nécessaire)
    const { data: signed } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(dceStoragePath, 60 * 60 * 24 * 365 * 10);

    dceUrl = signed?.signedUrl ?? null;
  }

  // 5. Résolution du platformId "prive"
  const platformRows = await db
    .select({ id: platforms.id })
    .from(platforms)
    .where(eq(platforms.code, "prive"))
    .limit(1);

  const platformId = platformRows[0]?.id;
  if (!platformId) {
    return {
      ok: false,
      error:
        "La plateforme 'prive' n'est pas configurée en base. Appliquez la migration 0023 d'abord.",
    };
  }

  // 6. Construction du rawData — respecte le contrat TenderRawData.
  // Pour les AO privés, `record` porte les métadonnées de création manuelle
  // (source, auteur, type de marché, description, notes) à la place du payload
  // brut d'une plateforme API. `fetched_at` = heure de création.
  const rawData = {
    platform_code: "prive" as const,
    record: {
      source: "manuel",
      created_by: user.id,
      market_type: marketTypeStr || null,
      description_longue: typeof description === "string" ? description.trim() || null : null,
      notes_internes: typeof notes === "string" ? notes.trim() || null : null,
    },
    fetched_at: new Date().toISOString(),
  };

  // 7. INSERT dans tenders
  const externalRef = newUuid(); // Référence externe unique côté serveur

  const tenderRows = await db
    .insert(tenders)
    .values({
      organizationId: orgId,
      externalRef,
      platformId,
      title: title.trim(),
      buyer: typeof buyerName === "string" ? buyerName.trim() || "—" : "—",
      cpv: [],
      amount,
      deadline,
      dceUrl,
      sourceUrl: finalSourceUrl,
      rawData,
      score: null,
      status: "sourced",
      department: departmentStr || null,
    })
    .returning({ id: tenders.id });

  const tenderId = tenderRows[0]?.id;
  if (!tenderId) {
    return { ok: false, error: "Erreur lors de la création de l'AO en base de données." };
  }

  // 8. INSERT dans tender_documents si fichier DCE uploadé
  if (dceStoragePath && dceFileName) {
    await db.insert(tenderDocuments).values({
      tenderId,
      organizationId: orgId,
      kind: "DCE",
      name: dceFileName,
      format: dceFileFormat,
      storagePath: dceStoragePath,
      sizeBytes: dceFileSizeBytes,
      analyzed: false,
    });
  }

  // 9. Revalidation du cache
  revalidatePath("/sourcing/ao-du-jour");

  return { ok: true, tenderId };
}

// ============================================================================
// Enrichissement automatique depuis URL
// ============================================================================

/**
 * Données extraites d'une page d'annonce d'AO (BOAMP ou autre plateforme).
 * Tous les champs sont optionnels — Claude ou l'API peuvent ne pas trouver
 * certaines informations.
 */
export interface EnrichedTenderData {
  title?: string;
  buyerName?: string;
  /** Date limite de remise des offres, format YYYY-MM-DD. */
  deadline?: string;
  /** Montant estimé du marché en euros. */
  estimatedValue?: number;
  /** Description courte du marché (max 300 chars). */
  description?: string;
  /** URL directe vers le DCE / RC si trouvée. */
  dceUrl?: string;
  /** Code département sur 2 caractères (ex : "62", "2A"). */
  department?: string;
  /** Type de marché parmi : moe, services, travaux, fournitures, autre. */
  marketType?: string;
}

/** Types de retour de enrichTenderFromUrlAction. */
export type EnrichTenderResult =
  | { ok: true; data: EnrichedTenderData }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

/**
 * Vérifie si un hostname correspond à une plage IP privée / réservée.
 * Protection anti-SSRF (Server-Side Request Forgery).
 */
function _isPrivateHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();

  if (
    h === "localhost" ||
    h === "metadata.google.internal" ||
    h === "instance-data" ||
    h === "169.254.169.254"
  ) {
    return true;
  }

  const ipv4Patterns = [
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^169\.254\./,
    /^0\./,
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
    /^198\.(18|19)\./,
    /^240\./,
  ];

  if (ipv4Patterns.some((re) => re.test(h))) return true;

  if (
    h === "::1" ||
    /^fe80:/i.test(h) ||
    /^fc[0-9a-f]{2}:/i.test(h) ||
    /^fd[0-9a-f]{2}:/i.test(h)
  ) {
    return true;
  }

  return false;
}

/**
 * Valide qu'une URL est autorisée pour un fetch externe :
 *  - Protocole HTTPS uniquement
 *  - Hostname hors plages privées (anti-SSRF)
 * Retourne null si valide, ou un message d'erreur.
 */
function _validateExternalUrl(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return "invalid_url";
  }
  if (parsed.protocol !== "https:") return "invalid_url";
  if (_isPrivateHostname(parsed.hostname)) return "invalid_url";
  return null;
}

/**
 * Extrait l'idweb BOAMP depuis une URL BOAMP.
 * Ex : https://www.boamp.fr/avis/detail/26-50052/0 → "26-50052"
 */
function _extractBoampIdweb(url: string): string | null {
  // Pattern : /avis/detail/{idweb} ou /avis/detail/{idweb}/{suffix}
  const match = url.match(/\/avis\/detail\/([^/?#]+)/i);
  return match?.[1] ?? null;
}

/**
 * Mappe le type_marche BOAMP vers les valeurs de l'enum interne.
 */
function _mapBoampMarketType(typeMarche: string | null | undefined): string | undefined {
  if (!typeMarche) return undefined;
  const t = typeMarche.toLowerCase();
  if (t.includes("travaux")) return "travaux";
  if (t.includes("service")) return "services";
  if (t.includes("fourniture")) return "fournitures";
  if (t.includes("moe") || t.includes("maîtrise") || t.includes("maitrise")) return "moe";
  return "autre";
}

/**
 * Parse une date ISO ou partielle vers le format YYYY-MM-DD.
 * Retourne undefined si la date est invalide ou absente.
 */
function _parseDeadline(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  // Tenter un Date parse → extraire YYYY-MM-DD
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString().slice(0, 10);
}

/**
 * Extrait le code département depuis un champ potentiellement formaté "62-Pas-de-Calais"
 * ou "62" ou "062".
 * Normalise vers 2-3 chars alphanumériques.
 */
function _normalizeDepartment(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  // Prendre les 2-3 premiers chars alphabétiques/numériques avant "-" ou espace
  const match = raw.match(/^([0-9A-Za-z]{1,3})/);
  if (!match || !match[1]) return undefined;
  const code = match[1].toUpperCase();
  // Vérifier que c'est un code valide (pas "000" ni chaîne > 3 chars)
  return code.length >= 1 && code.length <= 3 ? code : undefined;
}

/**
 * Supprime les balises <script>, <style> et leurs contenus du HTML.
 * Puis retire toutes les balises HTML restantes.
 * Retourne le texte brut tronqué à maxChars.
 */
function _stripHtmlToText(html: string, maxChars: number): string {
  let text = html
    // Supprimer blocs script et style (contenus inclus)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    // Supprimer toutes les balises restantes
    .replace(/<[^>]+>/g, " ")
    // Nettoyer les espaces multiples
    .replace(/\s{2,}/g, " ")
    .trim();

  if (text.length > maxChars) {
    text = text.slice(0, maxChars);
  }

  return text;
}

// ---------------------------------------------------------------------------
// Enrichissement via API BOAMP (Opendatasoft)
// ---------------------------------------------------------------------------

/**
 * Enrichit les données depuis l'API Opendatasoft BOAMP.
 * Retourne les données enrichies ou une erreur.
 */
async function _enrichFromBoamp(idweb: string): Promise<EnrichTenderResult> {
  const apiUrl =
    `https://boamp-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/boamp/records` +
    `?where=idweb%3D%22${encodeURIComponent(idweb)}%22` +
    `&limit=1` +
    `&select=objet,nomacheteur,datelimitereponse,descripteur,type_marche,code_departement,url_avis,donnees`;

  let response: Response;
  try {
    response = await fetch(apiUrl, { signal: AbortSignal.timeout(10_000) });
  } catch (err) {
    console.error("[enrich-from-url:boamp:fetch:fail]", err);
    return { ok: false, error: "fetch_failed" };
  }

  if (!response.ok) {
    console.warn("[enrich-from-url:boamp:api:non-ok]", response.status);
    return { ok: false, error: "fetch_failed" };
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return { ok: false, error: "parse_error" };
  }

  const record =
    json !== null &&
    typeof json === "object" &&
    "results" in json &&
    Array.isArray((json as { results: unknown[] }).results)
      ? (json as { results: unknown[] }).results[0]
      : null;

  if (!record || typeof record !== "object") {
    // Aucun résultat trouvé pour cet idweb
    return { ok: false, error: "fetch_failed" };
  }

  const r = record as Record<string, unknown>;

  const data: EnrichedTenderData = {
    title: typeof r.objet === "string" ? r.objet.trim() || undefined : undefined,
    buyerName: typeof r.nomacheteur === "string" ? r.nomacheteur.trim() || undefined : undefined,
    deadline: _parseDeadline(typeof r.datelimitereponse === "string" ? r.datelimitereponse : null),
    description:
      typeof r.descripteur === "string"
        ? r.descripteur.trim().slice(0, 300) || undefined
        : undefined,
    department: _normalizeDepartment(
      typeof r.code_departement === "string" ? r.code_departement : null,
    ),
    marketType: _mapBoampMarketType(typeof r.type_marche === "string" ? r.type_marche : null),
    // url_dce supprimé de l'API BOAMP v2.1 (décision 2026-06-01)
    dceUrl: undefined,
  };

  return { ok: true, data };
}

// ---------------------------------------------------------------------------
// Enrichissement via Claude Haiku 4.5 (pages tierces)
// ---------------------------------------------------------------------------

/** Prompt système pour l'extraction structurée. */
const ENRICH_SYSTEM_PROMPT = `Tu es un assistant qui extrait des informations structurées depuis une page d'appel d'offres public français. Réponds UNIQUEMENT en JSON valide, sans markdown, sans texte avant ou après.`;

/** Template du message utilisateur — {htmlContent} sera remplacé. */
const ENRICH_USER_TEMPLATE = `Extrait les informations suivantes depuis ce texte de page web d'appel d'offres (réponds UNIQUEMENT en JSON valide, sans markdown) :
{
  "title": "titre complet du marché ou null",
  "buyerName": "nom du maître d'ouvrage / acheteur public ou null",
  "deadline": "date limite de remise des offres au format YYYY-MM-DD ou null",
  "estimatedValue": nombre en euros ou null,
  "description": "description courte du marché (max 300 chars) ou null",
  "dceUrl": "URL directe pour télécharger le DCE/RC ou null",
  "department": "code département 2 chars (ex: 62, 75, 2A) ou null",
  "marketType": "un de: moe, services, travaux, fournitures, autre, ou null"
}

Texte de la page :
{htmlContent}`;

/**
 * Enrichit les données depuis une page HTML quelconque via Claude Haiku 4.5.
 */
async function _enrichFromHtmlViaHaiku(htmlContent: string): Promise<EnrichTenderResult> {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const userMessage = ENRICH_USER_TEMPLATE.replace("{htmlContent}", htmlContent);

  let response: Awaited<ReturnType<typeof client.messages.create>>;
  try {
    response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: ENRICH_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });
  } catch (err) {
    console.error("[enrich-from-url:haiku:fail]", err);
    return { ok: false, error: "internal_error" };
  }

  const rawText = response.content[0]?.type === "text" ? (response.content[0].text as string) : "";

  // Extraction JSON robuste (même helper que analyze-rc)
  const jsonText = _extractJson(rawText);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    console.warn("[enrich-from-url:haiku:parse:fail]", rawText.slice(0, 200));
    return { ok: false, error: "parse_error" };
  }

  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "parse_error" };
  }

  const p = parsed as Record<string, unknown>;

  // Construction des données — les champs absents ou null deviennent undefined
  const data: EnrichedTenderData = {
    title: typeof p.title === "string" && p.title ? p.title.trim() : undefined,
    buyerName: typeof p.buyerName === "string" && p.buyerName ? p.buyerName.trim() : undefined,
    deadline: _parseDeadline(typeof p.deadline === "string" ? p.deadline : null),
    estimatedValue:
      typeof p.estimatedValue === "number" && p.estimatedValue > 0
        ? Math.round(p.estimatedValue)
        : undefined,
    description:
      typeof p.description === "string" && p.description
        ? p.description.trim().slice(0, 300)
        : undefined,
    dceUrl: typeof p.dceUrl === "string" && p.dceUrl.startsWith("https://") ? p.dceUrl : undefined,
    department: _normalizeDepartment(typeof p.department === "string" ? p.department : null),
    marketType:
      typeof p.marketType === "string" &&
      ["moe", "services", "travaux", "fournitures", "autre"].includes(p.marketType)
        ? p.marketType
        : undefined,
  };

  return { ok: true, data };
}

/**
 * Extrait le JSON d'une réponse potentiellement enveloppée dans ```json ... ```.
 */
function _extractJson(text: string): string {
  const mdMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (mdMatch && mdMatch[1] !== undefined) return mdMatch[1].trim();

  const start = text.search(/[{[]/);
  const lastBrace = text.lastIndexOf("}");
  const lastBracket = text.lastIndexOf("]");
  const end = Math.max(lastBrace, lastBracket);
  if (start !== -1 && end > start) return text.slice(start, end + 1);

  return text.trim();
}

// ---------------------------------------------------------------------------
// Action principale
// ---------------------------------------------------------------------------

/**
 * Enrichit les champs d'un AO depuis une URL d'annonce publique.
 *
 * Stratégie :
 *  - URL BOAMP (boamp.fr) → extraction idweb + appel API Opendatasoft (10 s timeout)
 *  - Autre URL           → fetch HTML + Claude Haiku 4.5 extraction structurée (15 s timeout)
 *
 * Sécurité : SSRF check (HTTPS, pas d'IP privée).
 *
 * @param url URL de l'annonce d'appel d'offres
 */
export async function enrichTenderFromUrlAction(url: string): Promise<EnrichTenderResult> {
  try {
    // 1. Auth check
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { ok: false, error: "not_authenticated" };

    // 2. Validation URL basique (SSRF + HTTPS)
    if (!url || url.length > 2048) return { ok: false, error: "invalid_url" };
    const urlError = _validateExternalUrl(url);
    if (urlError) return { ok: false, error: urlError };

    // 3. Branche BOAMP
    if (url.includes("boamp.fr")) {
      const idweb = _extractBoampIdweb(url);
      if (!idweb) return { ok: false, error: "fetch_failed" };
      return await _enrichFromBoamp(idweb);
    }

    // 4. Branche HTML générique → Haiku 4.5
    let response: Response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(15_000),
        headers: { "User-Agent": "edifio-sourcing-bot/1.0" },
      });
    } catch (err) {
      console.error("[enrich-from-url:fetch:fail]", err);
      return { ok: false, error: "fetch_failed" };
    }

    if (!response.ok) {
      return { ok: false, error: "fetch_failed" };
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      return { ok: false, error: "not_a_webpage" };
    }

    const rawHtml = await response.text();
    // Nettoyage HTML + troncature à 15 000 chars pour Haiku
    const textContent = _stripHtmlToText(rawHtml, 15_000);

    if (!textContent || textContent.trim().length < 50) {
      return { ok: false, error: "not_a_webpage" };
    }

    return await _enrichFromHtmlViaHaiku(textContent);
  } catch (err) {
    console.error("[enrich-from-url:unhandled]", err);
    return { ok: false, error: "internal_error" };
  }
}
