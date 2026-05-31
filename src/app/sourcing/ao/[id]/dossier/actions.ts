"use server";

/**
 * Server Actions — page dossier IA `/sourcing/ao/[id]/dossier`.
 *
 * Cinq actions :
 *   - `downloadDceFromUrl`     : tente de télécharger le DCE depuis l'URL publique
 *                               stockée dans `tenders.dce_url`. Si l'URL n'est pas
 *                               un PDF direct, retourne `not_a_pdf` (upload manuel requis).
 *   - `uploadDcePdf`           : upload manuel du RC par l'utilisateur (FormData).
 *   - `importDceFromPastedUrl` : import RC depuis une URL collée manuellement.
 *   - `getRcSignedUrlAction`   : URL signée 1 h pour aperçu PDF en iframe.
 *   - `analyzeRcAction`        : extrait le texte PDF + appelle Claude Sonnet 4.6 via
 *                               `analyzeRc()`, insère un `tender_event` rc_analyzed.
 *
 * Sécurité :
 *   - Auth check sur chaque action (defense in depth)
 *   - Filtre `organizationId = orgId` sur toutes les requêtes BDD
 *   - PDF only, max 50 Mo pour l'upload manuel
 *   - AbortSignal.timeout(30 s) pour le fetch DCE
 *
 * Note `pdf-parse` :
 *   Utilise un import dynamique `(await import('pdf-parse')).default` pour éviter
 *   les problèmes de build Next.js avec les modules CommonJS.
 *
 * Source de vérité :
 *   - Spec PR-B module dossier IA (brief Board 2026-05-25)
 *   - Patterns : `src/app/sourcing/admin/bibliotheque/actions.ts`
 */

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { auditLogs } from "@/db/schema/audit";
import { tenderDocuments, tenderEvents, tenders } from "@/db/schema/tenders";
import { toUserProfile } from "@/lib/auth/types";
import { getRequiredOrgId } from "@/lib/auth/get-required-org-id";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { analyzeRc } from "@/lib/ai/analyze-rc";
import type { RcAnalysis } from "@/lib/ai/schemas";

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Taille maximale upload manuel : 50 Mo */
const MAX_PDF_SIZE_BYTES = 50 * 1024 * 1024;

/** Nom du bucket Supabase Storage (privé, RLS activée) */
const BUCKET = "tender_documents";

/** Limite de texte envoyé à Claude — 100 000 chars ~= 25 K tokens (raisonnable) */
const MAX_RC_TEXT_LENGTH = 100_000;

// ---------------------------------------------------------------------------
// Types retour
// ---------------------------------------------------------------------------

export interface DceActionResult {
  ok: boolean;
  error?: string;
}

export interface AnalyzeRcActionResult {
  ok: boolean;
  error?: string;
  analysis?: RcAnalysis;
}

// ---------------------------------------------------------------------------
// Sécurité SSRF : validation URL avant fetch externe
// ---------------------------------------------------------------------------

/**
 * Retourne `true` si le hostname correspond à une plage IP privée / réservée
 * (loopback, RFC 1918, link-local, CGNAT, IPv6 ULA…).
 * Protège contre les attaques SSRF (Server-Side Request Forgery).
 */
function isPrivateOrReservedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();

  // Noms d'hôtes réservés
  if (
    h === "localhost" ||
    h === "metadata.google.internal" ||
    h === "instance-data" ||
    h === "169.254.169.254" // AWS / GCP metadata
  ) {
    return true;
  }

  // IPv4 privé + réservé
  const ipv4Patterns = [
    /^127\./, // loopback
    /^10\./, // RFC 1918 class A
    /^172\.(1[6-9]|2\d|3[01])\./, // RFC 1918 class B (172.16–172.31)
    /^192\.168\./, // RFC 1918 class C
    /^169\.254\./, // link-local / AWS metadata
    /^0\./, // "this" network
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // CGNAT (100.64–100.127)
    /^198\.(18|19)\./, // benchmarking
    /^240\./, // reserved
  ];

  if (ipv4Patterns.some((re) => re.test(h))) return true;

  // IPv6 loopback + ULA
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
 *  - Protocole HTTPS uniquement (pas HTTP, pas file:// etc.)
 *  - Hostname hors plages privées/réservées (anti-SSRF)
 *
 * Retourne `null` si l'URL est valide, ou un code d'erreur lisible.
 */
function validateExternalUrl(rawUrl: string): "invalid_dce_url" | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return "invalid_dce_url";
  }

  if (parsed.protocol !== "https:") return "invalid_dce_url";
  if (isPrivateOrReservedHostname(parsed.hostname)) return "invalid_dce_url";

  return null;
}

