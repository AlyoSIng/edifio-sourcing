"use server";

/**
 * Server Actions publiques — page cotraitant /cotraitant/[token].
 *
 * PAS d'auth AlyoS requise ici — la sécurité repose entièrement sur :
 *  1. La validation du token UUID (existence, non-révoqué, non-expiré)
 *  2. La vérification que l'item appartient bien au share associé au token
 *
 * Actions exposées :
 *  - getCotraitantDownloadUrl : URL signée 1h pour télécharger une pièce originale
 *  - uploadSignedDocument     : upload d'une pièce signée dans le bucket cotraitant_signed
 *
 * IMPORTANT (ops) — bucket requis :
 *   Le bucket "cotraitant_signed" doit être créé dans le dashboard Supabase AVANT
 *   la 1re utilisation : Storage → New Bucket → Nom : "cotraitant_signed" → Private.
 */

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db/client";
import { cotraitantShareItems, cotraitantShares } from "@/db/schema/sharing";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Bucket destination pour les pièces signées déposées par le cotraitant. */
const SIGNED_BUCKET = "cotraitant_signed";

/** Taille max des uploads cotraitant (20 MB). */
const MAX_SIZE_BYTES = 20 * 1024 * 1024;

/** Types MIME acceptés pour les dépôts signés. */
const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

// ---------------------------------------------------------------------------
// getCotraitantDownloadUrl
// ---------------------------------------------------------------------------

/**
 * Génère une URL signée de téléchargement pour une pièce partagée.
 *
 * Sécurité :
 *  - Token validé (share existant, non-révoqué, non-expiré)
 *  - Item vérifié comme appartenant au share du token
 *  - URL valable 1 heure
 */
export async function getCotraitantDownloadUrl(
  token: string,
  itemId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!UUID_SHAPE.test(token) || !UUID_SHAPE.test(itemId)) {
    return { ok: false, error: "invalid_input" };
  }

  try {
    // Vérifier que le share est valide
    const shareRows = await db
      .select({
        id: cotraitantShares.id,
        expiresAt: cotraitantShares.expiresAt,
        revokedAt: cotraitantShares.revokedAt,
      })
      .from(cotraitantShares)
      .where(eq(cotraitantShares.token, token))
      .limit(1);

    const share = shareRows[0];
    if (!share || share.revokedAt || new Date(share.expiresAt) < new Date()) {
      return { ok: false, error: "share_invalid" };
    }

    // Récupérer le chemin Storage de l'item (et vérifier qu'il appartient au share)
    const itemRows = await db
      .select({ originalStoragePath: cotraitantShareItems.originalStoragePath })
      .from(cotraitantShareItems)
      .where(and(eq(cotraitantShareItems.id, itemId), eq(cotraitantShareItems.shareId, share.id)))
      .limit(1);

    const item = itemRows[0];
    if (!item) return { ok: false, error: "item_not_found" };

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.storage
      .from("company_library")
      .createSignedUrl(item.originalStoragePath, 3600);

    if (error || !data?.signedUrl) {
      console.error("[cotraitant:download:storage:fail]", error);
      return { ok: false, error: "storage_error" };
    }

    return { ok: true, url: data.signedUrl };
  } catch (err) {
    console.error("[cotraitant:download:fail]", err);
    return { ok: false, error: "internal_error" };
  }
}

// ---------------------------------------------------------------------------
// uploadSignedDocument
// ---------------------------------------------------------------------------

/**
 * Upload d'une pièce signée par le cotraitant.
 *
 * FormData attendu :
 *  - token      : UUID (token du partage)
 *  - itemId     : UUID (id de l'item à marquer comme signé)
 *  - file       : File (PDF, JPG ou PNG, max 20 MB)
 *  - signerName : string (optionnel — nom du signataire)
 *
 * Sécurité :
 *  - Token validé (non-révoqué, non-expiré)
 *  - Item vérifié comme appartenant au share
 *  - Validation MIME + taille côté serveur
 *  - Sanitisation du nom de fichier pour le chemin Storage
 *
 * IMPORTANT : le bucket "cotraitant_signed" doit exister dans Supabase Storage
 * avant la 1re exécution de cette action.
 */
export async function uploadSignedDocument(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = formData.get("token");
  const itemId = formData.get("itemId");
  const signerName = formData.get("signerName");
  const file = formData.get("file");

  // Validation des entrées
  if (typeof token !== "string" || !UUID_SHAPE.test(token)) {
    return { ok: false, error: "invalid_input" };
  }
  if (typeof itemId !== "string" || !UUID_SHAPE.test(itemId)) {
    return { ok: false, error: "invalid_input" };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "missing_file" };
  }
  if (file.size > MAX_SIZE_BYTES) {
    return { ok: false, error: "file_too_large" };
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return { ok: false, error: "invalid_mime_type" };
  }

  const signerNameStr =
    typeof signerName === "string" && signerName.trim() !== "" ? signerName.trim() : null;

  try {
    // Vérifier share valide
    const shareRows = await db
      .select({
        id: cotraitantShares.id,
        expiresAt: cotraitantShares.expiresAt,
        revokedAt: cotraitantShares.revokedAt,
      })
      .from(cotraitantShares)
      .where(eq(cotraitantShares.token, token))
      .limit(1);

    const share = shareRows[0];
    if (!share || share.revokedAt || new Date(share.expiresAt) < new Date()) {
      return { ok: false, error: "share_invalid" };
    }

    // Vérifier que l'item appartient au share
    const itemRows = await db
      .select({ id: cotraitantShareItems.id })
      .from(cotraitantShareItems)
      .where(and(eq(cotraitantShareItems.id, itemId), eq(cotraitantShareItems.shareId, share.id)))
      .limit(1);

    if (!itemRows[0]) return { ok: false, error: "item_not_found" };

    // Chemin Storage : {shareId}/{itemId}/{timestamp}_{safeFilename}
    const timestamp = Date.now();
    const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${share.id}/${itemId}/${timestamp}_${safeFilename}`;

    // Upload vers le bucket cotraitant_signed
    const fileBuffer = await file.arrayBuffer();
    const admin = createSupabaseAdminClient();
    const { error: storageError } = await admin.storage
      .from(SIGNED_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (storageError) {
      console.error("[cotraitant:upload:storage:fail]", storageError);
      return { ok: false, error: "storage_upload_failed" };
    }

    // Mise à jour BDD : marquer l'item comme signé
    await db
      .update(cotraitantShareItems)
      .set({
        signedStoragePath: storagePath,
        signedAt: sql`now()`,
        signerName: signerNameStr,
        signedFilename: file.name,
      })
      .where(eq(cotraitantShareItems.id, itemId));

    revalidatePath(`/cotraitant/${token}`);
    return { ok: true };
  } catch (err) {
    console.error("[cotraitant:upload:fail]", err);
    return { ok: false, error: "internal_error" };
  }
}
