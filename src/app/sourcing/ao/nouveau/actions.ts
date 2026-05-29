"use server";

/**
 * Server Action — création d'un AO manuel (consultation privée).
 *
 * Flux :
 *  1. Auth check + isAdmin
 *  2. Validation des champs obligatoires
 *  3. Upload DCE optionnel vers bucket `tender_documents`
 *  4. INSERT dans `tenders` avec platformCode = 'prive'
 *  5. INSERT optionnel dans `tender_documents` (si fichier DCE uploadé)
 *  6. revalidatePath + return de l'ID pour redirection côté client
 *
 * Sécurité :
 *  - Auth check systématique
 *  - Validation MIME + taille côté serveur (jamais côté client seul)
 *  - `externalRef` = UUID v4 généré côté serveur (jamais depuis le client)
 *  - `dceUrl` = URL publique signée Supabase Storage (si fichier uploadé)
 *
 * Source de vérité : brief Board feat/boamp-dce-ao-manuel (2026-05-27).
 */

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

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