// ---------------------------------------------------------------------------
// Helper : auth check
// ---------------------------------------------------------------------------

/**
 * Vérifie la session Supabase. Retourne le profile et l'orgId ou null si non authentifié.
 * Un `user` ET `admin` peuvent préparer un dossier (arbitrage Board G2 §3/A).
 */
async function getAuthenticatedProfile() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;
  const orgId = await getRequiredOrgId(user.id);
  return { supabase, profile: toUserProfile(user), orgId };
}

// ---------------------------------------------------------------------------
// Helper privé : _downloadAndStoreFromUrl
// ---------------------------------------------------------------------------

/**
 * Factorisation interne : fetch HTTPS + vérif PDF + upload Storage + insert BDD.
 *
 * Utilisé par `downloadDceFromUrl` et `importDceFromPastedUrl`.
 *
 * Retourne :
 *   - `{ ok: true }`         → RC enregistré dans Storage + BDD
 *   - `{ ok: false, error }` → erreur (ssrf, fetch_failed, not_a_pdf, storage, db)
 */
async function _downloadAndStoreFromUrl(
  tenderId: string,
  orgId: string,
  url: string,
  supabaseAdmin: ReturnType<typeof createSupabaseAdminClient>,
  logPrefix: string,
): Promise<DceActionResult> {
  // Validation SSRF
  const urlError = validateExternalUrl(url);
  if (urlError) {
    console.warn(`[${logPrefix}:ssrf-block]`, url);
    return { ok: false, error: urlError };
  }

  // Fetch avec timeout 30 s
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  } catch (err) {
    console.error(`[${logPrefix}:fetch:fail]`, err);
    return { ok: false, error: "fetch_failed" };
  }

  if (!response.ok) {
    return { ok: false, error: "fetch_failed" };
  }

  // Vérification content-type : on n'accepte que les PDF directs
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("pdf")) {
    return { ok: false, error: "not_a_pdf" };
  }

  const buffer = await response.arrayBuffer();

  // Upload Storage : chemin tenant-scoped
  const storagePath = `${orgId}/${tenderId}/${Date.now()}_RC.pdf`;

  const { error: storageError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: "application/pdf", upsert: false });

  if (storageError) {
    console.error(`[${logPrefix}:storage:fail]`, storageError);
    return { ok: false, error: "storage_upload_failed" };
  }

  // Insert dans tender_documents
  try {
    await db.insert(tenderDocuments).values({
      tenderId,
      organizationId: orgId,
      kind: "RC",
      name: "RC.pdf",
      format: "pdf",
      storagePath,
      sizeBytes: buffer.byteLength,
      analyzed: false,
    });
  } catch (err) {
    console.error(`[${logPrefix}:db:fail]`, err);
    // Nettoyage Storage best-effort
    await supabaseAdmin.storage.from(BUCKET).remove([storagePath]);
    return { ok: false, error: "db_insert_failed" };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Action 1 : downloadDceFromUrl
// ---------------------------------------------------------------------------

/**
 * Tente de télécharger le DCE depuis l'URL publique (`tenders.dce_url`).
 *
 * Cas de succès : `content-type: application/pdf` → upload Storage + insert BDD.
 * Cas `not_a_pdf` : l'URL pointe vers une page HTML (plateforme de marché) —
 *   l'utilisateur doit uploader le RC manuellement.
 *
 * @param tenderId UUID du tender
 */
export async function downloadDceFromUrl(tenderId: string): Promise<DceActionResult> {
  try {
    // Auth check
    const auth = await getAuthenticatedProfile();
    if (!auth) return { ok: false, error: "not_authenticated" };

    // Charger le tender (filtre tenant)
    const [tender] = await db
      .select({ dceUrl: tenders.dceUrl })
      .from(tenders)
      .where(and(eq(tenders.id, tenderId), eq(tenders.organizationId, auth.orgId)))
      .limit(1);

    if (!tender) return { ok: false, error: "tender_not_found" };
    if (!tender.dceUrl) return { ok: false, error: "no_dce_url" };

    const supabaseAdmin = createSupabaseAdminClient();
    // Storage admin : RLS bypass intentionnel — auth vérifiée ci-dessus
    const result = await _downloadAndStoreFromUrl(
      tenderId,
      auth.orgId,
      tender.dceUrl,
      supabaseAdmin,
      "dossier:download-dce",
    );

    if (!result.ok) return result;

    revalidatePath(`/sourcing/ao/${tenderId}/dossier`);
    return { ok: true };
  } catch (err) {
    console.error("[dossier:download-dce:unhandled]", err);
    return { ok: false, error: "internal_error" };
  }
}

// ---------------------------------------------------------------------------
// Action 2 : uploadDcePdf
// ---------------------------------------------------------------------------

/**
 * Upload manuel du RC par l'utilisateur.
 *
 * Champs FormData attendus :
 *   - `file` — File (PDF uniquement, max 50 Mo)
 *
 * @param tenderId UUID du tender
 * @param formData FormData contenant le fichier
 */
export async function uploadDcePdf(tenderId: string, formData: FormData): Promise<DceActionResult> {
  try {
    // Auth check
    const auth = await getAuthenticatedProfile();
    if (!auth) return { ok: false, error: "not_authenticated" };

    // Récupération et validation du fichier
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "missing_file" };
    }

    // PDF only
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return { ok: false, error: "not_a_pdf" };
    }

    // Taille max 50 Mo
    if (file.size > MAX_PDF_SIZE_BYTES) {
      return { ok: false, error: "file_too_large" };
    }

    // Vérification que le tender appartient à l'org
    const [tender] = await db
      .select({ id: tenders.id })
      .from(tenders)
      .where(and(eq(tenders.id, tenderId), eq(tenders.organizationId, auth.orgId)))
      .limit(1);

    if (!tender) return { ok: false, error: "tender_not_found" };

    // Chemin Storage tenant-scoped (RLS policy)
    const safeFilename = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const storagePath = `${auth.orgId}/${tenderId}/${Date.now()}_${safeFilename}`;

    const fileBuffer = await file.arrayBuffer();
    // Storage admin : RLS bypass intentionnel — auth vérifiée L.282
    const supabaseAdmin = createSupabaseAdminClient();
    const { error: storageError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (storageError) {
      console.error("[dossier:upload-pdf:storage:fail]", storageError);
      return { ok: false, error: "storage_upload_failed" };
    }

    // Insert dans tender_documents
    try {
      await db.insert(tenderDocuments).values({
        tenderId,
        organizationId: auth.orgId,
        kind: "RC",
        name: file.name,
        format: "pdf",
        storagePath,
        sizeBytes: file.size,
        analyzed: false,
      });
    } catch (err) {
      console.error("[dossier:upload-pdf:db:fail]", err);
      // Storage admin : RLS bypass intentionnel — auth vérifiée L.282
      await supabaseAdmin.storage.from(BUCKET).remove([storagePath]);
      return { ok: false, error: "db_insert_failed" };
    }

    revalidatePath(`/sourcing/ao/${tenderId}/dossier`);
    return { ok: true };
  } catch (err) {
    console.error("[dossier:upload-pdf:unhandled]", err);
    return { ok: false, error: "internal_error" };
  }
}

// ---------------------------------------------------------------------------
// Action 3 : importDceFromPastedUrl
// ---------------------------------------------------------------------------

/**
 * Importe le RC depuis une URL collée manuellement par l'utilisateur.
 * Même logique SSRF + fetch + PDF que `downloadDceFromUrl`, mais l'URL
 * est fournie en paramètre au lieu d'être lue depuis tenders.dce_url.
 * Après succès : met à jour tenders.dce_url pour les futurs téléchargements.
 *
 * @param tenderId  UUID du tender
 * @param pastedUrl URL DCE fournie par l'utilisateur
 */
export async function importDceFromPastedUrl(
  tenderId: string,
  pastedUrl: string,
): Promise<DceActionResult> {
  try {
    // Auth check
    const auth = await getAuthenticatedProfile();
    if (!auth) return { ok: false, error: "not_authenticated" };

    // Vérification que le tender appartient à l'org
    const [tender] = await db
      .select({ id: tenders.id })
      .from(tenders)
      .where(and(eq(tenders.id, tenderId), eq(tenders.organizationId, auth.orgId)))
      .limit(1);

    if (!tender) return { ok: false, error: "tender_not_found" };

    // Storage admin : RLS bypass intentionnel — auth vérifiée ci-dessus
    const supabaseAdmin = createSupabaseAdminClient();
    const result = await _downloadAndStoreFromUrl(
      tenderId,
      auth.orgId,
      pastedUrl,
      supabaseAdmin,
      "dossier:import-pasted",
    );

    if (!result.ok) return result;

    // Sauvegarde de l'URL pour les futurs téléchargements — non bloquant
    try {
      await db
        .update(tenders)
        .set({ dceUrl: pastedUrl })
        .where(and(eq(tenders.id, tenderId), eq(tenders.organizationId, auth.orgId)));
    } catch (err) {
      console.warn("[dossier:import-pasted:update-url:fail]", err);
      // Non bloquant : l'import est réussi même si la mise à jour de l'URL échoue
    }

    revalidatePath(`/sourcing/ao/${tenderId}/dossier`);
    return { ok: true };
  } catch (err) {
    console.error("[dossier:import-pasted:unhandled]", err);
    return { ok: false, error: "internal_error" };
  }
}

// ---------------------------------------------------------------------------
// Action 4 : getRcSignedUrlAction
// ---------------------------------------------------------------------------

/**
 * Génère une URL signée (1 h) pour prévisualiser le RC en iframe.
 * Lit le storagePath du document RC le plus récent depuis tender_documents.
 *
 * @param tenderId UUID du tender
 */
export async function getRcSignedUrlAction(
  tenderId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    // Auth check
    const auth = await getAuthenticatedProfile();
    if (!auth) return { ok: false, error: "not_authenticated" };

    // Récupération du storagePath du document RC le plus récent
    const [doc] = await db
      .select({ storagePath: tenderDocuments.storagePath })
      .from(tenderDocuments)
      .where(
        and(
          eq(tenderDocuments.tenderId, tenderId),
          eq(tenderDocuments.organizationId, auth.orgId),
          eq(tenderDocuments.kind, "RC"),
        ),
      )
      .orderBy(desc(tenderDocuments.uploadedAt))
      .limit(1);

    if (!doc) return { ok: false, error: "not_found" };

    // Génération URL signée 1 h (3 600 secondes)
    // Storage admin : RLS bypass intentionnel — auth vérifiée ci-dessus
    const supabaseAdmin = createSupabaseAdminClient();
    const { data: signedData, error: signedError } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(doc.storagePath, 3600);

    if (signedError || !signedData?.signedUrl) {
      console.error("[dossier:signed-url:fail]", signedError);
      return { ok: false, error: "storage_error" };
    }

    return { ok: true, url: signedData.signedUrl };
  } catch (err) {
    console.error("[dossier:signed-url:unhandled]", err);
    return { ok: false, error: "internal_error" };
  }
}

// ---------------------------------------------------------------------------
// Action 6 : analyzeRcAction
// ---------------------------------------------------------------------------

/**
 * Analyse le RC d'un AO via Claude Sonnet 4.6.
 *
 * Workflow :
 *   1. Vérification auth + ownership du document
 *   2. Téléchargement du PDF depuis Supabase Storage
 *   3. Extraction texte via `pdf-parse` (import dynamique CommonJS)
 *   4. Troncature à 100 000 chars (contexte raisonnable)
 *   5. Appel `analyzeRc(tenderId, rcText)`
 *   6. Insert `tender_events` (eventType='rc_analyzed', data contient l'analyse)
 *   7. Update `tender_documents.analyzed = true`
 *   8. `revalidatePath`
 *
 * @param tenderId   UUID du tender
 * @param documentId UUID du document dans `tender_documents`
 */
export async function analyzeRcAction(
  tenderId: string,
  documentId: string,
): Promise<AnalyzeRcActionResult> {
  try {
    // Auth check
    const auth = await getAuthenticatedProfile();
    if (!auth) return { ok: false, error: "not_authenticated" };

    // Charger le document (vérif ownership tenant)
    const [doc] = await db
      .select({
        id: tenderDocuments.id,
        storagePath: tenderDocuments.storagePath,
        organizationId: tenderDocuments.organizationId,
      })
      .from(tenderDocuments)
      .where(
        and(
          eq(tenderDocuments.id, documentId),
          eq(tenderDocuments.tenderId, tenderId),
          eq(tenderDocuments.organizationId, auth.orgId),
        ),
      )
      .limit(1);

    if (!doc) return { ok: false, error: "document_not_found" };

    // Téléchargement depuis Supabase Storage
    // Storage admin : RLS bypass intentionnel — auth vérifiée L.378
    const supabaseAdmin = createSupabaseAdminClient();
    const { data: storageData, error: downloadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .download(doc.storagePath);

    if (downloadError || !storageData) {
      console.error("[dossier:analyze-rc:storage-download:fail]", downloadError);
      return { ok: false, error: "storage_download_failed" };
    }

    // Conversion Blob → Buffer
    const pdfBuffer = Buffer.from(await storageData.arrayBuffer());

    // Extraction texte PDF — import dynamique pour compatibilité CJS/ESM Next.js
    let rcText: string;
    try {
      const pdfParse = (await import("pdf-parse")).default;
      const pdfData = await pdfParse(pdfBuffer);
      rcText = pdfData.text ?? "";
    } catch (err) {
      console.error("[dossier:analyze-rc:pdf-parse:fail]", err);
      return { ok: false, error: "pdf_parse_failed" };
    }

    if (!rcText || rcText.trim().length === 0) {
      return { ok: false, error: "pdf_empty" };
    }

    // Troncature raisonnable (100 000 chars ~= 25 K tokens)
    const truncated =
      rcText.length > MAX_RC_TEXT_LENGTH ? rcText.slice(0, MAX_RC_TEXT_LENGTH) : rcText;

    // Appel Claude Sonnet 4.6 via analyzeRc
    const result = await analyzeRc(tenderId, truncated, auth.orgId);

    if (!result.ok) {
      if (result.error === "prompt_not_seeded") {
        return {
          ok: false,
          error: "prompt_not_seeded",
        };
      }
      return {
        ok: false,
        error: result.error,
      };
    }

    // Insert audit log A7 — ai_run (traçabilité Gate 5 §7)
    try {
      await db.insert(auditLogs).values({
        organizationId: auth.orgId,
        actorId: auth.profile.id,
        actorEmail: auth.profile.email,
        actorRole: auth.profile.role as "admin" | "user" | "viewer",
        action: "ai_run",
        subjectType: "tender",
        subjectId: tenderId,
        data: {
          prompt_name: result.promptName,
          prompt_version: result.promptVersion,
          model: result.model as "sonnet-4-6" | "haiku-4-5",
          tender_id: tenderId,
          cost_usd: result.costUsd,
          latency_ms: result.latencyMs,
          succeeded: true,
          tokens_in: result.tokensIn,
          tokens_out: result.tokensOut,
        },
      });
    } catch (err) {
      console.error("[dossier:analyze-rc:audit-log:fail]", err);
      // Non bloquant — l'analyse est disponible même si l'audit log échoue
    }

    // Insert tender_event rc_analyzed (audit trail + source pour page-data.ts)
    try {
      await db.insert(tenderEvents).values({
        tenderId,
        organizationId: auth.orgId,
        eventType: "rc_analyzed",
        data: {
          extra: {
            rc_analysis: result.analysis,
            ai_run_id: result.runId,
            cost_usd: result.costUsd,
            latency_ms: result.latencyMs,
          },
        },
      });
    } catch (err) {
      console.error("[dossier:analyze-rc:event-insert:fail]", err);
      // Non bloquant — l'analyse est disponible dans ai_runs même si l'event échoue
    }

    // Marquer le document comme analysé
    try {
      await db
        .update(tenderDocuments)
        .set({ analyzed: true })
        .where(eq(tenderDocuments.id, documentId));
    } catch (err) {
      console.error("[dossier:analyze-rc:doc-update:fail]", err);
      // Non bloquant
    }

    revalidatePath(`/sourcing/ao/${tenderId}/dossier`);
    return { ok: true, analysis: result.analysis };
  } catch (err) {
    console.error("[dossier:analyze-rc:unhandled]", err);
    return { ok: false, error: "internal_error" };
  }
}
